import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, daysInMonth, budgetFor, carryInto, todaySummary, tagTotals } from '../src/budget.js';

const cats = [
  { id: 'food', kind: 'variable', carryover: 'reset' },
  { id: 'hobby', kind: 'variable', carryover: 'surplus' },
  { id: 'clothing', kind: 'sinking', carryover: 'both' },
];
const e = (date, categoryId, amount, tag = 'need') => ({ date, categoryId, amount, tag });

test('month helpers', () => {
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29);
});

test('budgetFor uses the month override, else the standard', () => {
  const b = { standard: { food: 20000 }, overrides: { '2026-12': { food: 30000 } } };
  assert.equal(budgetFor(b, 'food', '2026-11'), 20000);
  assert.equal(budgetFor(b, 'food', '2026-12'), 30000);
  assert.equal(budgetFor(b, 'hobby', '2026-11'), 0);
});

test('carry-over: reset never carries, surplus keeps only leftovers, both keeps overspend too', () => {
  const b = { startMonth: '2026-09', standard: { food: 10000, hobby: 10000, clothing: 5000 } };
  const entries = [
    e('2026-09-10', 'food', 2000), e('2026-09-10', 'hobby', 4000), e('2026-09-10', 'clothing', 20000),
    e('2026-10-10', 'hobby', 15000),
  ];
  assert.equal(carryInto(b, cats[0], entries, '2026-11'), 0);
  // hobby: Sep leaves 6000; Oct 6000+10000-15000 = 1000
  assert.equal(carryInto(b, cats[1], entries, '2026-11'), 1000);
  // clothing: Sep 5000-20000 = -15000; Oct -15000+5000 = -10000
  assert.equal(carryInto(b, cats[2], entries, '2026-11'), -10000);
  assert.equal(carryInto(b, cats[1], entries, '2026-09'), 0, 'nothing carries into the start month');
});

test('surplus never goes negative even after a big overspend', () => {
  const b = { startMonth: '2026-09', standard: { hobby: 10000 } };
  const entries = [e('2026-09-01', 'hobby', 50000)];
  assert.equal(carryInto(b, cats[1], entries, '2026-10'), 0);
});

test("today's allowance spreads this morning's balance over the days left", () => {
  const budget = { startMonth: '2026-11', standard: { food: 30000, hobby: 0, clothing: 5000 } };
  const entries = [
    e('2026-11-01', 'food', 10000),
    e('2026-11-26', 'food', 800),        // spent today
    e('2026-11-02', 'clothing', 48900),  // sinking: ignored
  ];
  const s = todaySummary({ budget, categories: cats, entries, today: '2026-11-26' });
  assert.equal(s.budget, 30000);
  assert.equal(s.spent, 10800);
  assert.equal(s.left, 19200);
  assert.equal(s.daysLeft, 5);
  // (30000 - 10000) / 5 = 4000, minus 800 spent today
  assert.equal(s.today, 3200);
});

test('allowance can go negative when overspent', () => {
  const budget = { startMonth: '2026-11', standard: { food: 1000 } };
  const s = todaySummary({ budget, categories: cats, entries: [e('2026-11-30', 'food', 5000)], today: '2026-11-30' });
  assert.equal(s.today, -4000);
});

test('tag totals for a month and a year', () => {
  const entries = [e('2026-11-01', 'food', 100), e('2026-11-02', 'food', 50, 'waste'), e('2025-01-01', 'food', 7, 'grow'), e('2026-10-01', 'food', 9, null)];
  assert.deepEqual(tagTotals(entries, '2026-11'), { need: 100, grow: 0, waste: 50, none: 0, total: 150 });
  assert.equal(tagTotals(entries, '2026').total, 159);
});
