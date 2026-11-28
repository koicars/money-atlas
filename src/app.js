// Money Atlas — app shell and screens. Plain JS modules, no framework.
import * as db from './db.js';
import { EXPENSEBOOK_CATEGORIES, FIXED_CATEGORIES, DEFAULT_ICONS, FALLBACK_ICON, SCHEMA_VERSION } from './model.js';
import { decodeExpenseBook, importExpenseBook } from './import/expensebook.js';
import { monthOf, isoDate, addMonths, budgetFor, carryInto, spentByCategory, todaySummary, tagTotals } from './budget.js';
import { postDue, upcoming, suggest, monthly, daysUntil, toICS, advance } from './recurring.js';
import { monthlySeries, paceSeries, categorySeries, breakdown } from './charts.js';
import { ICON_KEYS, DEFAULT_ICON_KEYS, iconSvg } from './icons.js';

const VERSION = '0.4.1';
const KIND_LABEL = { fixed: '固定費', subscription: 'サブスク', savings: '先取り貯蓄' };
const TAG_LABEL = { need: 'NEED', grow: 'GROW', waste: 'WASTE' };
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const state = {
  entries: [],        // newest first
  categories: [],
  recurring: [],
  budget: { standard: {}, overrides: {}, startMonth: null },
  settings: { theme: 'auto', lastBackup: null, dismissed: [] },
  tab: 'today',
  reportMonth: monthOf(new Date()),
  reportCat: null,
};

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yen = (n) => (n < 0 ? '−' : '') + '¥' + Math.abs(n).toLocaleString('ja-JP');
const num = (n) => Math.abs(n).toLocaleString('ja-JP');
const today = () => isoDate(new Date());
const catById = (id) => state.categories.find((c) => c.id === id);
const catName = (id) => catById(id)?.name ?? id;
const catIcon = (id) => catById(id)?.icon ?? FALLBACK_ICON;
const ico = (id) => `<span class="cat-icon" aria-hidden="true">${iconSvg(catIcon(id), 17)}</span>`;
const newId = () => 'e-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function dateLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  const t = today();
  if (iso === t) return '今日';
  if (iso === isoDate(new Date(Date.now() - 864e5))) return '昨日';
  const sameYear = iso.slice(0, 4) === t.slice(0, 4);
  return `${sameYear ? '' : d.getFullYear() + '年'}${d.getMonth() + 1}月${d.getDate()}日`;
}
function monthLabel(m) { const [y, mm] = m.split('-'); return `${y}年${Number(mm)}月`; }
function sortEntries() { state.entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt))); }

let toastTimer;
function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

const KEY_LETTERS = { '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ' };
const ICON = {
  backspace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12z"/><path d="M11.5 9.5l5 5M16.5 9.5l-5 5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
};

// ---------- theme ----------
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}

// ---------- load / save ----------
async function load() {
  const [entries, categories, recurring, budget, settings] = await Promise.all([
    db.getAll('entries'), db.getAll('categories'), db.getAll('recurring'), db.getKV('budget'), db.getKV('settings'),
  ]);
  state.entries = entries;
  state.categories = categories;
  state.recurring = recurring;
  if (budget) state.budget = budget;
  if (settings) state.settings = { ...state.settings, ...settings };
  // Seed the defaults, and add any category a newer version introduced.
  const missing = [];
  const have = new Set(state.categories.map((c) => c.id));
  if (!state.categories.length) {
    for (const c of Object.values(EXPENSEBOOK_CATEGORIES)) if (!have.has(c.id)) { have.add(c.id); missing.push({ ...c, archived: false }); }
  }
  for (const c of FIXED_CATEGORIES) if (!have.has(c.id)) missing.push({ ...c });
  if (missing.length) { state.categories.push(...missing); await db.putMany('categories', missing); }
  // Give older categories an icon and a fixed position (storage returns them sorted by id).
  const seedOrder = [...new Set([...Object.values(EXPENSEBOOK_CATEGORIES).map((c) => c.id), ...FIXED_CATEGORIES.map((c) => c.id)])];
  const fix = [];
  for (const c of state.categories) {
    let changed = false;
    // Missing, or one of the old default emoji: switch to the line icon.
    if (!c.icon || (!ICON_KEYS.includes(c.icon) && (!DEFAULT_ICONS[c.id] || c.icon === DEFAULT_ICONS[c.id]))) { c.icon = DEFAULT_ICON_KEYS[c.id] ?? FALLBACK_ICON; changed = true; }
    if (typeof c.order !== 'number') { const i = seedOrder.indexOf(c.id); c.order = i >= 0 ? i : 100 + state.categories.indexOf(c); changed = true; }
    if (changed) fix.push(c);
  }
  if (fix.length) await db.putMany('categories', fix);
  state.categories.sort((a, b) => a.order - b.order);
  sortEntries();
  await postRecurring();
}

/** Record every subscription or bill that has come due since the app was last opened. */
async function postRecurring() {
  const { entries, recurring } = postDue(state.recurring, new Set(state.entries.map((e) => e.id)), today());
  if (!entries.length && !recurring.length) return;
  state.entries.push(...entries);
  state.recurring = state.recurring.map((r) => recurring.find((x) => x.id === r.id) ?? r);
  sortEntries();
  await db.putMany('entries', entries);
  await db.putMany('recurring', recurring);
}
const saveBudget = () => db.setKV('budget', state.budget);
const saveSettings = () => db.setKV('settings', state.settings);

// ---------- screens ----------
function viewToday() {
  const t = today();
  const d = new Date();
  const s = todaySummary({ budget: state.budget, categories: state.categories, entries: state.entries, today: t });
  const hero = s.budget > 0 ? `
    <div class="hero-label">今日使えるお金</div>
    <div class="hero-amount${s.today < 0 ? ' negative' : ''}"><span class="yen">${s.today < 0 ? '−' : ''}¥</span>${num(s.today)}</div>
    <div class="meter" role="img" aria-label="今月の予算の${Math.round(s.ratio * 100)}%を使用"><span style="width:${(s.ratio * 100).toFixed(1)}%"></span></div>
    <div class="hero-foot"><span>今月の残り ${yen(s.left)}</span><span>あと${s.daysLeft}日</span></div>`
    : `<div class="hero-label">今日使えるお金</div>
    <p class="note" style="padding:8px 0 12px">毎月の予算を決めると、ここに「今日使えるお金」が出ます。</p>
    <button class="btn tinted" data-action="tab" data-tab="settings">予算を設定する</button>`;

  // Everything spent this month, with the fixed part shown separately so rent does not alarm.
  const month = monthOf(t);
  let monthTotal = 0, fixedTotal = 0;
  for (const e of state.entries) {
    if (!e.date.startsWith(month)) continue;
    monthTotal += e.amount;
    if (catById(e.categoryId)?.kind === 'fixed') fixedTotal += e.amount;
  }
  const monthBlock = `
    <div class="month-total">
      <span class="hero-label">今月の出費</span>
      <span class="month-total-amount">${yen(monthTotal)}</span>
    </div>
    ${fixedTotal ? `<div class="hero-foot" style="margin-top:2px"><span>うち固定費・サブスク ${yen(fixedTotal)}</span></div>` : ''}`;

  const recent = state.entries.slice(0, 40);
  const list = recent.length ? recent.map(entryRow).join('') : '<div class="empty">まだ記録がありません。下の ＋ から記録できます。</div>';
  // The one time the app speaks up: money is about to leave on its own.
  const soon = upcoming(state.recurring, t);
  const renewal = soon.length ? `
    <section class="group" style="margin-top:12px">
      <button class="row plain" data-action="tab" data-tab="recurring">
        <span class="main"><span class="title" style="max-width:none;flex-shrink:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(soon[0].name)} が${soon[0].days === 0 ? '今日' : `あと${soon[0].days}日で`}更新</span>
        ${soon.length > 1 ? `<span class="sub" style="flex:0 0 auto">ほか${soon.length - 1}件</span>` : ''}</span>
        <span class="amount">${yen(soon[0].amount)}</span>
        <span class="tag-need" aria-hidden="true">${ICON.right.replace('<svg', '<svg width="16" height="16"')}</span>
      </button>
    </section>` : '';
  return `
    <div class="topbar"></div>
    <div class="eyebrow">${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}曜日</div>
    <h1 class="large-title">Today</h1>
    <section class="group pad">${hero}${monthBlock}</section>
    ${renewal}
    <div class="section-head"><span>最近の記録</span></div>
    <section class="group">${list}</section>`;
}

