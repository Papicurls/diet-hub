const S = window.DietStore;
const F = window.DietFoods;
const WEEKLY_GOAL_LB = S.WEEKLY_GOAL;

const state = {
  sheet: null,
  suggestions: [],
  asking: false,
  waitNote: "",
  pendingCode: null,
  pendingName: "",
  renderedDate: null,
};

function $(id) {
  return document.getElementById(id);
}

function db() {
  return S.db();
}

function today() {
  return S.todayKey();
}

function fmt(n) {
  return Math.round(Number(n) || 0).toLocaleString();
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dateLabel(key) {
  return S.parseDate(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function applyTheme() {
  const saved = localStorage.getItem("diet-theme");
  if (saved) document.documentElement.dataset.theme = saved;
}

const VIEWS = ["today", "weight", "grocery", "agent", "setup"];

function currentView() {
  return VIEWS.find((v) => !$(`view-${v}`).hidden) || "today";
}

function showView(name) {
  if (!VIEWS.includes(name)) name = "today";
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.hidden = el.id !== `view-${name}`;
  });
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.section === name);
  });
  window.scrollTo(0, 0);
  if (name === "today") renderToday();
  if (name === "weight") renderProgress();
  if (name === "setup") renderSetup();
  try {
    localStorage.setItem("diet-hub-view", name);
  } catch {
    /* private mode */
  }
}

// ---------- Today ----------

const MACRO_ROWS = [
  { key: "protein", label: "Protein", cls: "p" },
  { key: "carbs", label: "Carbs", cls: "c" },
  { key: "fat", label: "Fat", cls: "f" },
];

function statusChip(st, unit) {
  if (st.state === "hit") return `<span class="chip hit">✓ Hit</span>`;
  if (st.state === "over") return `<span class="chip over">▲ ${fmt(st.diff)}${unit} over</span>`;
  return `<span class="chip under">${fmt(-st.diff)}${unit} to go</span>`;
}

function renderToday() {
  const d = db();
  const date = today();
  state.renderedDate = date;
  const sum = S.daySummary(d, date);
  $("todayDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  $("dayTypeSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b.dataset.type === sum.type));

  const left = sum.remaining.calories;
  $("kcalLeft").textContent = fmt(Math.abs(left));
  $("kcalLeftLabel").textContent = left >= 0 ? "kcal left" : "kcal over";
  $("kcalSide").textContent = `${fmt(sum.totals.calories)} of ${fmt(sum.targets.calories)} kcal eaten`;
  // The big number already says what's left; the chip only shows once you're in range or over.
  $("kcalStatus").innerHTML = sum.status.calories.state === "under" ? "" : statusChip(sum.status.calories, " kcal");
  $("macroRows").innerHTML = MACRO_ROWS.map(({ key, label, cls }) => {
    const eaten = sum.totals[key];
    const target = sum.targets[key];
    const st = sum.status[key];
    const pct = target > 0 ? Math.min(100, (eaten / target) * 100) : 0;
    return `<div class="macro-row">
      <div class="macro-name">${label}</div>
      <div class="macro-val">${fmt(eaten)} / ${fmt(target)} g</div>
      ${statusChip(st, " g")}
      <div class="bar-track"><div class="bar-fill ${cls} ${st.state === "over" ? "is-over" : ""}" style="width:${pct}%"></div></div>
    </div>`;
  }).join("");

  const ci = S.checkIn(d, date);
  const nudge = $("checkinNudge");
  nudge.hidden = !(ci.state === "raise" || ci.state === "lower");
  if (!nudge.hidden) nudge.textContent = `Weekly check-in: ${ci.delta > 0 ? "add" : "cut"} ${fmt(Math.abs(ci.delta))} kcal a day. Tap to review →`;

  renderMealGrid(d);
  renderSuggest(d, sum);
  renderLogged(sum);
  renderSteps(sum);
}

function rerenderAfterChange() {
  renderToday();
  if (currentView() === "weight") renderProgress();
}

function renderMealGrid(d) {
  $("mealGrid").innerHTML =
    d.meals
      .map((m) => {
        const kcal = S.sumMacros(S.mealItems(d, m.id).map(F.itemMacros)).calories;
        return `<button type="button" class="meal-btn" data-meal="${esc(m.id)}">
          <span class="meal-btn-name">${esc(m.name)}</span>
          <span class="meal-btn-meta">~${fmt(kcal)} kcal</span>
        </button>`;
      })
      .join("") +
    `<button type="button" class="meal-btn alt" data-action="food"><span class="meal-btn-name">Other food</span><span class="meal-btn-meta">pick from the list</span></button>
     <button type="button" class="meal-btn alt" data-action="scan"><span class="meal-btn-name">Scan barcode</span><span class="meal-btn-meta">packaged food</span></button>`;

  const quick = [
    ...(window.DIET_SEED.quickFoods || []).map((q) => ({ food: q.food, fallback: q })),
    ...d.customFoods.slice(-4).map((f) => ({ food: f.id, fallback: {} })),
  ];
  $("quickAdds").innerHTML = quick
    .filter((q) => F.getFood(q.food))
    .map((q) => {
      const item = S.foodItem(d, q.food, q.fallback);
      const unit = item.unit === "pc" ? "" : ` ${F.UNIT_LABELS[item.unit]}`;
      return `<button type="button" class="quick-chip" data-quick="${esc(q.food)}">${esc(F.getFood(q.food).name)} · ${F.fmtNum(item.amount)}${unit}</button>`;
    })
    .join("");
}

function renderSuggest(d, sum) {
  // Suggestions are for the last meal or two: wait for 2 logged meals unless he picks.
  const waiting = !sum.mealsLeftSet && sum.mealCount < 2;
  const res = window.DietSuggest.suggestNext(d, sum);
  state.suggestions = waiting ? [] : res.options;
  $("mealsLeftSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", !waiting && Number(b.dataset.n) === res.mealsLeft));
  let html;
  if (waiting) {
    html = `<p class="empty">Suggestions are for your last meal or two. They show up once you’ve logged 2 meals, or tap “1 meal left” or “2 left” to see them now.</p>`;
  } else if (res.done) {
    const left = sum.remaining;
    if (left.calories < 0) html = `<p class="empty">You’re ${fmt(-left.calories)} kcal past today’s target.</p>`;
    else if (sum.status.protein.state !== "hit") html = `<p class="empty">You’re within ${fmt(left.calories)} kcal of today’s target, but still ${fmt(left.protein)} g short on protein.</p>`;
    else html = `<p class="empty">You’re within ${fmt(left.calories)} kcal of today’s target. Done for the day.</p>`;
  } else if (!res.options.length) {
    html = `<p class="empty">Add a meal in Setup to get suggestions.</p>`;
  } else {
    const t = res.target;
    html =
      `<p class="card-sub">${res.mealsLeft === 1 ? "Your last meal" : "Each of your next 2 meals"}: ~${fmt(t.calories)} kcal · ${fmt(t.protein)} P · ${fmt(t.carbs)} C · ${fmt(t.fat)} F</p>` +
      res.options
        .map(
          (o, i) => `<div class="sg">
            <div class="sg-head"><span class="sg-name">${esc(o.meal.name)}</span><span class="sg-kcal">${fmt(o.totals.calories)} kcal</span></div>
            <div class="sg-items">${o.items.map((it) => esc(F.describeItem(it))).join(" · ")}</div>
            <div class="sg-foot">
              <span class="sg-macros">${fmt(o.totals.protein)} P · ${fmt(o.totals.carbs)} C · ${fmt(o.totals.fat)} F</span>
              <button type="button" class="ghost-btn" data-use="${i}">Log this</button>
            </div>
          </div>`,
        )
        .join("");
  }
  $("suggestBody").innerHTML = html;
}

