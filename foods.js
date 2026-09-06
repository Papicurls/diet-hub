// Per 100 g. Default table is COOKED unless rawPer100 is used.
const FOODS = [
  { names: ["chicken breast", "chicken", "breast"], kcal: 165, p: 31, c: 0, f: 3.6, weigh: "cooked", rawPer100: { kcal: 110, p: 23.1, c: 0, f: 1.2 }, rawToCooked: 0.75 },
  { names: ["93/7 ground beef", "93/7", "93 7", "ground beef 93", "ground beef", "beef", "hamburger"], kcal: 193, p: 26.6, c: 0, f: 9.1, weigh: "cooked", rawPer100: { kcal: 152, p: 21.4, c: 0, f: 7 }, rawToCooked: 0.7 },
  { names: ["90/10 ground beef", "90/10", "ground beef 90", "lean ground beef"], kcal: 199, p: 26, c: 0, f: 10, weigh: "cooked", rawPer100: { kcal: 176, p: 20, c: 0, f: 10 }, rawToCooked: 0.7 },
  { names: ["85/15 ground beef", "85/15", "ground beef 85"], kcal: 232, p: 26, c: 0, f: 14, weigh: "cooked", rawPer100: { kcal: 215, p: 19, c: 0, f: 15 }, rawToCooked: 0.7 },
  { names: ["80/20 ground beef", "80/20", "ground beef 80"], kcal: 254, p: 25, c: 0, f: 17, weigh: "cooked", rawPer100: { kcal: 254, p: 17, c: 0, f: 20 }, rawToCooked: 0.7 },
  { names: ["steak", "sirloin", "ribeye"], kcal: 271, p: 25, c: 0, f: 19, weigh: "cooked", rawPer100: { kcal: 250, p: 21, c: 0, f: 19 }, rawToCooked: 0.75 },
  { names: ["egg white", "egg whites"], kcal: 52, p: 11, c: 0.7, f: 0.2, pieceG: 33, weigh: "count" },
  { names: ["eggs", "egg"], kcal: 143, p: 13, c: 1.1, f: 10, pieceG: 50, weigh: "count" },
  { names: ["raw milk", "whole milk", "milk"], kcal: 61, p: 3.2, c: 4.8, f: 3.3, cupG: 244, weigh: "liquid" },
  { names: ["coconut water", "coco water"], kcal: 19, p: 0.7, c: 3.7, f: 0.2, cupG: 240, weigh: "liquid" },
  { names: ["jasmine rice", "white rice", "rice"], kcal: 130, p: 2.7, c: 28, f: 0.3, cupG: 158, weigh: "cooked", rawPer100: { kcal: 365, p: 7.1, c: 80, f: 0.6 }, rawToCooked: 3 },
  { names: ["potato", "potatoes", "diced potato", "diced potatoes", "baked potato"], kcal: 87, p: 1.9, c: 20, f: 0.1, cupG: 122, weigh: "cooked", rawPer100: { kcal: 77, p: 2, c: 17, f: 0.1 }, rawToCooked: 0.8 },
  { names: ["olive oil", "oil"], kcal: 884, p: 0, c: 0, f: 100, tbspG: 13.5, weigh: "liquid" },
  { names: ["guacamole", "guac", "avocado"], kcal: 160, p: 2, c: 8.5, f: 15, tbspG: 15, weigh: "as-is" },
  { names: ["banana", "bananas"], kcal: 89, p: 1.1, c: 23, f: 0.3, pieceG: 118, weigh: "count" },
  { names: ["orange", "oranges"], kcal: 47, p: 0.9, c: 12, f: 0.1, pieceG: 131, weigh: "count" },
  { names: ["frozen berries", "berries", "blueberry", "strawberry"], kcal: 57, p: 0.7, c: 14, f: 0.3, cupG: 140, weigh: "as-is" },
  { names: ["whey", "protein powder"], kcal: 400, p: 80, c: 8, f: 5, tbspG: 15, weigh: "dry" },
  { names: ["greek yogurt", "yogurt"], kcal: 97, p: 9, c: 3.6, f: 5, cupG: 245, weigh: "as-is" },
  { names: ["oats", "oatmeal"], kcal: 389, p: 17, c: 66, f: 7, cupG: 81, weigh: "dry", rawPer100: { kcal: 389, p: 17, c: 66, f: 7 } },
  { names: ["peanut butter", "pb"], kcal: 588, p: 25, c: 20, f: 50, tbspG: 16, weigh: "as-is" },
  { names: ["cheddar", "cheese"], kcal: 402, p: 25, c: 1.3, f: 33, weigh: "as-is" },
  { names: ["butter"], kcal: 717, p: 0.9, c: 0.1, f: 81, tbspG: 14, weigh: "as-is" },
  { names: ["tortilla", "tortillas"], kcal: 312, p: 8, c: 51, f: 8, pieceG: 45, weigh: "count" },
  { names: ["sourdough", "bread"], kcal: 265, p: 9, c: 51, f: 3.3, pieceG: 40, weigh: "count" },
  { names: ["pasta", "spaghetti"], kcal: 157, p: 5.8, c: 31, f: 0.9, cupG: 140, weigh: "cooked", rawPer100: { kcal: 371, p: 13, c: 75, f: 1.5 }, rawToCooked: 2.2 },
  { names: ["salmon"], kcal: 206, p: 22, c: 0, f: 13, weigh: "cooked", rawPer100: { kcal: 208, p: 20, c: 0, f: 13 }, rawToCooked: 0.75 },
  { names: ["shrimp"], kcal: 99, p: 24, c: 0.2, f: 0.3, weigh: "cooked", rawPer100: { kcal: 85, p: 20, c: 0, f: 0.5 }, rawToCooked: 0.75 },
  { names: ["turkey"], kcal: 135, p: 30, c: 0, f: 1, weigh: "cooked", rawPer100: { kcal: 104, p: 24, c: 0, f: 1 }, rawToCooked: 0.75 },
  { names: ["honey"], kcal: 304, p: 0.3, c: 82, f: 0, tbspG: 21, weigh: "liquid" },
  { names: ["apple"], kcal: 52, p: 0.3, c: 14, f: 0.2, pieceG: 182, weigh: "count" },
];

