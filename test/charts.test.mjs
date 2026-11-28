import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlySeries, paceSeries, categorySeries, breakdown } from '../src/charts.js';

const cats = [
  { id: 'food', kind: 'variable', carryover: 'reset' },
  { id: 'housing', kind: 'fixed', carryover: 'reset' },
  { id: 'clothing', kind: 'sinking', carryover: 'both' },
];
const e = (date, categoryId, amount, tag = 'need') => ({ date, categoryId, amount, tag });

test('monthlySeries fills every month, oldest first, split by tag', () => {
  const s = monthlySeries([e('2026-11-02', 'food', 100), e('2026-11-03', 'food', 50, 'waste'), e('2026-09-01', 'food', 7, 'grow'), e('2025-01-01', 'food', 9)], '2026-11', 3);
  assert.deepEqual(s.map((r) => r.month), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(s[2], { month: '2026-11', need: 100, grow: 0, waste: 50, none: 0, total: 150 });
  assert.equal(s[0].grow, 7);
  assert.equal(s[1].total, 0);
});

test('paceSeries: fixed costs on day 1, everyday spending on top, sinking left out', () => {
  const budget = { startMonth: '2026-11', standard: { food: 30000 } };
  const entries = [
    e('2026-11-27', 'housing', 90000),   // posted late in the month, still counted from day 1
    e('2026-11-01', 'food', 1000), e('2026-11-03', 'food', 2000),
    e('2026-11-02', 'clothing', 50000),
  ];
  const p = paceSeries({ entries, categories: cats, budget, month: '2026-11', today: '2026-11-03' });
  assert.equal(p.fixed, 90000);
  assert.equal(p.variableBudget, 30000);
  assert.equal(p.total, 120000);
  assert.deepEqual(p.points.map((x) => x.value), [91000, 91000, 93000]);
  assert.equal(p.actual, 93000);
  assert.equal(p.paceAt(1), 90000);
  assert.equal(p.paceAt(30), 120000);
  assert.equal(Math.round(p.pace), 92069); // 90000 + 30000 * 2/29
});

test('paceSeries uses planned recurring costs when bills are not posted yet', () => {
  const recurring = [{ active: true, kind: 'fixed', cycle: 'monthly', amount: 90000 }, { active: true, kind: 'savings', cycle: 'monthly', amount: 30000 }, { active: true, kind: 'subscription', cycle: 'yearly', amount: 12000 }];
  const p = paceSeries({ entries: [], categories: cats, budget: { standard: {} }, recurring, month: '2026-12', today: '2026-12-01' });
  assert.equal(p.fixed, 91000);
  assert.equal(p.lastDay, 1);
});

test('paceSeries covers the whole month for a past month and nothing for a future one', () => {
  const past = paceSeries({ entries: [], categories: cats, budget: { standard: {} }, month: '2026-10', today: '2026-11-03' });
  assert.equal(past.lastDay, 31);
  const future = paceSeries({ entries: [], categories: cats, budget: { standard: {} }, month: '2026-12', today: '2026-11-03' });
  assert.equal(future.lastDay, 0);
  assert.equal(future.points.length, 0);
});

test('categorySeries totals one category per month', () => {
  const s = categorySeries([e('2026-11-01', 'food', 5), e('2026-11-09', 'food', 5), e('2026-10-01', 'housing', 99)], 'food', '2026-11', 2);
  assert.deepEqual(s, [{ month: '2026-10', amount: 0 }, { month: '2026-11', amount: 10 }]);
});

test('breakdown ranks categories with share, budget and overspend', () => {
  const budget = { startMonth: '2026-11', standard: { food: 100, clothing: 500 } };
  const rows = breakdown([e('2026-11-01', 'food', 300), e('2026-11-01', 'housing', 700)], cats, budget, '2026-11');
  assert.deepEqual(rows.map((r) => [r.category.id, r.amount]), [['housing', 700], ['food', 300], ['clothing', 0]]);
  assert.equal(rows[1].share, 0.3);
  assert.equal(rows[1].over, true);
  assert.equal(rows[0].limit, 0, 'fixed costs have no budget');
});