function entryRow(e) {
  const name = catName(e.categoryId);
  const tag = e.tag ? `<span class="tag-${e.tag}">${TAG_LABEL[e.tag]}</span>` : '';
  const sub = [dateLabel(e.date), e.memo ? esc(e.memo) : ''].filter(Boolean).join(' · ');
  return `<button class="row" data-action="edit" data-id="${esc(e.id)}">
    <span class="main"><span class="title">${ico(e.categoryId)}${esc(name)}</span><span class="sub">${sub}${tag ? ' · ' + tag : ''}</span></span>
    <span class="amount">${yen(e.amount)}</span>
  </button>`;
}

// ---------- charts ----------
const manYen = (n) => (n >= 10000 ? `¥${Math.round(n / 10000).toLocaleString('ja-JP')}万` : yen(n));
function niceMax(v) {
  if (v <= 0) return 10000;
  const step = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * step >= v) return k * step;
  return 10 * step;
}

function paceChart(p, month) {
  if (!p.variableBudget && !p.fixed) {
    return '<p class="note" style="padding:4px 0 0">毎月の予算を設定すると、今月のペースが出ます。</p>';
  }
  const W = 334, H = 200, top = 14, maxY = niceMax(Math.max(p.total, p.actual) * 1.05);
  const x = (d) => ((d - 1) / Math.max(1, p.days - 1)) * W;
  const y = (v) => H - (v / maxY) * (H - top);
  const ticks = [maxY / 2, maxY];
  let path = '';
  if (p.points.length) {
    path = `M 0 ${y(0).toFixed(1)} L 0 ${y(p.fixed).toFixed(1)}`;
    let last = p.fixed;
    for (const pt of p.points) { path += ` L ${x(pt.day).toFixed(1)} ${y(last).toFixed(1)} L ${x(pt.day).toFixed(1)} ${y(pt.value).toFixed(1)}`; last = pt.value; }
  }
  const cur = p.points.length && p.lastDay < p.days;
  const xd = p.lastDay ? x(p.lastDay) : 0;
  const labelRight = xd > W * 0.6;
  const diff = Math.round(p.pace - p.actual);
  const status = !p.points.length ? '' : diff >= 0
    ? `<span class="pace-status good">予算のペースより ${yen(diff)} 少なめ</span>`
    : `<span class="pace-status over">予算のペースより ${yen(-diff)} 多め</span>`;
  return `
    <div class="chart-head"><span class="chart-value">${yen(p.actual)}</span><span class="chart-sub">${cur ? `${p.lastDay}日まで` : `予算 ${yen(p.total)}`}</span></div>
    ${status}
    <svg class="chart" viewBox="0 0 ${W} ${H + 20}" role="img" aria-label="${esc(`${monthLabel(month)}の累計支出は固定費を含めて${p.actual}円。予算のペースでは${Math.round(p.pace)}円、予算は${p.total}円`)}">
      ${p.fixed ? `<rect x="0" y="${y(p.fixed).toFixed(1)}" width="${W}" height="${(H - y(p.fixed)).toFixed(1)}" class="fixed-band"></rect>
      <text x="6" y="${(y(p.fixed) + 14).toFixed(1)}" class="t-fixed">固定費 ${yen(p.fixed)}</text>` : ''}
      ${ticks.map((v) => `<line x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"></line><text x="${W}" y="${(y(v) - 4).toFixed(1)}" text-anchor="end" class="t-axis">${manYen(v)}</text>`).join('')}
      <line x1="0" x2="${W}" y1="${H}" y2="${H}" class="axis"></line>
      <line x1="0" y1="${y(p.fixed).toFixed(1)}" x2="${W}" y2="${y(p.total).toFixed(1)}" class="pace-line"></line>
      ${cur ? `<line x1="${xd.toFixed(1)}" x2="${xd.toFixed(1)}" y1="${top}" y2="${H}" class="today-line"></line>` : ''}
      ${path ? `<path d="${path}" class="actual-line"></path>` : ''}
      ${p.points.length ? `<circle cx="${xd.toFixed(1)}" cy="${y(p.actual).toFixed(1)}" r="5" class="actual-dot"></circle>` : ''}
      ${p.points.length ? `<text x="${(labelRight ? xd - 8 : xd + 8).toFixed(1)}" y="${(y(p.actual) + 18).toFixed(1)}" text-anchor="${labelRight ? 'end' : 'start'}" class="t-strong">${cur ? '今日 ' : ''}${yen(p.actual)}</text>` : ''}
      <text x="0" y="${H + 16}" class="t-axis">1日</text>
      <text x="${x(15).toFixed(1)}" y="${H + 16}" text-anchor="middle" class="t-axis">15日</text>
      <text x="${W}" y="${H + 16}" text-anchor="end" class="t-axis">${p.days}日</text>
    </svg>
    <div class="chart-legend"><span><i class="swatch line-actual"></i>実際</span><span><i class="swatch line-pace"></i>予算のペース</span></div>`;
}

function trendChart(series, selected) {
  const max = niceMax(Math.max(...series.map((r) => r.total)));
  const cols = series.map((r) => {
    const parts = [['need', r.need + r.none], ['grow', r.grow], ['waste', r.waste]].filter(([, v]) => v > 0);
    const topKey = parts.length ? parts[parts.length - 1][0] : '';
    const segs = parts.map(([k, v]) => `<span class="seg-${k}${k === topKey ? ' top' : ''}" style="height:${Math.max(2, (v / max) * 100).toFixed(2)}%"></span>`).join('');
    const m = Number(r.month.slice(5));
    return `<button class="trend-col${r.month === selected ? ' on' : ''}" data-action="month-pick" data-month="${r.month}" aria-label="${m}月 ${yen(r.total)}">
      <span class="stack">${segs}</span><span class="m">${m}</span></button>`;
  }).join('');
  return `
    <div class="trend" role="group" aria-label="直近12か月の支出（タップでその月を表示）">
      <span class="trend-grid" style="top:calc((100% - 18px) / 2)"><i>${manYen(max / 2)}</i></span>
      <span class="trend-grid" style="top:0"><i>${manYen(max)}</i></span>
      ${cols}
    </div>
    <div class="chart-legend"><span><i class="swatch seg-need"></i>NEED</span><span><i class="swatch seg-grow"></i>GROW</span><span><i class="swatch seg-waste"></i>WASTE</span></div>`;
}

function categoryTrendChart(series, cat) {
  const max = niceMax(Math.max(1, ...series.map((r) => r.amount)));
  const avg = Math.round(series.reduce((s, r) => s + r.amount, 0) / series.length);
  const last = series.length - 1;
  return `
    <div class="chart-head"><span class="chart-value">${yen(avg)}</span><span class="chart-sub">月平均 · ${esc(cat.name)}</span></div>
    <div class="cat-trend" role="img" aria-label="${esc(`${cat.name}の直近12か月。月平均${avg}円`)}">
      <span class="avg-line" style="bottom:${((avg / max) * 100).toFixed(2)}%"><i>平均</i></span>
      ${series.map((r, i) => `<span class="bar${i === last ? ' now' : ''}" style="height:${Math.max(r.amount ? 2 : 0, (r.amount / max) * 100).toFixed(2)}%" title="${Number(r.month.slice(5))}月 ${yen(r.amount)}"></span>`).join('')}
    </div>
    <div class="cat-trend-labels">${series.map((r) => `<span>${Number(r.month.slice(5))}</span>`).join('')}</div>`;
}

function viewReport() {
  const m = state.reportMonth;
  const t = tagTotals(state.entries, m);
  const pct = (v) => (t.total ? (v / t.total) * 100 : 0).toFixed(1);

  const pace = paceSeries({ entries: state.entries, categories: state.categories, budget: state.budget, recurring: state.recurring, month: m, today: today() });
  const trend = monthlySeries(state.entries, m, 12);

  const rows = breakdown(state.entries, state.categories, state.budget, m);
  const maxAmount = Math.max(1, ...rows.map((r) => r.amount));
  const pickable = rows.filter((r) => r.amount > 0);
  if (!state.reportCat || !catById(state.reportCat)) state.reportCat = (pickable.find((r) => r.category.kind !== 'fixed') ?? pickable[0])?.category.id ?? 'food';
  const catRows = rows.map((r) => {
    const c = r.category;
    const note = c.kind === 'fixed' ? '定期' : c.kind === 'sinking' ? (r.limit ? `積立の残高 ${yen(r.limit - r.amount)}` : '積立') : (r.limit ? `予算 ${yen(r.limit)}` : '');
    return `<button class="row plain share-row${c.id === state.reportCat ? ' on' : ''}" data-action="cat-pick" data-cat="${esc(c.id)}">
      <span class="main"><span class="title">${ico(c.id)}${esc(c.name)}</span><span class="sub${r.over ? ' tag-waste' : ''}">${note}</span></span>
      <span class="share">${Math.round(r.share * 100)}%</span><span class="amount">${yen(r.amount)}</span>
      <span class="share-bar" aria-hidden="true"><span class="${c.kind === 'fixed' ? 'fixed' : r.over ? 'over' : ''}" style="width:${((r.amount / maxAmount) * 100).toFixed(1)}%"></span></span>
    </button>`;
  }).join('');

  const chipCats = state.categories.filter((c) => !c.archived && state.entries.some((e) => e.categoryId === c.id && e.date >= addMonths(m, -11) && e.date.slice(0, 7) <= m));
  const reportCat = catById(state.reportCat);
  const chips = chipCats.map((c) => `<button class="chip" data-action="cat-pick" data-cat="${esc(c.id)}" aria-pressed="${c.id === state.reportCat}">${iconSvg(c.icon, 16)}${esc(c.name)}</button>`).join('');

  const thisYear = Number(m.slice(0, 4));
  const years = [];
  for (let y = thisYear - 5; y <= thisYear; y++) years.push({ y, ...tagTotals(state.entries, String(y)) });
  const max = Math.max(1, ...years.map((y) => Math.max(y.grow, y.waste)));
  const bars = years.map((y) => `<div class="col"><span class="seg-grow" style="height:${(y.grow / max) * 100}%"></span><span class="seg-waste" style="height:${(y.waste / max) * 100}%"></span></div>`).join('');
  const yearAria = years.map((y) => `${y.y}年 GROW ${num(y.grow)}円 WASTE ${num(y.waste)}円`).join('、');

  return `
    <div class="topbar"></div>
    <h1 class="large-title">Insights</h1>
    <section class="group pad">
      <div class="month-nav">
        <button class="icon-btn" data-action="month" data-step="-1" aria-label="前の月">${ICON.left}</button>
        <span class="label">${monthLabel(m)}</span>
        <button class="icon-btn" data-action="month" data-step="1" aria-label="次の月" ${m >= monthOf(new Date()) ? 'disabled' : ''}>${ICON.right}</button>
      </div>
      <div class="hero-amount" style="font-size:36px;margin:8px 0 0">${yen(t.total)}</div>
      <div class="stack-bar" role="img" aria-label="NEED ${pct(t.need)}%、GROW ${pct(t.grow)}%、WASTE ${pct(t.waste)}%">
        <span class="seg-need" style="width:${pct(t.need)}%"></span><span class="seg-grow" style="width:${pct(t.grow)}%"></span><span class="seg-waste" style="width:${pct(t.waste)}%"></span>
      </div>
      <div class="legend">
        <span><i class="dot seg-need"></i>NEED<b>${yen(t.need)}</b></span>
        <span><i class="dot seg-grow"></i>GROW<b>${yen(t.grow)}</b></span>
        <span><i class="dot seg-waste"></i>WASTE<b>${yen(t.waste)}</b></span>
      </div>
    </section>

    <div class="section-head"><span>${m === monthOf(new Date()) ? '今月のペース' : `${Number(m.slice(5))}月のペース`}</span><span>固定費は月初に計上</span></div>
    <section class="group pad">${paceChart(pace, m)}</section>

    <div class="section-head"><span>月ごとの推移</span><span>タップで月を切り替え</span></div>
    <section class="group pad">${trendChart(trend, m)}</section>

    <div class="section-head"><span>カテゴリの内訳</span></div>
    <section class="group">${catRows || '<div class="empty">この月の記録はありません。</div>'}</section>

    ${reportCat ? `<div class="section-head"><span>カテゴリの推移</span><span>直近12か月</span></div>
    <div class="chips" style="padding-top:0;padding-bottom:8px">${chips}</div>
    <section class="group pad">${categoryTrendChart(categorySeries(state.entries, reportCat.id, m, 12), reportCat)}</section>` : ''}

    <div class="section-head"><span>GROW と WASTE（年ごと）</span></div>
    <section class="group pad">
      <div class="years" role="img" aria-label="${esc(yearAria)}">${bars}</div>
      <div class="year-labels">${years.map((y) => `<span>${y.y}</span>`).join('')}</div>
    </section>`;
}

function viewSettings() {
  const cats = state.categories.filter((c) => !c.archived);
  const hidden = state.categories.filter((c) => c.archived);
  const planned = (id) => state.recurring.filter((r) => r.active && r.categoryId === id && r.kind !== 'savings').reduce((s, r) => s + monthly(r), 0);
  const variableTotal = cats.filter((c) => c.kind === 'variable').reduce((s, c) => s + (state.budget.standard[c.id] ?? 0), 0);
  const fixedTotal = cats.filter((c) => c.kind === 'fixed').reduce((s, c) => s + planned(c.id), 0);
  const nameBtn = (c, extra = '') => `<button class="cat-name" data-action="c-edit" data-id="${esc(c.id)}" aria-label="${esc(c.name)}を編集">${ico(c.id)}<span class="title">${esc(c.name)}</span>${extra}</button>`;
  const rows = cats.map((c) => c.kind === 'fixed' ? `
    <div class="row plain">
      ${nameBtn(c, '<span class="pill">定期</span>')}
      <button class="fixed-amount" data-action="tab" data-tab="recurring" aria-label="${esc(c.name)}の定期支出を見る">${planned(c.id) ? yen(planned(c.id)) : '未登録'}</button>
    </div>` : `
    <div class="row plain">
      ${nameBtn(c, c.kind === 'sinking' ? '<span class="pill soft">積立</span>' : '')}
      <span style="color:var(--ink-soft)">¥</span><input class="budget-input" id="b-${esc(c.id)}" inputmode="numeric" data-budget="${esc(c.id)}" value="${state.budget.standard[c.id] ? num(state.budget.standard[c.id]) : ''}" placeholder="0" aria-label="${esc(c.name)}の毎月の予算">
    </div>`).join('');
  const hiddenRows = hidden.map((c) => `<div class="row plain">${nameBtn(c, '<span class="sub">非表示</span>')}</div>`).join('');
  const themes = [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']];
  const lastBackup = state.settings.lastBackup ? dateLabel(state.settings.lastBackup.slice(0, 10)) : 'まだありません';
  return `
    <div class="topbar"></div>
    <h1 class="large-title">Settings</h1>
    <div class="section-head"><span>毎月の予算</span><span id="budget-total">毎月 ${yen(variableTotal)} ・ 定期 ${yen(fixedTotal)}</span></div>
    <section class="group">${rows}<button class="row plain add-row" data-action="c-new"><span class="main"><span class="title">＋ カテゴリを追加</span></span></button></section>
    <p class="note">名前をタップすると、アイコンや名前を変えられます。予算を入れたカテゴリの合計から、今日使えるお金を計算します。「積立」は服や旅行のような大きな出費用、「定期」は家賃やサブスクで、どちらも毎日の金額には響きません。定期の金額は Recurring タブで登録した支払いから自動で入ります。</p>
    ${hiddenRows ? `<div class="section-head"><span>非表示のカテゴリ</span></div><section class="group">${hiddenRows}</section>` : ''}

    <div class="section-head"><span>データ</span><span>最後のバックアップ：${lastBackup}</span></div>
    <section class="group">
      <button class="row plain" data-action="pick" data-input="file-eb"><span class="main"><span class="title">ExpenseBook から読み込む（CSV）</span></span></button>
      <button class="row plain" data-action="backup"><span class="main"><span class="title">バックアップを書き出す</span></span></button>
      <button class="row plain" data-action="pick" data-input="file-restore"><span class="main"><span class="title">バックアップから戻す</span></span></button>
      <button class="row plain" data-action="wipe"><span class="main"><span class="title tag-waste">すべてのデータを削除</span></span></button>
    </section>
    <p class="note">データはこの端末の中だけに保存され、外部には送信されません。ときどきバックアップを書き出して、iCloud Drive などに保存してください。「戻す」と今のデータはすべて置き換わります。</p>

    <div class="section-head"><span>表示</span></div>
    <section class="group pad">
      <div class="seg" role="group" aria-label="テーマ">${themes.map(([v, l]) => `<button data-action="theme" data-theme-value="${v}" aria-pressed="${state.settings.theme === v}">${l}</button>`).join('')}</div>
    </section>
    <p class="note">Money Atlas ${VERSION} · ${state.entries.length.toLocaleString('ja-JP')} 件の記録</p>`;
}

function viewRecurring() {
  const t = today();
  const active = state.recurring.filter((r) => r.active);
  const sum = (kind) => active.filter((r) => r.kind === kind).reduce((s, r) => s + monthly(r), 0);
  const fixed = sum('fixed'), subs = sum('subscription'), savings = sum('savings');
  const subsYear = active.filter((r) => r.kind === 'subscription').reduce((s, r) => s + (r.cycle === 'yearly' ? r.amount : r.amount * 12), 0);

  const dismissed = new Set(state.settings.dismissed ?? []);
  const ideas = suggest(state.entries, state.recurring, t).filter((s) => !dismissed.has(s.name.trim().toLowerCase())).slice(0, 3);
  const ideaRows = ideas.map((s, i) => `
    <div class="row plain">
      <span class="main"><span class="title">${esc(s.name)} ${yen(s.amount)}</span><span class="sub">${s.months}か月続いています</span></span>
      <button class="btn tinted" style="min-height:30px;padding:0 12px;font-size:13px" data-action="r-suggest" data-i="${i}">登録</button>
      <button class="link-btn" style="color:var(--ink-soft);min-height:30px" data-action="r-dismiss" data-name="${esc(s.name)}">無視</button>
    </div>`).join('');
  recurringIdeas = ideas;

  const section = (kind) => {
    const items = state.recurring.filter((r) => r.kind === kind).sort((a, b) => (a.active === b.active ? a.nextDate.localeCompare(b.nextDate) : a.active ? -1 : 1));
    if (!items.length) return '';
    return `<div class="section-head"><span>${KIND_LABEL[kind]}</span></div><section class="group">${items.map((r) => {
      const days = daysUntil(r.nextDate, t);
      const soon = r.active && r.remindDaysBefore != null && days <= r.remindDaysBefore;
      const when = !r.active ? '停止中' : soon ? `<span class="tag-waste">${days === 0 ? '今日' : `あと${days}日で`}更新</span>` : `次回 ${dateLabel(r.nextDate)}`;
      return `<button class="row" data-action="r-edit" data-id="${esc(r.id)}">
        <span class="main"><span class="title">${r.categoryId ? ico(r.categoryId) : ''}${esc(r.name)}</span><span class="sub">${when} · ${r.cycle === 'yearly' ? '毎年' : '毎月'}</span></span>
        <span class="amount">${yen(r.amount)}</span></button>`;
    }).join('')}</section>`;
  };

  return `
    <div class="topbar"><button class="icon-btn" data-action="r-new" aria-label="定期支出を追加">${ICON.plus}</button></div>
    <h1 class="large-title">Recurring</h1>
    <section class="group pad">
      <div class="hero-label">毎月の固定費とサブスク</div>
      <div class="hero-amount" style="font-size:36px"><span class="yen">¥</span>${num(fixed + subs)}</div>
      <div class="legend">
        <span>固定費<b>${yen(fixed)}</b></span><span>サブスク<b>${yen(subs)}</b></span><span>先取り貯蓄<b>${yen(savings)}</b></span>
      </div>
      ${subsYear ? `<p class="note" style="padding:12px 0 0">サブスクを1年にすると <b style="color:var(--ink)">${yen(subsYear)}</b></p>` : ''}
    </section>
    ${ideas.length ? `<div class="section-head"><span>履歴から見つけました</span></div><section class="group">${ideaRows}</section>` : ''}
    ${section('fixed')}${section('subscription')}${section('savings')}
    ${state.recurring.length ? '' : '<div class="empty">家賃、保険、サブスクなどを登録すると、支払日に自動で記録されます。</div>'}
    <p class="note">支払日にアプリを開くと自動で記録されます。固定費とサブスクは「今日使えるお金」には影響しません。更新前に iPhone で通知が欲しいときは、各項目の「カレンダーに追加」を使ってください。</p>`;
}
let recurringIdeas = [];

function render() {
  const main = $('#main');
  main.innerHTML = state.tab === 'report' ? viewReport() : state.tab === 'settings' ? viewSettings() : state.tab === 'recurring' ? viewRecurring() : viewToday();
  for (const b of document.querySelectorAll('.tabbar button')) b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false');
}

// ---------- entry sheet ----------
let sheet = null; // { entry|null, amount, categoryId, tag, tagTouched, memo, date }

function openSheet(entry) {
  rsheet = null;
  const recentCat = state.entries[0]?.categoryId ?? 'food';
  const cat = entry ? entry.categoryId : (catById(recentCat) ? recentCat : state.categories[0]?.id);
  sheet = {
    entry,
    amount: entry ? String(entry.amount) : '0',
    categoryId: cat,
    tag: entry ? entry.tag : (catById(cat)?.defaultTag ?? 'need'),
    tagTouched: !!entry,
    memo: entry?.memo ?? '',
    date: entry?.date ?? today(),
  };
  $('#sheet').innerHTML = sheetMarkup();
  $('#sheet').hidden = false; $('#backdrop').hidden = false;
  requestAnimationFrame(() => { $('#sheet').classList.add('open'); $('#backdrop').classList.add('open'); });
}

function closeSheet() {
  sheet = null; rsheet = null; csheet = null;
  $('#sheet').classList.remove('open'); $('#backdrop').classList.remove('open');
  setTimeout(() => { if (!sheet && !rsheet && !csheet) { $('#sheet').hidden = true; $('#backdrop').hidden = true; } }, 280);
}

function memoSuggestions() {
  const counts = new Map();
  for (const e of state.entries.slice(0, 600)) {
    if (e.categoryId !== sheet.categoryId || !e.memo) continue;
    counts.set(e.memo, (counts.get(e.memo) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m]) => m);
}

function sheetHint() {
  const amount = Number(sheet.amount);
  const cat = catById(sheet.categoryId);
  if (sheet.date !== today() || cat?.kind !== 'variable') return cat?.kind === 'sinking' ? '積立から使います（今日の金額には響きません）' : '';
  const others = sheet.entry ? state.entries.filter((e) => e.id !== sheet.entry.id) : state.entries;
  const s = todaySummary({ budget: state.budget, categories: state.categories, entries: [...others, { date: sheet.date, categoryId: cat.id, amount }], today: today() });
  return s.budget > 0 ? `記録後の今日使えるお金 ${yen(s.today)}` : '';
}

function sheetMarkup() {
  const cats = state.categories.filter((c) => !c.archived);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];
  return `
    <div class="grabber" aria-hidden="true"></div>
    <div class="sheet-bar">
      <button class="text-btn left" data-action="close">キャンセル</button>
      <span class="sheet-title" id="sheet-title">${sheet.entry ? '記録を編集' : '記録'}</span>
      <button class="text-btn strong right" data-action="save" ${Number(sheet.amount) > 0 ? '' : 'disabled'}>保存</button>
    </div>
    <div class="sheet-body">
      <div class="amount-display" aria-live="polite"><span class="yen">¥</span>${num(Number(sheet.amount))}</div>
      <div class="amount-hint">${esc(sheetHint())}</div>
      <div class="seg" role="group" aria-label="タグ">${['need', 'grow', 'waste'].map((t) => `<button class="tag-${t}" data-action="tag" data-tag="${t}" aria-pressed="${sheet.tag === t}">${TAG_LABEL[t]}</button>`).join('')}</div>
      <div class="chips" role="group" aria-label="カテゴリ">${cats.map((c) => `<button class="chip" data-action="cat" data-cat="${esc(c.id)}" aria-pressed="${sheet.categoryId === c.id}">${iconSvg(c.icon, 16)}${esc(c.name)}</button>`).join('')}</div>
      <div class="chips" style="padding-top:8px">${memoSuggestions().map((m) => `<button class="chip small" data-action="memo" data-memo="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      <section class="group" style="margin-top:10px">
        <div class="field-row"><label for="f-memo">メモ</label><input id="f-memo" data-field="memo" value="${esc(sheet.memo)}" placeholder="なし" autocomplete="off"></div>
        <div class="field-row"><label for="f-date">日付</label><input id="f-date" type="date" data-field="date" value="${esc(sheet.date)}" max="${today()}"></div>
      </section>
      ${sheet.entry ? '<button class="btn danger block" style="margin-top:8px" data-action="delete">この記録を削除</button>' : ''}
    </div>
    <div class="keypad">${keys.map((k) => `<button class="${k === 'del' || k === '00' ? 'fn' : ''}" data-action="key" data-key="${k}" aria-label="${k === 'del' ? '1文字消す' : k}">${k === 'del' ? ICON.backspace : `<span class="k">${k}</span><span class="l">${KEY_LETTERS[k] ?? ''}</span>`}</button>`).join('')}</div>`;
}

function refreshSheet() {
  const focused = document.activeElement?.dataset?.field;
  $('#sheet').innerHTML = sheetMarkup();
  if (focused) $(`#sheet [data-field="${focused}"]`)?.focus();
}

function pressKey(k) {
  let a = sheet.amount;
  if (k === 'del') a = a.length > 1 ? a.slice(0, -1) : '0';
  else if (a === '0') a = k === '00' ? '0' : k;
  else if (a.length < 9) a += k;
  sheet.amount = a;
  $('#sheet .amount-display').innerHTML = `<span class="yen">¥</span>${num(Number(a))}`;
  $('#sheet .amount-hint').textContent = sheetHint();
  $('#sheet [data-action="save"]').disabled = !(Number(a) > 0);
}

async function saveSheet() {
  const amount = Number(sheet.amount);
  if (!(amount > 0)) return;
  const now = new Date().toISOString();
  let e;
  if (sheet.entry) {
    e = { ...sheet.entry, amount, categoryId: sheet.categoryId, memo: sheet.memo.trim(), date: sheet.date, updatedAt: now };
    if (e.tag !== sheet.tag) { e.tag = sheet.tag; e.tagHistory = [...(e.tagHistory ?? []), { tag: sheet.tag, at: now, by: 'user' }]; }
    state.entries = state.entries.map((x) => (x.id === e.id ? e : x));
  } else {
    e = {
      id: newId(), date: sheet.date, amount, categoryId: sheet.categoryId, memo: sheet.memo.trim(),
      tag: sheet.tag, tagHistory: sheet.tag ? [{ tag: sheet.tag, at: now, by: 'user' }] : [],
      payment: null, recurringId: null, flags: [], source: null, createdAt: now, updatedAt: now,
    };
    state.entries.push(e);
  }
  sortEntries();
  await db.put('entries', e);
  closeSheet(); render();
}

async function deleteEntry() {
  if (!confirm('この記録を削除しますか？')) return;
  const id = sheet.entry.id;
  state.entries = state.entries.filter((e) => e.id !== id);
  await db.remove('entries', id);
  closeSheet(); render(); toast('削除しました');
}

// ---------- recurring sheet ----------
let rsheet = null; // a draft recurring item being edited, plus { isNew, originalCategory }

function openRecurringSheet(item, draft = null) {
  const base = item ?? {
    name: '', amount: 0, cycle: 'monthly', nextDate: '', categoryId: 'subscriptions',
    tag: 'need', kind: 'subscription', remindDaysBefore: 3, active: true, ...draft,
  };
  rsheet = { ...base, amountText: base.amount ? String(base.amount) : '', isNew: !item };
  if (draft && catById(draft.categoryId)?.kind !== 'fixed') rsheet.categoryId = 'subscriptions';
  sheet = null;
  $('#sheet').innerHTML = recurringMarkup();
  $('#sheet').hidden = false; $('#backdrop').hidden = false;
  requestAnimationFrame(() => { $('#sheet').classList.add('open'); $('#backdrop').classList.add('open'); });
}

function recurringMarkup() {
  const r = rsheet;
  const seg = (action, current, options) => `<div class="seg" role="group" style="grid-template-columns:repeat(${options.length},minmax(0,1fr))">${options.map(([v, l]) =>
    `<button data-action="${action}" data-v="${v}" aria-pressed="${String(current) === String(v)}">${l}</button>`).join('')}</div>`;
  const cats = [...state.categories.filter((c) => !c.archived && c.kind === 'fixed'), ...state.categories.filter((c) => !c.archived && c.kind !== 'fixed')];
  const valid = r.name.trim() && Number(r.amountText) > 0 && r.nextDate;
  return `
    <div class="grabber" aria-hidden="true"></div>
    <div class="sheet-bar">
      <button class="text-btn left" data-action="close">キャンセル</button>
      <span class="sheet-title" id="sheet-title">${r.isNew ? '定期支出を追加' : '定期支出を編集'}</span>
      <button class="text-btn strong right" data-action="r-save" ${valid ? '' : 'disabled'}>保存</button>
    </div>
    <div class="sheet-body" style="padding-bottom:calc(var(--safe-b) + 16px)">
      <section class="group" style="margin-top:8px">
        <div class="field-row"><label for="r-name">名前</label><input id="r-name" data-rfield="name" value="${esc(r.name)}" placeholder="例：YouTube" autocomplete="off"></div>
        <div class="field-row"><label for="r-amount">金額</label><input id="r-amount" data-rfield="amountText" inputmode="numeric" pattern="[0-9]*" value="${esc(r.amountText)}" placeholder="¥0"></div>
        <div class="field-row"><label for="r-date">次の支払日</label><input id="r-date" type="date" data-rfield="nextDate" value="${esc(r.nextDate)}" min="${r.isNew ? today() : ''}"></div>
      </section>
      <div class="section-head" style="padding-left:4px"><span>種類</span></div>
      ${seg('r-kind', r.kind, [['fixed', '固定費'], ['subscription', 'サブスク'], ['savings', '先取り貯蓄']])}
      <div class="section-head" style="padding-left:4px"><span>くり返し</span></div>
      ${seg('r-cycle', r.cycle, [['monthly', '毎月'], ['yearly', '毎年']])}
      ${r.kind === 'savings' ? '<p class="note" style="padding-left:4px">先取り貯蓄は支出として記録しません。毎月いくら未来に回しているかを見えるようにするためのものです。</p>' : `
      <div class="section-head" style="padding-left:4px"><span>カテゴリ</span></div>
      <div class="chips" style="padding-top:0">${cats.map((c) => `<button class="chip" data-action="r-cat" data-cat="${esc(c.id)}" aria-pressed="${r.categoryId === c.id}">${iconSvg(c.icon, 16)}${esc(c.name)}</button>`).join('')}</div>
      <div class="section-head" style="padding-left:4px"><span>タグ</span></div>
      <div class="seg" role="group">${['need', 'grow', 'waste'].map((t) => `<button class="tag-${t}" data-action="r-tag" data-v="${t}" aria-pressed="${r.tag === t}">${TAG_LABEL[t]}</button>`).join('')}</div>
      <div class="section-head" style="padding-left:4px"><span>更新前のお知らせ（アプリ内）</span></div>
      ${seg('r-remind', r.remindDaysBefore ?? 'none', [['none', 'なし'], ['1', '前日'], ['3', '3日前'], ['7', '7日前']])}`}
      ${r.isNew ? '' : `
      <section class="group" style="margin-top:20px">
        ${r.kind === 'savings' ? '' : '<button class="row plain" data-action="r-ics"><span class="main stack"><span class="title" style="color:var(--brand-ink)">カレンダーに追加</span><span class="sub">更新前に iPhone のカレンダーから通知が届きます</span></span></button>'}
        <button class="row plain" data-action="r-toggle"><span class="main stack"><span class="title">${r.active ? '一時停止する' : '再開する'}</span><span class="sub">${r.active ? '解約したときなど。過去の記録は残ります' : '次の支払日から再び記録します'}</span></span></button>
        <button class="row plain" data-action="r-delete"><span class="main stack"><span class="title tag-waste">削除</span><span class="sub">過去の記録は残ります</span></span></button>
      </section>`}
    </div>`;
}

function refreshRecurringSheet() {
  const focused = document.activeElement?.dataset?.rfield;
  $('#sheet').innerHTML = recurringMarkup();
  if (focused) { const el = $(`#sheet [data-rfield="${focused}"]`); el?.focus(); if (el?.setSelectionRange && el.type !== 'date') el.setSelectionRange(el.value.length, el.value.length); }
}

async function saveRecurring() {
  const r = rsheet;
  const now = new Date().toISOString();
  const item = {
    id: r.id ?? 'rc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: r.name.trim(), amount: Number(r.amountText), cycle: r.cycle, nextDate: r.nextDate,
    anchorDay: Number(r.nextDate.slice(8, 10)), categoryId: r.kind === 'savings' ? null : r.categoryId,
    tag: r.tag, kind: r.kind, remindDaysBefore: r.kind === 'savings' ? null : r.remindDaysBefore,
    active: r.active, createdAt: r.createdAt ?? now, updatedAt: now,
  };
  state.recurring = [...state.recurring.filter((x) => x.id !== item.id), item];
  await db.put('recurring', item);

  // Past payments with the same name may sit in an everyday category (rent filed under 日用品).
  // Offer to move them, so this month's allowance and the reports stay honest.
  if (item.categoryId) {
    const key = item.name.toLowerCase();
    const past = state.entries.filter((e) => e.memo && e.memo.trim().toLowerCase() === key && e.categoryId !== item.categoryId);
    if (past.length && confirm(`過去の「${item.name}」の記録 ${past.length} 件も「${catName(item.categoryId)}」に移しますか？\n移すと、今日使えるお金や Insights が正しく計算されます。`)) {
      const moved = past.map((e) => ({ ...e, categoryId: item.categoryId, updatedAt: now }));
      const byId = new Map(moved.map((e) => [e.id, e]));
      state.entries = state.entries.map((e) => byId.get(e.id) ?? e);
      await db.putMany('entries', moved);
    }
  }
  closeSheet();
  await postRecurring();
  render();
}

async function deleteRecurring() {
  if (!confirm(`「${rsheet.name}」を削除しますか？過去の記録は残ります。`)) return;
  state.recurring = state.recurring.filter((x) => x.id !== rsheet.id);
  await db.remove('recurring', rsheet.id);
  closeSheet(); render(); toast('削除しました');
}

async function toggleRecurring() {
  const item = { ...state.recurring.find((x) => x.id === rsheet.id), active: !rsheet.active, updatedAt: new Date().toISOString() };
  // Resuming: never back-post the months it was paused.
  if (item.active && item.nextDate < today()) {
    while (item.nextDate < today()) item.nextDate = advance(item.nextDate, item.cycle, item.anchorDay);
  }
  state.recurring = state.recurring.map((x) => (x.id === item.id ? item : x));
  await db.put('recurring', item);
  closeSheet(); render(); toast(item.active ? '再開しました' : '一時停止しました');
}

function addToCalendar() {
  const item = state.recurring.find((x) => x.id === rsheet.id);
  const url = URL.createObjectURL(new Blob([toICS(item)], { type: 'text/calendar' }));
  // Opening the file (rather than saving it) lets iPhone offer "Add to Calendar".
  location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---------- category sheet ----------
let csheet = null;

function openCategorySheet(cat) {
  sheet = null; rsheet = null;
  csheet = cat
    ? { ...cat, budgetText: state.budget.standard[cat.id] ? num(state.budget.standard[cat.id]) : '', isNew: false }
    : { id: null, name: '', icon: 'tag', kind: 'variable', carryover: 'reset', defaultTag: 'need', archived: false, budgetText: '', isNew: true };
  $('#sheet').innerHTML = categoryMarkup();
  $('#sheet').hidden = false; $('#backdrop').hidden = false;
  requestAnimationFrame(() => { $('#sheet').classList.add('open'); $('#backdrop').classList.add('open'); });
}

function categoryMarkup() {
  const c = csheet;
  const seg = (action, current, options) => `<div class="seg" role="group" style="grid-template-columns:repeat(${options.length},minmax(0,1fr))">${options.map(([v, l]) =>
    `<button data-action="${action}" data-v="${v}" aria-pressed="${current === v}">${l}</button>`).join('')}</div>`;
  const used = state.entries.some((e) => e.categoryId === c.id);
  return `
    <div class="grabber" aria-hidden="true"></div>
    <div class="sheet-bar">
      <button class="text-btn left" data-action="close">キャンセル</button>
      <span class="sheet-title" id="sheet-title">${c.isNew ? 'カテゴリを追加' : 'カテゴリを編集'}</span>
      <button class="text-btn strong right" data-action="c-save" ${c.name.trim() ? '' : 'disabled'}>保存</button>
    </div>
    <div class="sheet-body" style="padding-bottom:calc(var(--safe-b) + 16px)">
      <div class="icon-preview" aria-hidden="true">${iconSvg(c.icon, 44)}</div>
      <section class="group">
        <div class="field-row"><label for="c-name">名前</label><input id="c-name" data-cfield="name" value="${esc(c.name)}" placeholder="例：ペット" autocomplete="off"></div>
        ${c.kind === 'fixed' ? '' : `<div class="field-row"><label for="c-budget">毎月の予算</label><input id="c-budget" data-cfield="budgetText" inputmode="numeric" value="${esc(c.budgetText)}" placeholder="¥0"></div>`}
      </section>
      <div class="section-head" style="padding-left:4px"><span>アイコン</span></div>
      <div class="icon-grid" role="group" aria-label="アイコンを選ぶ">${ICON_KEYS.map((k) => `<button data-action="c-icon" data-v="${k}" aria-pressed="${c.icon === k}" aria-label="${k}">${iconSvg(k, 22)}</button>`).join('')}</div>
      <div class="section-head" style="padding-left:4px"><span>種類</span></div>
      ${seg('c-kind', c.kind, [['variable', '毎月'], ['sinking', '積立'], ['fixed', '定期']])}
      <p class="note" style="padding-left:4px">${c.kind === 'variable' ? '今日使えるお金の計算に入ります。' : c.kind === 'sinking' ? '服や旅行のような大きな出費用。使っても今日の金額には響きません。' : '家賃やサブスクなど、定期支出で使うカテゴリです。'}</p>
      <div class="section-head" style="padding-left:4px"><span>記録するときのタグ（最初に選ばれるもの）</span></div>
      <div class="seg" role="group">${['need', 'grow', 'waste'].map((t) => `<button class="tag-${t}" data-action="c-tag" data-v="${t}" aria-pressed="${c.defaultTag === t}">${TAG_LABEL[t]}</button>`).join('')}</div>
      ${c.isNew ? '' : `
      <section class="group" style="margin-top:20px">
        <button class="row plain" data-action="c-archive"><span class="main stack"><span class="title ${c.archived ? '' : 'tag-waste'}">${c.archived ? 'もう一度表示する' : '非表示にする'}</span><span class="sub">${used ? '過去の記録はそのまま残ります' : 'まだ記録はありません'}</span></span></button>
      </section>`}
    </div>`;
}

function refreshCategorySheet() {
  const focused = document.activeElement?.dataset?.cfield;
  $('#sheet').innerHTML = categoryMarkup();
  if (focused) $(`#sheet [data-cfield="${focused}"]`)?.focus();
}

async function saveCategory() {
  const c = csheet;
  const icon = c.icon || FALLBACK_ICON;
  const cat = {
    id: c.id ?? 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: c.name.trim(), icon, kind: c.kind,
    carryover: c.kind === 'sinking' ? 'both' : c.kind === 'fixed' ? 'reset' : (c.carryover === 'both' ? 'reset' : c.carryover ?? 'reset'),
    defaultTag: c.defaultTag, archived: !!c.archived,
    order: typeof c.order === 'number' ? c.order : Math.max(0, ...state.categories.map((x) => x.order ?? 0)) + 1,
  };
  // Keep the category's place in the list; new ones go at the end.
  state.categories = state.categories.some((x) => x.id === cat.id)
    ? state.categories.map((x) => (x.id === cat.id ? cat : x))
    : [...state.categories, cat];
  await db.put('categories', cat);
  if (cat.kind !== 'fixed') {
    const v = Number(String(c.budgetText).replace(/[^0-9]/g, ''));
    if (v > 0) state.budget.standard[cat.id] = v; else delete state.budget.standard[cat.id];
    if (v > 0) state.budget.startMonth ??= monthOf(new Date());
    await saveBudget();
  } else delete state.budget.standard[cat.id];
  closeSheet(); render();
}

async function toggleArchiveCategory() {
  csheet.archived = !csheet.archived;
  const hidden = csheet.archived;
  await saveCategory();
  toast(hidden ? '非表示にしました' : 'もう一度表示しました');
}

// ---------- data ----------
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function backup() {
  const data = await db.exportAll();
  download(`money-atlas-backup-${today()}.json`, JSON.stringify({ app: 'money-atlas', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), ...data }));
  state.settings.lastBackup = new Date().toISOString();
  await saveSettings(); render();
}

async function importExpenseBookFile(file) {
  try {
    const { entries, categories, report } = importExpenseBook(decodeExpenseBook(await file.arrayBuffer()));
    const existing = new Set(state.entries.map((e) => e.id));
    const added = entries.filter((e) => !existing.has(e.id));
    if (!confirm(`${entries.length.toLocaleString('ja-JP')} 件のうち、新しい ${added.length.toLocaleString('ja-JP')} 件を読み込みます。よろしいですか？`)) return;
    let next = Math.max(0, ...state.categories.map((c) => c.order ?? 0));
    const newCats = categories.filter((c) => !catById(c.id)).map((c) => ({ ...c, icon: DEFAULT_ICON_KEYS[c.id] ?? FALLBACK_ICON, order: ++next }));
    state.categories.push(...newCats);
    state.entries.push(...added);
    sortEntries();
    await db.putMany('categories', newCats);
    await db.putMany('entries', added);
    const flagged = Object.values(report.flagged).reduce((s, ids) => s + ids.length, 0);
    render();
    toast(`${added.length.toLocaleString('ja-JP')} 件を読み込みました${flagged ? `（要確認 ${flagged} 件）` : ''}`);
  } catch (err) {
    alert('読み込めませんでした：' + err.message);
  }
}

async function restoreFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'money-atlas') throw new Error('Money Atlas のバックアップではありません');
    if (!confirm(`${data.entries.length.toLocaleString('ja-JP')} 件の記録で、今のデータをすべて置き換えます。よろしいですか？`)) return;
    await db.importAll(data);
    await load(); applyTheme(); render(); toast('バックアップから戻しました');
  } catch (err) {
    alert('戻せませんでした：' + err.message);
  }
}

