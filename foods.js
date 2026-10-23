// Food library. Macros are [kcal, protein, carbs, fat] per 100 g, from USDA SR Legacy.
// `raw` = weighed uncooked, `cooked` = weighed after cooking. `per` = foods that don't change.
// `flex` foods are the ones meal suggestions are allowed to scale up or down.
const FOODS = [
  { id: "chicken-breast", name: "Chicken breast", cat: "protein", raw: [120, 22.5, 0, 2.6], cooked: [165, 31, 0, 3.6], usual: "cooked", flex: true },
  { id: "beef-93", name: "Ground beef 93/7", group: "ground-beef", variant: "93/7", cat: "protein", raw: [152, 20.9, 0, 7], cooked: [209, 28.9, 0, 9.5], usual: "cooked", flex: true },
  { id: "beef-90", name: "Ground beef 90/10", group: "ground-beef", variant: "90/10", cat: "protein", raw: [176, 20, 0, 10], cooked: [230, 28.5, 0, 12], usual: "cooked", flex: true },
  { id: "beef-85", name: "Ground beef 85/15", group: "ground-beef", variant: "85/15", cat: "protein", raw: [215, 18.6, 0, 15], cooked: [256, 27.7, 0, 15.3], usual: "cooked", flex: true },
  { id: "beef-80", name: "Ground beef 80/20", group: "ground-beef", variant: "80/20", cat: "protein", raw: [254, 17.2, 0, 20], cooked: [272, 27, 0, 17.4], usual: "cooked", flex: true },
  { id: "steak-sirloin", name: "Sirloin steak", group: "steak", variant: "Sirloin", cat: "protein", raw: [201, 20.3, 0, 12.7], cooked: [243, 27, 0, 14.2], usual: "cooked", flex: true },
  { id: "steak-ribeye", name: "Ribeye steak", group: "steak", variant: "Ribeye", cat: "protein", raw: [254, 19.3, 0, 19.1], cooked: [291, 25.9, 0, 20], usual: "cooked", flex: true },
  { id: "steak-strip", name: "NY strip steak", group: "steak", variant: "NY strip", cat: "protein", raw: [228, 20.6, 0, 15.5], cooked: [239, 27.4, 0.6, 14.1], usual: "cooked", flex: true },
  { id: "salmon-farmed", name: "Farmed salmon", group: "salmon", variant: "Farmed", cat: "protein", raw: [208, 20.4, 0, 13.4], cooked: [206, 22.1, 0, 12.4], usual: "cooked", flex: true },
  { id: "salmon-wild", name: "Wild Atlantic salmon", group: "salmon", variant: "Wild Atlantic", cat: "protein", raw: [142, 19.8, 0, 6.3], cooked: [182, 25.4, 0, 8.1], usual: "cooked", flex: true },
  { id: "salmon-sockeye", name: "Sockeye salmon", group: "salmon", variant: "Sockeye", cat: "protein", raw: [131, 22.3, 0, 4.7], cooked: [156, 26.5, 0, 5.6], usual: "cooked", flex: true },
  { id: "eggs", name: "Eggs", cat: "protein", per: [143, 12.6, 0.7, 9.5], unit: "pc", pieceG: 50, pcNames: ["egg", "eggs"], flex: true },

  { id: "rice", name: "Jasmine rice", cat: "carb", raw: [365, 7.1, 80, 0.7], cooked: [130, 2.7, 28.2, 0.3], usual: "cooked", flex: true },
  {
    id: "potato", name: "Potatoes", cat: "carb", raw: [79, 2.1, 18.1, 0.1], cooked: [95, 2.6, 21.4, 0.1], usual: "raw", flex: true,
    note: "Oven-roasted diced potatoes lose more water than USDA’s baked-potato number assumes, so uncooked weight is more accurate.",
    noteIfCooked: true,
  },
  { id: "corn-tortilla", name: "Corn tortillas", cat: "carb", per: [218, 5.7, 44.6, 2.9], unit: "pc", pieceG: 24, pcNames: ["corn tortilla", "corn tortillas"], flex: true },

  { id: "banana", name: "Banana", cat: "fruit", per: [89, 1.1, 22.8, 0.3], unit: "pc", pieceG: 118, pcNames: ["banana", "bananas"], flex: true },
  { id: "kiwi", name: "Kiwi", cat: "fruit", per: [61, 1.1, 14.7, 0.5], unit: "pc", pieceG: 69, pcNames: ["kiwi", "kiwis"] },
  { id: "blueberries", name: "Frozen blueberries", cat: "fruit", per: [51, 0.4, 12.2, 0.6] },
  { id: "strawberries", name: "Strawberries", cat: "fruit", per: [35, 0.4, 9.1, 0.1], flex: true },
  { id: "mango", name: "Mango", cat: "fruit", per: [60, 0.8, 15, 0.4], flex: true },
  {
    id: "raw-milk", name: "Raw milk", cat: "drink", per: [61, 3.2, 4.8, 3.3], unit: "ml", gPerMl: 1.03, flex: true,
    note: "USDA whole milk (3.25% fat). Raw milk often runs a little higher in fat.",
  },
  { id: "coconut-water", name: "Coconut water", cat: "drink", per: [19, 0.7, 3.7, 0.2], unit: "ml", gPerMl: 1.01, flex: true },

  { id: "olive-oil", name: "Olive oil", cat: "extra", per: [884, 0, 0, 100], tbspG: 13.5 },
  { id: "butter", name: "Butter", cat: "extra", per: [717, 0.9, 0.1, 81.1], tbspG: 14.2 },
  { id: "ketchup", name: "Ketchup", cat: "extra", per: [101, 1, 27.4, 0.1], tbspG: 17 },
  { id: "onion", name: "Onion", cat: "extra", per: [40, 1.1, 9.3, 0.1] },
  { id: "cilantro", name: "Cilantro", cat: "extra", per: [23, 2.1, 3.7, 0.5] },
  { id: "lime", name: "Lime juice", cat: "extra", per: [25, 0.4, 8.4, 0.1], unit: "pc", pieceG: 44, pcNames: ["lime, juiced", "limes, juiced"] },
];

