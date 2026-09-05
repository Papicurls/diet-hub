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

function stepGoal(plan) {
  const raw = String(plan?.profile?.steps || "10000");
  const k = raw.match(/(\d+(?:\.\d+)?)\s*k/i);
  if (k) return Math.round(Number(k[1]) * 1000);
  const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
  return n >= 1000 ? n : 10000;
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
  const goal = stepGoal(db.plan);
  const steps = day.steps == null ? null : Number(day.steps);
  return {
    date,
    type: day.type,
    eaten,
    totals,
    targets,
    remaining,
    remainingMeals,
    template,
    steps: Number.isFinite(steps) ? steps : null,
    stepGoal: goal,
    stepsSource: day.stepsSource || null,
    stepsAt: day.stepsAt || null,
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

function qtyToNumber(raw) {
  const s = String(raw).trim();
  if (s === "½" || s === "1/2") return 0.5;
  if (s === "¼" || s === "1/4") return 0.25;
  if (s === "¾" || s === "3/4") return 0.75;
  if (s.includes("/")) {
    const parts = s.split("/");
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (a && b) return a / b;
  }
  return Number(s);
}

function formatQty(n, kind) {
  if (kind === "count") return String(Math.max(1, Math.round(n)));
  if (kind === "tbsp") {
    const r = Math.max(0.25, Math.round(n * 2) / 2);
    if (r === 0.5) return "½";
    if (r === 0.25) return "¼";
    if (r === 0.75) return "¾";
    return String(r).replace(/\.0$/, "");
  }
  const step = n >= 100 ? 10 : 5;
  return String(Math.max(step, Math.round(n / step) * step));
}

function scaleFoodText(food, ratios) {
  const specs = [
    { re: /(\d+(?:\.\d+)?)\s*(g|grams?)\s+((?:cooked\s+)?(?:white\/jasmine\s+|jasmine\s+|white\s+)?rice)/gi, r: ratios.cR, kind: "g" },
    { re: /(\d+(?:\.\d+)?)\s*(g|grams?)\s+((?:cooked\s+)?potato)/gi, r: ratios.cR, kind: "g" },
    { re: /(\d+(?:\.\d+)?)\s*(g|grams?)\s+((?:cooked\s+)?(?:chicken(?:\s+breast)?|breast))/gi, r: ratios.pR, kind: "g" },
    { re: /(\d+(?:\.\d+)?)\s*(g|grams?)\s+((?:cooked\s+)?(?:ground\s+)?beef)/gi, r: ratios.pR, kind: "g" },
    { re: /(\d+(?:\.\d+)?)\s*(ml)\s+((?:raw\s+)?milk)/gi, r: ratios.pR, kind: "g" },
    { re: /(\d+(?:\.\d+)?|½|¼|¾)\s*(tbsp|tablespoons?)\s+(guac)/gi, r: ratios.fR, kind: "tbsp" },
    { re: /(\d+(?:\.\d+)?|½|¼|¾)\s*(tbsp|tablespoons?)\s+((?:olive\s+)?oil)/gi, r: ratios.fR, kind: "tbsp" },
    { re: /(\d+)\s+(eggs?)\b/gi, r: ratios.pR, kind: "count" },
    { re: /(\d+(?:\.\d+)?)\s+(cups?)\s+((?:frozen\s+)?berries)/gi, r: ratios.cR, kind: "tbsp" },
    { re: /(\d+)\s+(oranges?)\b/gi, r: ratios.cR, kind: "count" },
    { re: /(\d+)\s+(bananas?)\b/gi, r: ratios.cR, kind: "count" },
  ];
  let out = food;
  for (const spec of specs) {
    out = out.replace(spec.re, (full, n, unit, maybeRest) => {
      const next = formatQty(qtyToNumber(n) * spec.r, spec.kind);
      const rest = typeof maybeRest === "string" ? maybeRest : "";
      return rest ? `${next} ${unit} ${rest}` : `${next} ${unit}`;
    });
  }
  return out.replace(/\s+/g, " ").trim();
}

function grabMacro(q, names) {
  const alt = names.join("|");
  const patterns = [
    new RegExp("(\\d{2,3})\\s*(?:g|grams?)?\\s*(?:of\\s+)?(?:" + alt + ")\\b", "i"),
    new RegExp("\\b(?:" + alt + ")\\b\\s*(?:intake|target|macros?)?\\s*(?:to|at|around|of|=|:)?\\s*(\\d{2,3})\\s*(?:g|grams?)?\\b", "i"),
  ];
  for (const re of patterns) {
    const m = q.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 20 && n <= 900) return n;
    }
  }
  return null;
}

