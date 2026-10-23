// Everything lives in this phone's localStorage. The key stays the same as the old
// planned-meals version so existing logs carry over; migrate() upgrades the shape.
const DB_KEY = "diet-hub-db-v1";
const DB_VERSION = 2;

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function parseDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(key, n) {
  const d = parseDate(key);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2);
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function r1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

let memoryDb = null;

function writeDb(db) {
  memoryDb = db;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* private mode / quota — keep memory copy */
  }
}

function validTargets(t) {
  return t && ["calories", "protein", "carbs", "fat"].every((k) => Number(t[k]) > 0);
}

function pickTargets(t, fallback) {
  if (!validTargets(t)) return { ...fallback };
  return {
    calories: Math.round(t.calories),
    protein: Math.round(t.protein),
    carbs: Math.round(t.carbs),
    fat: Math.round(t.fat),
  };
}

function mergeGrocery(old, seed) {
  const prev = new Map((old?.items || []).map((i) => [i.id, i]));
  const seedIds = new Set(seed.items.map((i) => i.id));
  const items = seed.items.map((s) => {
    const p = prev.get(s.id);
    if (!p) return { ...s };
    return { ...s, have: Boolean(p.have), amount: p.amount || s.amount, ...(s.beefFat ? { beefFat: p.beefFat || s.beefFat } : {}) };
  });
  // Items Chris added himself have generated ids, not seed slugs — keep them.
  for (const i of old?.items || []) {
    if (!seedIds.has(i.id) && /^(id-|[0-9a-f]{8}-)/i.test(String(i.id))) items.push(i);
  }
  return { note: seed.note, items };
}

function migrate(db) {
  const seed = window.DIET_SEED;
  db.logs = db.logs?.days ? db.logs : { days: {} };
  db.chats = Array.isArray(db.chats?.messages) ? db.chats : { messages: [] };
  if ((db.version || 0) < DB_VERSION) {
    const oldDays = db.plan?.days || {};
    db.settings = {
      targets: {
        train: pickTargets(oldDays.train, seed.targets.train),
        rest: pickTargets(oldDays.rest, seed.targets.rest),
      },
      hit: { ...seed.hit },
      stepGoal: seed.stepGoal,
    };
    db.meals = clone(seed.meals);
    db.grocery = mergeGrocery(db.grocery, seed.grocery);
    if (db.plan) db.legacy = { plan: db.plan };
    delete db.plan;
    db.version = DB_VERSION;
  }
  db.settings = db.settings || {};
  db.settings.targets = {
    train: pickTargets(db.settings.targets?.train, seed.targets.train),
    rest: pickTargets(db.settings.targets?.rest, seed.targets.rest),
  };
  db.settings.hit = { ...seed.hit, ...(db.settings.hit || {}) };
  db.settings.stepGoal = Number(db.settings.stepGoal) > 0 ? Number(db.settings.stepGoal) : seed.stepGoal;
  db.meals = Array.isArray(db.meals) ? db.meals : clone(seed.meals);
  db.customFoods = Array.isArray(db.customFoods) ? db.customFoods : [];
  db.lastUsed = { meals: {}, foods: {}, ...(db.lastUsed || {}) };
  db.weights = Array.isArray(db.weights) ? db.weights : [];
  db.checkins = Array.isArray(db.checkins) ? db.checkins : [];
  db.grocery = Array.isArray(db.grocery?.items) ? db.grocery : clone(seed.grocery);
  db.dayPrefs = db.dayPrefs || {};
  return db;
}

function readDb() {
  if (memoryDb) return memoryDb;
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(DB_KEY) || "null");
  } catch {
    raw = null;
  }
  const db = migrate(raw && typeof raw === "object" ? raw : {});
  window.DietFoods.setCustomFoods(db.customFoods);
  writeDb(db);
  return db;
}

