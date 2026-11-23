// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, parseMoney, moneyShort, setNumberStyle, setToday } from '../app/js/format.js';
import {
  periodOf, periodRange, shiftPeriod, summarize, emptyState, seedCategories, occurrences,
  materializeThrough, refreshRule, planFor, ensureOwnPlan, goalProgress, uid,
} from '../app/js/model.js';
import { parseCsv, planImport, applyImport, transactionsCsv, budgetCsv, parseDate } from '../app/js/csv.js';
import { sampleState } from '../app/js/sample.js';

const NNBSP = ' ';
const NBSP = ' ';

test('rand formatting', () => {
  setNumberStyle('space-dot');
  assert.equal(money(123456), `R${NBSP}1${NNBSP}234.56`);
  assert.equal(money(-5000), `−R${NBSP}50.00`);
  assert.equal(money(150000, { cents: false }), `R${NBSP}1${NNBSP}500`);
  assert.equal(money(2500, { sign: true }), `+R${NBSP}25.00`);
  setNumberStyle('comma-dot');
  assert.equal(money(123456789), 'R1,234,567.89');
  setNumberStyle('space-comma');
  assert.equal(money(123456), `R${NBSP}1${NNBSP}234,56`);
  setNumberStyle('space-dot');
  assert.equal(moneyShort(1250000), `R${NBSP}13K`);
  assert.equal(moneyShort(150000), `R${NBSP}1.5K`);
});

test('reading typed amounts', () => {
  const cases = {
    '250': 25000, '1 499.99': 149999, 'R1,234.56': 123456, 'R 1 234,56': 123456, '1.234,56': 123456,
    '12,5': 1250, '1,234': 123400, '(500.00)': -50000, '-75': -7500, '1 000 000': 100000000, 'R 350': 35000,
    'abc': NaN, '': NaN, '.5': 50,
  };
  for (const [input, want] of Object.entries(cases)) {
    const got = parseMoney(input);
    if (Number.isNaN(want)) assert.ok(Number.isNaN(got), input);
    else assert.equal(got, want, input);
  }
});

test('calendar and payday months', () => {
  assert.equal(periodOf('2026-11-23', 1), '2026-11');
  assert.deepEqual(periodRange('2026-02', 1), { start: '2026-02-01', end: '2026-02-28' });
  // Payday on the 25th: 25 Oct to 24 Nov is "November"
  assert.equal(periodOf('2026-11-23', 25), '2026-11');
  assert.equal(periodOf('2026-11-25', 25), '2026-12');
  assert.deepEqual(periodRange('2026-11', 25), { start: '2026-10-25', end: '2026-11-24' });
  assert.deepEqual(periodRange('2027-01', 25), { start: '2026-12-25', end: '2027-01-24' });
  // Payday on the 31st clamps in short months
  assert.deepEqual(periodRange('2026-03', 31), { start: '2026-02-28', end: '2026-03-30' });
  // Early payday names the month it starts in
  assert.equal(periodOf('2026-11-05', 10), '2026-10');
  assert.equal(shiftPeriod('2026-12', 1), '2027-01');
  assert.equal(shiftPeriod('2026-01', -1), '2025-12');
  for (const sd of [1, 7, 15, 16, 25, 28, 31]) {
    for (let k = '2026-01'; k <= '2027-03'; k = shiftPeriod(k, 1)) {
      const { start, end } = periodRange(k, sd);
      assert.equal(periodOf(start, sd), k, `start ${k} sd ${sd}`);
      assert.equal(periodOf(end, sd), k, `end ${k} sd ${sd}`);
      assert.equal(periodRange(shiftPeriod(k, 1), sd).start > end, true);
    }
  }
});

test('recurring occurrences', () => {
  const r = { active: true, frequency: 'monthly', startDate: '2026-01-31' };
  assert.deepEqual(occurrences(r, '2026-02-01', '2026-04-30'), ['2026-02-28', '2026-03-31', '2026-04-30']);
  const w = { active: true, frequency: 'weekly', startDate: '2026-11-06' };
  assert.deepEqual(occurrences(w, '2026-11-01', '2026-11-30'), ['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27']);
  const y = { active: true, frequency: 'yearly', startDate: '2025-03-15' };
  assert.deepEqual(occurrences(y, '2026-01-01', '2026-12-31'), ['2026-03-15']);
  const ended = { active: true, frequency: 'monthly', startDate: '2026-01-01', endDate: '2026-02-15' };
  assert.deepEqual(occurrences(ended, '2026-01-01', '2026-12-31'), ['2026-01-01', '2026-02-01']);
});

function fresh(today = '2026-11-23') {
  setToday(today);
  const s = seedCategories(emptyState());
  const cat = (n) => s.categories.find((c) => c.name === n).id;
  return { s, cat };
}

test('recurring items fill in once, respect deletes and edits', () => {
  const { s, cat } = fresh();
  s.recurring.push({ id: 'rent', name: 'Rent', type: 'expense', amount: 850000, categoryId: cat('Rent or bond'), frequency: 'monthly', startDate: '2026-09-01', active: true, skips: [] });
  materializeThrough(s);
  assert.equal(s.transactions.filter((t) => t.recurringId === 'rent').length, 3); // Sep, Oct, Nov
  materializeThrough(s);
  assert.equal(s.transactions.length, 3, 'no duplicates on reload');
  // Look ahead to December: one upcoming payment
  materializeThrough(s, '2026-12');
  assert.equal(s.transactions.length, 4);
  // Rent goes up: only the upcoming one changes
  s.recurring[0].amount = 900000;
  refreshRule(s, 'rent');
  const amounts = s.transactions.map((t) => [t.date, t.amount]).sort();
  assert.deepEqual(amounts, [['2026-09-01', 850000], ['2026-10-01', 850000], ['2026-11-01', 850000], ['2026-12-01', 900000]]);
  // Changing the day does not duplicate past months
  s.recurring[0].startDate = '2026-09-03';
  refreshRule(s, 'rent');
  materializeThrough(s, '2026-12');
  assert.equal(s.transactions.length, 4);
  assert.ok(s.transactions.some((t) => t.date === '2026-12-03'));
});

