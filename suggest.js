// "What to eat next": for each of Chris's meals, scale the main foods (meat, rice,
// potatoes, eggs, tortillas, milk, banana) so the meal lands on what's left today.
// Oil, sauces and toppings stay at his usual amounts. Pure math — no AI, works offline.

const MACROS = ["protein", "carbs", "fat"];
// Misses are weighed in calories (4/4/9 per gram); protein misses count 1.5×.
const WEIGHTS = { protein: 16 * 1.5, carbs: 16, fat: 81 };

function missScore(fixed, vars, target) {
  let s = 0;
  for (const k of MACROS) {
    let v = fixed[k];
    for (const x of vars) v += x.per[k] * x.x;
    const d = v - target[k];
    s += WEIGHTS[k] * d * d;
  }
  return s;
}

// Coordinate descent: the miss is a convex quadratic, so fitting one food at a time
// (clamped to its range) converges fast for the 2–3 foods a meal scales.
function fit(fixed, vars, target, frozen) {
  for (let it = 0; it < 80; it++) {
    for (const v of vars) {
      if (frozen.has(v)) continue;
      let num = 0;
      let den = 0;
      for (const k of MACROS) {
        let rest = fixed[k] - target[k];
        for (const o of vars) if (o !== v) rest += o.per[k] * o.x;
        num += WEIGHTS[k] * v.per[k] * rest;
        den += WEIGHTS[k] * v.per[k] * v.per[k];
      }
      if (den > 0) v.x = Math.min(v.max, Math.max(v.min, -num / den));
    }
  }
}

function solveMeal(meal, baseItems, target) {
  const F = window.DietFoods;
  const items = baseItems.map((i) => ({ ...i }));
  const fixed = { protein: 0, carbs: 0, fat: 0 };
  // Only the meal's own foods scale; something he tossed in once stays at what he used.
  const kind = (id) => F.getFood(id)?.group || id;
  const core = new Set(meal.items.map((i) => kind(i.food)));
  let vars = [];
  items.forEach((item, idx) => {
    const food = F.getFood(item.food);
    const amount = Number(item.amount);
    if (!food || !(amount > 0)) return;
    if (food.flex && core.has(kind(item.food))) {
      const per = F.itemMacros({ ...item, amount: 1 });
      const integer = item.unit === "pc" || item.unit === "srv";
      // Stay between 40% and 250% of his usual portion so the meal still looks like itself.
      const min = integer ? Math.max(1, Math.round(amount * 0.4)) : amount * 0.4;
      const max = integer ? Math.max(min, Math.round(amount * 2.5)) : amount * 2.5;
      vars.push({ idx, per, integer, min, max, x: amount });
    } else {
      const m = F.itemMacros(item);
      for (const k of MACROS) fixed[k] += m[k];
    }
  });
  if (!vars.length) return null;

  fit(fixed, vars, target, new Set());

  // Whole eggs/tortillas/bananas: try each counted food rounded down and up, refit the rest.
  const counted = vars.filter((v) => v.integer);
  if (counted.length) {
    let best = null;
    for (let mask = 0; mask < 1 << counted.length; mask++) {
      const trial = vars.map((v) => ({ ...v }));
      const frozen = new Set();
      let bit = 0;
      for (const v of trial) {
        if (!v.integer) continue;
        const rounded = (mask >> bit) & 1 ? Math.ceil(v.x) : Math.floor(v.x);
        v.x = Math.min(v.max, Math.max(v.min, rounded));
        frozen.add(v);
        bit++;
      }
      fit(fixed, trial, target, frozen);
      const score = missScore(fixed, trial, target);
      if (!best || score < best.score) best = { score, trial };
    }
    vars = best.trial;
  }

  for (const v of vars) {
    if (!v.integer) {
      const step = items[v.idx].unit === "ml" ? 10 : 5;
      v.x = Math.max(step, Math.round(v.x / step) * step);
    }
    items[v.idx].amount = v.x;
  }

  const used = items.filter((i) => Number(i.amount) > 0 && F.getFood(i.food));
  const totals = window.DietStore.sumMacros(used.map((i) => F.itemMacros(i)));
  return { meal, items: used, totals, score: Math.sqrt(missScore(fixed, vars, target)) };
}

function suggestNext(db, summary) {
  const left = summary.remaining;
  const n = summary.mealsLeft;
  if (left.calories < 150) return { done: true, left, mealsLeft: n, options: [] };
  const target = {};
  for (const k of ["calories", ...MACROS]) target[k] = Math.max(0, left[k]) / n;
  const options = db.meals
    .map((meal) => solveMeal(meal, window.DietStore.mealItems(db, meal.id), target))
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);
  return { done: false, left, target, mealsLeft: n, options: options.slice(0, 3) };
}

window.DietSuggest = { suggestNext, solveMeal };
