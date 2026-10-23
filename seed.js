// Starting data for a fresh phone, and for upgrading the old planned-meals version.
window.DIET_SEED = {
  targets: {
    train: { calories: 2940, protein: 142, carbs: 432, fat: 63 },
    rest: { calories: 2758, protein: 144, carbs: 402, fat: 70 },
  },
  hit: { kcalWindow: 100, carbFatPct: 10 },
  stepGoal: 10000,
  meals: [
    {
      id: "potatoes-eggs",
      name: "Potatoes & eggs",
      items: [
        { food: "potato", amount: 400, unit: "g", doneness: "raw" },
        { food: "olive-oil", amount: 7, unit: "g", doneness: null },
        { food: "eggs", amount: 4, unit: "pc", doneness: null },
        { food: "butter", amount: 7, unit: "g", doneness: null },
        { food: "ketchup", amount: 30, unit: "g", doneness: null },
      ],
    },
    {
      id: "tacos",
      name: "Tacos",
      items: [
        { food: "corn-tortilla", amount: 4, unit: "pc", doneness: null },
        { food: "beef-93", amount: 170, unit: "g", doneness: "cooked" },
        { food: "olive-oil", amount: 7, unit: "g", doneness: null },
        { food: "onion", amount: 30, unit: "g", doneness: null },
        { food: "cilantro", amount: 5, unit: "g", doneness: null },
        { food: "lime", amount: 1, unit: "pc", doneness: null },
      ],
    },
    {
      id: "salmon-rice",
      name: "Salmon & rice",
      items: [
        { food: "salmon-farmed", amount: 170, unit: "g", doneness: "cooked" },
        { food: "rice", amount: 400, unit: "g", doneness: "cooked" },
        { food: "olive-oil", amount: 14, unit: "g", doneness: null },
      ],
    },
    {
      id: "chicken-rice",
      name: "Chicken & rice",
      items: [
        { food: "chicken-breast", amount: 200, unit: "g", doneness: "cooked" },
        { food: "rice", amount: 400, unit: "g", doneness: "cooked" },
        { food: "olive-oil", amount: 14, unit: "g", doneness: null },
      ],
    },
    {
      id: "steak-potatoes",
      name: "Steak & potatoes",
      items: [
        { food: "steak-sirloin", amount: 200, unit: "g", doneness: "cooked" },
        { food: "potato", amount: 400, unit: "g", doneness: "raw" },
        { food: "olive-oil", amount: 20, unit: "g", doneness: null },
      ],
    },
    {
      id: "smoothie",
      name: "Smoothie",
      items: [
        { food: "coconut-water", amount: 330, unit: "ml", doneness: null },
        { food: "mango", amount: 120, unit: "g", doneness: null },
        { food: "strawberries", amount: 120, unit: "g", doneness: null },
        { food: "banana", amount: 0, unit: "pc", doneness: null },
      ],
    },
  ],
  quickFoods: [
    { food: "raw-milk", amount: 250, unit: "ml" },
    { food: "coconut-water", amount: 330, unit: "ml" },
    { food: "banana", amount: 1, unit: "pc" },
    { food: "kiwi", amount: 1, unit: "pc" },
  ],
  grocery: {
    note: "Your weekly haul. Pick the ground-beef fat % you buy.",
    items: [
      { id: "chicken-breast", item: "Chicken breast", amount: "3 lb", have: false, category: "protein" },
      { id: "ground-beef", item: "Ground beef", amount: "2.5 lb", have: false, category: "protein", beefFat: "93/7" },
      { id: "steak", item: "Steak", amount: "", have: false, category: "protein" },
      { id: "salmon", item: "Salmon", amount: "", have: false, category: "protein" },
      { id: "eggs", item: "Farm eggs", amount: "3 dozen", have: false, category: "protein" },
      { id: "raw-milk", item: "Raw milk", amount: "2 gallons", have: false, category: "dairy" },
      { id: "white-jasmine-rice", item: "Jasmine rice", amount: "6 lb dry", have: false, category: "carbs" },
      { id: "potatoes", item: "Potatoes", amount: "10 lb", have: false, category: "carbs" },
      { id: "corn-tortillas", item: "Corn tortillas", amount: "", have: false, category: "carbs" },
      { id: "bananas", item: "Bananas", amount: "", have: false, category: "fruit" },
      { id: "kiwis", item: "Kiwis", amount: "", have: false, category: "fruit" },
      { id: "mango", item: "Frozen mango", amount: "", have: false, category: "fruit" },
      { id: "strawberries", item: "Frozen strawberries", amount: "", have: false, category: "fruit" },
      { id: "coconut-water", item: "Coconut water", amount: "3 × 1 L", have: false, category: "drinks" },
      { id: "onions", item: "Onions", amount: "", have: false, category: "produce" },
      { id: "cilantro", item: "Cilantro", amount: "", have: false, category: "produce" },
      { id: "limes", item: "Limes", amount: "", have: false, category: "produce" },
      { id: "olive-oil", item: "Olive oil", amount: "1 bottle", have: false, category: "fat" },
      { id: "butter", item: "Butter", amount: "", have: false, category: "fat" },
      { id: "ketchup", item: "Ketchup", amount: "", have: false, category: "other" },
      { id: "salt", item: "Salt", amount: "as needed", have: false, category: "other" },
    ],
  },
};