function entryRowsHtml(eaten, date) {
  return [...eaten]
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .map((e) => {
      const time = e.at ? new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
      const what = e.items?.length ? e.items.map(F.describeItem).join(" · ") : e.food || "";
      return `<div class="log-item" data-entry="${esc(e.id)}" data-date="${esc(date)}">
        <button type="button" class="log-main" ${e.items?.length ? "data-edit" : "disabled"}>
          <span class="log-name">${esc(e.name)} <span class="log-time">${esc(time)}</span></span>
          <span class="log-meta">${esc(what)}</span>
          <span class="log-macros">${fmt(e.calories)} kcal · ${fmt(e.protein)} P · ${fmt(e.carbs)} C · ${fmt(e.fat)} F</span>
        </button>
        <button type="button" class="unlog" data-delete aria-label="Delete ${esc(e.name)}">×</button>
      </div>`;
    })
    .join("");
}

function renderLogged(sum) {
  $("loggedList").innerHTML = sum.eaten.length ? entryRowsHtml(sum.eaten, sum.date) : `<p class="empty">Nothing logged yet.</p>`;
}

// Tap an entry to edit it, × to delete it — on Today and on past days.
function onEntryListClick(e) {
  const row = e.target.closest("[data-entry]");
  if (!row) return;
  const date = row.dataset.date || today();
  if (e.target.closest("[data-delete]")) {
    S.removeEntry(db(), date, row.dataset.entry);
    rerenderAfterChange();
  } else if (e.target.closest("[data-edit]")) {
    openEntry(row.dataset.entry, date);
  }
}

// ---------- Steps ----------

