// Data behind the Insights charts. Pure functions over plain data, so they are easy to test.

import { addMonths, budgetFor, carryInto, daysInMonth, spentByCategory } from './budget.js';
import { monthly } from './recurring.js';

/** The `n` months ending with `endMonth`, oldest first: [{ month, need, grow, waste, none, total }]. */
export function monthlySeries(entries, endMonth, n = 12) {
  const start = addMonths(endMonth, -(n - 1));
  const rows = new Map();
  for (let m = start; m <= endMonth; m = addMonths(m, 1)) rows.set(m, { month: m, need: 0, grow: 0, waste: 0, none: 0, total: 0 });
  for (const e of entries) {
    const r = rows.get(e.date.slice(0, 7));
    if (!r) continue;
    r[e.tag ?? 'none'] += e.amount;
    r.total += e.amount;
  }
  return [...rows.values()];
}

/**
 * The month's pace. Fixed costs are treated as paid on day 1 (they are committed for the
 * month); everyday ('variable') spending piles on top day by day. The budget line runs
 * straight from the fixed costs on day 1 to fixed + the month's variable budget on the last day.
 * Sinking-fund categories (clothes, travel…) are left out on both sides.
 */
export function paceSeries({ entries, categories, budget, recurring = [], month, today }) {
  const kind = new Map(categories.map((c) => [c.id, c.kind]));
  const days = daysInMonth(month);
  let fixedSpent = 0;
  const perDay = new Array(days + 1).fill(0);
  for (const e of entries) {
    if (!e.date.startsWith(month)) continue;
    const k = kind.get(e.categoryId);
    if (k === 'fixed') fixedSpent += e.amount;
    else if (k === 'variable') perDay[Number(e.date.slice(8, 10))] += e.amount;
  }
  // Early in the month not every bill has been posted yet: use what is planned if larger.
  const planned = recurring.filter((r) => r.active && r.kind !== 'savings').reduce((s, r) => s + monthly(r), 0);
  const fixed = Math.max(fixedSpent, planned);
  const variableBudget = categories
    .filter((c) => c.kind === 'variable' && !c.archived)
    .reduce((s, c) => s + budgetFor(budget, c.id, month) + carryInto(budget, c, entries, month), 0);

  const isCurrent = today.startsWith(month);
  const lastDay = isCurrent ? Number(today.slice(8, 10)) : today > month ? days : 0;
  const points = [];
  let acc = fixed;
  for (let d = 1; d <= lastDay; d++) { acc += perDay[d]; points.push({ day: d, value: acc }); }
  const paceAt = (d) => fixed + (days > 1 ? (variableBudget * (d - 1)) / (days - 1) : variableBudget);
  const actual = points.length ? points[points.length - 1].value : fixed;
  return { fixed, variableBudget, total: fixed + variableBudget, days, lastDay, points, actual, pace: lastDay ? paceAt(lastDay) : fixed, paceAt };
}

/** One category over the `n` months ending with `endMonth`: [{ month, amount }], oldest first. */
export function categorySeries(entries, categoryId, endMonth, n = 12) {
  const start = addMonths(endMonth, -(n - 1));
  const rows = new Map();
  for (let m = start; m <= endMonth; m = addMonths(m, 1)) rows.set(m, { month: m, amount: 0 });
  for (const e of entries) {
    if (e.categoryId !== categoryId) continue;
    const r = rows.get(e.date.slice(0, 7));
    if (r) r.amount += e.amount;
  }
  return [...rows.values()];
}

/** The month's spending by category, largest first, with each one's share and budget. */
export function breakdown(entries, categories, budget, month) {
  const spent = spentByCategory(entries, month);
  const total = Object.values(spent).reduce((s, v) => s + v, 0);
  return categories
    .filter((c) => spent[c.id] || (!c.archived && c.kind !== 'fixed' && budgetFor(budget, c.id, month)))
    .map((c) => {
      const amount = spent[c.id] ?? 0;
      const limit = c.kind === 'fixed' ? 0 : budgetFor(budget, c.id, month) + carryInto(budget, c, entries, month);
      return { category: c, amount, share: total ? amount / total : 0, limit, over: limit > 0 && amount > limit };
    })
    .sort((a, b) => b.amount - a.amount);
}
