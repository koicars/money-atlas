// Money Atlas — app shell and screens. Plain JS modules, no framework.
import * as db from './db.js';
import { EXPENSEBOOK_CATEGORIES, FIXED_CATEGORIES, SCHEMA_VERSION } from './model.js';
import { decodeExpenseBook, importExpenseBook } from './import/expensebook.js';
import { monthOf, isoDate, addMonths, budgetFor, carryInto, spentByCategory, todaySummary, tagTotals } from './budget.js';
import { postDue, upcoming, suggest, monthly, daysUntil, toICS, advance } from './recurring.js';

const VERSION = '0.2.5';
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
};

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yen = (n) => (n < 0 ? '−' : '') + '¥' + Math.abs(n).toLocaleString('ja-JP');
const num = (n) => Math.abs(n).toLocaleString('ja-JP');
const today = () => isoDate(new Date());
const catById = (id) => state.categories.find((c) => c.id === id);
const catName = (id) => catById(id)?.name ?? id;
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

const ICON = {
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
  const list = recent.length ? recent.map(entryRow).join('') : '<div class="empty">まだ記録がありません。右上の ＋ から記録できます。</div>';
  // The one time the app speaks up: money is about to leave on its own.
  const soon = upcoming(state.recurring, t);
  const renewal = soon.length ? `
    <section class="group" style="margin-top:12px">
      <button class="row plain" data-action="tab" data-tab="recurring">
        <span class="main"><span class="title">${esc(soon[0].name)} が${soon[0].days === 0 ? '今日' : `あと${soon[0].days}日で`}更新</span>
        <span class="sub">${yen(soon[0].amount)}${soon.length > 1 ? ` ・ ほか${soon.length - 1}件` : ''}</span></span>
        <span class="tag-need" aria-hidden="true">${ICON.right.replace('<svg', '<svg width="16" height="16"')}</span>
      </button>
    </section>` : '';
  return `
    <div class="topbar"><button class="icon-btn" data-action="new" aria-label="支出を記録する">${ICON.plus}</button></div>
    <div class="eyebrow">${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}曜日</div>
    <h1 class="large-title">今日</h1>
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
    <span class="main"><span class="title">${esc(name)}</span><span class="sub">${sub}${tag ? ' · ' + tag : ''}</span></span>
    <span class="amount">${yen(e.amount)}</span>
  </button>`;
}

function viewReport() {
  const m = state.reportMonth;
  const t = tagTotals(state.entries, m);
  const pct = (v) => (t.total ? (v / t.total) * 100 : 0).toFixed(1);
  const spent = spentByCategory(state.entries, m);
  const cats = state.categories.filter((c) => !c.archived && (spent[c.id] || budgetFor(state.budget, c.id, m)))
    .sort((a, b) => (spent[b.id] ?? 0) - (spent[a.id] ?? 0));
  const catRows = cats.map((c) => {
    const s = spent[c.id] ?? 0;
    const b = budgetFor(state.budget, c.id, m) + carryInto(state.budget, c, state.entries, m);
    const ratio = b > 0 ? Math.min(1, s / b) : s > 0 ? 1 : 0;
    const sub = c.kind === 'fixed' ? '定期の支払い'
      : c.kind === 'sinking' ? (b ? `積立の残高 ${yen(b - s)}` : '積立')
      : (b ? `予算 ${yen(b)}` : '予算なし');
    return `<div class="row plain">
        <span class="main"><span class="title">${esc(c.name)}</span><span class="sub">${sub}</span></span>
        <span class="amount">${yen(s)}</span>
        ${b > 0 ? `<span class="cat-meter" aria-hidden="true"><span class="${s > b ? 'over' : ''}" style="width:${(ratio * 100).toFixed(1)}%"></span></span>` : ''}
      </div>`;
  }).join('');

  const thisYear = Number(m.slice(0, 4));
  const years = [];
  for (let y = thisYear - 5; y <= thisYear; y++) years.push({ y, ...tagTotals(state.entries, String(y)) });
  const max = Math.max(1, ...years.map((y) => Math.max(y.grow, y.waste)));
  const bars = years.map((y) => `<div class="col"><span style="height:${(y.grow / max) * 100}%;background:var(--grow-fill)"></span><span style="height:${(y.waste / max) * 100}%;background:var(--waste-fill)"></span></div>`).join('');
  const yearAria = years.map((y) => `${y.y}年 GROW ${num(y.grow)}円 WASTE ${num(y.waste)}円`).join('、');

  return `
    <div class="topbar"></div>
    <h1 class="large-title">レポート</h1>
    <section class="group pad">
      <div class="month-nav">
        <button class="icon-btn" data-action="month" data-step="-1" aria-label="前の月">${ICON.left}</button>
        <span class="label">${monthLabel(m)}</span>
        <button class="icon-btn" data-action="month" data-step="1" aria-label="次の月" ${m >= monthOf(new Date()) ? 'disabled' : ''}>${ICON.right}</button>
      </div>
      <div class="hero-amount" style="font-size:36px;margin:8px 0 0">${yen(t.total)}</div>
      <div class="stack-bar" role="img" aria-label="NEED ${pct(t.need)}%、GROW ${pct(t.grow)}%、WASTE ${pct(t.waste)}%">
        <span style="width:${pct(t.need)}%;background:var(--ink-faint)"></span><span style="width:${pct(t.grow)}%;background:var(--grow-fill)"></span><span style="width:${pct(t.waste)}%;background:var(--waste-fill)"></span>
      </div>
      <div class="legend">
        <span><i class="dot" style="background:var(--ink-faint)"></i>NEED<b>${yen(t.need)}</b></span>
        <span><i class="dot" style="background:var(--grow-fill)"></i>GROW<b>${yen(t.grow)}</b></span>
        <span><i class="dot" style="background:var(--waste-fill)"></i>WASTE<b>${yen(t.waste)}</b></span>
      </div>
    </section>
    <div class="section-head"><span>カテゴリ</span></div>
    <section class="group">${catRows || '<div class="empty">この月の記録はありません。</div>'}</section>
    <div class="section-head"><span>GROW と WASTE（年ごと）</span></div>
    <section class="group pad">
      <div class="years" role="img" aria-label="${esc(yearAria)}">${bars}</div>
      <div class="year-labels">${years.map((y) => `<span>${y.y}</span>`).join('')}</div>
    </section>`;
}

