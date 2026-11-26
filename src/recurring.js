// Recurring items: subscriptions, fixed costs and 先取り savings.
// Pure functions over plain data, so they are easy to test.

import { isoDate } from './budget.js';

const DAY = 864e5;
const pad = (n) => String(n).padStart(2, '0');
const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const lastDay = (y, m) => new Date(y, m, 0).getDate();

/**
 * The next due date after `iso`, keeping the day of month (`anchorDay`) when the
 * month is long enough: a bill due on the 31st falls on Feb 28, then Mar 31 again.
 */
export function advance(iso, cycle, anchorDay) {
  const { y, m, d } = parse(iso);
  const day = anchorDay ?? d;
  let ny = y, nm = m + (cycle === 'yearly' ? 12 : 1);
  while (nm > 12) { nm -= 12; ny++; }
  return `${ny}-${pad(nm)}-${pad(Math.min(day, lastDay(ny, nm)))}`;
}

export function daysUntil(iso, today) {
  return Math.round((new Date(iso + 'T00:00:00') - new Date(today + 'T00:00:00')) / DAY);
}

/** Cost per month, so yearly and monthly items can be added up. */
export const monthly = (r) => (r.cycle === 'yearly' ? Math.round(r.amount / 12) : r.amount);

/**
 * Post every payment that has come due, and move each item's next date forward.
 * Savings (先取り) are not spending, so they advance without creating an entry.
 * Entry ids are derived from the item and the date, so running this twice never duplicates.
 *
 * @returns {{ entries: object[], recurring: object[] }} new entries and the items that changed
 */
export function postDue(items, existingIds, today, now = new Date().toISOString()) {
  const entries = [];
  const changed = [];
  for (const r of items) {
    if (!r.active || !r.nextDate) continue;
    let next = r.nextDate;
    let guard = 0;
    while (next <= today && guard++ < 36) {
      const id = `r-${r.id}-${next}`;
      if (r.kind !== 'savings' && !existingIds.has(id)) {
        entries.push({
          id, date: next, amount: r.amount, categoryId: r.categoryId, memo: r.name,
          tag: r.tag ?? 'need', tagHistory: [{ tag: r.tag ?? 'need', at: now, by: 'user' }],
          payment: null, recurringId: r.id, flags: [], source: null, createdAt: now, updatedAt: now,
        });
      }
      next = advance(next, r.cycle, r.anchorDay);
    }
    if (next !== r.nextDate) changed.push({ ...r, nextDate: next });
  }
  return { entries, recurring: changed };
}

/** Items renewing within their reminder window, soonest first. */
export function upcoming(items, today) {
  return items
    .filter((r) => r.active && r.remindDaysBefore != null && r.kind !== 'savings')
    .map((r) => ({ ...r, days: daysUntil(r.nextDate, today) }))
    .filter((r) => r.days >= 0 && r.days <= r.remindDaysBefore)
    .sort((a, b) => a.days - b.days);
}

const norm = (s) => s.trim().toLowerCase();

/**
 * Look through recent history for payments that repeat every month with the same
 * memo, and that are not registered yet. Returns ready-to-edit recurring drafts.
 */
export function suggest(entries, items, today, { months = 6, minMonths = 3 } = {}) {
  const since = isoDate(new Date(new Date(today + 'T00:00:00').getTime() - months * 31 * DAY));
  const known = new Set(items.map((r) => norm(r.name)));
  const groups = new Map();
  for (const e of entries) {
    if (e.date < since || e.date > today || !e.memo || e.recurringId) continue;
    const key = norm(e.memo);
    if (known.has(key)) continue;
    const g = groups.get(key) ?? { months: new Set(), last: null, amounts: [] };
    g.months.add(e.date.slice(0, 7));
    g.amounts.push(e.amount);
    if (!g.last || e.date > g.last.date) g.last = e;
    groups.set(key, g);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.months.size < minMonths) continue;
    // One payment per month, mostly the same amount: that is a subscription or a bill.
    if (g.amounts.length > g.months.size + 1) continue;
    const same = g.amounts.filter((a) => a === g.last.amount).length;
    if (same < Math.ceil(g.amounts.length / 2)) continue;
    const day = Number(g.last.date.slice(8, 10));
    out.push({
      name: g.last.memo, amount: g.last.amount, cycle: 'monthly', anchorDay: day,
      nextDate: advance(g.last.date, 'monthly', day), categoryId: g.last.categoryId,
      tag: g.last.tag ?? 'need', months: g.months.size,
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/**
 * An iCalendar event that repeats with the item and alerts before each renewal.
 * Opening it on iPhone adds it to Calendar, which then sends the reminder:
 * a real notification, without a server.
 */
export function toICS(r, stamp = new Date()) {
  const ymd = r.nextDate.replace(/-/g, '');
  const ts = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const escText = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const days = r.remindDaysBefore ?? 3;
  const dayAfter = isoDate(new Date(new Date(r.nextDate + 'T00:00:00').getTime() + DAY)).replace(/-/g, '');
  // All-day events start at midnight: alert at 9:00 on the day `days` before.
  const trigger = days === 0 ? 'PT9H' : `-P${days - 1}DT15H`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Money Atlas//JA', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:money-atlas-${r.id}@money-atlas`,
    `DTSTAMP:${ts}`,
    `DTSTART;VALUE=DATE:${ymd}`,
    `DTEND;VALUE=DATE:${dayAfter}`,
    `RRULE:FREQ=${r.cycle === 'yearly' ? 'YEARLY' : 'MONTHLY'}`,
    `SUMMARY:${escText(`${r.name} の更新（¥${r.amount.toLocaleString('ja-JP')}）`)}`,
    `DESCRIPTION:${escText('今から新しく契約するとしても、払いますか？ — Money Atlas')}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escText(`${r.name} があと${days}日で更新`)}`, `TRIGGER:${trigger}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}
