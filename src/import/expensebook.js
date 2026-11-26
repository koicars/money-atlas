// Import from the ExpenseBook app's CSV export.
// Pure functions, no I/O: the same code runs in the browser (file picker) and in Node (CLI, tests).
//
// The export looks like:
//   "ID","Version","Year","Month","Day","Amount","Category","Name","Note"
//   "6085","1000","2023","7","4","1477","foods","","[tag:card][tag:need]"
// encoded as UTF-16 with a byte-order mark. "Name" is the memo; "Note" holds the tags.

import { EXPENSEBOOK_CATEGORIES } from '../model.js';

/** Turn the raw file bytes into text, honouring a UTF-16 or UTF-8 byte-order mark. */
export function decodeExpenseBook(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
  return new TextDecoder('utf-8').decode(b);
}

/** Minimal RFC 4180 CSV parser: quoted fields, "" escapes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const PURPOSE_TAGS = {
  'need': 'need',
  'investment': 'grow', '投資': 'grow',
  'waste': 'waste', '浪費': 'waste', '無駄遣い': 'waste',
};
const PAYMENT_TAGS = { 'card': 'card', 'credit card': 'card', 'クレジットカード': 'card' };
// Used in 2015–2016 and then dropped. Kept in `source.rawTags`; the entry stays untagged.
const LEGACY_TAGS = new Set(['消費']);

const pad = (n) => String(n).padStart(2, '0');

function slug(text) {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (s) return s;
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return 'cat-' + h.toString(36);
}

/**
 * Convert an ExpenseBook export into Money Atlas entries and categories.
 * Nothing is dropped: every row becomes an entry, and anything doubtful is flagged.
 *
 * @param {string} text  Decoded CSV text
 * @param {{ importedAt?: string }} [opts]
 */
export function importExpenseBook(text, opts = {}) {
  const importedAt = opts.importedAt ?? new Date().toISOString();
  const [header, ...rows] = parseCsv(text);
  const expected = ['ID', 'Version', 'Year', 'Month', 'Day', 'Amount', 'Category', 'Name', 'Note'];
  if (!header || expected.some((h, i) => header[i] !== h)) {
    throw new Error('Not an ExpenseBook export: unexpected header ' + JSON.stringify(header));
  }

  const raw = rows.map((r, line) => {
    const [id, version, year, month, day, amount, category, name, note] = r;
    return { line: line + 2, id: Number(id), version, year: Number(year), month: Number(month), day: Number(day), amount, category, name, note };
  });

  // Rows with a broken year (e.g. "5") take the year of the nearest row by ID, since IDs
  // grow over time. In the real export the four broken rows sit between 2023-07 rows.
  const byId = raw.filter((r) => r.year >= 1900).sort((a, b) => a.id - b.id);
  function inferYear(r) {
    let best = null;
    for (const o of byId) {
      if (o.month !== r.month) continue;
      if (!best || Math.abs(o.id - r.id) < Math.abs(best.id - r.id)) best = o;
    }
    return best ? best.year : null;
  }

  const categories = new Map();
  const entries = [];
  const report = { rows: raw.length, flagged: {}, unknownCategories: {}, unknownTags: {}, tags: { need: 0, grow: 0, waste: 0, none: 0 } };
  const flag = (entry, name) => {
    entry.flags.push(name);
    (report.flagged[name] ??= []).push(entry.source.id);
  };

  for (const r of raw) {
    const rawTags = [...(r.note || '').matchAll(/\[tag:([^\]]*)\]/g)].map((m) => m[1].trim());
    const entry = {
      id: 'eb-' + r.id,
      date: '',
      amount: Number.parseInt(r.amount, 10),
      categoryId: '',
      memo: (r.name || '').trim(),
      tag: null,
      tagHistory: [],
      payment: null,
      recurringId: null,
      flags: [],
      source: { app: 'ExpenseBook', id: r.id, version: Number(r.version), line: r.line, rawTags, rawCategory: r.category },
      createdAt: importedAt,
      updatedAt: importedAt,
    };

    let year = r.year;
    if (!(year >= 1900)) {
      year = inferYear(r);
      flag(entry, 'year-inferred');
    }
    const d = new Date(Date.UTC(year, r.month - 1, r.day));
    if (!year || d.getUTCMonth() !== r.month - 1 || d.getUTCDate() !== r.day) flag(entry, 'invalid-date');
    entry.date = `${year}-${pad(r.month)}-${pad(r.day)}`;

    if (!Number.isFinite(entry.amount) || entry.amount < 0) { entry.amount = 0; flag(entry, 'invalid-amount'); }
    else if (entry.amount === 0) flag(entry, 'zero-amount');

    const catText = (r.category || '').trim();
    let cat = EXPENSEBOOK_CATEGORIES[catText];
    if (!cat) {
      cat = { id: slug(catText || 'uncategorized'), name: catText || '未分類', kind: 'variable', carryover: 'reset', defaultTag: 'need' };
      report.unknownCategories[catText] = (report.unknownCategories[catText] ?? 0) + 1;
    }
    if (!categories.has(cat.id)) categories.set(cat.id, { ...cat, archived: false });
    entry.categoryId = cat.id;

    const purposes = new Set();
    for (const t of rawTags) {
      if (PURPOSE_TAGS[t]) purposes.add(PURPOSE_TAGS[t]);
      else if (PAYMENT_TAGS[t]) entry.payment = PAYMENT_TAGS[t];
      else if (LEGACY_TAGS.has(t)) flag(entry, 'legacy-tag');
      else report.unknownTags[t] = (report.unknownTags[t] ?? 0) + 1;
    }
    if (purposes.size === 1) entry.tag = [...purposes][0];
    else if (purposes.size > 1) {
      // Keep the strongest judgement the user made; the others stay visible in rawTags.
      entry.tag = purposes.has('waste') ? 'waste' : purposes.has('grow') ? 'grow' : 'need';
      flag(entry, 'tag-conflict');
    }
    if (entry.tag) entry.tagHistory.push({ tag: entry.tag, at: importedAt, by: 'import' });
    report.tags[entry.tag ?? 'none']++;

    entries.push(entry);
  }

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.source.id - b.source.id));
  return { entries, categories: [...categories.values()], report };
}