function stepsFromUrl() {
  const params = new URLSearchParams(location.search);
  let raw = params.get("steps");
  if (raw == null && location.hash) {
    raw = new URLSearchParams(location.hash.replace(/^#/, "")).get("steps");
  }
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function clearStepsFromUrl() {
  const url = new URL(location.href);
  url.searchParams.delete("steps");
  if (url.hash && /steps=/i.test(url.hash)) url.hash = "";
  history.replaceState({}, "", url.pathname + url.search + url.hash);
}

function renderSteps(sum) {
  const goal = sum.stepGoal || 10000;
  const have = sum.steps != null && Number.isFinite(sum.steps);
  const n = have ? Math.round(sum.steps) : 0;
  const left = Math.max(0, goal - n);
  $("stepsValue").textContent = have ? n.toLocaleString() : "—";
  $("stepsNote").textContent = have
    ? `${sum.stepsSource === "health" ? "Health" : "logged"} · ${left ? left.toLocaleString() + " left" : "goal"}`
    : "tap to log";
  $("stepsFill").style.width = `${Math.min(100, (n / goal) * 100)}%`;
  $("stepsBarValue").textContent = `${n.toLocaleString()} / ${goal.toLocaleString()}`;
  if (have && document.activeElement !== $("stepsInput")) $("stepsInput").value = String(n);
}

function saveSteps(steps, source) {
  S.setSteps(db(), today(), steps, source);
  renderToday();
}

// ---------- Sheet (log a meal, edit a meal, add a food) ----------

function openSheet(sheet) {
  state.sheet = sheet;
  renderSheet();
}

function closeSheet() {
  state.sheet = null;
  $("sheet").hidden = true;
  $("sheetBody").innerHTML = "";
  document.body.classList.remove("sheet-open");
}

function msgSheet(title, text, buttons) {
  return { mode: "msg", title, text, buttons };
}

function renderSheet() {
  const sh = state.sheet;
  if (!sh) return closeSheet();
  $("sheet").hidden = false;
  document.body.classList.add("sheet-open");
  $("sheetTitle").textContent = sh.title;
  let html = "";
  if (sh.mode === "log" || sh.mode === "meal") html = itemsEditorHtml(sh);
  else if (sh.mode === "food") html = foodFormHtml(sh);
  else if (sh.mode === "code") html = codeFormHtml();
  else if (sh.mode === "busy") html = `<p class="busy" id="busyText">${esc(sh.message)}</p>`;
  else if (sh.mode === "msg") {
    html = `<p class="sheet-text">${esc(sh.text)}</p><div class="sheet-actions stack">${(sh.buttons || [])
      .map(([act, label, primary]) => `<button type="button" class="${primary ? "primary-btn" : "ghost-btn"}" data-act="${act}">${esc(label)}</button>`)
      .join("")}</div>`;
  }
  $("sheetBody").innerHTML = html;
  if (sh.mode === "log" || sh.mode === "meal") updateSheetTotals();
}

function showSheetError(msg) {
  const el = $("sheetError");
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
}

function addFoodOptions() {
  const groups = {};
  for (const f of F.allFoods()) (groups[f.cat] ||= []).push(f);
  return (
    `<option value="">+ Add a food…</option>` +
    Object.entries(F.CATEGORY_LABELS)
      .filter(([cat]) => groups[cat]?.length)
      .map(([cat, label]) => `<optgroup label="${esc(label)}">${groups[cat].map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}</optgroup>`)
      .join("")
  );
}

function itemRowHtml(item, idx) {
  const food = F.getFood(item.food);
  const variants = F.groupVariants(food);
  const name = variants.length
    ? `<label class="variant"><span class="item-name">${esc(F.GROUP_NAMES[food.group] || food.name)}</span>
        <select data-variant="${idx}" aria-label="Type">${variants
          .map((v) => `<option value="${esc(v.id)}" ${v.id === item.food ? "selected" : ""}>${esc(v.variant)}</option>`)
          .join("")}</select></label>`
    : `<span class="item-name">${esc(food?.name || "Food")}</span>`;
  const units = F.unitsFor(food);
  const unit =
    units.length > 1
      ? `<select data-unit="${idx}" aria-label="Unit">${units
          .map((u) => `<option value="${u}" ${u === item.unit ? "selected" : ""}>${F.UNIT_LABELS[u]}</option>`)
          .join("")}</select>`
      : `<span class="unit-label">${F.UNIT_LABELS[item.unit] || item.unit}</span>`;
  const done = F.hasDoneness(food)
    ? `<div class="seg small" role="group" aria-label="Cooked or uncooked">
        <button type="button" data-done="${idx}" data-val="cooked" class="${item.doneness !== "raw" ? "is-on" : ""}">Cooked</button>
        <button type="button" data-done="${idx}" data-val="raw" class="${item.doneness === "raw" ? "is-on" : ""}">Uncooked</button>
      </div>`
    : "";
  const showNote = food?.note && !(food.noteIfCooked && item.doneness === "raw");
  return `<div class="item-row">
    <div class="item-top">${name}<button type="button" class="unlog" data-remove="${idx}" aria-label="Remove">×</button></div>
    <div class="item-controls">
      <input class="amount" data-amount="${idx}" type="number" inputmode="decimal" min="0" step="any" value="${esc(item.amount ?? "")}" aria-label="Amount" />
      ${unit}
      ${done}
      <span class="item-kcal" data-kcal="${idx}"></span>
    </div>
    ${showNote ? `<div class="item-note">${esc(food.note)}</div>` : ""}
  </div>`;
}

function itemsEditorHtml(sh) {
  const nameField =
    sh.mode === "meal"
      ? `<label class="field"><span>Meal name</span><input id="mealNameInput" value="${esc(sh.name || "")}" placeholder="Chicken & rice" /></label>`
      : "";
  const rows = sh.items.length ? sh.items.map(itemRowHtml).join("") : `<p class="empty">Add a food below.</p>`;
  const notes = (sh.notes || []).map((n) => `<p class="sheet-note">${esc(n)}</p>`).join("");
  const actions =
    sh.mode === "meal"
      ? `${sh.mealId ? `<button type="button" class="danger-btn" data-delete-meal>Delete meal</button>` : ""}
         <button type="button" class="primary-btn" data-save-meal>Save meal</button>`
      : `${sh.entryId ? `<button type="button" class="danger-btn" data-delete-entry>Delete</button>` : ""}
         <button type="button" class="primary-btn" data-save-log>${sh.entryId ? "Save changes" : "Log it"}</button>`;
  return `${nameField}
    ${sh.mode === "meal" ? `<p class="card-sub">Starting amounts for this meal. Grams are whatever you pick: cooked or uncooked. Set a food to 0 to keep it as optional.</p>` : ""}
    ${notes}
    <div class="items">${rows}</div>
    <select class="add-food" id="addFoodSelect" aria-label="Add a food">${addFoodOptions()}</select>
    <div class="sheet-total" id="sheetTotal"></div>
    <div class="sheet-error" id="sheetError" hidden></div>
    <div class="sheet-actions">${actions}</div>`;
}

function updateSheetTotals() {
  const sh = state.sheet;
  if (!sh || !$("sheetTotal")) return;
  const t = S.sumMacros(sh.items.map(F.itemMacros));
  sh.items.forEach((it, i) => {
    const el = document.querySelector(`[data-kcal="${i}"]`);
    if (el) el.textContent = `${fmt(F.itemMacros(it).calories)} kcal`;
  });
  let after = "";
  if (sh.mode === "log") {
    const date = sh.date || today();
    const sum = S.daySummary(db(), date);
    const prev = sh.entryId ? S.findEntry(db(), date, sh.entryId)?.calories || 0 : 0;
    const left = sum.remaining.calories + prev - t.calories;
    const day = date === today() ? "today" : "that day";
    after = `<div class="sheet-after">${left >= 0 ? `Leaves ${fmt(left)} kcal for ${day}` : `Puts you ${fmt(-left)} kcal over ${day}`}</div>`;
  }
  $("sheetTotal").innerHTML = `<div><strong>${fmt(t.calories)} kcal</strong> · ${fmt(t.protein)} P · ${fmt(t.carbs)} C · ${fmt(t.fat)} F</div>${after}`;
}

function convertAmount(food, amount, from, to) {
  const grams = F.toGrams(food, amount, from);
  const per = F.toGrams(food, 1, to);
  if (!grams || !per) return amount;
  const n = grams / per;
  return to === "pc" || to === "srv" || to === "tbsp" ? Math.round(n * 10) / 10 : Math.round(n);
}

function openMeal(mealId) {
  const meal = db().meals.find((m) => m.id === mealId);
  if (!meal) return;
  openSheet({ mode: "log", kind: "meal", mealId, name: meal.name, title: meal.name, items: S.mealItems(db(), mealId) });
}

function openFood(foodId, fallback, date = today()) {
  const food = foodId ? F.getFood(foodId) : null;
  openSheet({
    mode: "log",
    kind: "food",
    mealId: null,
    name: null,
    date,
    title: food ? food.name : date === today() ? "Log food" : `Add to ${dateLabel(date)}`,
    items: food ? [S.foodItem(db(), foodId, fallback)] : [],
  });
}

function openEntry(id, date = today()) {
  const e = S.findEntry(db(), date, id);
  if (!e?.items?.length) return;
  openSheet({
    mode: "log",
    kind: e.kind,
    mealId: e.mealId,
    name: e.kind === "meal" ? e.name : null,
    date,
    title: `Edit ${e.name}${date === today() ? "" : ` · ${dateLabel(date)}`}`,
    entryId: e.id,
    items: e.items.map(({ food, amount, unit, doneness }) => ({ food, amount, unit, doneness })),
  });
}

// "Say it" box: read what he said/typed, then open the log sheet to check it.
function onSay(text) {
  const r = window.DietVoice.parseSpoken(db(), text);
  if (!r.items.some((i) => Number(i.amount) > 0)) {
    return openSheet(
      msgSheet("Didn’t catch that", `None of your foods were in “${text}”. Try something like “250 grams chicken and 120 grams uncooked rice”, or tap a meal.`, [["close", "OK", true]]),
    );
  }
  const notes = [];
  if (r.unknown.length) notes.push(`Didn’t catch ${r.unknown.map((u) => `“${u}”`).join(", ")}. Add it below with “+ Add a food”, or scan it.`);
  if (r.guessed.length) notes.push(`You didn’t say how much ${r.guessed.join(", ").toLowerCase()}, so it used your usual. Check it.`);
  if (r.unclearCups.length) notes.push(`Cups don’t convert for ${r.unclearCups.join(", ").toLowerCase()}. Weigh it and type the grams.`);
  openSheet({
    mode: "log",
    kind: r.mealId ? "meal" : "food",
    mealId: r.mealId,
    name: r.name,
    date: today(),
    title: r.name || "Check what you said",
    items: r.items,
    notes,
    fromSay: true,
  });
}

function openSuggestion(i) {
  const o = state.suggestions[i];
  if (!o) return;
  openSheet({ mode: "log", kind: "meal", mealId: o.meal.id, name: o.meal.name, title: o.meal.name, items: o.items.map((it) => ({ ...it })) });
}

function openMealEditor(mealId) {
  const meal = mealId ? db().meals.find((m) => m.id === mealId) : null;
  openSheet({
    mode: "meal",
    mealId: meal?.id || null,
    name: meal?.name || "",
    title: meal ? `Edit ${meal.name}` : "New meal",
    items: meal ? meal.items.map((i) => ({ ...i })) : [],
  });
}

function saveLog() {
  const sh = state.sheet;
  try {
    const fields = { kind: sh.kind, mealId: sh.mealId, name: sh.name, items: sh.items };
    const date = sh.date || today();
    if (sh.entryId) S.updateEntry(db(), date, sh.entryId, fields);
    else S.addEntry(db(), date, fields);
    if (sh.fromSay) $("sayInput").value = "";
    closeSheet();
    rerenderAfterChange();
  } catch (err) {
    showSheetError(err.message);
  }
}

function saveMealTemplate() {
  const sh = state.sheet;
  try {
    S.saveMeal(db(), { id: sh.mealId, name: sh.name, items: sh.items });
    closeSheet();
    renderSetup();
    renderToday();
  } catch (err) {
    showSheetError(err.message);
  }
}

// ---------- Packaged food: barcode, label photo, typed in ----------

function num1(v) {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) ? "" : String(Math.round(n * 10) / 10);
}

function foodFormHtml(sh) {
  const v = sh.values || {};
  const field = (name, label) =>
    `<label class="field"><span>${label}</span><input name="${name}" type="number" min="0" step="any" inputmode="decimal" value="${num1(v[name])}" required /></label>`;
  return `<form id="foodForm" class="food-form">
    ${sh.intro ? `<p class="card-sub">${esc(sh.intro)}</p>` : ""}
    <label class="field"><span>Name</span><input name="name" value="${esc(v.name || "")}" placeholder="Brand and product" required /></label>
    <div class="field-row">
      ${field("serving", "Serving size")}
      <label class="field"><span>Unit</span><select name="baseUnit">
        <option value="g">g</option>
        <option value="ml" ${v.baseUnit === "ml" ? "selected" : ""}>ml</option>
      </select></label>
    </div>
    <p class="card-sub">Per serving, as printed on the label:</p>
    <div class="field-row four">
      ${field("calories", "Calories")}
      ${field("protein", "Protein g")}
      ${field("carbs", "Carbs g")}
      ${field("fat", "Fat g")}
    </div>
    ${sh.ocrText ? `<details class="ocr"><summary>What the camera read</summary><pre>${esc(sh.ocrText)}</pre></details>` : ""}
    <div class="sheet-error" id="sheetError" hidden></div>
    <div class="sheet-actions">
      <button type="button" class="ghost-btn" data-act="label">${sh.ocrText ? "Retake label photo" : "Read a label photo"}</button>
      <button type="submit" class="primary-btn">${sh.logAfter ? "Save & log" : "Save"}</button>
    </div>
  </form>`;
}

function codeFormHtml() {
  return `<form id="codeForm">
    <label class="field"><span>Barcode number</span><input name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="off" required /></label>
    <div class="sheet-actions"><button type="submit" class="primary-btn">Look up</button></div>
  </form>`;
}

function openFoodForm({ foodId = null, values = {}, intro = "", ocrText = "", logAfter = true } = {}) {
  let title = "Add a food";
  if (foodId) {
    const f = F.getFood(foodId);
    const k = f.servingG / 100;
    title = `Edit ${f.name}`;
    values = { name: f.name, serving: f.servingG, baseUnit: f.baseUnit, calories: f.per[0] * k, protein: f.per[1] * k, carbs: f.per[2] * k, fat: f.per[3] * k };
    logAfter = false;
  } else if (values.calories != null || ocrText) {
    title = "Check and save";
  }
  openSheet({ mode: "food", title, foodId, code: state.pendingCode, values, intro, ocrText, logAfter });
}

function saveFoodForm(form) {
  const sh = state.sheet;
  const fd = new FormData(form);
  const serving = Number(fd.get("serving"));
  const keys = ["calories", "protein", "carbs", "fat"];
  const raw = keys.map((k) => String(fd.get(k) ?? "").trim());
  const vals = raw.map(Number);
  try {
    if (!(serving > 0)) throw new Error("Enter the serving size.");
    if (raw.some((s) => s === "") || vals.some((n) => !Number.isFinite(n) || n < 0)) throw new Error("Fill in calories, protein, carbs and fat.");
    const saved = S.saveCustomFood(db(), {
      id: sh.foodId,
      name: fd.get("name"),
      per: vals.map((n) => (n / serving) * 100),
      servingG: serving,
      baseUnit: fd.get("baseUnit"),
      code: sh.code || F.getFood(sh.foodId)?.code || null,
    });
    renderSetup();
    if (sh.logAfter) openFood(saved.id);
    else {
      closeSheet();
      renderToday();
    }
  } catch (err) {
    showSheetError(err.message);
  }
}

function startScan() {
  state.pendingCode = null;
  state.pendingName = "";
  $("scanInput").value = "";
  $("scanInput").click();
}

function startLabel() {
  const name = document.querySelector("#foodForm [name=name]")?.value;
  if (name) state.pendingName = name;
  $("labelInput").value = "";
  $("labelInput").click();
}

function scanFailSheet() {
  return msgSheet("Scan barcode", "Couldn’t find a barcode in that photo. Get close so the barcode fills most of the picture, and keep it sharp.", [
    ["rescan", "Try again", true],
    ["typecode", "Type the barcode number"],
    ["label", "Read the nutrition label instead"],
    ["manual", "Type it in"],
  ]);
}

async function onScanFile(file) {
  openSheet({ mode: "busy", title: "Scan barcode", message: "Reading the barcode…" });
  try {
    const code = await window.DietScan.decodeBarcode(file);
    if (!code) return openSheet(scanFailSheet());
    await handleBarcode(code);
  } catch (err) {
    openSheet(msgSheet("Scan barcode", err.message, [["rescan", "Try again", true], ["manual", "Type it in"]]));
  }
}

async function handleBarcode(rawCode) {
  const code = F.normalizeBarcode(rawCode);
  state.pendingCode = code;
  const known = S.customByCode(db(), code);
  if (known) return openFood(known.id);
  openSheet({ mode: "busy", title: "Scan barcode", message: `Looking up ${code}…` });
  let found;
  try {
    found = await F.lookupBarcode(code);
  } catch (err) {
    return openSheet(msgSheet("Scan barcode", `${err.message} You can read the label instead.`, [["label", "Take a label photo", true], ["manual", "Type it in"]]));
  }
  if (found?.per) {
    const k = (found.servingG || 100) / 100;
    return openFoodForm({
      intro: `Found it in Open Food Facts (barcode ${code}). Check the numbers against the label, then save.`,
      values: {
        name: found.name,
        serving: found.servingG || 100,
        baseUnit: found.liquid ? "ml" : "g",
        calories: found.per[0] * k,
        protein: found.per[1] * k,
        carbs: found.per[2] * k,
        fat: found.per[3] * k,
      },
    });
  }
  state.pendingName = found?.name || "";
  const text = found
    ? `${found.name} is in the free food database, but without nutrition numbers.`
    : `Barcode ${code} isn’t in the free food database yet.`;
  openSheet(msgSheet("Not found", text, [["label", "Take a label photo", true], ["manual", "Type it in"]]));
}

async function onLabelFile(file) {
  openSheet({ mode: "busy", title: "Read label", message: "Getting the label reader ready… The first time downloads about 10 MB, then it’s saved on your phone." });
  try {
    const res = await window.DietScan.readLabel(file, (msg) => {
      const el = $("busyText");
      if (el) el.textContent = msg;
    });
    const got = ["calories", "protein", "carbs", "fat"].filter((k) => res[k] != null).length;
    openFoodForm({
      intro: got === 4 ? "Here’s what the camera read. Check it against the label, then save." : "The camera only got part of the label. Fill in the blanks, then save.",
      ocrText: res.text,
      values: {
        name: state.pendingName,
        serving: res.servingG,
        baseUnit: res.servingUnit === "ml" ? "ml" : "g",
        calories: res.calories,
        protein: res.protein,
        carbs: res.carbs,
        fat: res.fat,
      },
    });
  } catch (err) {
    openSheet(msgSheet("Read label", err.message, [["label", "Try again", true], ["manual", "Type it in"]]));
  }
}

function onSheetAction(act) {
  if (act === "close") return closeSheet();
  if (act === "do-restore") return finishRestore();
  if (act === "rescan") return startScan();
  if (act === "label") return startLabel();
  if (act === "typecode") return openSheet({ mode: "code", title: "Type the barcode" });
  if (act === "manual") return openFoodForm({ values: { name: state.pendingName } });
}

// ---------- Weight ----------

function rateText(rate) {
  return `${rate >= 0 ? "+" : "−"}${Math.abs(rate).toFixed(2)} lb/week`;
}

function renderCheckin(d, date) {
  const ci = S.checkIn(d, date);
  const goal = `+${WEEKLY_GOAL_LB[0]}–${WEEKLY_GOAL_LB[1]} lb/week`;
  const rate = ci.rate != null ? rateText(ci.rate) : null;
  let html = "";
  if (ci.state === "need-weights") {
    html = `<p class="sheet-text">Weigh in at least 3 mornings a week. The check-in compares this week’s average with last week’s, so it needs 3 of each. So far: ${ci.count7} this week, ${ci.prevCount} last week.</p>`;
  } else if (ci.state === "wait") {
    html = `<p class="sheet-text">You changed your targets by ${ci.last.delta > 0 ? "+" : "−"}${fmt(Math.abs(ci.last.delta))} kcal on ${esc(dateLabel(ci.last.date))}. Weight takes about 2 weeks to respond, so the next check-in is ${esc(dateLabel(ci.nextDate))}.${rate ? ` Right now: ${rate}.` : ""}</p>`;
  } else if (ci.state === "need-logs") {
    html = `<p class="sheet-text">${rate ? `You’re gaining ${rate}. ` : ""}Log at least 7 of the last 14 days so the check-in knows what you actually ate. So far: ${ci.logged}.</p>`;
  } else if (ci.state === "eat-more") {
    html = `<p class="sheet-text">You’re gaining ${rate}, below your ${goal} goal. But you averaged ${fmt(ci.ate)} kcal a day against a ${fmt(ci.target)} target. Hit your targets for a week before raising them.</p>`;
  } else if (ci.state === "eat-less") {
    html = `<p class="sheet-text">You’re gaining ${rate}, above your ${goal} goal, and you averaged ${fmt(ci.ate)} kcal a day against a ${fmt(ci.target)} target. Stick to your targets before lowering them.</p>`;
  } else if (ci.state === "on-pace") {
    html = `<p class="sheet-text"><strong class="good-text">✓ On pace.</strong> You’re gaining ${rate} (goal ${goal}) on about ${fmt(ci.ate)} kcal a day. Keep your targets.</p>`;
  } else {
    const t = d.settings.targets;
    const verb = ci.delta > 0 ? "Add" : "Cut";
    const carbs = Math.round(Math.abs(ci.delta) / 4);
    html = `<p class="sheet-text">You’re gaining ${rate}, ${ci.delta > 0 ? "below" : "above"} your ${goal} goal, on about ${fmt(ci.ate)} kcal a day (target ${fmt(ci.target)}).</p>
      <p class="checkin-call">${verb} ${fmt(Math.abs(ci.delta))} kcal a day, all from carbs (${carbs} g).</p>
      <p class="card-sub">Train ${fmt(t.train.calories)} → ${fmt(t.train.calories + ci.delta)} · Rest ${fmt(t.rest.calories)} → ${fmt(t.rest.calories + ci.delta)}</p>
      <button type="button" class="primary-btn" data-apply-checkin="${ci.delta}" data-rate="${ci.rate}">Apply to my targets</button>`;
  }
  if (ci.last && ci.state !== "wait") {
    html += `<p class="card-sub last-change">Last change: ${ci.last.delta > 0 ? "+" : "−"}${fmt(Math.abs(ci.last.delta))} kcal on ${esc(dateLabel(ci.last.date))}.</p>`;
  }
  $("checkinBody").innerHTML = html;
}

function miniStatus(label, st) {
  const mark = st.state === "hit" ? "✓" : st.state === "over" ? "▲" : "▼";
  const word = st.state === "hit" ? "hit" : st.state === "over" ? "over" : "under";
  return `<span class="mini ${st.state}" title="${label} ${word}">${label} ${mark}</span>`;
}

function renderWeeks(d, date) {
  const weeks = S.weekSummaries(d, date, 4);
  const span = (w) => `${S.parseDate(w.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${S.parseDate(w.end).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  $("weeksList").innerHTML = weeks
    .map((w) => {
      if (!w.logged) return `<div class="week-row"><div class="log-name">${span(w)}</div><div class="log-meta">Nothing logged${w.weight != null ? ` · weight avg ${w.weight.toFixed(1)} lb` : ""}</div></div>`;
      return `<div class="week-row">
        <div class="log-name">${span(w)} <span class="log-time">${w.logged} day${w.logged === 1 ? "" : "s"} logged</span></div>
        <div class="log-meta">${fmt(w.calories)} kcal a day (target ${fmt(w.target)}) · ${fmt(w.protein)} P · ${fmt(w.carbs)} C · ${fmt(w.fat)} F</div>
        <div class="log-macros">Protein hit ${w.proteinHits}/${w.logged} days · calories on target ${w.calorieHits}/${w.logged}${w.weight != null ? ` · weight avg ${w.weight.toFixed(1)} lb` : ""}</div>
      </div>`;
    })
    .join("");
}

function renderHistory(d, date) {
  // Keep the days he had opened open after an edit re-renders the list.
  const open = new Set([...document.querySelectorAll("#historyList details.day[open]")].map((el) => el.dataset.date));
  const days = S.pastDays(d, date, 30);
  const list = days.length
    ? days
        .map(
          (s) => `<details class="day" data-date="${esc(s.date)}" ${open.has(s.date) ? "open" : ""}>
            <summary>
              <span class="day-head"><span class="log-name">${esc(dateLabel(s.date))}</span><span class="log-time">${s.type === "rest" ? "Rest" : "Train"}</span></span>
              <span class="day-sum">${fmt(s.totals.calories)} / ${fmt(s.targets.calories)} kcal ${miniStatus("P", s.status.protein)}${miniStatus("C", s.status.carbs)}${miniStatus("F", s.status.fat)}</span>
            </summary>
            <div class="day-body">
              ${entryRowsHtml(s.eaten, s.date)}
              <button type="button" class="ghost-btn" data-add-day="${esc(s.date)}">+ Add food to this day</button>
            </div>
          </details>`,
        )
        .join("")
    : `<p class="empty">No past days logged yet.</p>`;
  $("historyList").innerHTML = `${list}
    <form class="add-past" id="addPastForm">
      <label class="field"><span>Forgot a whole day?</span><input type="date" name="date" max="${esc(S.addDays(date, -1))}" required /></label>
      <button type="submit" class="ghost-btn">Add food to that day</button>
    </form>`;
}

function renderProgress() {
  const d = db();
  const date = today();
  const form = $("weightForm");
  if (!form.date.value) form.date.value = date;
  renderCheckin(d, date);
  renderBackupStatus();
  const st = S.weightStats(d, date);
  let pace = { text: "Needs 2 weeks of weigh-ins", cls: "" };
  if (st.rate != null) {
    if (st.rate < WEEKLY_GOAL_LB[0]) pace = { text: `▼ Slower than +${WEEKLY_GOAL_LB[0]} lb/week`, cls: "is-warn" };
    else if (st.rate > WEEKLY_GOAL_LB[1]) pace = { text: `▲ Faster than +${WEEKLY_GOAL_LB[1]} lb/week`, cls: "is-over" };
    else pace = { text: `✓ On pace (+${WEEKLY_GOAL_LB[0]}–${WEEKLY_GOAL_LB[1]})`, cls: "is-good" };
  }
  const tile = (label, value, note, cls = "") =>
    `<div class="stat-tile ${cls}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`;
  $("weightTiles").innerHTML = [
    tile("Latest", st.latest ? `${st.latest.lb} lb` : "—", st.latest ? dateLabel(st.latest.date) : "No weigh-ins yet"),
    tile("7-day average", st.avg7 != null ? `${st.avg7.toFixed(1)} lb` : "—", st.count7 ? `${st.count7} weigh-in${st.count7 === 1 ? "" : "s"} this week` : "None this week"),
    tile("Weekly change", st.rate != null ? `${st.rate >= 0 ? "+" : "−"}${Math.abs(st.rate).toFixed(2)} lb` : "—", pace.text, pace.cls),
  ].join("");
  renderWeightChart(d, date);
  renderWeeks(d, date);
  renderHistory(d, date);
  $("weighinCount").textContent = `${d.weights.length}`;
  $("weightList").innerHTML = d.weights.length
    ? [...d.weights]
        .reverse()
        .map(
          (w) => `<div class="log-item">
            <div><div class="log-name">${w.lb} lb</div><div class="log-meta">${esc(dateLabel(w.date))}</div></div>
            <button type="button" class="unlog" data-weight-del="${esc(w.date)}" aria-label="Delete weigh-in">×</button>
          </div>`,
        )
        .join("")
    : `<p class="empty">No weigh-ins yet.</p>`;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

function niceStep(range) {
  if (range <= 4) return 1;
  if (range <= 10) return 2;
  return 5;
}

function renderWeightChart(d, date) {
  const box = $("weightChart");
  const from = S.addDays(date, -59);
  const pts = S.weightTrend(d).filter((w) => w.date >= from && w.date <= date);
  box.replaceChildren();
  if (pts.length < 2) {
    box.innerHTML = `<p class="empty">Log at least two weigh-ins to see the trend.</p>`;
    return;
  }
  const W = Math.max(280, box.clientWidth || 600);
  const H = 220;
  const pad = { l: 40, r: 48, t: 14, b: 26 };
  const t0 = S.parseDate(pts[0].date).getTime();
  const t1 = Math.max(S.parseDate(date).getTime(), t0 + 86400000);
  const xOf = (key) => pad.l + ((S.parseDate(key).getTime() - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const vals = pts.flatMap((p) => [p.lb, p.avg]);
  const step = niceStep(Math.max(...vals) - Math.min(...vals) + 1);
  const lo = Math.floor((Math.min(...vals) - 0.5) / step) * step;
  const hi = Math.ceil((Math.max(...vals) + 0.5) / step) * step;
  const yOf = (v) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img" });
  const last = pts[pts.length - 1];
  svg.setAttribute("aria-label", `Weight over the last 60 days. Latest ${last.lb} lb, 7-day average ${last.avg.toFixed(1)} lb.`);
  for (let v = lo; v <= hi + 1e-9; v += step) {
    svg.appendChild(svgEl("line", { x1: pad.l, x2: W - pad.r, y1: yOf(v), y2: yOf(v), class: "grid" }));
    svg.appendChild(svgEl("text", { x: pad.l - 8, y: yOf(v) + 4, "text-anchor": "end", class: "axis" }, String(v)));
  }
  const firstLabel = S.parseDate(pts[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  svg.appendChild(svgEl("text", { x: pad.l, y: H - 6, class: "axis" }, firstLabel));
  svg.appendChild(svgEl("text", { x: W - pad.r, y: H - 6, "text-anchor": "end", class: "axis" }, "Today"));

  const xhair = svgEl("line", { y1: pad.t, y2: H - pad.b, class: "xhair", visibility: "hidden" });
  svg.appendChild(xhair);
  svg.appendChild(svgEl("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${xOf(p.date).toFixed(1)},${yOf(p.avg).toFixed(1)}`).join(""), class: "avg" }));
  for (const p of pts) svg.appendChild(svgEl("circle", { cx: xOf(p.date), cy: yOf(p.lb), r: 4, class: "pt" }));
  svg.appendChild(svgEl("text", { x: xOf(last.date) + 8, y: yOf(last.avg) + 4, class: "end-label" }, last.avg.toFixed(1)));
  const focus = svgEl("circle", { r: 6, class: "pt focus", visibility: "hidden" });
  svg.appendChild(focus);

  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  box.append(svg, tip);

  const show = (e) => {
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let near = pts[0];
    for (const p of pts) if (Math.abs(xOf(p.date) - x) < Math.abs(xOf(near.date) - x)) near = p;
    const px = xOf(near.date);
    xhair.setAttribute("x1", px);
    xhair.setAttribute("x2", px);
    xhair.setAttribute("visibility", "visible");
    focus.setAttribute("cx", px);
    focus.setAttribute("cy", yOf(near.lb));
    focus.setAttribute("visibility", "visible");
    tip.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = `${near.lb} lb`;
    const avg = document.createElement("div");
    avg.textContent = `7-day avg ${near.avg.toFixed(1)}`;
    const when = document.createElement("div");
    when.className = "tip-date";
    when.textContent = dateLabel(near.date);
    tip.append(strong, avg, when);
    tip.hidden = false;
    const left = (px / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(left, 60), rect.width - 60)}px`;
  };
  const hide = () => {
    xhair.setAttribute("visibility", "hidden");
    focus.setAttribute("visibility", "hidden");
    tip.hidden = true;
  };
  svg.addEventListener("pointermove", show);
  svg.addEventListener("pointerdown", show);
  svg.addEventListener("pointerleave", hide);
}

// ---------- Grocery ----------

const BEEF_FATS = ["93/7", "90/10", "85/15", "80/20"];

function isBeefHaul(item) {
  return item.id === "ground-beef" || /ground\s*beef/i.test(item.item || "");
}

function renderGrocery() {
  const g = db().grocery;
  const need = g.items.filter((i) => !i.have).length;
  $("groceryContent").innerHTML = `
    <div class="card">
      <p class="need-count">${need} item${need === 1 ? "" : "s"} still to get · ${g.items.length} on the list</p>
      <input class="grocery-note" id="groceryNote" value="${esc(g.note || "")}" placeholder="Note for this haul" />
      <div id="haulList">
        ${g.items
          .map((i) => {
            const beef = isBeefHaul(i)
              ? `<select data-field="beefFat" class="beef-fat" aria-label="Ground beef fat percent">${BEEF_FATS.map(
                  (f) => `<option value="${f}" ${(i.beefFat || "93/7") === f ? "selected" : ""}>${f}</option>`,
                ).join("")}</select>`
              : "";
            return `<div class="haul-item ${i.have ? "is-have" : ""} ${beef ? "is-beef" : ""}" data-id="${esc(i.id)}">
              <input type="checkbox" data-have ${i.have ? "checked" : ""} aria-label="Have it" />
              <input type="text" data-field="item" value="${esc(i.item)}" aria-label="Item" />
              <input type="text" data-field="amount" value="${esc(i.amount)}" placeholder="Amount" aria-label="Amount" />
              ${beef}
              <button type="button" class="unlog" data-delete aria-label="Remove">×</button>
            </div>`;
          })
          .join("")}
      </div>
      <form id="groceryAddForm" class="grocery-add">
        <input name="item" placeholder="Item" required />
        <input name="amount" placeholder="Amount" />
        <button type="submit" class="primary-btn">Add</button>
      </form>
    </div>
  `;
}

// ---------- Ask ----------

function renderChat() {
  const msgs = db().chats.messages;
  const html =
    !msgs.length && !state.asking
      ? `<div class="empty">Ask anything about food, macros or training. Try “What should I have for dinner?” or “How’s my protein been this week?”</div>`
      : msgs.map((m) => `<div class="bubble ${m.role === "user" ? "user" : "agent"}">${esc(m.content)}</div>`).join("") +
        (state.asking ? `<div class="bubble agent pending">${esc(state.waitNote || "Thinking… the free AI can take up to a minute.")}</div>` : "");
  const el = $("chatLog");
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

async function sendChat(message) {
  const d = db();
  const date = today();
  S.addChat(d, "user", message);
  state.asking = true;
  state.waitNote = "";
  $("chatSend").disabled = true;
  renderChat();
  let reply;
  try {
    reply = await window.DietLLM.ask(d, date, {
      onWait: (secs) => {
        state.waitNote = `The free AI allows one reply every 30 seconds. Waiting ${secs}s, then asking again…`;
        renderChat();
      },
    });
  } catch (err) {
    reply = window.DietLLM.offlineReply(d, date, err.message);
  }
  S.addChat(d, "agent", reply);
  state.asking = false;
  $("chatSend").disabled = false;
  renderChat();
}

// ---------- Setup ----------

const TARGET_FIELDS = [
  ["calories", "Calories", "kcal"],
  ["protein", "Protein", "g"],
  ["carbs", "Carbs", "g"],
  ["fat", "Fat", "g"],
];

function readTargetInputs(type) {
  const form = $("targetsForm");
  const out = {};
  for (const [k] of TARGET_FIELDS) out[k] = Number(form[`${type}-${k}`].value);
  return out;
}

function updateMacroChecks() {
  for (const type of ["train", "rest"]) {
    const t = readTargetInputs(type);
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    const diff = fromMacros - t.calories;
    const el = document.querySelector(`[data-check="${type}"]`);
    const off = Math.abs(diff) > 50;
    el.textContent = `Protein + carbs + fat = ${fmt(fromMacros)} kcal${off ? ` (${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))} vs calories)` : " ✓"}`;
    el.classList.toggle("is-off", off);
  }
}

function renderSetup() {
  const d = db();
  const form = $("targetsForm");
  const t = d.settings.targets;
  $("targetsGrid").innerHTML = ["train", "rest"]
    .map(
      (type) => `<fieldset class="target-col">
        <legend>${type === "train" ? "Train day" : "Rest day"}</legend>
        ${TARGET_FIELDS.map(
          ([k, label, unit]) =>
            `<label class="field inline-field"><span>${label}</span><input type="number" name="${type}-${k}" value="${t[type][k]}" min="0" step="1" inputmode="numeric" /><span>${unit}</span></label>`,
        ).join("")}
        <div class="macro-check" data-check="${type}"></div>
        <button type="button" class="ghost-btn" data-fill-carbs="${type}">Set carbs to fit calories</button>
      </fieldset>`,
    )
    .join("");
  form.kcalWindow.value = d.settings.hit.kcalWindow;
  form.carbFatPct.value = d.settings.hit.carbFatPct;
  updateMacroChecks();

  $("mealsList").innerHTML = d.meals.length
    ? d.meals
        .map(
          (m) => `<div class="setup-row">
            <div><div class="log-name">${esc(m.name)}</div><div class="log-meta">${esc(m.items.map(F.describeItem).join(" · "))}</div></div>
            <button type="button" class="ghost-btn" data-edit-meal="${esc(m.id)}">Edit</button>
          </div>`,
        )
        .join("")
    : `<p class="empty">No meals yet.</p>`;

  $("customList").innerHTML = d.customFoods.length
    ? d.customFoods
        .map((f) => {
          const k = f.servingG / 100;
          return `<div class="setup-row">
            <div><div class="log-name">${esc(f.name)}</div><div class="log-meta">${F.fmtNum(f.servingG)} ${f.baseUnit} serving · ${fmt(f.per[0] * k)} kcal · ${fmt(f.per[1] * k)} P · ${fmt(f.per[2] * k)} C · ${fmt(f.per[3] * k)} F</div></div>
            <div class="row-btns">
              <button type="button" class="ghost-btn" data-edit-food="${esc(f.id)}">Edit</button>
              <button type="button" class="unlog" data-del-food="${esc(f.id)}" aria-label="Delete ${esc(f.name)}">×</button>
            </div>
          </div>`;
        })
        .join("")
    : `<p class="empty">Nothing yet. Scan a barcode on Today and it shows up here.</p>`;
  renderBackupStatus();
}

// ---------- Backup ----------

function backupAge(d) {
  if (!d.lastBackup) return null;
  return S.daysBetween(new Date(d.lastBackup).toLocaleDateString("en-CA"), today());
}

function renderBackupStatus() {
  const d = db();
  const age = backupAge(d);
  const hasData = d.weights.length > 0 || Object.values(d.logs.days).some((day) => day.eaten?.length);
  const due = hasData && (age == null || age >= 7);
  const status = $("backupStatus");
  status.textContent =
    age == null ? "No backup yet." : `Last backup: ${dateLabel(new Date(d.lastBackup).toLocaleDateString("en-CA"))}${age === 0 ? " (today)" : age === 1 ? " (yesterday)" : ` (${age} days ago)`}.`;
  status.classList.toggle("is-due", due);
  const nudge = $("backupNudge");
  nudge.hidden = !due;
  if (due) nudge.textContent = age == null ? "You haven’t backed up your log yet. Tap to back up now →" : `Last backup was ${age} days ago. Tap to back up now →`;
}

// iPhone: the share sheet's "Save to Files" puts it in iCloud Drive. Elsewhere: a download.
async function runBackup() {
  const d = db();
  const name = `diet-hub-backup-${today()}.json`;
  const file = new File([S.exportDb(d)], name, { type: "application/json" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Diet Hub backup" });
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    S.markBackup(d);
  } catch (err) {
    if (err?.name !== "AbortError") openSheet(msgSheet("Backup", `Couldn’t save the backup: ${err.message}`, [["close", "OK", true]]));
  }
  renderBackupStatus();
}

async function onRestoreFile(file) {
  try {
    const obj = JSON.parse(await file.text());
    const info = S.backupSummary(obj);
    if (!obj?.logs?.days) throw new Error("That file isn’t a Diet Hub backup.");
    state.pendingRestore = obj;
    const when = info.exportedAt ? ` from ${dateLabel(new Date(info.exportedAt).toLocaleDateString("en-CA"))}` : "";
    openSheet(
      msgSheet(
        "Restore backup?",
        `This backup${when} has ${info.days} logged day${info.days === 1 ? "" : "s"} and ${info.weights} weigh-in${info.weights === 1 ? "" : "s"}. Restoring replaces everything on this phone with it.`,
        [["do-restore", "Restore it", true], ["close", "Cancel"]],
      ),
    );
  } catch (err) {
    openSheet(msgSheet("Restore", err instanceof SyntaxError ? "That file isn’t a Diet Hub backup." : err.message, [["close", "OK", true]]));
  }
}

function finishRestore() {
  try {
    S.restoreDb(state.pendingRestore);
    state.pendingRestore = null;
    renderGrocery();
    renderChat();
    renderSetup();
    rerenderAfterChange();
    openSheet(msgSheet("Restored", "Your log, weigh-ins, meals, targets and foods are back.", [["close", "OK", true]]));
  } catch (err) {
    openSheet(msgSheet("Restore", err.message, [["close", "OK", true]]));
  }
}

// ---------- Wiring ----------

function bind() {
  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.section)));
  $("themeBtn").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("diet-theme", next);
    if (currentView() === "weight") renderProgress();
  });
  $("dismissInstall").addEventListener("click", () => {
    $("installBanner").hidden = true;
    try {
      localStorage.setItem("diet-hub-install-dismissed", "1");
    } catch {
      /* private mode */
    }
  });

  // Today
  $("dayTypeSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-type]");
    if (!btn) return;
    S.setDayType(db(), today(), btn.dataset.type);
    renderToday();
  });
  $("mealsLeftSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-n]");
    if (!btn) return;
    S.setMealsLeft(db(), today(), Number(btn.dataset.n));
    renderToday();
  });
  $("mealGrid").addEventListener("click", (e) => {
    const meal = e.target.closest("[data-meal]");
    if (meal) return openMeal(meal.dataset.meal);
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "food") openFood(null);
    if (action === "scan") startScan();
  });
  $("quickAdds").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-quick]");
    if (!chip) return;
    const seed = (window.DIET_SEED.quickFoods || []).find((q) => q.food === chip.dataset.quick) || {};
    openFood(chip.dataset.quick, seed);
  });
  $("suggestBody").addEventListener("click", (e) => {
    const use = e.target.closest("[data-use]");
    if (use) openSuggestion(Number(use.dataset.use));
  });
  $("loggedList").addEventListener("click", onEntryListClick);
  $("sayForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("sayInput").value.trim();
    if (text) onSay(text);
  });
  $("checkinNudge").addEventListener("click", () => showView("weight"));

  // Steps
  $("stepsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const steps = Number($("stepsInput").value);
    if (!Number.isFinite(steps) || steps < 0 || $("stepsInput").value === "") return;
    saveSteps(steps, "manual");
  });
  $("healthStepsBtn").addEventListener("click", () => {
    $("healthHelp").hidden = !$("healthHelp").hidden;
  });
  $("runHealthShortcut").addEventListener("click", () => {
    location.href = "shortcuts://run-shortcut?name=Diet%20Hub%20Steps";
  });

  // Sheet
  const sheet = $("sheet");
  sheet.addEventListener("click", (e) => {
    const sh = state.sheet;
    if (e.target === sheet || e.target.closest("[data-close]")) return closeSheet();
    if (!sh) return;
    const act = e.target.closest("[data-act]");
    if (act) return onSheetAction(act.dataset.act);
    const done = e.target.closest("[data-done]");
    if (done) {
      sh.items[Number(done.dataset.done)].doneness = done.dataset.val;
      return renderSheet();
    }
    const remove = e.target.closest("[data-remove]");
    if (remove) {
      sh.items.splice(Number(remove.dataset.remove), 1);
      return renderSheet();
    }
    if (e.target.closest("[data-save-log]")) return saveLog();
    if (e.target.closest("[data-save-meal]")) return saveMealTemplate();
    if (e.target.closest("[data-delete-entry]")) {
      S.removeEntry(db(), sh.date || today(), sh.entryId);
      closeSheet();
      return rerenderAfterChange();
    }
    if (e.target.closest("[data-delete-meal]")) {
      S.removeMeal(db(), sh.mealId);
      closeSheet();
      renderSetup();
      return renderToday();
    }
  });
  sheet.addEventListener("input", (e) => {
    const sh = state.sheet;
    if (!sh) return;
    if (e.target.matches("[data-amount]")) {
      const v = e.target.value;
      sh.items[Number(e.target.dataset.amount)].amount = v === "" ? "" : Number(v);
      updateSheetTotals();
    }
    if (e.target.id === "mealNameInput") sh.name = e.target.value;
  });
  sheet.addEventListener("change", (e) => {
    const sh = state.sheet;
    if (!sh) return;
    if (e.target.matches("[data-unit]")) {
      const item = sh.items[Number(e.target.dataset.unit)];
      const food = F.getFood(item.food);
      item.amount = convertAmount(food, item.amount, item.unit, e.target.value);
      item.unit = e.target.value;
      return renderSheet();
    }
    if (e.target.matches("[data-variant]")) {
      sh.items[Number(e.target.dataset.variant)].food = e.target.value;
      return renderSheet();
    }
    if (e.target.id === "addFoodSelect" && e.target.value) {
      sh.items.push(S.foodItem(db(), e.target.value));
      return renderSheet();
    }
  });
  sheet.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "foodForm") return saveFoodForm(e.target);
    if (e.target.id === "codeForm") {
      const code = String(new FormData(e.target).get("code") || "").replace(/\D/g, "");
      if (code.length >= 6) handleBarcode(code);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.sheet) closeSheet();
  });
  $("scanInput").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) onScanFile(file);
  });
  $("labelInput").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) onLabelFile(file);
  });

  // Weight
  $("weightForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      S.setWeight(db(), form.date.value, form.lb.value);
      form.lb.value = "";
      renderProgress();
    } catch (err) {
      form.lb.setCustomValidity(err.message);
      form.lb.reportValidity();
      form.lb.setCustomValidity("");
    }
  });
  $("checkinBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-apply-checkin]");
    if (!btn) return;
    S.applyCheckin(db(), today(), Number(btn.dataset.applyCheckin), Number(btn.dataset.rate));
    rerenderAfterChange();
    renderSetup();
  });
  $("historyList").addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-day]");
    if (add) return openFood(null, {}, add.dataset.addDay);
    onEntryListClick(e);
  });
  $("historyList").addEventListener("submit", (e) => {
    if (e.target.id !== "addPastForm") return;
    e.preventDefault();
    const date = e.target.date.value;
    if (date && date < today()) openFood(null, {}, date);
  });
  $("weightList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-weight-del]");
    if (!del) return;
    S.removeWeight(db(), del.dataset.weightDel);
    renderProgress();
  });

  // Grocery
  $("groceryContent").addEventListener("change", (e) => {
    if (e.target.id === "groceryNote") return S.setGroceryNote(db(), e.target.value);
    const row = e.target.closest(".haul-item");
    if (!row) return;
    if (e.target.matches("[data-have]")) S.updateGroceryItem(db(), row.dataset.id, { have: e.target.checked });
    else if (e.target.matches("[data-field]")) S.updateGroceryItem(db(), row.dataset.id, { [e.target.dataset.field]: e.target.value });
    renderGrocery();
  });
  $("groceryContent").addEventListener("click", (e) => {
    const del = e.target.closest("[data-delete]");
    if (!del) return;
    S.removeGroceryItem(db(), del.closest(".haul-item").dataset.id);
    renderGrocery();
  });
  $("groceryContent").addEventListener("submit", (e) => {
    if (e.target.id !== "groceryAddForm") return;
    e.preventDefault();
    const fd = new FormData(e.target);
    S.addGroceryItem(db(), fd.get("item"), fd.get("amount"));
    renderGrocery();
  });

  // Ask
  $("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const message = $("chatInput").value.trim();
    if (!message || state.asking) return;
    $("chatInput").value = "";
    sendChat(message);
  });
  $("clearChatBtn").addEventListener("click", () => {
    if (state.asking) return;
    S.clearChats(db());
    renderChat();
  });

  // Setup
  $("targetsForm").addEventListener("input", updateMacroChecks);
  $("targetsForm").addEventListener("click", (e) => {
    const fill = e.target.closest("[data-fill-carbs]");
    if (!fill) return;
    const type = fill.dataset.fillCarbs;
    const t = readTargetInputs(type);
    $("targetsForm")[`${type}-carbs`].value = Math.max(0, Math.round((t.calories - t.protein * 4 - t.fat * 9) / 4));
    updateMacroChecks();
  });
  $("targetsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const status = $("targetsStatus");
    try {
      S.saveSettings(db(), {
        targets: { train: readTargetInputs("train"), rest: readTargetInputs("rest") },
        hit: { kcalWindow: form.kcalWindow.value, carbFatPct: form.carbFatPct.value },
      });
      status.textContent = "Saved.";
      status.classList.remove("is-error");
      renderToday();
    } catch (err) {
      status.textContent = err.message;
      status.classList.add("is-error");
    }
    status.hidden = false;
  });
  $("mealsList").addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit-meal]");
    if (edit) openMealEditor(edit.dataset.editMeal);
  });
  $("addMealBtn").addEventListener("click", () => openMealEditor(null));
  $("customList").addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit-food]");
    if (edit) return openFoodForm({ foodId: edit.dataset.editFood });
    const del = e.target.closest("[data-del-food]");
    if (del) {
      S.removeCustomFood(db(), del.dataset.delFood);
      renderSetup();
      renderToday();
    }
  });
  $("backupBtn").addEventListener("click", runBackup);
  $("backupNudge").addEventListener("click", runBackup);
  $("restoreBtn").addEventListener("click", () => {
    $("restoreInput").value = "";
    $("restoreInput").click();
  });
  $("restoreInput").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) onRestoreFile(file);
  });
  $("addCustomBtn").addEventListener("click", () => {
    state.pendingCode = null;
    state.pendingName = "";
    openFoodForm({ logAfter: false });
  });

  // Coming back to the app the next morning: start a fresh day.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (today() !== state.renderedDate) renderToday();
    if (currentView() === "weight") renderProgress();
  });
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentView() === "weight") renderWeightChart(db(), today());
    }, 150);
  });
}

function boot() {
  applyTheme();
  bind();
  db();
  renderGrocery();
  renderChat();
  const incoming = stepsFromUrl();
  if (incoming != null) {
    saveSteps(incoming, "health");
    clearStepsFromUrl();
    showView("today");
  } else {
    showView(localStorage.getItem("diet-hub-view") || "today");
  }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  if (ios && !standalone && !localStorage.getItem("diet-hub-install-dismissed")) $("installBanner").hidden = false;
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((reg) => reg.unregister()));
  }
}

try {
  boot();
} catch (err) {
  $("metaLine").textContent = err.message;
  console.error(err);
}