function gramsFor(food, amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = String(unit || "g").toLowerCase();
  if (u === "g" || u === "gram" || u === "grams") return n;
  if (u === "oz" || u === "ounce" || u === "ounces") return n * 28.35;
  if (u === "lb" || u === "lbs" || u === "pound") return n * 453.6;
  if (u === "ml") return n;
  if (u === "cup" || u === "cups") return n * (food.cupG || 240);
  if (u === "tbsp" || u === "tablespoon" || u === "tablespoons") return n * (food.tbspG || 15);
  if (u === "tsp") return n * ((food.tbspG || 15) / 3);
  if (u === "piece" || u === "pieces" || u === "item" || u === "items" || u === "egg" || u === "eggs") {
    return n * (food.pieceG || 100);
  }
  return n;
}

function findFood(name) {
  const q = String(name || "").toLowerCase().trim();
  if (!q) return null;
  let best = null;
  let bestLen = 0;
  for (const food of FOODS) {
    for (const alias of food.names) {
      if (q.includes(alias) && alias.length >= bestLen) {
        best = food;
        bestLen = alias.length;
      }
    }
  }
  return best;
}

function parseEmbeddedAmount(name) {
  const q = String(name || "");
  const m = q.match(/(\d+(?:\.\d+)?)\s*(kg|lbs?|oz|ounces?|grams?|g|ml|cups?|tbsp|tablespoons?|tsp|eggs?|pieces?)?\b/i);
  if (!m) return null;
  const amount = Number(m[1]);
  let unit = (m[2] || "g").toLowerCase();
  if (unit.startsWith("egg")) unit = "piece";
  if (unit.startsWith("gram")) unit = "g";
  if (unit === "ounce" || unit === "ounces") unit = "oz";
  if (unit === "lbs" || unit === "lb") unit = "lb";
  if (unit === "kg") {
    return { amount: amount * 1000, unit: "g", label: q.replace(m[0], "").trim() || q };
  }
  return { amount, unit, label: q.replace(m[0], "").replace(/^[x×, ]+|[ ,]+$/g, "").trim() || q };
}

function scaleFood(food, grams, { label, doneness } = {}) {
  const k = grams / 100;
  return {
    name: label || food.names[0],
    grams: Math.round(grams),
    calories: Math.round(food.kcal * k),
    protein: Math.round(food.p * k * 10) / 10,
    carbs: Math.round(food.c * k * 10) / 10,
    fat: Math.round(food.f * k * 10) / 10,
    source: "library",
    doneness: doneness || (food.weigh === "cooked" ? "cooked" : food.weigh || "as-is"),
    rawGrams: null,
  };
}