function parseMacroIntent(text, history) {
  const textQ = String(text || "").toLowerCase().replace(/protien/g, "protein");
  const lookLikeOnly = /what (would|does) that look like|how would (the )?meals|show (me )?the (new )?meals/.test(textQ)
    && !/\d{2,3}/.test(textQ);
  if (lookLikeOnly) return null;

  const prior = (history || [])
    .filter((m) => m.role === "user")
    .slice(-2)
    .map((m) => m.content)
    .join(" ");
  const namedInText = grabMacro(textQ, ["protein"]) || grabMacro(textQ, ["carbs", "carb", "carbohydrates"]) || grabMacro(textQ, ["fats", "fat"]);
  const combined = namedInText ? text : `${prior} ${text}`.trim();
  const q = combined.toLowerCase().replace(/protien/g, "protein");
  let protein = grabMacro(q, ["protein"]);
  let carbs = grabMacro(q, ["carbs", "carb", "carbohydrates"]);
  let fat = grabMacro(q, ["fats", "fat"]);
  if (protein == null && carbs == null && fat == null && /protein/.test(q) && /carb/.test(q) && /fat/.test(q)) {
    const triple = q.match(/(\d{2,3})\D{0,20}(\d{2,3})\D{0,20}(\d{2,3})/);
    if (triple) {
      protein = Number(triple[1]);
      carbs = Number(triple[2]);
      fat = Number(triple[3]);
    }
  }
  const calMatch = q.match(/(\d{4})\s*(?:kcal|calories|cals)\b/) || q.match(/\b(?:calories|kcal)\s*(?:to|at|around)?\s*(\d{4})\b/);
  const calories = calMatch ? Number(calMatch[1]) : null;

  let days = ["train", "rest"];
  if (/\brest\b/.test(q) && !/\btrain\b|\blift|\bgym|\bevery day|\bboth\b|\bdaily\b/.test(q)) days = ["rest"];
  else if (/\b(train|lift|gym)\b/.test(q) && !/\brest\b|\bevery day|\bboth\b|\bdaily\b/.test(q)) days = ["train"];

  const relative = {};
  if (protein == null && /more protein|increase protein|higher protein|protein up/.test(q)) relative.protein = 25;
  if (protein == null && /less protein|lower protein|drop protein|cut protein/.test(q)) relative.protein = -20;
  if (carbs == null && /more carb|increase carb|higher carb|carbs up/.test(q)) relative.carbs = 40;
  if (carbs == null && /less carb|lower carb|drop carb|cut carb/.test(q)) relative.carbs = -40;
  if (fat == null && /more fat|increase fat|higher fat|fats up/.test(q)) relative.fat = 15;
  if (fat == null && /less fat|lower fat|drop fat|cut fat/.test(q)) relative.fat = -15;

  const hasAbs = protein != null || carbs != null || fat != null || calories != null;
  const hasRel = relative.protein || relative.carbs || relative.fat;
  const changeTalk = /(chang|set |make |want|target|hit |bump|increas|decreas|rais|lower|drop |cut |adjust|update|rewrite|new macro|macros to|look like|for my meals)/.test(q);
  const questionOnly = /^(what|how much|show|tell me|what's|whats)\b/.test(textQ) && !changeTalk && !hasAbs;

  if (questionOnly || (!hasAbs && !hasRel)) return null;
  if (!changeTalk && !hasAbs) return null;

  return { protein, carbs, fat, calories, relative, days };
}

function describeDay(day) {
  return day.meals
    .map((m) => `- ${m.name}: ${m.food} (${m.calories} kcal · P${m.protein} C${m.carbs} F${m.fat})`)
    .join("\n");
}

function retargetDay(day, wanted) {
  const curP = day.protein || 1;
  const curC = day.carbs || 1;
  const curF = day.fat || 1;
  const pR = wanted.protein != null ? wanted.protein / curP : 1;
  const cR = wanted.carbs != null ? wanted.carbs / curC : 1;
  const fR = wanted.fat != null ? wanted.fat / curF : 1;
  day.meals = (day.meals || []).map((m) => {
    const protein = Math.max(0, Math.round(Number(m.protein) * pR));
    const carbs = Math.max(0, Math.round(Number(m.carbs) * cR));
    const fat = Math.max(0, Math.round(Number(m.fat) * fR));
    return {
      ...m,
      food: scaleFoodText(m.food, { pR, cR, fR }),
      protein,
      carbs,
      fat,
      calories: Math.round(protein * 4 + carbs * 4 + fat * 9),
    };
  });
  retotalDay(day);
  if (day.meals.length) {
    const last = day.meals[day.meals.length - 1];
    if (wanted.protein != null) last.protein = Math.max(0, last.protein + (wanted.protein - day.protein));
    if (wanted.carbs != null) last.carbs = Math.max(0, last.carbs + (wanted.carbs - day.carbs));
    if (wanted.fat != null) last.fat = Math.max(0, last.fat + (wanted.fat - day.fat));
    last.calories = Math.round(last.protein * 4 + last.carbs * 4 + last.fat * 9);
    retotalDay(day);
  }
  if (wanted.calories != null && wanted.protein == null && wanted.carbs == null && wanted.fat == null && day.calories) {
    const cR2 = wanted.calories / day.calories;
    return retargetDay(day, {
      protein: Math.round(day.protein * cR2),
      carbs: Math.round(day.carbs * cR2),
      fat: Math.round(day.fat * cR2),
    });
  }
  return day;
}

function applyMacroChange(db, message) {
  const intent = parseMacroIntent(message, db.chats?.messages || []);
  if (!intent || !db.plan) return null;

  const notes = [];
  for (const key of intent.days) {
    const day = db.plan.days[key];
    if (!day) continue;
    const wanted = {
      protein: intent.protein != null ? intent.protein : intent.relative.protein ? Math.max(80, day.protein + intent.relative.protein) : null,
      carbs: intent.carbs != null ? intent.carbs : intent.relative.carbs ? Math.max(80, day.carbs + intent.relative.carbs) : null,
      fat: intent.fat != null ? intent.fat : intent.relative.fat ? Math.max(30, day.fat + intent.relative.fat) : null,
      calories: intent.days.length === 1 ? intent.calories : key === "train" ? intent.calories : null,
    };
    if (intent.calories != null && key === "rest" && intent.days.includes("train") && intent.days.includes("rest")) {
      wanted.calories = null;
    }
    const before = { p: day.protein, c: day.carbs, f: day.fat, kcal: day.calories };
    retargetDay(day, wanted);
    notes.push({
      key,
      label: day.label,
      before,
      after: { p: day.protein, c: day.carbs, f: day.fat, kcal: day.calories },
      meals: describeDay(day),
    });
  }

  db.plan.updatedAt = todayKey();
  writeDb(db);

  const lines = notes.map((n) => {
    return `${n.label}: ${n.before.p}P / ${n.before.c}C / ${n.before.f}F (${n.before.kcal} kcal) → ${n.after.p}P / ${n.after.c}C / ${n.after.f}F (${n.after.kcal} kcal)\n${n.meals}`;
  });
  const reply = `Got it — I changed the plan to those daily macros and scaled the meals to match.\n\n${lines.join("\n\n")}\n\nOpen Plan if you want to tweak a meal. Tell me rest-day vs train-day if you want them different.`;
  return { reply, applied: ["plan"] };
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

  if (/step/.test(q)) {
    const goal = snap.stepGoal || 10000;
    if (snap.steps == null) {
      return "No steps yet. On iPhone open Today → Get from Health (that’s the only way a website can see the Health app), or type the number from Health.";
    }
    const left = Math.max(0, goal - snap.steps);
    return `Steps today: ${Math.round(snap.steps).toLocaleString()} / ${goal.toLocaleString()}${snap.stepsSource === "health" ? " (from Health)" : ""}. ${left ? left.toLocaleString() + " left to hit the goal." : "Goal hit."}`;
  }

  if (db.plan && /what (would|does) that look like|how would (the )?meals|show (me )?the (new )?meals|for my meals/.test(q)) {
    const t = db.plan.days.train;
    const r = db.plan.days.rest;
    return `Train (~${t.calories} kcal · P${t.protein} C${t.carbs} F${t.fat})\n${describeDay(t)}\n\nRest (~${r.calories} kcal · P${r.protein} C${r.carbs} F${r.fat})\n${describeDay(r)}`;
  }

  if (snap.type && (/eat|left|remain|today|calories|hungry|what do i/.test(q))) {
    const left = Math.round(snap.remaining.calories);
    const meals = snap.remainingMeals.map((m) => `- ${m.name}: ${m.food} (${m.calories} kcal)`).join("\n") || "- all planned meals logged";
    const stepLine = snap.steps == null ? "" : `\nSteps: ${Math.round(snap.steps).toLocaleString()} / ${(snap.stepGoal || 10000).toLocaleString()}.`;
    return `${snap.type} day. Eaten ${Math.round(snap.totals.calories)} / ${snap.targets.calories} kcal (${left} left).${stepLine}\nStill to eat:\n${meals}`;
  }

  if (/train day|rest day|plan|macros|protein|carb|fat/.test(q) && db.plan) {
    const t = db.plan.days.train;
    const r = db.plan.days.rest;
    return `Current plan\n\nTrain (~${t.calories} kcal · P${t.protein} C${t.carbs} F${t.fat})\n${describeDay(t)}\n\nRest (~${r.calories} kcal · P${r.protein} C${r.carbs} F${r.fat})\n${describeDay(r)}\n\nTo change it, say the daily grams you want, e.g. “set protein to 180, carbs to 350, fat to 70 and show me the meals.”`;
  }

  return "I can log meals, grocery, steps, and I can rewrite the plan. Say the daily protein / carbs / fat you want (example: “change my day to 180 protein, 350 carbs, 70 fat”) and I’ll scale the meals and show what they look like.";
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
    const next = body.type === "rest" ? "rest" : "train";
    if (day.type && day.type !== next) {
      day.eaten = (day.eaten || []).map((x) => {
        if (x.kind !== "planned") return x;
        const copy = { ...x, kind: "extra" };
        delete copy.mealId;
        copy.name = `${x.name} (was ${day.type})`;
        return copy;
      });
    }
    day.type = next;
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
  if (route === "/api/today/steps" && method === "POST") {
    const date = todayKey(body.date);
    const day = ensureDay(db, date);
    const steps = Math.round(Number(body.steps));
    if (!Number.isFinite(steps) || steps < 0) throw new Error("steps required");
    day.steps = steps;
    day.stepsSource = body.source === "health" ? "health" : "manual";
    day.stepsAt = new Date().toISOString();
    writeDb(db);
    return snapshot(db, date);
  }

  if (route === "/api/food/lookup" && method === "POST") {
    return window.DietFoods.estimateFood(body);
  }

  if (route === "/api/chat" && method === "GET") return db.chats.messages || [];
  if (route === "/api/chat" && method === "POST") {
    const date = todayKey(body.date);
    const message = String(body.message || "");
    const change = applyMacroChange(db, message);
    let reply;
    let applied = [];
    if (change) {
      reply = change.reply;
      applied = change.applied;
    } else {
      try {
        const system = window.DietLLM.buildChatSystem(db, date);
        reply = await window.DietLLM.askAnywhere(system, db.chats.messages || [], message);
      } catch (err) {
        reply = `${localReply(db, date, message)}\n\n(Full chat is offline right now: ${err.message})`;
      }
    }
    const userMsg = { id: uid(), role: "user", content: message, at: new Date().toISOString() };
    const agentMsg = { id: uid(), role: "agent", content: reply, at: new Date().toISOString(), applied };
    db.chats.messages = [...(db.chats.messages || []), userMsg, agentMsg];
    writeDb(db);
    return { reply: agentMsg, messages: db.chats.messages, applied, plan: db.plan, grocery: db.grocery };
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
