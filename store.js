const DB_KEY = "diet-hub-db-v1";

function todayKey(date) {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Date().toLocaleDateString("en-CA");
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2);
}

function emptyDb() {
  return { plan: null, grocery: { note: "", items: [] }, logs: { days: {} }, chats: { messages: [] } };
}

let memoryDb = null;

function readDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return memoryDb || emptyDb();
    const db = JSON.parse(raw);
    db.plan = db.plan || null;
    db.grocery = db.grocery || { note: "", items: [] };
    db.logs = db.logs || { days: {} };
    db.chats = db.chats || { messages: [] };
    memoryDb = db;
    return db;
  } catch {
    return memoryDb || emptyDb();
  }
}

function writeDb(db) {
  memoryDb = db;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* private mode / quota — keep memory copy */
  }
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

function retotalDay(day) {
  const t = sumMacros(day.meals || []);
  day.calories = Math.round(t.calories);
  day.protein = Math.round(t.protein);
  day.carbs = Math.round(t.carbs);
  day.fat = Math.round(t.fat);
  return day;
}

function ensureDay(db, date) {
  if (!db.logs.days[date]) db.logs.days[date] = { type: null, eaten: [] };
  return db.logs.days[date];
}

function snapshot(db, date) {
  const day = db.logs.days[date] || { type: null, eaten: [] };
  const template = day.type && db.plan ? db.plan.days[day.type] : null;
  const eaten = day.eaten || [];
  const totals = sumMacros(eaten);
  const targets = template
    ? { calories: template.calories, protein: template.protein, carbs: template.carbs, fat: template.fat }
    : null;
  const remaining = targets
    ? {
        calories: targets.calories - totals.calories,
        protein: targets.protein - totals.protein,
        carbs: targets.carbs - totals.carbs,
        fat: targets.fat - totals.fat,
      }
    : null;
  const eatenIds = new Set(eaten.filter((x) => x.kind === "planned").map((x) => x.mealId));
  const remainingMeals = template ? template.meals.filter((m) => !eatenIds.has(m.id)) : [];
  return {
    date,
    type: day.type,
    eaten,
    totals,
    targets,
    remaining,
    remainingMeals,
    template,
  };
}

function onServer() {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || /^\d+\.\d+\.\d+\.\d+$/.test(h);
}

function seedIfNeeded() {
  const db = readDb();
  const seed = window.DIET_SEED || {};
  if (!db.plan) db.plan = seed.plan || null;
  if (!db.grocery || !db.grocery.items || !db.grocery.items.length) {
    db.grocery = seed.grocery || { note: "", items: [] };
  }
  if (!db.plan) throw new Error("Plan failed to load. Refresh the page.");
  writeDb(db);
  return db;
}

function localReply(db, date, message) {
  const snap = snapshot(db, date);
  const q = message.toLowerCase();
  const g = db.grocery?.items || [];
  const need = g.filter((i) => !i.have);
  const have = g.filter((i) => i.have);

  if (/grocery|buy|shop|get for|need to get|haul|list/.test(q)) {
    const buy = need.map((i) => `- ${i.item} — ${i.amount}`).join("\n") || "- nothing left to buy";
    const owned = have.map((i) => `- ${i.item} — ${i.amount}`).join("\n") || "- nothing marked have";
    return `BUY:\n${buy}\n\nALREADY HAVE:\n${owned}`;
  }

  if (snap.type && (/eat|left|remain|today|calories|hungry|what do i/.test(q))) {
    const left = Math.round(snap.remaining.calories);
    const meals = snap.remainingMeals.map((m) => `- ${m.name}: ${m.food} (${m.calories} kcal)`).join("\n") || "- all planned meals logged";
    return `${snap.type} day. Eaten ${Math.round(snap.totals.calories)} / ${snap.targets.calories} kcal (${left} left).\nStill to eat:\n${meals}`;
  }

  if (/train day|rest day|plan|macros|protein|carb/.test(q) && db.plan) {
    const t = db.plan.days.train;
    const r = db.plan.days.rest;
    return `Train (~${t.calories} kcal): ${t.meals.map((m) => m.name + " — " + m.food).join(" | ")}\n\nRest (~${r.calories} kcal): ${r.meals.map((m) => m.name + " — " + m.food).join(" | ")}`;
  }

  return "On your phone I can log meals, grocery, and the plan without the laptop. Ask “what do I need to get”, “what’s left today”, or open Today / Grocery. For a full rewrite of the plan, use Diet Hub on your Mac so the main agent can edit it.";
}