function nutrientsFromUsda(item) {
  const list = item.foodNutrients || [];
  const get = (ids) => {
    const hit = list.find((n) => ids.includes(n.nutrientId) || ids.includes(n.nutrientNumber) || ids.includes(String(n.nutrientName || "").toLowerCase()));
    return hit ? Number(hit.value) || 0 : 0;
  };
  const kcal = get([1008, "208", "energy"]) || Math.round(get([1062, "268"]) / 4.184);
  return {
    name: item.description || "USDA food",
    kcal: kcal || 0,
    p: get([1003, "203", "protein"]),
    c: get([1005, "205", "carbohydrate, by difference"]),
    f: get([1004, "204", "total lipid (fat)"]),
  };
}

async function lookupUsda(query, grams) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&pageSize=5&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const item = (data.foods || []).find((f) => /cooked|raw|boiled|roasted|grilled/i.test(f.description || "")) || (data.foods || [])[0];
  if (!item) return null;
  const n = nutrientsFromUsda(item);
  const k = grams / 100;
  return {
    name: n.name,
    grams: Math.round(grams),
    calories: Math.round(n.kcal * k),
    protein: Math.round(n.p * k * 10) / 10,
    carbs: Math.round(n.c * k * 10) / 10,
    fat: Math.round(n.f * k * 10) / 10,
    source: "usda",
  };
}

async function estimateFood({ name, amount, unit, doneness }) {
  const embedded = parseEmbeddedAmount(name);
  const foodName = (embedded && !amount ? embedded.label : name) || name;
  const qty = amount || embedded?.amount;
  const useUnit = (amount ? unit : "") || embedded?.unit || unit || "g";
  const local = findFood(foodName);
  const grams = local ? gramsFor(local, qty, useUnit) : gramsFor({ cupG: 240, tbspG: 15, pieceG: 100 }, qty, useUnit);
  if (!grams) throw new Error("Add how much you ate.");
  const nameSaysRaw = /\b(uncooked|dry)\b/.test(String(foodName || "").toLowerCase())
    || (/\braw\b/.test(String(foodName || "").toLowerCase()) && !/\braw milk\b/.test(String(foodName || "").toLowerCase()));
  const wantRaw = String(doneness || "").toLowerCase() === "raw"
    || String(doneness || "").toLowerCase() === "uncooked"
    || String(doneness || "").toLowerCase() === "dry"
    || nameSaysRaw;
  if (local) {
    const weigh = local.weigh || "cooked";
    if (weigh === "cooked" && wantRaw && local.rawPer100) {
      const raw = local.rawPer100;
      const cookedG = local.rawToCooked ? grams * local.rawToCooked : grams;
      const k = grams / 100;
      return {
        name: `${local.names[0]} (uncooked)`,
        grams: Math.round(grams),
        calories: Math.round(raw.kcal * k),
        protein: Math.round(raw.p * k * 10) / 10,
        carbs: Math.round(raw.c * k * 10) / 10,
        fat: Math.round(raw.f * k * 10) / 10,
        source: "library",
        doneness: "uncooked",
        cookedEquivG: Math.round(cookedG),
      };
    }
    if (weigh === "cooked") {
      return scaleFood(local, grams, { label: `${local.names[0]} (cooked)`, doneness: "cooked" });
    }
    if (weigh === "dry") {
      return scaleFood(local, grams, { label: `${local.names[0]} (dry)`, doneness: "dry" });
    }
    if (weigh === "count") {
      return scaleFood(local, grams, { label: local.names[0], doneness: "count" });
    }
    return scaleFood(local, grams, { label: `${local.names[0]} (${weigh})`, doneness: weigh });
  }
  try {
    const usda = await lookupUsda(foodName, grams);
    if (usda && usda.calories > 0) {
      usda.doneness = wantRaw ? "uncooked (USDA)" : "as listed — check cooked vs uncooked";
      return usda;
    }
  } catch {
    /* offline */
  }
  throw new Error(`Don’t have macros for “${foodName}” yet. Pick a closer name (chicken, rice, eggs, beef) or type kcal yourself.`);
}

window.DietFoods = { estimateFood, findFood };