const CATEGORY_LABELS = {
  custom: "Your foods",
  protein: "Meat, fish, eggs",
  carb: "Carbs",
  fruit: "Fruit",
  drink: "Drinks",
  extra: "Oil, sauces, toppings",
};

const GROUP_NAMES = { "ground-beef": "Ground beef", steak: "Steak", salmon: "Salmon" };

const UNIT_LABELS = { g: "g", ml: "ml", pc: "each", tbsp: "tbsp", srv: "serving" };

let customFoods = [];

function setCustomFoods(list) {
  customFoods = Array.isArray(list) ? list : [];
}

function getFood(id) {
  return FOODS.find((f) => f.id === id) || customFoods.find((f) => f.id === id) || null;
}

function allFoods() {
  return [...customFoods.map((f) => ({ ...f, cat: "custom" })), ...FOODS];
}

function groupVariants(food) {
  if (!food?.group) return [];
  return FOODS.filter((f) => f.group === food.group);
}

function hasDoneness(food) {
  return Boolean(food && food.raw && food.cooked);
}

function unitsFor(food) {
  if (!food) return ["g"];
  const units = [food.unit || "g", food.baseUnit || "g", "g"];
  if (food.servingG) units.push("srv");
  if (food.tbspG) units.push("tbsp");
  return [...new Set(units)];
}

function toGrams(food, amount, unit) {
  const n = Number(amount);
  if (!food || !Number.isFinite(n) || n <= 0) return 0;
  if (unit === "ml") return n * (food.gPerMl || 1);
  if (unit === "pc") return n * (food.pieceG || 100);
  if (unit === "tbsp") return n * (food.tbspG || 15);
  if (unit === "srv") return n * (food.servingG || 100);
  return n;
}

