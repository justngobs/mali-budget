// CSV in and out. Files open cleanly in Google Sheets, LibreOffice and Excel.
import { plainAmount, parseMoney, isIsoDate, pad, MONTHS_SHORT, todayIso } from './format.js';
import { category, goal, summarize, uid, activeCategories } from './model.js';

// ---------------------------------------------------------------- writing

function cell(v, { text = false } = {}) {
  let s = v == null ? '' : String(v);
  // Stop spreadsheet apps from treating text such as "=SUM(...)" as a formula.
  if (text && /^[=+@\t\r]/.test(s)) s = `'${s}`;
  if (text && /^-[^\d]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header, rows, textCols = []) {
  const textSet = new Set(textCols);
  const lines = [header.map((h) => cell(h)).join(',')];
  for (const r of rows) lines.push(r.map((v, i) => cell(v, { text: textSet.has(i) })).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const TYPE_LABEL = { expense: 'Expense', income: 'Income', savings: 'Savings' };

export function transactionsCsv(state, { start = null, end = null } = {}) {
  const txs = state.transactions
    .filter((t) => (!start || t.date >= start) && (!end || t.date <= end))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rows = txs.map((t) => {
    const name = t.type === 'savings' ? goal(state, t.goalId)?.name || 'Savings' : category(state, t.categoryId)?.name || 'Uncategorised';
    const signed = t.type === 'income' ? t.amount : -t.amount;
    return [t.date, TYPE_LABEL[t.type], name, t.note || '', plainAmount(t.amount), plainAmount(signed), t.recurringId ? 'Yes' : 'No'];
  });
  return toCsv(['Date', 'Type', 'Category', 'Note', 'Amount', 'Signed amount', 'Recurring'], rows, [2, 3]);
}

export function budgetCsv(state, key) {
  const s = summarize(state, key);
  const rows = [];
  for (const r of s.incomeRows) rows.push(['Income', r.category.name, plainAmount(r.planned), plainAmount(r.actual + r.upcoming), plainAmount(r.actual + r.upcoming - r.planned)]);
  rows.push(['Income', 'Total income', plainAmount(s.income.planned), plainAmount(s.income.actual + s.income.upcoming), plainAmount(s.income.actual + s.income.upcoming - s.income.planned)]);
  for (const r of s.expenseRows) rows.push(['Spending', r.category.name, plainAmount(r.planned), plainAmount(r.actual + r.upcoming), plainAmount(r.planned - r.actual - r.upcoming)]);
  rows.push(['Spending', 'Total spending', plainAmount(s.expense.planned), plainAmount(s.expense.actual + s.expense.upcoming), plainAmount(s.expense.planned - s.expense.actual - s.expense.upcoming)]);
  for (const g of state.goals.filter((x) => !x.archived)) {
    const got = s.savings.byGoal.get(g.id) || { actual: 0, upcoming: 0 };
    rows.push(['Savings', g.name, plainAmount(g.monthly || 0), plainAmount(got.actual + got.upcoming), plainAmount((g.monthly || 0) - got.actual - got.upcoming)]);
  }
  rows.push(['Savings', 'Total savings', plainAmount(s.savings.planned), plainAmount(s.savings.actual + s.savings.upcoming), plainAmount(s.savings.planned - s.savings.actual - s.savings.upcoming)]);
  const actualLeft = s.income.actual + s.income.upcoming - s.expense.actual - s.expense.upcoming - s.savings.actual - s.savings.upcoming;
  rows.push(['Summary', 'Left over', plainAmount(s.plannedLeftover), plainAmount(actualLeft), plainAmount(actualLeft - s.plannedLeftover)]);
  return toCsv(['Section', 'Category', 'Planned', 'Actual', 'Difference'], rows, [1]);
}

// ---------------------------------------------------------------- reading

/** RFC 4180 parser with delimiter detection (comma, semicolon or tab). */
export function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => {
    let n = 0;
    let q = false;
    for (const c of firstLine) {
      if (c === '"') q = !q;
      else if (c === ch && !q) n++;
    }
    return n;
  };
  const delims = [',', ';', '\t'];
  const delim = delims.reduce((best, d) => (count(d) > count(best) ? d : best), ',');

  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

const MONTH_INDEX = Object.fromEntries(MONTHS_SHORT.map((m, i) => [m.toLowerCase(), i + 1]));

/** Reads ISO, DD/MM/YYYY (South African order), YYYY/MM/DD and '23 Nov 2026'. */
export function parseDate(raw, order = 'dmy') {
  const s = String(raw || '').trim().replace(/^'/, '');
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return check(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return order === 'mdy' ? check(y, m[1], m[2]) : check(y, m[2], m[1]);
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{2,4})/);
  if (m && MONTH_INDEX[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return check(y, MONTH_INDEX[m[2].toLowerCase()], m[1]);
  }
  m = s.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTH_INDEX[m[1].toLowerCase()]) return check(m[3], MONTH_INDEX[m[1].toLowerCase()], m[2]);
  return null;
  function check(y, mo, d) {
    const out = `${y}-${pad(Number(mo))}-${pad(Number(d))}`;
    return isIsoDate(out) ? out : null;
  }
}

const HEADERS = {
  date: ['date', 'transaction date', 'posting date', 'posted', 'value date', 'datum'],
  amount: ['amount', 'amount (zar)', 'value', 'amount zar', 'rand', 'bedrag'],
  signed: ['signed amount'],
  debit: ['debit', 'debits', 'money out', 'out', 'withdrawal', 'withdrawals'],
  credit: ['credit', 'credits', 'money in', 'in', 'deposit', 'deposits'],
  type: ['type', 'kind', 'transaction type'],
  category: ['category', 'categories', 'budget category', 'goal'],
  note: ['note', 'notes', 'description', 'details', 'narrative', 'memo', 'reference', 'payee', 'merchant', 'beskrywing'],
};

function findCol(header, names) {
  const h = header.map((x) => String(x).trim().toLowerCase());
  for (const n of names) {
    const i = h.indexOf(n);
    if (i > -1) return i;
  }
  return -1;
}

/**
 * Turns CSV text into new transactions without changing the state.
 * Returns { transactions, newCategories, duplicates, skipped, problems, range }.
 */
export function planImport(state, text) {
  const rows = parseCsv(text);
  const result = { transactions: [], newCategories: [], newGoals: [], duplicates: 0, skipped: 0, problems: [], range: null };
  if (rows.length < 2) {
    result.problems.push('The file has no rows to import.');
    return result;
  }
  const header = rows[0];
  const col = Object.fromEntries(Object.entries(HEADERS).map(([k, names]) => [k, findCol(header, names)]));
  if (col.date < 0 || (col.amount < 0 && col.debit < 0 && col.credit < 0)) {
    result.problems.push('Could not find a Date column and an Amount column (or Debit and Credit columns).');
    return result;
  }

  // Work out DD/MM against MM/DD from the data itself (South Africa uses DD/MM).
  let order = 'dmy';
  for (const r of rows.slice(1)) {
    const m = String(r[col.date] || '').match(/^(\d{1,2})[-/.](\d{1,2})[-/.]/);
    if (m && Number(m[2]) > 12) {
      order = 'mdy';
      break;
    }
    if (m && Number(m[1]) > 12) break;
  }

  const hasNegatives = col.amount > -1 && rows.slice(1).some((r) => parseMoney(r[col.amount]) < 0);
  const existing = new Set(state.transactions.map(dupKey));
  const catByName = new Map(state.categories.map((c) => [`${c.type}|${c.name.trim().toLowerCase()}`, c]));
  const goalByName = new Map(state.goals.map((g) => [g.name.trim().toLowerCase(), g]));
  let order0 = state.categories.length;

  for (const r of rows.slice(1)) {
    const date = parseDate(r[col.date], order);
    let amount = NaN;
    let signedSource = false;
    if (col.amount > -1 && String(r[col.amount] ?? '').trim() !== '') {
      amount = parseMoney(r[col.amount]);
    } else if (col.signed > -1 && String(r[col.signed] ?? '').trim() !== '') {
      amount = parseMoney(r[col.signed]);
      signedSource = true;
    } else if (col.debit > -1 || col.credit > -1) {
      const debit = col.debit > -1 ? parseMoney(r[col.debit]) : NaN;
      const credit = col.credit > -1 ? parseMoney(r[col.credit]) : NaN;
      amount = (Number.isFinite(credit) ? Math.abs(credit) : 0) - (Number.isFinite(debit) ? Math.abs(debit) : 0);
      signedSource = true;
    }
    if (!date || !Number.isFinite(amount) || amount === 0) {
      result.skipped++;
      continue;
    }
    const rawType = col.type > -1 ? String(r[col.type] || '').trim().toLowerCase() : '';
    let type;
    if (rawType) {
      if (/^(income|in|credit|deposit)/.test(rawType)) type = 'income';
      else if (/^(saving|goal)/.test(rawType)) type = 'savings';
      else type = 'expense';
    } else if (signedSource || hasNegatives) {
      // Bank-statement style: money in is positive, money out is negative.
      type = amount < 0 ? 'expense' : 'income';
    } else {
      // A list of plain positive amounts with no Type column is a spending list.
      type = 'expense';
    }
    const value = Math.abs(amount);
    const note = col.note > -1 ? String(r[col.note] || '').trim().replace(/^'/, '') : '';
    const catName = col.category > -1 ? String(r[col.category] || '').trim().replace(/^'/, '') : '';

    const tx = { id: uid(), date, type, amount: value, categoryId: null, goalId: null, note, createdAt: new Date().toISOString(), imported: true };
    if (type === 'savings') {
      const gname = (catName || 'Savings').toLowerCase();
      let g = goalByName.get(gname);
      if (!g) {
        g = { id: uid(), name: catName || 'Savings', emoji: '🎯', target: 0, startingBalance: 0, monthly: 0, targetDate: null, archived: false, createdAt: new Date().toISOString(), createdPeriod: date.slice(0, 7) };
        goalByName.set(gname, g);
        result.newGoals.push(g);
      }
      tx.goalId = g.id;
    } else {
      const name = catName || (type === 'income' ? 'Other income' : 'Other');
      const k = `${type}|${name.toLowerCase()}`;
      let c = catByName.get(k);
      if (!c) {
        c = { id: uid(), type, name, emoji: type === 'income' ? '💰' : '🏷️', order: order0++, archived: false };
        catByName.set(k, c);
        result.newCategories.push(c);
      }
      tx.categoryId = c.id;
    }
    if (existing.has(dupKey(tx))) {
      result.duplicates++;
      continue;
    }
    existing.add(dupKey(tx));
    result.transactions.push(tx);
  }
  if (result.transactions.length) {
    const dates = result.transactions.map((t) => t.date).sort();
    result.range = { start: dates[0], end: dates[dates.length - 1] };
  }
  return result;
}

function dupKey(t) {
  return [t.date, t.type, Math.abs(t.amount), t.categoryId || t.goalId || '', (t.note || '').trim().toLowerCase()].join('|');
}

export function applyImport(state, plan) {
  state.categories.push(...plan.newCategories);
  state.goals.push(...plan.newGoals);
  state.transactions.push(...plan.transactions);
}

export function backupJson(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString(), app: 'mali-budget' }, null, 2);
}

export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return 'This is not a backup file.';
  if (!Array.isArray(obj.transactions) || !Array.isArray(obj.categories)) return 'This file is missing transactions or categories.';
  return null;
}

export { todayIso, activeCategories };
