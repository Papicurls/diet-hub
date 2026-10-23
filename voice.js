// "Say it" logging: turns what Chris says or types (Wispr Flow, the keyboard mic, or typing)
// into log items, e.g. "250 grams of chicken and 120 grams of uncooked rice". It runs on the
// phone against his own foods — no AI, instant — and the result opens in the log sheet to check.

const ALIASES = [
  ["chicken breasts", "chicken-breast"], ["chicken breast", "chicken-breast"], ["chicken", "chicken-breast"],
  ["ground beef", "@ground-beef"], ["hamburger meat", "@ground-beef"], ["hamburger", "@ground-beef"], ["taco meat", "@ground-beef"], ["beef", "@ground-beef"],
  ["ribeye", "steak-ribeye"], ["rib eye", "steak-ribeye"], ["sirloin", "steak-sirloin"], ["new york strip", "steak-strip"], ["ny strip", "steak-strip"], ["strip steak", "steak-strip"], ["steak", "@steak"],
  ["sockeye salmon", "salmon-sockeye"], ["sockeye", "salmon-sockeye"], ["wild caught salmon", "salmon-wild"], ["wild salmon", "salmon-wild"],
  ["farm raised salmon", "salmon-farmed"], ["farmed salmon", "salmon-farmed"], ["atlantic salmon", "salmon-farmed"], ["salmon", "@salmon"],
  ["eggs", "eggs"], ["egg", "eggs"],
  ["jasmine rice", "rice"], ["white rice", "rice"], ["rice", "rice"],
  ["potatoes", "potato"], ["potato", "potato"],
  ["corn tortillas", "corn-tortilla"], ["corn tortilla", "corn-tortilla"], ["tortillas", "corn-tortilla"], ["tortilla", "corn-tortilla"],
  ["bananas", "banana"], ["banana", "banana"], ["kiwis", "kiwi"], ["kiwi", "kiwi"],
  ["mangoes", "mango"], ["mangos", "mango"], ["mango", "mango"],
  ["strawberries", "strawberries"], ["strawberry", "strawberries"], ["blueberries", "blueberries"], ["blueberry", "blueberries"],
  ["raw milk", "raw-milk"], ["whole milk", "raw-milk"], ["milk", "raw-milk"],
  ["coconut water", "coconut-water"],
  ["olive oil", "olive-oil"], ["oil", "olive-oil"], ["butter", "butter"], ["ketchup", "ketchup"], ["catsup", "ketchup"],
  ["onions", "onion"], ["onion", "onion"], ["cilantro", "cilantro"], ["lime juice", "lime"], ["limes", "lime"], ["lime", "lime"],
];

const UNIT_WORDS = {
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  l: "l", liter: "l", liters: "l", litre: "l", litres: "l",
  cup: "cup", cups: "cup",
  tbsp: "tbsp", tbs: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  serving: "srv", servings: "srv", scoop: "srv", scoops: "srv", pack: "srv", packs: "srv", bag: "srv", bags: "srv",
  can: "srv", cans: "srv", bottle: "srv", bottles: "srv", bar: "srv", bars: "srv",
  piece: "pc", pieces: "pc", whole: "pc",
};

// Words that can sit around a food without meaning anything ("I had", "for lunch", "scrambled").
const FILLER = new Set(
  ("i i'm im had have ate eaten eat just also then for my the of some a an and with about around like roughly approximately " +
    "today this morning afternoon evening tonight night breakfast lunch dinner snack meal log add please it that was were me " +
    "cooked uncooked raw dry scrambled fried grilled baked roasted boiled seared pan air fryer oven bowl plate side little bit " +
    "big small large medium extra more less plus in on to into usual normal regular same as last time").split(/\s+/),
);