function macroTable(food, doneness) {
  if (food.per) return food.per;
  return doneness === "raw" ? food.raw : food.cooked;
}

function itemMacros(item) {
  const food = getFood(item.food);
  if (!food) {
    return {
      calories: Number(item.calories) || 0,
      protein: Number(item.protein) || 0,
      carbs: Number(item.carbs) || 0,
      fat: Number(item.fat) || 0,
    };
  }
  const k = toGrams(food, item.amount, item.unit) / 100;
  const [kcal, p, c, f] = macroTable(food, item.doneness);
  return { calories: kcal * k, protein: p * k, carbs: c * k, fat: f * k };
}

function fmtNum(n, max = 1) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: max });
}

function describeItem(item) {
  const food = getFood(item.food);
  const name = (food?.name || item.name || "Food").toLowerCase();
  const unit = item.unit || "g";
  if (!(Number(item.amount) > 0)) return `${name} (optional)`;
  const amount = fmtNum(item.amount);
  let label;
  if (unit === "pc") label = `${amount} ${food?.pcNames?.[Number(item.amount) === 1 ? 0 : 1] || name}`;
  else if (unit === "srv") label = `${amount} serving${Number(item.amount) === 1 ? "" : "s"} ${name}`;
  else label = `${amount} ${UNIT_LABELS[unit] || unit} ${name}`;
  if (hasDoneness(food)) label += item.doneness === "raw" ? " (uncooked)" : " (cooked)";
  return label;
}

function newItem(foodId, overrides = {}) {
  const food = getFood(foodId);
  const unit = food?.unit || "g";
  const amount = unit === "pc" || unit === "srv" ? 1 : unit === "ml" ? 250 : 100;
  return {
    food: foodId,
    amount,
    unit,
    doneness: hasDoneness(food) ? food.usual || "cooked" : null,
    ...overrides,
  };
}

// The same product reads as a 12-digit UPC-A or a 13-digit EAN-13 depending on the
// scanner. Store everything as 13 digits so a saved food matches either way.
function normalizeBarcode(code) {
  const digits = String(code || "").replace(/\D/g, "");
  return digits.length === 12 ? `0${digits}` : digits;
}

// Open Food Facts: free, no key. Values come back per 100 g (or per 100 ml for drinks).
async function lookupBarcode(code) {
  const fields = "code,product_name,brands,nutriments,serving_quantity,serving_size,quantity";
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Food database error (${res.status}).`);
  const data = await res.json();
  const p = data.product;
  if (data.status !== 1 || !p) return null;
  const n = p.nutriments || {};
  let kcal = Number(n["energy-kcal_100g"]);
  if (!Number.isFinite(kcal) && Number.isFinite(Number(n.energy_100g))) kcal = Number(n.energy_100g) / 4.184;
  const per = [kcal, Number(n.proteins_100g), Number(n.carbohydrates_100g), Number(n.fat_100g)];
  const complete = per.every((v) => Number.isFinite(v));
  const name = [p.brands?.split(",")[0]?.trim(), p.product_name].filter(Boolean).join(" ") || `Barcode ${code}`;
  const liquid = /\b(ml|cl|l|fl\.? ?oz)\b/i.test(`${p.serving_size || ""} ${p.quantity || ""}`);
  const servingG = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : null;
  return { code: String(code), name, per: complete ? per : null, servingG, liquid };
}

window.DietFoods = {
  FOODS,
  CATEGORY_LABELS,
  GROUP_NAMES,
  UNIT_LABELS,
  setCustomFoods,
  getFood,
  allFoods,
  groupVariants,
  hasDoneness,
  unitsFor,
  toGrams,
  itemMacros,
  describeItem,
  newItem,
  fmtNum,
  normalizeBarcode,
  lookupBarcode,
};
