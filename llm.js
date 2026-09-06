function clip(s, max) {
  const t = String(s || "");
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function buildChatSystem(db, date) {
  const snap = typeof snapshot === "function" ? snapshot(db, date) : {};
  const plan = db.plan || {};
  const p = plan.profile || {};
  const next = (snap.remainingMeals || []).slice(0, 3).map((m) => `${m.name}: ${m.food} (${m.calories} kcal)`).join(" | ");
  const today = snap.type
    ? `${snap.type} day. Eaten ${Math.round(snap.totals?.calories || 0)} / ${snap.targets?.calories} kcal. Left P${Math.round(snap.remaining?.protein || 0)} C${Math.round(snap.remaining?.carbs || 0)} F${Math.round(snap.remaining?.fat || 0)}. Next: ${next || "nothing planned"}.`
    : "Train/rest not chosen yet.";
  return `You are Chris’s Diet Hub assistant. Be direct. Always say if food grams are cooked or uncooked. Chicken, beef, rice, and potato weights in his plan are cooked. Raw milk means unpasteurized. 4 meals every day. Train: jasmine rice pre/post lift, chicken midday, coconut water. Rest: smoothie then diced potatoes. 140 g protein, 65–70 g fat, weekly ~2,850–2,900 kcal. Ground beef default is 93/7. Extra food he logs, and meals he eats differently, automatically move calories onto the next planned meals.

Chris: ${p.age || 19}, lean bulk, 5 lift days, ~10k steps, no greens.
${today}`;
}

function looksLikeError(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (t.startsWith("{") && /"error"|Payment Required|UNAUTHORIZED/i.test(t)) return true;
  return false;
}

async function askAnywhere(system, history, message) {
  const compact = [
    clip(system, 450),
    `Chris: ${clip(message, 280)}`,
    "Agent:",
  ].join("\n");
  const url = `https://text.pollinations.ai/${encodeURIComponent(compact)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { headers: { Accept: "text/plain" }, signal: ctrl.signal });
    const text = (await res.text()).trim();
    if (!res.ok || looksLikeError(text)) throw new Error("chat unavailable");
    return text.replace(/^Agent:\s*/i, "").trim();
  } finally {
    clearTimeout(timer);
  }
}

window.DietLLM = { askAnywhere, buildChatSystem };
