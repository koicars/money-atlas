import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeExpenseBook, parseCsv, importExpenseBook } from '../src/import/expensebook.js';

// Synthetic sample in the ExpenseBook format. No real personal data.
const SAMPLE = [
  '"ID","Version","Year","Month","Day","Amount","Category","Name","Note"',
  '"10","1000","2023","7","3","234","foods","","[tag:card][tag:need]"',
  '"11","1000","5","7","4","1400","foods","","[tag:need]"',
  '"12","1001","2023","7","6","16000","clothing","Coat, black","[tag:waste]"',
  '"13","1000","2016","1","2","500","drinking session","","[tag:消費]"',
  '"14","1000","2016","1","3","1200","book","Design ""classics""","[tag:投資][tag:クレジットカード]"',
  '"15","1000","2016","1","4","0","clothes"," Socks ",""',
  '"16","1000","2016","1","5","800","Travel ","","[tag:need][tag:浪費]"',
  '"17","1000","2016","1","6","300","pets","","[tag:mystery]"',
].join('\r\n') + '\r\n';

const utf16 = (s) => {
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xff; out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); out[2 + i * 2] = c & 0xff; out[3 + i * 2] = c >> 8; }
  return out;
};

const run = () => importExpenseBook(decodeExpenseBook(utf16(SAMPLE)), { importedAt: '2026-11-26T00:00:00.000Z' });
const byId = (entries, id) => entries.find((e) => e.source.id === id);

test('decodes UTF-16LE with BOM', () => {
  assert.ok(decodeExpenseBook(utf16(SAMPLE)).startsWith('"ID","Version"'));
});

test('parses quoted commas and escaped quotes', () => {
  const rows = parseCsv('"a","b, c","say ""hi"""\n');
  assert.deepEqual(rows, [['a', 'b, c', 'say "hi"']]);
});

test('every row becomes an entry, sorted by date', () => {
  const { entries } = run();
  assert.equal(entries.length, 8);
  const dates = entries.map((e) => e.date);
  assert.deepEqual(dates, [...dates].sort());
});

test('broken year is inferred from neighbouring IDs and flagged', () => {
  const e = byId(run().entries, 11);
  assert.equal(e.date, '2023-07-04');
  assert.ok(e.flags.includes('year-inferred'));
});

test('tags: English and Japanese variants map to need / grow / waste', () => {
  const { entries } = run();
  assert.equal(byId(entries, 10).tag, 'need');
  assert.equal(byId(entries, 12).tag, 'waste');
  assert.equal(byId(entries, 14).tag, 'grow');
});

test('payment tags become the payment field, not a purpose tag', () => {
  const { entries } = run();
  assert.equal(byId(entries, 10).payment, 'card');
  assert.equal(byId(entries, 14).payment, 'card');
  assert.equal(byId(entries, 12).payment, null);
});

test('legacy 消費 tag leaves the entry untagged but keeps the raw tag', () => {
  const e = byId(run().entries, 13);
  assert.equal(e.tag, null);
  assert.deepEqual(e.source.rawTags, ['消費']);
  assert.ok(e.flags.includes('legacy-tag'));
});

test('conflicting purpose tags keep the strongest and are flagged', () => {
  const e = byId(run().entries, 16);
  assert.equal(e.tag, 'waste');
  assert.ok(e.flags.includes('tag-conflict'));
});

test('categories: trimmed, clothes merged into clothing, unknown ones kept', () => {
  const { entries, categories, report } = run();
  assert.equal(byId(entries, 16).categoryId, 'travel');
  assert.equal(byId(entries, 15).categoryId, 'clothing');
  assert.equal(byId(entries, 17).categoryId, 'pets');
  assert.equal(categories.filter((c) => c.id === 'clothing').length, 1);
  assert.deepEqual(report.unknownCategories, { pets: 1 });
});

test('memo is trimmed; quotes and commas survive', () => {
  const { entries } = run();
  assert.equal(byId(entries, 15).memo, 'Socks');
  assert.equal(byId(entries, 12).memo, 'Coat, black');
  assert.equal(byId(entries, 14).memo, 'Design "classics"');
});

test('tag history records the imported tag', () => {
  const e = byId(run().entries, 12);
  assert.deepEqual(e.tagHistory, [{ tag: 'waste', at: '2026-11-26T00:00:00.000Z', by: 'import' }]);
});

test('zero amounts and unknown tags are reported, not dropped', () => {
  const { entries, report } = run();
  assert.ok(byId(entries, 15).flags.includes('zero-amount'));
  assert.deepEqual(report.unknownTags, { mystery: 1 });
});

test('rejects files that are not ExpenseBook exports', () => {
  assert.throws(() => importExpenseBook('"a","b"\n"1","2"\n'), /Not an ExpenseBook export/);
});