async function wipeAll() {
  if (!confirm('すべての記録・予算・設定を削除します。元に戻せません。')) return;
  if (!confirm('本当に削除しますか？先にバックアップを書き出すことをおすすめします。')) return;
  await db.wipe();
  state.entries = []; state.categories = []; state.budget = { standard: {}, overrides: {}, startMonth: null };
  state.settings = { theme: 'auto', lastBackup: null };
  await load(); applyTheme(); render(); toast('削除しました');
}

// ---------- events ----------
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'tab') { state.tab = el.dataset.tab; render(); scrollTo(0, 0); }
  else if (a === 'new') openSheet(null);
  else if (a === 'edit') openSheet(state.entries.find((e) => e.id === el.dataset.id));
  else if (a === 'close') closeSheet();
  else if (a === 'save') saveSheet();
  else if (a === 'delete') deleteEntry();
  else if (a === 'key') pressKey(el.dataset.key);
  else if (a === 'tag') { sheet.tag = el.dataset.tag; sheet.tagTouched = true; refreshSheet(); }
  else if (a === 'cat') {
    sheet.categoryId = el.dataset.cat;
    if (!sheet.tagTouched) sheet.tag = catById(sheet.categoryId)?.defaultTag ?? 'need';
    refreshSheet();
  }
  else if (a === 'memo') { sheet.memo = el.dataset.memo; refreshSheet(); }
  else if (a === 'month') { state.reportMonth = addMonths(state.reportMonth, Number(el.dataset.step)); render(); }
  else if (a === 'month-pick') { state.reportMonth = el.dataset.month; render(); }
  else if (a === 'cat-pick') {
    state.reportCat = el.dataset.cat; render();
    document.querySelector('.cat-trend')?.closest('section')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  else if (a === 'theme') { state.settings.theme = el.dataset.themeValue; applyTheme(); await saveSettings(); render(); }
  else if (a === 'r-new') openRecurringSheet(null);
  else if (a === 'r-edit') openRecurringSheet(state.recurring.find((r) => r.id === el.dataset.id));
  else if (a === 'r-suggest') openRecurringSheet(null, recurringIdeas[Number(el.dataset.i)]);
  else if (a === 'r-dismiss') {
    state.settings.dismissed = [...(state.settings.dismissed ?? []), el.dataset.name.trim().toLowerCase()];
    await saveSettings(); render();
  }
  else if (a === 'r-kind') { rsheet.kind = el.dataset.v; if (rsheet.kind === 'fixed' && rsheet.remindDaysBefore === 3) rsheet.remindDaysBefore = null; refreshRecurringSheet(); }
  else if (a === 'r-cycle') { rsheet.cycle = el.dataset.v; refreshRecurringSheet(); }
  else if (a === 'r-cat') { rsheet.categoryId = el.dataset.cat; refreshRecurringSheet(); }
  else if (a === 'r-tag') { rsheet.tag = el.dataset.v; refreshRecurringSheet(); }
  else if (a === 'r-remind') { rsheet.remindDaysBefore = el.dataset.v === 'none' ? null : Number(el.dataset.v); refreshRecurringSheet(); }
  else if (a === 'r-save') saveRecurring();
  else if (a === 'r-delete') deleteRecurring();
  else if (a === 'r-toggle') toggleRecurring();
  else if (a === 'r-ics') addToCalendar();
  else if (a === 'c-edit') openCategorySheet(catById(el.dataset.id));
  else if (a === 'c-new') openCategorySheet(null);
  else if (a === 'c-icon') { csheet.icon = el.dataset.v; refreshCategorySheet(); }
  else if (a === 'c-kind') { csheet.kind = el.dataset.v; refreshCategorySheet(); }
  else if (a === 'c-tag') { csheet.defaultTag = el.dataset.v; refreshCategorySheet(); }
  else if (a === 'c-save') saveCategory();
  else if (a === 'c-archive') toggleArchiveCategory();
  else if (a === 'pick') $('#' + el.dataset.input).click();
  else if (a === 'backup') backup();
  else if (a === 'wipe') wipeAll();
});