test('a new recurring item with a past first date fills in from that date', () => {
  const { s, cat } = fresh();
  s.recurring.push({ id: 'n', name: 'Netflix', type: 'expense', amount: 19900, categoryId: cat('Subscriptions'), frequency: 'monthly', startDate: '2026-11-12', active: true, skips: [] });
  refreshRule(s, 'n');
  assert.deepEqual(s.transactions.map((t) => t.date), ['2026-11-12']);
});

test('safe to spend and the monthly summary', () => {
  const { s, cat } = fresh('2026-11-20');
  const plan = ensureOwnPlan(s, '2026-11');
  plan[cat('Salary')] = 3000000;
  plan[cat('Groceries')] = 400000;
  plan[cat('Rent or bond')] = 850000;
  s.goals.push({ id: 'g', name: 'Holiday', target: 1000000, startingBalance: 0, monthly: 100000, createdPeriod: '2026-10' });
  const tx = (date, type, amount, categoryId, goalId = null) => s.transactions.push({ id: uid(), date, type, amount, categoryId, goalId });
  tx('2026-11-01', 'expense', 850000, cat('Rent or bond'));
  tx('2026-11-05', 'expense', 120000, cat('Groceries'));
  tx('2026-11-25', 'income', 3000000, cat('Salary')); // upcoming salary
  tx('2026-11-28', 'expense', 19900, cat('Subscriptions')); // upcoming bill
  tx('2026-11-10', 'savings', 50000, null, 'g');
  const sum = summarize(s, '2026-11');
  assert.equal(sum.status, 'current');
  assert.equal(sum.income.expected, 3000000);
  assert.equal(sum.expense.actual, 970000);
  assert.equal(sum.expense.upcoming, 19900);
  assert.equal(sum.savings.committed, 100000);
  assert.equal(sum.safeToSpend, 3000000 - 970000 - 19900 - 100000);
  assert.equal(sum.daysLeft, 11);
  assert.equal(sum.perDay, Math.floor(sum.safeToSpend / 11));
  assert.equal(sum.plannedLeftover, 3000000 - 1250000 - 100000);
  // Plans carry forward to later months and back to earlier ones
  assert.equal(planFor(s, '2027-02')[cat('Groceries')], 400000);
  assert.equal(planFor(s, '2026-01')[cat('Groceries')], 400000);
  const gp = goalProgress(s, s.goals[0], '2026-11-20');
  assert.equal(gp.saved, 50000);
  assert.equal(gp.eta, '2027-09'); // R9 500 left at R1 000 a month: 10 months
});

test('CSV: parse, export and import back without duplicates', () => {
  const rows = parseCsv('﻿Date;Amount;Note\r\n23/11/2026;"1 250,50";"Checkers; Rosebank"\r\n');
  assert.deepEqual(rows, [['Date', 'Amount', 'Note'], ['23/11/2026', '1 250,50', 'Checkers; Rosebank']]);
  assert.equal(parseDate('23/11/2026'), '2026-11-23');
  assert.equal(parseDate('2026/11/03'), '2026-11-03');
  assert.equal(parseDate('3 Nov 2026'), '2026-11-03');
  assert.equal(parseDate('31/02/2026'), null);

  setToday('2026-11-23');
  const s = sampleState('2026-11-23');
  const csv = transactionsCsv(s);
  assert.ok(csv.startsWith('﻿Date,Type,Category,Note,Amount,Signed amount,Recurring'));
  const again = planImport(s, csv);
  assert.equal(again.transactions.length, 0, 'everything already there');
  assert.equal(again.duplicates, s.transactions.length);

  const empty = seedCategories(emptyState());
  const plan = planImport(empty, csv);
  assert.equal(plan.transactions.length, s.transactions.length);
  applyImport(empty, plan);
  const a = summarize(s, '2026-10');
  const b = summarize(empty, '2026-10');
  assert.equal(b.expense.actual, a.expense.actual);
  assert.equal(b.income.actual, a.income.actual);
  assert.equal(b.savings.actual, a.savings.actual);

  // A bank statement: signed amounts, no categories
  const bank = 'Date,Description,Amount,Balance\n2026/11/02,SALARY ACME,25000.00,30000\n2026/11/03,CHECKERS,-612.40,29387.60\n';
  const bp = planImport(seedCategories(emptyState()), bank);
  assert.deepEqual(bp.transactions.map((t) => [t.type, t.amount]), [['income', 2500000], ['expense', 61240]]);

  const budget = budgetCsv(s, '2026-11');
  assert.ok(budget.includes('Total spending'));
  assert.ok(!/=/.test(budget.split('\n').slice(1).join('\n').replace(/"[^"]*"/g, '')));
});

test('formula-like notes are neutralised in CSV', () => {
  setToday('2026-11-23');
  const s = seedCategories(emptyState());
  s.transactions.push({ id: 'x', date: '2026-11-01', type: 'expense', amount: 100, categoryId: s.categories[5].id, note: '=HYPERLINK("http://x")' });
  const csv = transactionsCsv(s);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`));
});
