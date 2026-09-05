function clip(s, max) {
  const t = String(s || "");
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function buildChatSystem(db, date) {
  const snap = typeof snapshot === "function" ? snapshot(db, date) : {};
  const plan = db.plan || {};
  const p = plan.profile || {};
  const train = plan.days?.train;
  const rest = plan.days?.rest;
  const grocery = (db.grocery?.items || []).map((i) => `${i.have ? "HAVE" : "NEED"} ${i.item} (${i.amount})`).join("; ");
  const today = snap.type
    ? `Today is a ${snap.type} day. Eaten ${Math.round(snap.totals?.calories || 0)} / ${snap.targets?.calories} kcal. Left ${Math.round(snap.remaining?.calories || 0)} kcal, P${Math.round(snap.remaining?.protein || 0)} C${Math.round(snap.remaining?.carbs || 0)} F${Math.round(snap.remaining?.fat || 0)}. Logged: ${(snap.eaten || []).map((x) => x.name).join(", ") || "nothing"}.`
    : "Today’s train/rest type is not chosen yet.";
  return `You are Chris’s assistant in Diet Hub. Answer ANY question — diet, lifting, life, random facts, whatever. Be direct. If it is about his food, use the context. If he wants the plan changed, say the new meals clearly with calories and P/C/F.

Chris: ${p.age || 19}, ${p.height || ""}, ${p.weightLb ? p.weightLb[0] + "–" + p.weightLb[1] + " lb" : ""}, lean bulk, ~10k steps, 5 lift days. No greens. Cook with olive oil. Farm eggs, chicken, beef, rice, potatoes, raw milk.

Train day${train ? ` ~${train.calories} kcal P${train.protein} C${train.carbs} F${train.fat}: ` + train.meals.map((m) => m.name + " " + m.food).join(" | ") : ""}.
Rest day${rest ? ` ~${rest.calories} kcal P${rest.protein} C${rest.carbs} F${rest.fat}: ` + rest.meals.map((m) => m.name + " " + m.food).join(" | ") : ""}.
Grocery: ${grocery || "empty"}.
${today}`;
}

async function askAnywhere(system, history, message) {
  const lines = [
    clip(system, 1800),
    ...(history || []).slice(-8).map((m) => `${m.role === "user" ? "Chris" : "Agent"}: ${clip(m.content, 500)}`),
    `Chris: ${message}`,
    "Agent:",
  ];
  const prompt = lines.join("\n");
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`;
  const res = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!res.ok) throw new Error(`chat HTTP ${res.status}`);
  const text = (await res.text()).trim();
  if (!text) throw new Error("empty reply");
  return text.replace(/^Agent:\s*/i, "").trim();
}

window.DietLLM = { askAnywhere, buildChatSystem };
