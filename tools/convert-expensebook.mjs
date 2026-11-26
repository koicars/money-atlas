#!/usr/bin/env node
// Convert an ExpenseBook CSV export into Money Atlas JSON.
//   node tools/convert-expensebook.mjs <export.csv> [out.json]
// Output goes to data/ by default, which git ignores: personal data never enters the repo.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodeExpenseBook, importExpenseBook } from '../src/import/expensebook.js';
import { SCHEMA_VERSION } from '../src/model.js';

const [input, output = 'data/expensebook.json'] = process.argv.slice(2);
if (!input) {
  console.error('usage: node tools/convert-expensebook.mjs <export.csv> [out.json]');
  process.exit(1);
}

const { entries, categories, report } = importExpenseBook(decodeExpenseBook(readFileSync(input)));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ schemaVersion: SCHEMA_VERSION, categories, entries }, null, 1));

const yen = (n) => '¥' + n.toLocaleString('ja-JP');
const byYear = {};
for (const e of entries) {
  const y = (byYear[e.date.slice(0, 4)] ??= { n: 0, total: 0, need: 0, grow: 0, waste: 0, none: 0 });
  y.n++; y.total += e.amount; y[e.tag ?? 'none'] += e.amount;
}

console.log(`${report.rows} rows → ${entries.length} entries, ${categories.length} categories → ${output}`);
console.log('tags:', report.tags);
console.log('\nyear   rows       total        need        grow       waste    untagged');
for (const [y, v] of Object.entries(byYear)) {
  console.log(y, String(v.n).padStart(6), ...[v.total, v.need, v.grow, v.waste, v.none].map((n) => yen(n).padStart(11)));
}
console.log('\nflags to review:');
for (const [k, ids] of Object.entries(report.flagged)) console.log(`  ${k}: ${ids.length}`, ids.length <= 8 ? ids.join(', ') : '');
if (Object.keys(report.unknownCategories).length) console.log('unknown categories:', report.unknownCategories);
if (Object.keys(report.unknownTags).length) console.log('unknown tags:', report.unknownTags);
