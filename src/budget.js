// Budget math. Pure functions over plain data, so they are easy to test.
//
// Only 'variable' categories feed the daily allowance. 'sinking' categories (clothes,
// travel, car…) are funds you save into and spend from in lumps, so a big purchase
// there never wrecks the month's daily number.

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM' of a 'YYYY-MM-DD' date or a Date. */
export function monthOf(d) {
  if (typeof d === 'string') return d.slice(0, 7);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 'YYYY-MM-DD' in local time. */
export function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** The budget for one category in one month: the month's override, else the standard. */
export function budgetFor(budget, categoryId, month) {
  const o = budget.overrides?.[month];
  if (o && categoryId in o) return o[categoryId];
  return budget.standard?.[categoryId] ?? 0;
}

/** Spending per category for one month: { categoryId: yen }. */
export function spentByCategory(entries, month) {
  const out = {};
  for (const e of entries) {
    if (e.date.startsWith(month)) out[e.categoryId] = (out[e.categoryId] ?? 0) + e.amount;
  }
  return out;
}

/**
 * What rolls into `month` for one category, following its carry-over rule from the
 * month budgeting started (`budget.startMonth`). Before that month nothing carries.
 */
export function carryInto(budget, category, entries, month) {
  if (category.carryover === 'reset' || !budget.startMonth || month <= budget.startMonth) return 0;
  let carry = 0;
  for (let m = budget.startMonth; m < month; m = addMonths(m, 1)) {
    const left = carry + budgetFor(budget, category.id, m) - (spentByCategory(entries, m)[category.id] ?? 0);
    carry = category.carryover === 'surplus' ? Math.max(0, left) : left;
  }
  return carry;
}

/**
 * The numbers behind the Today screen.
 * @returns {{ budget:number, spent:number, left:number, daysLeft:number, today:number, spentToday:number, ratio:number }}
 */
export function todaySummary({ budget, categories, entries, today }) {
  const month = monthOf(today);
  const variable = categories.filter((c) => c.kind === 'variable' && !c.archived);
  const ids = new Set(variable.map((c) => c.id));
  let total = 0;
  for (const c of variable) total += budgetFor(budget, c.id, month) + carryInto(budget, c, entries, month);

  let spent = 0;
  let spentToday = 0;
  for (const e of entries) {
    if (!ids.has(e.categoryId) || !e.date.startsWith(month)) continue;
    spent += e.amount;
    if (e.date === today) spentToday += e.amount;
  }
  const daysLeft = daysInMonth(month) - Number(today.slice(8, 10)) + 1;
  // Spread what was left this morning over the remaining days, then take off today's spending.
  const leftThisMorning = total - (spent - spentToday);
  const todayAllowance = Math.floor(leftThisMorning / daysLeft) - spentToday;
  return {
    budget: total,
    spent,
    left: total - spent,
    daysLeft,
    today: todayAllowance,
    spentToday,
    ratio: total > 0 ? Math.min(1, Math.max(0, spent / total)) : 0,
  };
}

/** Totals per tag for a month (or a year when `period` is 'YYYY'). */
export function tagTotals(entries, period) {
  const out = { need: 0, grow: 0, waste: 0, none: 0, total: 0 };
  for (const e of entries) {
    if (!e.date.startsWith(period)) continue;
    out[e.tag ?? 'none'] += e.amount;
    out.total += e.amount;
  }
  return out;
}
