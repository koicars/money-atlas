// Money Atlas — app shell and screens. Plain JS modules, no framework.
import * as db from './db.js';
import { EXPENSEBOOK_CATEGORIES, SCHEMA_VERSION } from './model.js';
import { decodeExpenseBook, importExpenseBook } from './import/expensebook.js';
import { monthOf, isoDate, addMonths, budgetFor, carryInto, spentByCategory, todaySummary, tagTotals } from './budget.js';

const VERSION = '0.1.0';
const TAG_LABEL = { need: 'NEED', grow: 'GROW', waste: 'WASTE' };
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const state = {
  entries: [],        // newest first
  categories: [],
  budget: { standard: {}, overrides: {}, startMonth: null },
  settings: { theme: 'auto', lastBackup: null },
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
  const [entries, categories, budget, settings] = await Promise.all([
    db.getAll('entries'), db.getAll('categories'), db.getKV('budget'), db.getKV('settings'),
  ]);
  state.entries = entries;
  state.categories = categories;
  if (budget) state.budget = budget;
  if (settings) state.settings = { ...state.settings, ...settings };
  if (!state.categories.length) {
    const seen = new Map();
    for (const c of Object.values(EXPENSEBOOK_CATEGORIES)) if (!seen.has(c.id)) seen.set(c.id, { ...c, archived: false });
    state.categories = [...seen.values()];
    await db.putMany('categories', state.categories);
  }
  sortEntries();
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

  const recent = state.entries.slice(0, 40);
  const list = recent.length ? recent.map(entryRow).join('') : '<div class="empty">まだ記録がありません。右上の ＋ から記録できます。</div>';
  return `
    <div class="topbar"><button class="icon-btn" data-action="new" aria-label="支出を記録する">${ICON.plus}</button></div>
    <div class="eyebrow">${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}曜日</div>
    <h1 class="large-title">今日</h1>
    <section class="group pad">${hero}</section>
    <div class="section-head"><span>最近の記録</span></div>
    <section class="group">${list}</section>`;
}