function viewSettings() {
  const cats = state.categories.filter((c) => !c.archived && c.kind !== 'fixed');
  const variableTotal = cats.filter((c) => c.kind === 'variable').reduce((s, c) => s + (state.budget.standard[c.id] ?? 0), 0);
  const rows = cats.map((c) => `
    <div class="row plain">
      <span class="main"><span class="title">${esc(c.name)}</span>${c.kind === 'sinking' ? '<span class="sub">積立</span>' : ''}</span>
      <span style="color:var(--ink-soft)">¥</span><input class="budget-input" id="b-${esc(c.id)}" inputmode="numeric" data-budget="${esc(c.id)}" value="${state.budget.standard[c.id] ? num(state.budget.standard[c.id]) : ''}" placeholder="0" aria-label="${esc(c.name)}の毎月の予算">
    </div>`).join('');
  const themes = [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']];
  const lastBackup = state.settings.lastBackup ? dateLabel(state.settings.lastBackup.slice(0, 10)) : 'まだありません';
  return `
    <div class="topbar"></div>
    <h1 class="large-title">設定</h1>
    <div class="section-head"><span>毎月の予算</span><span id="budget-total">毎月の合計 ${yen(variableTotal)}</span></div>
    <section class="group">${rows}</section>
    <p class="note">「毎月」のカテゴリの合計から、今日使えるお金を計算します。「積立」は服や旅行のような大きな出費用で、使っても毎日の金額には響きません。</p>

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
        <span class="main"><span class="title">${esc(r.name)}</span><span class="sub">${when} · ${r.cycle === 'yearly' ? '毎年' : '毎月'}</span></span>
        <span class="amount">${yen(r.amount)}</span></button>`;
    }).join('')}</section>`;
  };

  return `
    <div class="topbar"><button class="icon-btn" data-action="r-new" aria-label="定期支出を追加">${ICON.plus}</button></div>
    <h1 class="large-title">定期</h1>
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
  sheet = null; rsheet = null;
  $('#sheet').classList.remove('open'); $('#backdrop').classList.remove('open');
  setTimeout(() => { if (!sheet && !rsheet) { $('#sheet').hidden = true; $('#backdrop').hidden = true; } }, 280);
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
      <div class="chips" role="group" aria-label="カテゴリ">${cats.map((c) => `<button class="chip" data-action="cat" data-cat="${esc(c.id)}" aria-pressed="${sheet.categoryId === c.id}">${esc(c.name)}</button>`).join('')}</div>
      <div class="chips" style="padding-top:8px">${memoSuggestions().map((m) => `<button class="chip small" data-action="memo" data-memo="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      <section class="group" style="margin-top:10px">
        <div class="field-row"><label for="f-memo">メモ</label><input id="f-memo" data-field="memo" value="${esc(sheet.memo)}" placeholder="なし" autocomplete="off"></div>
        <div class="field-row"><label for="f-date">日付</label><input id="f-date" type="date" data-field="date" value="${esc(sheet.date)}" max="${today()}"></div>
      </section>
      ${sheet.entry ? '<button class="btn danger block" style="margin-top:8px" data-action="delete">この記録を削除</button>' : ''}
    </div>
    <div class="keypad">${keys.map((k) => `<button class="${k === 'del' || k === '00' ? 'fn' : ''}" data-action="key" data-key="${k}" aria-label="${k === 'del' ? '1文字消す' : k}">${k === 'del' ? '⌫' : k}</button>`).join('')}</div>`;
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
      <div class="chips" style="padding-top:0">${cats.map((c) => `<button class="chip" data-action="r-cat" data-cat="${esc(c.id)}" aria-pressed="${r.categoryId === c.id}">${esc(c.name)}</button>`).join('')}</div>
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
    if (past.length && confirm(`過去の「${item.name}」の記録 ${past.length} 件も「${catName(item.categoryId)}」に移しますか？\n移すと、今日使えるお金やレポートが正しく計算されます。`)) {
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
    const newCats = categories.filter((c) => !catById(c.id));
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
    const el = $('#budget-total'); if (el) el.textContent = `毎月の合計 ${yen(total)}`;
  }
});

$('#file-eb').addEventListener('change', (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) importExpenseBookFile(f); });
$('#file-restore').addEventListener('change', (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) restoreFile(f); });

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && (sheet || rsheet)) { closeSheet(); return; }
  if (!sheet) return;
  if (ev.target.matches('input')) return;
  if (/^[0-9]$/.test(ev.key)) pressKey(ev.key);
  else if (ev.key === 'Backspace') pressKey('del');
  else if (ev.key === 'Enter') saveSheet();
});

// Refresh "today" when the app comes back after midnight.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || sheet || rsheet) return;
  await postRecurring();
  render();
});

// ---------- boot ----------
(async () => {
  await load();
  applyTheme();
  render();
  db.persist();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