$('#backdrop').addEventListener('click', closeSheet);

document.addEventListener('input', (ev) => {
  const f = ev.target.dataset?.field;
  if (f && sheet) {
    sheet[f] = ev.target.value;
    if (f === 'date') $('#sheet .amount-hint').textContent = sheetHint();
  }
  const cf = ev.target.dataset?.cfield;
  if (cf && csheet) {
    csheet[cf] = ev.target.value;
    $('#sheet [data-action="c-save"]').disabled = !csheet.name.trim();
  }
  const rf = ev.target.dataset?.rfield;
  if (rf && rsheet) {
    rsheet[rf] = rf === 'amountText' ? ev.target.value.replace(/[^0-9]/g, '') : ev.target.value;
    if (rf === 'amountText' && ev.target.value !== rsheet.amountText) ev.target.value = rsheet.amountText;
    $('#sheet [data-action="r-save"]').disabled = !(rsheet.name.trim() && Number(rsheet.amountText) > 0 && rsheet.nextDate);
  }
});

document.addEventListener('change', async (ev) => {
  const id = ev.target.dataset?.budget;
  if (id) {
    const v = Number(ev.target.value.replace(/[^0-9]/g, ''));
    if (v > 0) state.budget.standard[id] = v; else delete state.budget.standard[id];
    state.budget.startMonth ??= monthOf(new Date());
    await saveBudget();
    // Update only the total: re-rendering would steal focus from the next field being typed in.
    ev.target.value = state.budget.standard[id] ? num(state.budget.standard[id]) : '';
    const total = state.categories.filter((c) => !c.archived && c.kind === 'variable').reduce((s, c) => s + (state.budget.standard[c.id] ?? 0), 0);
    const fixedTotal = state.categories.filter((c) => !c.archived && c.kind === 'fixed').reduce((s, c) => s + state.recurring.filter((r) => r.active && r.categoryId === c.id && r.kind !== 'savings').reduce((a, r) => a + monthly(r), 0), 0);
    const el = $('#budget-total'); if (el) el.textContent = `毎月 ${yen(total)} ・ 定期 ${yen(fixedTotal)}`;
  }
});

$('#file-eb').addEventListener('change', (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) importExpenseBookFile(f); });
$('#file-restore').addEventListener('change', (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) restoreFile(f); });

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && (sheet || rsheet || csheet)) { closeSheet(); return; }
  if (!sheet) return;
  if (ev.target.matches('input')) return;
  if (/^[0-9]$/.test(ev.key)) pressKey(ev.key);
  else if (ev.key === 'Backspace') pressKey('del');
  else if (ev.key === 'Enter') saveSheet();
});

// Refresh "today" when the app comes back after midnight.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || sheet || rsheet || csheet) return;
  await postRecurring();
  render();
});

// ---------- boot ----------
(async () => {
  await load();
  applyTheme();
  render();
  db.persist();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    // When a newer version takes over, reload once so the new screens show right away
    // (not on the first install, and never while a sheet is open).
    const updating = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!updating || reloaded || sheet || rsheet || csheet) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
  }
})();