function entryRow(e) {
  const name = catName(e.categoryId);
  const tag = e.tag ? `<span class="tag-${e.tag}">${TAG_LABEL[e.tag]}</span>` : '';
  const sub = [dateLabel(e.date), e.memo ? esc(e.memo) : ''].filter(Boolean).join(' · ');
  return `<button class="row" data-action="edit" data-id="${esc(e.id)}">
    <span class="badge" aria-hidden="true">${esc(name.slice(0, 1))}</span>
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
    const sub = c.kind === 'sinking'
      ? (b ? `積立の残高 ${yen(b - s)}` : '積立')
      : (b ? `予算 ${yen(b)}` : '予算なし');
    return `<div class="row plain"><span class="main">
        <span style="display:flex;justify-content:space-between;gap:12px"><span class="title">${esc(c.name)}</span><span class="amount">${yen(s)}</span></span>
        <span class="sub">${sub}</span>
        ${b > 0 ? `<span class="cat-meter"><span class="${s > b ? 'over' : ''}" style="width:${(ratio * 100).toFixed(1)}%"></span></span>` : ''}
      </span></div>`;
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
  const cats = state.categories.filter((c) => !c.archived);
  const variableTotal = cats.filter((c) => c.kind === 'variable').reduce((s, c) => s + (state.budget.standard[c.id] ?? 0), 0);
  const rows = cats.map((c) => `
    <div class="row plain">
      <span class="main"><span class="title">${esc(c.name)}</span><span class="sub">${c.kind === 'sinking' ? '積立（大きな出費用）' : '毎月'}</span></span>
      <span style="color:var(--ink-soft)">¥</span><input class="budget-input" id="b-${esc(c.id)}" inputmode="numeric" pattern="[0-9]*" data-budget="${esc(c.id)}" value="${state.budget.standard[c.id] ?? ''}" placeholder="0" aria-label="${esc(c.name)}の毎月の予算">
    </div>`).join('');
  const themes = [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']];
  const lastBackup = state.settings.lastBackup ? dateLabel(state.settings.lastBackup.slice(0, 10)) : 'まだありません';
  return `
    <div class="topbar"></div>
    <h1 class="large-title">設定</h1>
    <div class="section-head"><span>毎月の予算</span><span>毎月の合計 ${yen(variableTotal)}</span></div>
    <section class="group">${rows}</section>
    <p class="note">「毎月」のカテゴリの合計から、今日使えるお金を計算します。「積立」は服や旅行のような大きな出費用で、使っても毎日の金額には響きません。</p>

    <div class="section-head"><span>データ</span><span>最後のバックアップ：${lastBackup}</span></div>
    <section class="group">
      <button class="row plain" data-action="pick" data-input="file-eb"><span class="main"><span class="title">ExpenseBook から読み込む</span><span class="sub">書き出した CSV ファイルを選びます</span></span></button>
      <button class="row plain" data-action="backup"><span class="main"><span class="title">バックアップを書き出す</span><span class="sub">ファイルとして保存（iCloud Drive などに）</span></span></button>
      <button class="row plain" data-action="pick" data-input="file-restore"><span class="main"><span class="title">バックアップから戻す</span><span class="sub">今のデータはすべて置き換わります</span></span></button>
      <button class="row plain" data-action="wipe"><span class="main"><span class="title tag-waste">すべてのデータを削除</span></span></button>
    </section>
    <p class="note">データはこの端末の中だけに保存され、外部には送信されません。端末の故障や機種変更に備えて、ときどきバックアップを書き出してください。</p>

    <div class="section-head"><span>表示</span></div>
    <section class="group pad">
      <div class="seg" role="group" aria-label="テーマ">${themes.map(([v, l]) => `<button data-action="theme" data-theme-value="${v}" aria-pressed="${state.settings.theme === v}">${l}</button>`).join('')}</div>
    </section>
    <p class="note">Money Atlas ${VERSION} · ${state.entries.length.toLocaleString('ja-JP')} 件の記録</p>`;
}

function render() {
  const main = $('#main');
  main.innerHTML = state.tab === 'report' ? viewReport() : state.tab === 'settings' ? viewSettings() : viewToday();
  for (const b of document.querySelectorAll('.tabbar button')) b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false');
}

// ---------- entry sheet ----------
let sheet = null; // { entry|null, amount, categoryId, tag, tagTouched, memo, date }

function openSheet(entry) {
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
  sheet = null;
  $('#sheet').classList.remove('open'); $('#backdrop').classList.remove('open');
  setTimeout(() => { if (!sheet) { $('#sheet').hidden = true; $('#backdrop').hidden = true; } }, 280);
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
});

document.addEventListener('change', async (ev) => {
  const id = ev.target.dataset?.budget;
  if (id) {
    const v = Number(ev.target.value.replace(/[^0-9]/g, ''));
    if (v > 0) state.budget.standard[id] = v; else delete state.budget.standard[id];
    state.budget.startMonth ??= monthOf(new Date());
    await saveBudget(); render();
  }
});

$('#file-eb').addEventListener('change', (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) importExpenseBookFile(f); });
$('#file-restore').addEventListener('change', (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) restoreFile(f); });

document.addEventListener('keydown', (ev) => {
  if (!sheet) return;
  if (ev.key === 'Escape') { closeSheet(); return; }
  if (ev.target.matches('input')) return;
  if (/^[0-9]$/.test(ev.key)) pressKey(ev.key);
  else if (ev.key === 'Backspace') pressKey('del');
  else if (ev.key === 'Enter') saveSheet();
});

// Refresh "today" when the app comes back after midnight.
document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheet) render(); });

// ---------- boot ----------
(async () => {
  await load();
  applyTheme();
  render();
  db.persist();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