function sumMacros(rows) {
  return (rows || []).reduce(
    (acc, item) => {
      acc.calories += Number(item.calories) || 0;
      acc.protein += Number(item.protein) || 0;
      acc.carbs += Number(item.carbs) || 0;
      acc.fat += Number(item.fat) || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

// ---- Days ----

function ensureDay(db, date) {
  let day = db.logs.days[date];
  if (!day) day = db.logs.days[date] = { type: "train", eaten: [] };
  if (day.type !== "rest") day.type = "train";
  if (!Array.isArray(day.eaten)) day.eaten = [];
  return day;
}

function macroStatus(key, eaten, target, hit) {
  const diff = eaten - target;
  if (key === "protein") return { state: diff >= -0.5 ? "hit" : "under", diff };
  const tol = key === "calories" ? Number(hit.kcalWindow) || 0 : (target * (Number(hit.carbFatPct) || 0)) / 100;
  if (Math.abs(diff) <= tol) return { state: "hit", diff };
  return { state: diff > 0 ? "over" : "under", diff };
}

function mealCount(eaten) {
  return eaten.filter((e) => e.kind === "meal" || e.kind === "planned").length;
}

function daySummary(db, date) {
  const day = ensureDay(db, date);
  const targets = db.settings.targets[day.type];
  const totals = sumMacros(day.eaten);
  const remaining = {};
  const status = {};
  for (const k of ["calories", "protein", "carbs", "fat"]) {
    remaining[k] = targets[k] - totals[k];
    status[k] = macroStatus(k, totals[k], targets[k], db.settings.hit);
  }
  const pref = db.dayPrefs[date]?.mealsLeft;
  const meals = mealCount(day.eaten);
  const mealsLeftSet = pref === 1 || pref === 2;
  const mealsLeft = mealsLeftSet ? pref : Math.min(2, Math.max(1, 4 - meals));
  return {
    date,
    type: day.type,
    eaten: day.eaten,
    totals,
    targets,
    remaining,
    status,
    mealCount: meals,
    mealsLeft,
    mealsLeftSet,
    steps: day.steps == null ? null : Number(day.steps),
    stepsSource: day.stepsSource || null,
    stepGoal: db.settings.stepGoal,
  };
}

function setDayType(db, date, type) {
  ensureDay(db, date).type = type === "rest" ? "rest" : "train";
  writeDb(db);
}

function setMealsLeft(db, date, n) {
  db.dayPrefs[date] = { ...(db.dayPrefs[date] || {}), mealsLeft: n === 1 ? 1 : 2 };
  writeDb(db);
}

function setSteps(db, date, steps, source) {
  const n = Math.round(Number(steps));
  if (!Number.isFinite(n) || n < 0) throw new Error("Enter a step count.");
  const day = ensureDay(db, date);
  day.steps = n;
  day.stepsSource = source === "health" ? "health" : "manual";
  day.stepsAt = new Date().toISOString();
  writeDb(db);
}

// ---- Log entries ----

function buildEntry({ kind, mealId, name, items }) {
  const F = window.DietFoods;
  const rows = (items || [])
    .filter((i) => Number(i.amount) > 0 && F.getFood(i.food))
    .map((i) => {
      const food = F.getFood(i.food);
      const m = F.itemMacros(i);
      return {
        food: i.food,
        name: food.name,
        amount: Number(i.amount),
        unit: i.unit,
        doneness: F.hasDoneness(food) ? (i.doneness === "raw" ? "raw" : "cooked") : null,
        calories: r1(m.calories),
        protein: r1(m.protein),
        carbs: r1(m.carbs),
        fat: r1(m.fat),
      };
    });
  if (!rows.length) throw new Error("Enter an amount for at least one food.");
  const t = sumMacros(rows);
  return {
    kind: kind === "meal" ? "meal" : "food",
    mealId: mealId || null,
    name: name || rows.map((r) => r.name).join(" + "),
    items: rows,
    calories: Math.round(t.calories),
    protein: r1(t.protein),
    carbs: r1(t.carbs),
    fat: r1(t.fat),
  };
}

function remember(db, entry) {
  const slim = entry.items.map(({ food, amount, unit, doneness }) => ({ food, amount, unit, doneness }));
  if (entry.mealId) db.lastUsed.meals[entry.mealId] = slim;
  for (const i of slim) db.lastUsed.foods[i.food] = { amount: i.amount, unit: i.unit, doneness: i.doneness };
}

function addEntry(db, date, fields) {
  const entry = { id: uid(), at: new Date().toISOString(), ...buildEntry(fields) };
  ensureDay(db, date).eaten.push(entry);
  remember(db, entry);
  writeDb(db);
  return entry;
}

function updateEntry(db, date, id, fields) {
  const day = ensureDay(db, date);
  const idx = day.eaten.findIndex((e) => e.id === id);
  if (idx < 0) throw new Error("That entry is gone.");
  const entry = { id, at: day.eaten[idx].at, ...buildEntry(fields) };
  day.eaten[idx] = entry;
  remember(db, entry);
  writeDb(db);
  return entry;
}

function removeEntry(db, date, id) {
  const day = ensureDay(db, date);
  day.eaten = day.eaten.filter((e) => e.id !== id);
  writeDb(db);
}

function findEntry(db, date, id) {
  return ensureDay(db, date).eaten.find((e) => e.id === id) || null;
}

function foodKind(id) {
  const food = window.DietFoods.getFood(id);
  return food?.group || id;
}

// What to prefill when Chris taps a meal: last time's amounts, plus any of the meal's
// foods he skipped last time (or that are optional) at 0 so they're one tap away.
function mealItems(db, mealId) {
  const F = window.DietFoods;
  const meal = db.meals.find((m) => m.id === mealId);
  const template = meal?.items || [];
  const last = db.lastUsed.meals[mealId];
  const items = last ? [...last] : [...template];
  if (last) {
    const have = new Set(last.map((i) => foodKind(i.food)));
    for (const t of template) if (!have.has(foodKind(t.food))) items.push({ ...t, amount: 0 });
  }
  return clone(items.filter((i) => F.getFood(i.food)));
}

// Which beef blend / steak cut / salmon he usually has, from his most recent meals.
function preferredVariant(db, group) {
  const F = window.DietFoods;
  for (const items of Object.values(db.lastUsed.meals)) {
    const hit = items.find((i) => F.getFood(i.food)?.group === group);
    if (hit) return hit.food;
  }
  for (const m of db.meals) {
    const hit = m.items.find((i) => F.getFood(i.food)?.group === group);
    if (hit) return hit.food;
  }
  return F.FOODS.find((f) => f.group === group)?.id || null;
}

function foodItem(db, foodId, fallback = {}) {
  const F = window.DietFoods;
  const last = db.lastUsed.foods[foodId];
  const units = F.unitsFor(F.getFood(foodId));
  if (last && units.includes(last.unit)) return F.newItem(foodId, last);
  return F.newItem(foodId, fallback);
}

function recentDays(db, today, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const date = addDays(today, -i);
    const day = db.logs.days[date];
    if (!day?.eaten?.length) continue;
    const t = sumMacros(day.eaten);
    out.push({ date, type: day.type || "train", totals: t, targets: db.settings.targets[day.type === "rest" ? "rest" : "train"] });
  }
  return out;
}

// ---- Targets, meals, custom foods ----

function saveSettings(db, { targets, hit }) {
  for (const type of ["train", "rest"]) {
    const t = targets[type];
    if (!validTargets(t)) throw new Error(`Fill in all four ${type}-day numbers.`);
    db.settings.targets[type] = pickTargets(t, db.settings.targets[type]);
  }
  const kcalWindow = Number(hit.kcalWindow);
  const carbFatPct = Number(hit.carbFatPct);
  if (!(kcalWindow >= 0) || !(carbFatPct >= 0)) throw new Error("Hit ranges must be 0 or more.");
  db.settings.hit = { kcalWindow: Math.round(kcalWindow), carbFatPct: Math.round(carbFatPct) };
  writeDb(db);
}

function saveMeal(db, meal) {
  const name = String(meal.name || "").trim();
  if (!name) throw new Error("Give the meal a name.");
  // An amount of 0 keeps a food on the meal as optional (e.g. "sometimes banana").
  const items = (meal.items || [])
    .filter((i) => window.DietFoods.getFood(i.food))
    .map(({ food, amount, unit, doneness }) => ({ food, amount: Math.max(0, Number(amount) || 0), unit, doneness: doneness || null }));
  if (!items.some((i) => i.amount > 0)) throw new Error("Add at least one food with an amount.");
  const id = meal.id || `meal-${uid().slice(0, 8)}`;
  const idx = db.meals.findIndex((m) => m.id === id);
  const saved = { id, name, items };
  if (idx >= 0) db.meals[idx] = saved;
  else db.meals.push(saved);
  delete db.lastUsed.meals[id];
  writeDb(db);
  return saved;
}

function removeMeal(db, id) {
  db.meals = db.meals.filter((m) => m.id !== id);
  delete db.lastUsed.meals[id];
  writeDb(db);
}

function saveCustomFood(db, food) {
  const name = String(food.name || "").trim();
  if (!name) throw new Error("Give the food a name.");
  if (!food.per || food.per.some((v) => !Number.isFinite(v) || v < 0)) throw new Error("Fill in calories, protein, carbs and fat.");
  const id = food.id || `custom-${uid().slice(0, 8)}`;
  const saved = {
    id,
    name,
    per: food.per.map(r1),
    unit: "srv",
    baseUnit: food.baseUnit === "ml" ? "ml" : "g",
    gPerMl: 1,
    servingG: Number(food.servingG) > 0 ? Number(food.servingG) : 100,
    code: food.code ? window.DietFoods.normalizeBarcode(food.code) : null,
  };
  const idx = db.customFoods.findIndex((f) => f.id === id);
  if (idx >= 0) db.customFoods[idx] = saved;
  else db.customFoods.push(saved);
  window.DietFoods.setCustomFoods(db.customFoods);
  writeDb(db);
  return saved;
}

function removeCustomFood(db, id) {
  db.customFoods = db.customFoods.filter((f) => f.id !== id);
  delete db.lastUsed.foods[id];
  window.DietFoods.setCustomFoods(db.customFoods);
  writeDb(db);
}

function customByCode(db, code) {
  const want = window.DietFoods.normalizeBarcode(code);
  return db.customFoods.find((f) => f.code && window.DietFoods.normalizeBarcode(f.code) === want) || null;
}

// ---- Weight ----

function setWeight(db, date, lb) {
  const n = Number(lb);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Pick a date.");
  if (!(n > 50 && n < 500)) throw new Error("Enter your weight in lb.");
  db.weights = db.weights.filter((w) => w.date !== date);
  db.weights.push({ date, lb: r1(n) });
  db.weights.sort((a, b) => a.date.localeCompare(b.date));
  writeDb(db);
}

function removeWeight(db, date) {
  db.weights = db.weights.filter((w) => w.date !== date);
  writeDb(db);
}

function mean(list) {
  return list.length ? list.reduce((a, w) => a + w.lb, 0) / list.length : null;
}

// 7-day average for each weigh-in: the mean of every weigh-in in that day and the 6 before it.
function weightTrend(db) {
  return db.weights.map((w) => {
    const from = addDays(w.date, -6);
    return { ...w, avg: mean(db.weights.filter((x) => x.date >= from && x.date <= w.date)) };
  });
}

function weightStats(db, today) {
  const last7 = db.weights.filter((w) => w.date > addDays(today, -7) && w.date <= today);
  const prev7 = db.weights.filter((w) => w.date > addDays(today, -14) && w.date <= addDays(today, -7));
  const avg7 = mean(last7);
  const prevAvg = mean(prev7);
  return {
    latest: db.weights[db.weights.length - 1] || null,
    avg7,
    count7: last7.length,
    rate: avg7 != null && prevAvg != null ? avg7 - prevAvg : null,
  };
}

// ---- History & weekly check-in ----

// Weekly gain goal from Chris's lean-bulk plan (lb per week).
const WEEKLY_GOAL = [0.25, 0.5];

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

function loggedDays(db, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (db.logs.days[d]?.eaten?.length) out.push(daySummary(db, d));
  }
  return out;
}

function pastDays(db, today, n) {
  return loggedDays(db, addDays(today, -n), addDays(today, -1)).reverse();
}

// 7-day blocks ending yesterday (today is still in progress).
function weekSummaries(db, today, n) {
  const weeks = [];
  for (let k = 0; k < n; k++) {
    const end = addDays(today, -1 - 7 * k);
    const start = addDays(end, -6);
    const days = loggedDays(db, start, end);
    const avg = (fn) => (days.length ? days.reduce((a, s) => a + fn(s), 0) / days.length : null);
    weeks.push({
      start,
      end,
      logged: days.length,
      calories: avg((s) => s.totals.calories),
      target: avg((s) => s.targets.calories),
      protein: avg((s) => s.totals.protein),
      carbs: avg((s) => s.totals.carbs),
      fat: avg((s) => s.totals.fat),
      proteinHits: days.filter((s) => s.status.protein.state === "hit").length,
      calorieHits: days.filter((s) => s.status.calories.state === "hit").length,
      weight: mean(db.weights.filter((w) => w.date >= start && w.date <= end)),
    });
  }
  return weeks;
}

// Compares this week's average weight with last week's. Rule of thumb: ~3,500 kcal per lb,
// so each 0.1 lb/week off the middle of the goal is ~50 kcal a day. Changes are 100–250 kcal,
// at most every 2 weeks, and only once he's actually been eating his targets.
function checkIn(db, today) {
  const w = weightStats(db, today);
  const prevCount = db.weights.filter((x) => x.date > addDays(today, -14) && x.date <= addDays(today, -7)).length;
  const last = db.checkins[db.checkins.length - 1] || null;
  const since = last ? daysBetween(last.date, today) : null;
  const base = { rate: w.rate, last, since };
  if (w.count7 < 3 || prevCount < 3) return { ...base, state: "need-weights", count7: w.count7, prevCount };
  if (since != null && since < 14) return { ...base, state: "wait", nextDate: addDays(last.date, 14) };
  const days = loggedDays(db, addDays(today, -14), addDays(today, -1));
  if (days.length < 7) return { ...base, state: "need-logs", logged: days.length };
  const ate = days.reduce((a, s) => a + s.totals.calories, 0) / days.length;
  const target = days.reduce((a, s) => a + s.targets.calories, 0) / days.length;
  const mid = (WEEKLY_GOAL[0] + WEEKLY_GOAL[1]) / 2;
  const step = (lbPerWeek) => Math.min(250, Math.max(100, Math.round((lbPerWeek * 500) / 25) * 25));
  const common = { ...base, ate, target };
  if (w.rate < WEEKLY_GOAL[0]) {
    if (target - ate > 150) return { ...common, state: "eat-more" };
    return { ...common, state: "raise", delta: step(mid - w.rate) };
  }
  if (w.rate > WEEKLY_GOAL[1]) {
    if (ate - target > 150) return { ...common, state: "eat-less" };
    return { ...common, state: "lower", delta: -step(w.rate - mid) };
  }
  return { ...common, state: "on-pace" };
}

// Calorie changes go on carbs; protein and fat stay put.
function applyCheckin(db, today, delta, rate) {
  for (const type of ["train", "rest"]) {
    const t = db.settings.targets[type];
    t.calories = Math.round(t.calories + delta);
    t.carbs = Math.max(0, Math.round(t.carbs + delta / 4));
  }
  db.checkins.push({ date: today, delta, rate: rate == null ? null : Math.round(rate * 100) / 100 });
  writeDb(db);
}

// ---- Backup ----
// A backup is just the whole database as a JSON file Chris saves to Files / iCloud Drive.

function exportDb(db) {
  return JSON.stringify({ ...db, exportedAt: new Date().toISOString() });
}

function backupSummary(obj) {
  return {
    days: Object.values(obj?.logs?.days || {}).filter((d) => d?.eaten?.length).length,
    weights: Array.isArray(obj?.weights) ? obj.weights.length : 0,
    exportedAt: obj?.exportedAt || null,
  };
}

function restoreDb(obj) {
  if (!obj || typeof obj !== "object" || !obj.logs?.days) throw new Error("That file isn’t a Diet Hub backup.");
  // Keep what was on the phone, just in case the wrong file got picked.
  try {
    localStorage.setItem(`${DB_KEY}-before-restore`, JSON.stringify(memoryDb || {}));
  } catch {
    /* quota — the restore still goes ahead */
  }
  const db = migrate(clone(obj));
  delete db.exportedAt;
  window.DietFoods.setCustomFoods(db.customFoods);
  writeDb(db);
  return db;
}

function markBackup(db) {
  db.lastBackup = new Date().toISOString();
  writeDb(db);
}

// ---- Grocery ----

function updateGroceryItem(db, id, patch) {
  const item = db.grocery.items.find((i) => i.id === id);
  if (item) Object.assign(item, patch, { id: item.id });
  writeDb(db);
}

function addGroceryItem(db, item, amount) {
  db.grocery.items.push({ id: uid(), item: String(item || "").trim(), amount: String(amount || ""), have: false, category: "other" });
  writeDb(db);
}

function removeGroceryItem(db, id) {
  db.grocery.items = db.grocery.items.filter((i) => i.id !== id);
  writeDb(db);
}

function setGroceryNote(db, note) {
  db.grocery.note = String(note || "");
  writeDb(db);
}

// ---- Chat ----

function addChat(db, role, content) {
  db.chats.messages.push({ id: uid(), role, content, at: new Date().toISOString() });
  db.chats.messages = db.chats.messages.slice(-60);
  writeDb(db);
}

function clearChats(db) {
  db.chats.messages = [];
  writeDb(db);
}

window.DietStore = {
  db: readDb,
  todayKey,
  addDays,
  parseDate,
  sumMacros,
  daySummary,
  setDayType,
  setMealsLeft,
  setSteps,
  addEntry,
  updateEntry,
  removeEntry,
  findEntry,
  mealItems,
  preferredVariant,
  foodItem,
  recentDays,
  WEEKLY_GOAL,
  daysBetween,
  pastDays,
  weekSummaries,
  checkIn,
  applyCheckin,
  exportDb,
  backupSummary,
  restoreDb,
  markBackup,
  saveSettings,
  saveMeal,
  removeMeal,
  saveCustomFood,
  removeCustomFood,
  customByCode,
  setWeight,
  removeWeight,
  weightTrend,
  weightStats,
  updateGroceryItem,
  addGroceryItem,
  removeGroceryItem,
  setGroceryNote,
  addChat,
  clearChats,
};
