// Ask tab. Uses Pollinations' free chat endpoint: no key, but one reply per 30 s per
// connection and replies can take ~30–60 s. The app does the math (totals, what's left,
// meal suggestions) and hands the AI the answers, so it only has to explain.
const CHAT_URL = "https://text.pollinations.ai/openai";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function r0(n) {
  return Math.round(Number(n) || 0);
}

function macroLine(m) {
  return `${r0(m.calories)} kcal, ${r0(m.protein)}P ${r0(m.carbs)}C ${r0(m.fat)}F`;
}

function buildSystem(db, date) {
  const S = window.DietStore;
  const F = window.DietFoods;
  const sum = S.daySummary(db, date);
  const sug = window.DietSuggest.suggestNext(db, sum);
  const t = sum.targets;
  const lines = [
    "You are Chris's food-tracking assistant inside his Diet Hub app. Answer in plain, short sentences. No markdown tables.",
    "Give food amounts in grams and say cooked or uncooked. Use the numbers below as-is; the app already did the math. If he asks what to eat, use the app's suggested meals below.",
    "",
    "About Chris: 19, about 5'8\", lean bulk, lifts most days (rest days are rare), ~10k steps a day. Weighs food on a scale.",
    "He cooks meat, fish and potatoes in olive oil (lathers the meat in oil, plus oil in the pan). Eggs are cooked differently. Raw milk = unpasteurized whole milk.",
    `His meals: ${db.meals.map((m) => `${m.name} (${m.items.map((i) => F.getFood(i.food)?.name).filter(Boolean).join(", ")})`).join("; ")}.`,
    "",
    `Today ${date} is a ${sum.type} day. Targets: ${macroLine(t)}.`,
    `Eaten so far: ${macroLine(sum.totals)}. Left: ${macroLine(sum.remaining)}.`,
  ];
  if (sum.eaten.length) {
    lines.push("Logged today:");
    for (const e of sum.eaten) {
      const time = new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const what = e.items?.length ? e.items.map(F.describeItem).join(", ") : e.food || "";
      lines.push(`- ${time} ${e.name}: ${what} = ${macroLine(e)}`);
    }
  } else {
    lines.push("Nothing logged yet today.");
  }
  if (sug.done) {
    lines.push("He's within 150 kcal of today's target.");
  } else if (sug.options.length) {
    lines.push(`Suggested next meal (aiming at ${macroLine(sug.target)} each, ${sug.mealsLeft} meal(s) left):`);
    for (const o of sug.options) lines.push(`- ${o.meal.name}: ${o.items.map(F.describeItem).join(", ")} = ${macroLine(o.totals)}`);
  }
  const recent = S.recentDays(db, date, 7);
  if (recent.length) {
    lines.push("Last 7 days:");
    for (const d of recent) lines.push(`- ${d.date} (${d.type}): ${macroLine(d.totals)} vs target ${r0(d.targets.calories)} kcal`);
  }
  const ci = S.checkIn(db, date);
  if (ci.state === "raise" || ci.state === "lower") lines.push(`Weekly check-in suggests ${ci.delta > 0 ? "adding" : "cutting"} ${Math.abs(ci.delta)} kcal a day (as carbs); he can apply it on the Progress tab.`);
  else if (ci.state === "on-pace") lines.push("Weekly check-in: on pace, keep targets.");
  const w = S.weightStats(db, date);
  if (w.latest) {
    const rate = w.rate == null ? "not enough weigh-ins for a weekly rate yet" : `${w.rate >= 0 ? "+" : ""}${w.rate.toFixed(2)} lb/week (goal +0.25 to +0.5)`;
    lines.push(`Weight: latest ${w.latest.lb} lb on ${w.latest.date}; 7-day average ${w.avg7 == null ? "n/a" : w.avg7.toFixed(1)} lb; ${rate}.`);
  }
  return lines.join("\n");
}

function retrySeconds(res, body) {
  const header = Number(res.headers.get("Retry-After"));
  if (header > 0) return header;
  const m = String(body).match(/retry after (\d+)\s*s/i);
  return m ? Number(m[1]) : 30;
}

function cleanReply(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

async function askFree(messages, { onWait } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    let res;
    let body;
    try {
      res = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai", messages, private: true }),
        signal: ctrl.signal,
      });
      body = await res.text();
    } catch {
      throw new Error(ctrl.signal.aborted ? "The free AI took too long." : "Couldn’t reach the free AI.");
    } finally {
      clearTimeout(timer);
    }
    if ((res.status === 402 || res.status === 429) && attempt === 0) {
      const secs = retrySeconds(res, body);
      onWait?.(secs);
      await sleep(secs * 1000 + 500);
      continue;
    }
    // Pollinations wants a Turnstile token from unknown origins like localhost; the live site is fine.
    if (res.status === 403 && /turnstile/i.test(body)) throw new Error("The free AI only answers on the live app (papicurls.github.io), not a test copy.");
    if (!res.ok) throw new Error(`The free AI said no (error ${res.status}).`);
    let content = "";
    try {
      content = JSON.parse(body).choices?.[0]?.message?.content || "";
    } catch {
      content = "";
    }
    content = cleanReply(content);
    if (!content) throw new Error("The free AI sent back an empty reply.");
    return content;
  }
  throw new Error("The free AI is busy. Try again in a minute.");
}

// The question is the last saved chat message; the 8 before it go along as history.
async function ask(db, date, opts) {
  const recent = db.chats.messages.slice(-9).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
  return askFree([{ role: "system", content: buildSystem(db, date) }, ...recent], opts);
}

// When the AI can't be reached, still answer the most common question locally.
function offlineReply(db, date, reason) {
  const F = window.DietFoods;
  const sum = window.DietStore.daySummary(db, date);
  const sug = window.DietSuggest.suggestNext(db, sum);
  const left = sum.remaining;
  const part = (n, unit, label) => (n > 0 ? `${r0(n)}${unit} ${label} left` : `${label} done`);
  let text = `${reason} Here's where you're at: ${part(left.calories, "", "kcal")} · ${part(left.protein, " g", "protein")} · ${part(left.carbs, " g", "carbs")} · ${part(left.fat, " g", "fat")}.`;
  const best = sug.options[0];
  if (best) text += `\nNext meal idea: ${best.meal.name} — ${best.items.map(F.describeItem).join(", ")} (${r0(best.totals.calories)} kcal).`;
  return text;
}

window.DietLLM = { ask, offlineReply, buildSystem };