async function localHandle(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const url = new URL(path, "http://diet.local");
  const route = url.pathname;
  const body = opts.body ? JSON.parse(opts.body) : {};
  const db = seedIfNeeded();

  if (route === "/api/plan" && method === "GET") return db.plan;
  if (route === "/api/plan" && method === "PUT") {
    for (const key of ["train", "rest"]) {
      if (!body.days?.[key]) continue;
      if (Array.isArray(body.days[key].meals) && body.days[key].meals.length) {
        db.plan.days[key].meals = body.days[key].meals;
      }
      if (body.days[key].role) db.plan.days[key].role = body.days[key].role;
      retotalDay(db.plan.days[key]);
    }
    if (Array.isArray(body.rules)) db.plan.rules = body.rules;
    db.plan.updatedAt = todayKey();
    writeDb(db);
    return db.plan;
  }

  if (route === "/api/grocery" && method === "GET") return db.grocery;
  if (route === "/api/grocery" && method === "PUT") {
    if (typeof body.note === "string") db.grocery.note = body.note;
    if (Array.isArray(body.items)) db.grocery.items = body.items;
    writeDb(db);
    return db.grocery;
  }
  if (route === "/api/grocery/item" && method === "POST") {
    db.grocery.items.push({
      id: uid(),
      item: String(body.item || "").trim(),
      amount: String(body.amount || ""),
      have: Boolean(body.have),
      category: body.category || "other",
    });
    writeDb(db);
    return db.grocery;
  }
  if (route === "/api/grocery/item/update" && method === "POST") {
    const item = db.grocery.items.find((i) => i.id === body.id);
    if (item) Object.assign(item, body, { id: item.id });
    writeDb(db);
    return db.grocery;
  }
  if (route === "/api/grocery/item/delete" && method === "POST") {
    db.grocery.items = db.grocery.items.filter((i) => i.id !== body.id);
    writeDb(db);
    return db.grocery;
  }

  if (route === "/api/today" && method === "GET") {
    return snapshot(db, todayKey(url.searchParams.get("date")));
  }
  if (route === "/api/today/type" && method === "POST") {
    const date = todayKey(body.date);
    const day = ensureDay(db, date);
    day.type = body.type === "rest" ? "rest" : "train";
    writeDb(db);
    return snapshot(db, date);
  }
  if (route === "/api/today/eat" && method === "POST") {
    const date = todayKey(body.date);
    const day = ensureDay(db, date);
    if (!day.type) throw new Error("Pick train or rest first");
    let entry;
    if (body.mealId) {
      const meal = db.plan.days[day.type].meals.find((m) => m.id === body.mealId);
      if (!meal) throw new Error("Unknown meal");
      if (day.eaten.some((x) => x.kind === "planned" && x.mealId === meal.id)) {
        throw new Error("Already logged");
      }
      entry = { id: uid(), kind: "planned", mealId: meal.id, name: meal.name, food: meal.food, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, at: new Date().toISOString() };
    } else {
      entry = {
        id: uid(),
        kind: "extra",
        name: String(body.name || "").trim(),
        food: String(body.food || body.name || ""),
        calories: Number(body.calories) || 0,
        protein: Number(body.protein) || 0,
        carbs: Number(body.carbs) || 0,
        fat: Number(body.fat) || 0,
        at: new Date().toISOString(),
      };
    }
    day.eaten.push(entry);
    writeDb(db);
    return { entry, ...snapshot(db, date) };
  }
  if (route === "/api/today/uneat" && method === "POST") {
    const date = todayKey(body.date);
    const day = ensureDay(db, date);
    day.eaten = (day.eaten || []).filter((x) => x.id !== body.id);
    writeDb(db);
    return snapshot(db, date);
  }

  if (route === "/api/chat" && method === "GET") return db.chats.messages || [];
  if (route === "/api/chat" && method === "POST") {
    const date = todayKey(body.date);
    const reply = localReply(db, date, String(body.message || ""));
    const userMsg = { id: uid(), role: "user", content: String(body.message || ""), at: new Date().toISOString() };
    const agentMsg = { id: uid(), role: "agent", content: reply, at: new Date().toISOString(), applied: [] };
    db.chats.messages = [...(db.chats.messages || []), userMsg, agentMsg];
    writeDb(db);
    return { reply: agentMsg, messages: db.chats.messages, applied: [], plan: db.plan, grocery: db.grocery };
  }
  if (route === "/api/chat/clear" && method === "POST") {
    db.chats.messages = [];
    writeDb(db);
    return [];
  }

  if (route === "/api/info") return { port: 3700, local: location.origin, phone: [location.origin] };

  throw new Error("Unknown API route");
}

window.DietStore = {
  async api(path, opts) {
    if (onServer()) {
      try {
        const res = await fetch(path, {
          headers: { "Content-Type": "application/json" },
          ...opts,
        });
        const body = await res.json().catch(() => ({ ok: false, error: res.statusText }));
        if (!body.ok) throw new Error(body.error || "Request failed");
        return body.data;
      } catch (err) {
        return localHandle(path, opts);
      }
    }
    return localHandle(path, opts);
  },
};
