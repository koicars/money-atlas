import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, daysUntil, monthly, postDue, upcoming, suggest, toICS } from '../src/recurring.js';

const sub = (o = {}) => ({ id: 'yt', name: 'YouTube', amount: 1280, cycle: 'monthly', anchorDay: 20, nextDate: '2026-11-20', categoryId: 'subscriptions', tag: 'need', kind: 'subscription', remindDaysBefore: 3, active: true, ...o });

test('advance keeps the day of month and clamps short months', () => {
  assert.equal(advance('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(advance('2026-02-28', 'monthly', 31), '2026-03-31');
  assert.equal(advance('2026-12-15', 'monthly'), '2027-01-15');
  assert.equal(advance('2028-02-29', 'yearly', 29), '2029-02-28');
});

test('daysUntil and monthly cost', () => {
  assert.equal(daysUntil('2026-11-29', '2026-11-26'), 3);
  assert.equal(daysUntil('2026-11-25', '2026-11-26'), -1);
  assert.equal(monthly(sub({ cycle: 'yearly', amount: 12000 })), 1000);
  assert.equal(monthly(sub()), 1280);
});

test('postDue posts every missed payment once and moves the next date', () => {
  const { entries, recurring } = postDue([sub({ nextDate: '2026-09-20' })], new Set(), '2026-11-26', 'T');
  assert.deepEqual(entries.map((e) => e.date), ['2026-09-20', '2026-10-20', '2026-11-20']);
  assert.equal(entries[0].recurringId, 'yt');
  assert.equal(entries[0].memo, 'YouTube');
  assert.equal(recurring[0].nextDate, '2026-12-20');
});

test('postDue never duplicates and skips future, inactive and savings items', () => {
  const ids = new Set(['r-yt-2026-11-20']);
  const r = postDue([sub(), sub({ id: 'x', nextDate: '2026-12-01' }), sub({ id: 'off', active: false, nextDate: '2026-01-01' }), sub({ id: 'nisa', kind: 'savings', nextDate: '2026-11-01', anchorDay: 1 })], ids, '2026-11-26');
  assert.equal(r.entries.length, 0);
  assert.deepEqual(r.recurring.map((x) => [x.id, x.nextDate]), [['yt', '2026-12-20'], ['nisa', '2026-12-01']]);
});

test('upcoming lists items inside their reminder window', () => {
  const items = [sub({ nextDate: '2026-11-29' }), sub({ id: 'b', nextDate: '2026-12-10' }), sub({ id: 'c', nextDate: '2026-11-27', remindDaysBefore: null })];
  assert.deepEqual(upcoming(items, '2026-11-26').map((r) => [r.id, r.days]), [['yt', 3]]);
});

test('suggest finds monthly repeats that are not registered yet', () => {
  const e = (date, memo, amount) => ({ date, memo, amount, categoryId: 'hobby', tag: 'need' });
  const entries = [
    e('2026-08-10', 'F1', 2400), e('2026-09-10', 'F1', 2400), e('2026-10-10', 'F1', 2400), e('2026-11-10', 'F1', 2400),
    e('2026-09-03', 'Cafe', 450), e('2026-09-09', 'Cafe', 480), e('2026-10-02', 'Cafe', 450), e('2026-11-05', 'Cafe', 500), e('2026-11-06', 'Cafe', 450),
    e('2026-10-15', 'Audible', 750), e('2026-11-15', 'Audible', 750),
    e('2026-09-20', 'youtube', 1280), e('2026-10-20', 'YouTube', 1280), e('2026-11-20', 'YouTube ', 1280),
  ];
  const s = suggest(entries, [sub()], '2026-11-26');
  assert.deepEqual(s.map((x) => x.name), ['F1'], 'Cafe is too irregular, Audible too new, YouTube already registered');
  assert.equal(s[0].nextDate, '2026-12-10');
});

test('toICS repeats with the item and alerts before renewal', () => {
  const ics = toICS(sub({ nextDate: '2026-12-20', remindDaysBefore: 3 }), new Date('2026-11-26T00:00:00Z'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261220\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261221\r\n/);
  assert.match(ics, /RRULE:FREQ=MONTHLY\r\n/);
  assert.match(ics, /TRIGGER:-P2DT15H\r\n/);
  assert.match(ics, /SUMMARY:YouTube の更新（¥1\\,280）/);
});