const UNITS_1 = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// "two hundred and fifty" -> "250". Adjacent separate numbers ("eighty five fifteen") stay apart.
function wordsToNumbers(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  while (i < words.length) {
    let j = i;
    let total = 0;
    let current = 0;
    let last = null;
    while (j < words.length) {
      const w = words[j];
      if (w in TENS && (last === null || last === "hundred")) {
        current += TENS[w];
        last = "tens";
      } else if (w in UNITS_1 && (last === null || last === "hundred" || (last === "tens" && UNITS_1[w] < 10))) {
        current += UNITS_1[w];
        last = "unit";
      } else if (w === "hundred" && last && last !== "hundred") {
        current *= 100;
        last = "hundred";
      } else if (w === "thousand" && last) {
        total += current * 1000;
        current = 0;
        last = null;
      } else if (w === "and" && last === "hundred" && (words[j + 1] in TENS || words[j + 1] in UNITS_1)) {
        /* "three hundred and fifty" */
      } else break;
      j++;
    }
    if (j > i && (last !== null || total)) {
      out.push(String(total + current));
      i = j;
    } else {
      out.push(words[i]);
      i++;
    }
  }
  return out.join(" ");
}

function normalize(raw) {
  let t = ` ${String(raw || "").toLowerCase()} `
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/(\d)\s*(g|kg|ml|oz|lbs?)\b/g, "$1 $2")
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(\w+)/g, "$1 $2")
    .replace(/[.!?](?!\d)/g, " , ")
    .replace(/\s+/g, " ");
  t = wordsToNumbers(t.replace(/\ba hundred\b/g, "100"));
  t = t
    .replace(/(\d+(?:\.\d+)?) and (a )?half\b/g, (_, n) => String(Number(n) + 0.5))
    .replace(/\b(a|1) quarter\b/g, "0.25")
    .replace(/\bhalf (of )?(a|an)\b/g, "0.5")
    .replace(/\ba half\b/g, "0.5")
    .replace(/\ba couple( of)?\b/g, "2")
    .replace(/\ba dozen\b/g, "12");
  return ` ${t} `;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function plain(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasList(db) {
  const F = window.DietFoods;
  const builtIn = new Set(ALIASES.flatMap(([a]) => a.split(" ")));
  const custom = [];
  for (const f of db.customFoods) {
    const name = plain(f.name);
    if (!name) continue;
    custom.push([name, f.id]);
    const first = name.split(/\s+/)[0];
    if (first.length >= 4 && !builtIn.has(first) && !FILLER.has(first)) custom.push([first, f.id]);
  }
  return [...custom, ...ALIASES.filter(([, id]) => id.startsWith("@") || F.getFood(id))].sort((a, b) => b[0].length - a[0].length);
}

function findFoods(chunk, aliases) {
  const taken = [];
  const hits = [];
  for (const [alias, id] of aliases) {
    const re = new RegExp(`\\b${escapeRe(alias)}\\b`, "g");
    for (const m of chunk.matchAll(re)) {
      const start = m.index;
      const end = start + alias.length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      hits.push({ id, start, end });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

const BEEF_BLEND = /\b(93|90|85|80)\s*(?:(?:\/|-|\s)\s*(7|10|15|20)\b|\s*(?:%|percent)(?:\s*lean)?|\s+lean\b)/;
const BLEND_PAIR = { 93: 7, 90: 10, 85: 15, 80: 20 };

// Amount, unit and cooked/uncooked from the words around one food.
function readSegment(seg) {
  let text = seg;
  let blend = null;
  const b = text.match(BEEF_BLEND);
  if (b && (!b[2] || BLEND_PAIR[b[1]] === Number(b[2]))) {
    blend = `beef-${b[1]}`;
    text = text.replace(b[0], " ");
  }
  const done = /\b(uncooked|raw|dry)\b/.test(text) ? "raw" : /\bcooked\b/.test(text) ? "cooked" : null;
  const nums = [...text.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)?/g)].map((m) => ({ n: Number(m[1]), unit: UNIT_WORDS[m[2]] || null }));
  let pick = nums.find((x) => x.unit) || nums[0] || null;
  if (!pick) {
    const a = text.match(/\b(a|an)\s+([a-z]+)/);
    if (a && UNIT_WORDS[a[2]]) pick = { n: 1, unit: UNIT_WORDS[a[2]] };
    else if (/\b(a|an)\b/.test(text)) pick = { n: 1, unit: null, article: true };
  }
  return { amount: pick?.n ?? null, unitWord: pick?.unit ?? null, article: Boolean(pick?.article), done, blend };
}

function leftoverWords(chunk) {
  return chunk
    .replace(/\d+(?:\.\d+)?/g, " ")
    .split(/[^a-z]+/)
    .filter((w) => w && !FILLER.has(w) && !UNIT_WORDS[w]);
}

// Last time's amount for a food, else the quick-add default (330 ml coconut water, 1 banana…).
function usualItem(db, foodId) {
  const quick = (window.DIET_SEED.quickFoods || []).find((q) => q.food === foodId) || {};
  return window.DietStore.foodItem(db, foodId, quick);
}

// Turn one recognised food + what was said about it into a log item.
function toItem(db, hit, info) {
  const S = window.DietStore;
  const F = window.DietFoods;
  let foodId = hit.id;
  let variantSaid = true;
  if (foodId.startsWith("@")) {
    const group = foodId.slice(1);
    foodId = (group === "ground-beef" && info.blend) || S.preferredVariant(db, group);
    variantSaid = Boolean(group === "ground-beef" && info.blend);
  }
  const food = F.getFood(foodId);
  const base = usualItem(db, foodId);
  const item = { food: foodId, amount: null, unit: base.unit, doneness: F.hasDoneness(food) ? info.done || base.doneness : null };
  const n = info.amount;
  const u = info.unitWord;
  const units = F.unitsFor(food);
  if (n != null && !(info.article && !["pc", "srv"].includes(food.unit))) {
    if (!u) [item.amount, item.unit] = [n, food.unit || "g"];
    else if (u === "g") [item.amount, item.unit] = [n, "g"];
    else if (u === "kg") [item.amount, item.unit] = [n * 1000, "g"];
    else if (u === "oz") [item.amount, item.unit] = [Math.round(n * 28.35), "g"];
    else if (u === "lb") [item.amount, item.unit] = [Math.round(n * 453.6), "g"];
    else if (u === "ml" || u === "l") {
      const ml = u === "l" ? n * 1000 : n;
      [item.amount, item.unit] = units.includes("ml") ? [ml, "ml"] : [Math.round(ml), "g"];
    } else if (u === "cup") {
      if (units.includes("ml")) [item.amount, item.unit] = [n * 240, "ml"];
    } else if (u === "tbsp" || u === "tsp") {
      const tbsp = u === "tsp" ? n / 3 : n;
      [item.amount, item.unit] = food.tbspG ? [Math.round(tbsp * 100) / 100, "tbsp"] : [Math.round(tbsp * 15), "g"];
    } else if (u === "srv") {
      if (food.servingG) [item.amount, item.unit] = [n, "srv"];
      else [item.amount, item.unit] = [Math.round(Number(base.amount) * n), base.unit];
    } else if (u === "pc") {
      if (units.includes("pc")) [item.amount, item.unit] = [n, "pc"];
      else if (food.servingG) [item.amount, item.unit] = [n, "srv"];
    }
  }
  return { item, said: item.amount != null, variantSaid, unclearCups: u === "cup" && item.amount == null };
}

function mealPhrases(meal) {
  const name = plain(meal.name);
  const out = new Set([name]);
  const parts = name.split(" and ");
  if (parts.length === 2) out.add(`${parts[1]} and ${parts[0]}`);
  for (const p of [...out]) {
    if (p.endsWith("s")) out.add(p.slice(0, -1));
    else out.add(`${p}s`);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

function parseSpoken(db, raw) {
  const S = window.DietStore;
  const F = window.DietFoods;
  let text = normalize(raw);

  // 1. A meal said by name ("tacos", "chicken and rice") starts from his usual amounts.
  let meal = null;
  for (const m of db.meals) {
    for (const phrase of mealPhrases(m)) {
      const re = new RegExp(`\\b${escapeRe(phrase)}\\b`);
      if (!meal && re.test(text)) {
        meal = m;
        text = text.replace(re, " , ");
      }
    }
  }

  // 2. Every food mentioned, with its amount.
  const aliases = aliasList(db);
  const parsed = [];
  const unknown = [];
  let unclearCups = [];
  for (const chunk of text.split(/,|;|\n|\band\b|\bwith\b|\bplus\b|\balso\b|\bthen\b|\bin\b|\bon\b/)) {
    const hits = findFoods(chunk, aliases);
    if (!hits.length) {
      if (leftoverWords(chunk).length) unknown.push(chunk.trim());
      continue;
    }
    hits.forEach((hit, i) => {
      const from = i === 0 ? 0 : hits[i - 1].end;
      const to = i === hits.length - 1 ? chunk.length : hit.end;
      const seg = chunk.slice(from, hit.start) + " " + chunk.slice(hit.end, to);
      const r = toItem(db, hit, readSegment(seg));
      if (r.unclearCups) unclearCups.push(F.getFood(r.item.food).name);
      parsed.push(r);
    });
  }

  // 3. No meal named, but the main foods of one of his meals were ("250 g chicken, 120 g rice").
  const kind = (id) => F.getFood(id)?.group || id;
  if (!meal && parsed.length >= 2) {
    const said = new Set(parsed.map((p) => kind(p.item.food)));
    let best = null;
    for (const m of db.meals) {
      const core = m.items.filter((i) => i.amount > 0 && F.getFood(i.food)?.flex).map((i) => kind(i.food));
      if (core.length >= 2 && core.every((k) => said.has(k)) && (!best || core.length > best.n)) best = { m, n: core.length };
    }
    meal = best?.m || null;
  }

  // 4. Merge into the meal (if any) or fill in last-used amounts.
  const guessed = [];
  let items;
  if (meal) {
    items = S.mealItems(db, meal.id);
    for (const p of parsed) {
      const idx = items.findIndex((i) => kind(i.food) === kind(p.item.food));
      if (idx < 0) {
        if (!p.said) {
          const base = usualItem(db, p.item.food);
          Object.assign(p.item, { amount: base.amount, unit: base.unit });
          guessed.push(F.getFood(p.item.food).name);
        }
        items.push(p.item);
        continue;
      }
      const cur = items[idx];
      items[idx] = {
        ...cur,
        food: p.variantSaid ? p.item.food : cur.food,
        amount: p.said ? p.item.amount : cur.amount,
        unit: p.said ? p.item.unit : cur.unit,
        doneness: p.item.doneness && F.hasDoneness(F.getFood(p.variantSaid ? p.item.food : cur.food)) ? p.item.doneness : cur.doneness,
      };
      if (!p.said && !(Number(cur.amount) > 0)) {
        const base = usualItem(db, items[idx].food);
        Object.assign(items[idx], { amount: base.amount, unit: base.unit });
        guessed.push(F.getFood(items[idx].food).name);
      }
    }
  } else {
    items = parsed.map((p) => {
      if (!p.said) {
        const base = usualItem(db, p.item.food);
        Object.assign(p.item, { amount: base.amount, unit: base.unit });
        guessed.push(F.getFood(p.item.food).name);
      }
      return p.item;
    });
  }

  return {
    mealId: meal?.id || null,
    name: meal?.name || null,
    items,
    unknown,
    guessed: [...new Set(guessed)],
    unclearCups: [...new Set(unclearCups)],
  };
}

window.DietVoice = { parseSpoken, normalize };
