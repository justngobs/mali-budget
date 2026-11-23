// Realistic South African sample budget, so you can explore before entering your own.
import { emptyState, seedCategories, materializeThrough, periodOf, shiftPeriod, uid, periodRange } from './model.js';
import { todayIso, addDays, pad, daysInMonth } from './format.js';

function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleState(today = todayIso()) {
  const s = seedCategories(emptyState());
  s.demo = true;
  const r = rng(20261123);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const between = (a, b) => Math.round((a + r() * (b - a)) * 100) / 100;
  const cents = (rand) => Math.round(rand * 100);
  const cat = (name) => s.categories.find((c) => c.name === name).id;

  const cur = periodOf(today, 1);
  const first = shiftPeriod(cur, -6);

  const plan = {
    [cat('Salary')]: 2850000,
    [cat('Side income')]: 240000,
    [cat('Rent or bond')]: 850000,
    [cat('Groceries')]: 420000,
    [cat('Transport & fuel')]: 260000,
    [cat('Electricity & water')]: 90000,
    [cat('Airtime & data')]: 65000,
    [cat('Insurance')]: 115000,
    [cat('Medical aid & health')]: 190000,
    [cat('Debt & accounts')]: 120000,
    [cat('Subscriptions')]: 37000,
    [cat('Eating out')]: 90000,
    [cat('Family support')]: 150000,
    [cat('Clothing & personal')]: 60000,
    [cat('Giving & church')]: 50000,
    [cat('Entertainment')]: 60000,
    [cat('Other')]: 40000,
  };
  s.months[first] = { plan };
  s.months[cur] = { plan: { ...plan, [cat('Groceries')]: 450000, [cat('Entertainment')]: 80000 } };

  const goal = (name, emoji, target, startingBalance, monthly, targetDate) => {
    const g = { id: uid(), name, emoji, target, startingBalance, monthly, targetDate, createdPeriod: first, archived: false, createdAt: new Date().toISOString() };
    s.goals.push(g);
    return g.id;
  };
  const gEmergency = goal('Emergency fund', '🛟', 3000000, 900000, 150000, null);
  const gHoliday = goal('December holiday', '🏖️', 800000, 200000, 100000, `${cur.slice(0, 4)}-12`);
  const gLaptop = goal('New laptop', '💻', 1800000, 0, 80000, `${Number(cur.slice(0, 4)) + 1}-06`);

  const rule = (name, type, amount, day, target) => {
    s.recurring.push({
      id: uid(),
      name,
      type,
      amount,
      frequency: 'monthly',
      startDate: `${first}-${pad(day)}`,
      endDate: null,
      active: true,
      skips: [],
      generatedThrough: null,
      categoryId: type === 'savings' ? null : target,
      goalId: type === 'savings' ? target : null,
    });
  };
  rule('Salary', 'income', 2850000, 25, cat('Salary'));
  rule('Rent', 'expense', 850000, 1, cat('Rent or bond'));
  rule('Discovery medical aid', 'expense', 165000, 1, cat('Medical aid & health'));
  rule('Car insurance', 'expense', 95000, 3, cat('Insurance'));
  rule('Funeral cover', 'expense', 20000, 3, cat('Insurance'));
  rule('Vodacom contract', 'expense', 44900, 5, cat('Airtime & data'));
  rule('Credit card repayment', 'expense', 120000, 7, cat('Debt & accounts'));
  rule('Netflix', 'expense', 19900, 12, cat('Subscriptions'));
  rule('Showmax', 'expense', 9900, 15, cat('Subscriptions'));
  rule('Spotify', 'expense', 6999, 20, cat('Subscriptions'));
  rule('Money for Mama', 'expense', 150000, 26, cat('Family support'));
  rule('Tithe', 'expense', 50000, 2, cat('Giving & church'));
  rule('Emergency fund', 'savings', 150000, 26, gEmergency);
  rule('Holiday savings', 'savings', 100000, 26, gHoliday);
  rule('Laptop savings', 'savings', 80000, 26, gLaptop);
  materializeThrough(s, cur, today);

  const add = (date, type, categoryId, amount, note) => {
    if (date > today) return;
    s.transactions.push({ id: uid(), date, type, amount, categoryId, goalId: null, note, createdAt: `${date}T12:00:00.000Z` });
  };

  for (let k = first; k <= cur; k = shiftPeriod(k, 1)) {
    const [y, m] = k.split('-').map(Number);
    const dim = daysInMonth(y, m);
    const day = () => `${k}-${pad(1 + Math.floor(r() * dim))}`;
    const n = (a, b) => a + Math.floor(r() * (b - a + 1));
    const big = k === shiftPeriod(cur, -3);

    for (let i = n(6, 9); i--; ) add(day(), 'expense', cat('Groceries'), cents(between(140, 920)), pick(['Checkers', 'Pick n Pay', 'Woolworths Food', 'Shoprite', 'Spar', 'Checkers Sixty60']));
    for (let i = n(3, 4); i--; ) add(day(), 'expense', cat('Transport & fuel'), cents(between(450, 850)), pick(['Engen', 'Shell', 'BP', 'Sasol', 'Astron Energy']));
    for (let i = n(1, 4); i--; ) add(day(), 'expense', cat('Transport & fuel'), cents(between(55, 190)), pick(['Uber', 'Bolt', 'Taxi fare']));
    for (let i = n(2, 3); i--; ) add(day(), 'expense', cat('Electricity & water'), cents(between(300, 520)), 'Prepaid electricity');
    for (let i = n(0, 2); i--; ) add(day(), 'expense', cat('Airtime & data'), cents(pick([29, 49, 99, 149])), pick(['Data bundle', 'Airtime']));
    for (let i = n(3, 7); i--; ) add(day(), 'expense', cat('Eating out'), cents(between(85, 460)), pick(["Nando's", 'KFC', 'Steers', 'Debonairs', 'Wimpy', 'Ocean Basket', 'Mugg & Bean', 'Kota spot']));
    for (let i = n(0, 2); i--; ) add(day(), 'expense', cat('Clothing & personal'), cents(between(120, 650)), pick(['Mr Price', 'Pep', 'Ackermans', 'Clicks', 'Barber']));
    for (let i = n(1, 3); i--; ) add(day(), 'expense', cat('Entertainment'), cents(between(90, 380)), pick(['Ster-Kinekor', 'Braai with friends', 'Spur', 'Soccer tickets']));
    for (let i = n(0, 2); i--; ) add(day(), 'expense', cat('Medical aid & health'), cents(between(90, 320)), pick(['Dis-Chem', 'Clicks pharmacy']));
    for (let i = n(1, 2); i--; ) add(day(), 'expense', cat('Other'), cents(between(80, 420)), pick(['Takealot', 'Hardware store', 'Post office', 'Gift']));
    for (let i = n(1, 2); i--; ) add(day(), 'income', cat('Side income'), cents(between(700, 1600)), pick(['Logo design job', 'Weekend photography', 'Tutoring']));
    if (big) add(`${k}-14`, 'expense', cat('Transport & fuel'), 386000, 'Car service and tyres');
    if (k === shiftPeriod(cur, -1)) add(`${k}-08`, 'expense', cat('Clothing & personal'), 129900, 'Winter jacket');
  }
  // The sample "today" month: a couple of fresh entries so the dashboard feels alive.
  add(today, 'expense', cat('Groceries'), 38650, 'Checkers');
  add(addDays(today, -1), 'expense', cat('Eating out'), 21400, "Nando's");
  return s;
}

export { periodRange };
