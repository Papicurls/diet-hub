const DATE = new Date().toLocaleDateString("en-CA");

const state = {
  plan: null,
  grocery: null,
  today: null,
  messages: [],
  asking: false,
  foodEstimate: null,
};

function $(id) {
  return document.getElementById(id);
}

async function api(path, opts) {
  return window.DietStore.api(path, opts);
}

function round(n) {
  return Math.round(Number(n) || 0);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function applyTheme() {
  const saved = localStorage.getItem("diet-theme");
  if (saved) document.documentElement.dataset.theme = saved;
}

const VIEWS = ["today", "grocery", "plan", "agent"];

function showView(name) {
  if (!VIEWS.includes(name)) name = "today";
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.hidden = el.id !== `view-${name}`;
  });
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.section === name);
  });
  try {
    localStorage.setItem("diet-hub-view", name);
  } catch {
    /* private mode */
  }
}

function guessDayType() {
  const d = new Date().getDay();
  return d === 0 || d === 6 ? "rest" : "train";
}

function stepsFromUrl() {
  const params = new URLSearchParams(location.search);
  let raw = params.get("steps");
  if (raw == null && location.hash) {
    raw = new URLSearchParams(location.hash.replace(/^#/, "")).get("steps");
  }
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

function renderSteps() {
  const t = state.today;
  if (!$("stepsValue")) return;
  const goal = t?.stepGoal || 10000;
  const steps = t?.steps;
  const have = steps != null && Number.isFinite(Number(steps));
  const n = have ? round(steps) : 0;
  const left = Math.max(0, goal - n);
  const pct = Math.min(100, goal ? (n / goal) * 100 : 0);
  $("stepsValue").textContent = have ? n.toLocaleString() : "—";
  $("stepsNote").textContent = have
    ? `${t.stepsSource === "health" ? "Health" : "logged"} · ${left ? left.toLocaleString() + " left" : "goal"}`
    : "tap to log";
  $("stepsFill").style.width = `${pct}%`;
  $("stepsFill").classList.toggle("is-over", n >= goal);
  $("stepsBarValue").textContent = `${have ? n.toLocaleString() : 0} / ${goal.toLocaleString()}`;
  if ($("stepsInput") && have && document.activeElement !== $("stepsInput")) {
    $("stepsInput").value = String(n);
  }
}

async function saveSteps(steps, source) {
  state.today = await api("/api/today/steps", {
    method: "POST",
    body: JSON.stringify({ date: DATE, steps, source }),
  });
  renderSteps();
  if (state.today?.type) renderToday();
}

function renderGate() {
  const gate = $("dayGate");
  const body = $("todayBody");
  const hasType = Boolean(state.today?.type);
  gate.hidden = hasType;
  if (body) body.hidden = !hasType;
  $("gateKicker").textContent = hasType
    ? `${DATE} · currently ${state.today.type}`
    : DATE;
}

function renderToday() {
  const t = state.today;
  if (!t?.type) {
    $("todayTitle").textContent = "Today";
    $("statTiles").innerHTML = "";
    $("macroBars").innerHTML = "";
    $("plannedList").innerHTML = "";
    $("loggedList").innerHTML = "";
    return;
  }

  const label = t.type === "train" ? "Train day" : "Rest day";
  $("todayTitle").textContent = `${label} · ${DATE}`;
  $("todaySub").textContent = t.template.role;
  $("metaLine").textContent = `${label} · target ${t.targets.calories.toLocaleString()} kcal`;
  if ($("changeDayBtn")) {
    $("changeDayBtn").textContent = t.type === "train" ? "Switch to rest day" : "Switch to train day";
  }

  const eaten = round(t.totals.calories);
  const need = t.targets.calories;
  const left = round(t.remaining.calories);
  const over = left < 0;

  $("statTiles").innerHTML = [
    ["Eaten", eaten.toLocaleString(), "kcal so far"],
    ["Target", need.toLocaleString(), t.type === "train" ? "lift day" : "rest day"],
    ["Left", Math.abs(left).toLocaleString(), over ? "over target" : "still to eat", over ? "is-over" : left <= 200 ? "is-good" : ""],
    ["Protein", `${round(t.totals.protein)} / ${t.targets.protein}g`, `${round(t.remaining.protein)}g left`],
  ]
    .map(
      ([label, value, note, cls]) =>
        `<div class="stat-tile ${cls || ""}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`,
    )
    .join("");

  const macros = [
    ["Protein", "p", t.totals.protein, t.targets.protein],
    ["Carbs", "c", t.totals.carbs, t.targets.carbs],
    ["Fat", "f", t.totals.fat, t.targets.fat],
  ];
  $("macroBars").innerHTML = macros
    .map(([label, cls, have, want]) => {
      const pct = Math.min(100, want ? (have / want) * 100 : 0);
      const overBar = have > want + 5;
      return `<div class="bar-row"><div class="bar-label">${label}</div><div class="bar-track"><div class="bar-fill ${cls} ${overBar ? "is-over" : ""}" style="width:${pct}%"></div></div><div class="bar-value">${round(have)} / ${want}g</div></div>`;
    })
    .join("");

  const eatenIds = new Set((t.eaten || []).filter((x) => x.kind === "planned").map((x) => x.mealId));
  $("plannedSub").textContent = "Check the box if you ate it as written. Ate different if the amount changed — leftover or extra goes to the next meal.";
  const meals = t.displayMeals || t.template.meals;
  $("plannedList").innerHTML = meals
    .map((m) => {
      const eatenMeal = eatenIds.has(m.id);
      const note = m.adjusted && !eatenMeal
        ? `<div class="meal-shift">${escapeHtml(m.adjustNote)}</div>`
        : "";
      const swap = eatenMeal
        ? ""
        : `<button type="button" class="ghost-btn meal-swap" data-swap="${m.id}">Ate different</button>
        <form class="swap-form" data-swap-form="${m.id}" hidden>
          <input name="name" placeholder="${escapeHtml(m.food)}" required />
          <div class="extra-row">
            <input name="amount" type="number" min="0" step="any" placeholder="Amount" />
            <select name="unit">
              <option value="g">grams</option>
              <option value="ml">ml</option>
              <option value="oz">oz</option>
              <option value="piece">piece / egg</option>
            </select>
            <select name="doneness">
              <option value="cooked" selected>cooked</option>
              <option value="raw">uncooked</option>
            </select>
          </div>
          <div class="extra-row extra-macros">
            <input name="calories" type="number" min="0" step="1" placeholder="kcal" />
            <input name="protein" type="number" min="0" step="0.1" placeholder="P" />
            <input name="carbs" type="number" min="0" step="0.1" placeholder="C" />
            <input name="fat" type="number" min="0" step="0.1" placeholder="F" />
            <button type="submit" class="primary-btn">Log this instead</button>
          </div>
        </form>`;
      return `<div class="meal ${eatenMeal ? "is-eaten" : ""} ${m.adjusted && !eatenMeal ? "is-shifted" : ""}">
        <button class="check" data-meal="${m.id}" ${eatenMeal ? "disabled" : ""} aria-label="Log ${m.name}"></button>
        <div>
          <div class="meal-name">${escapeHtml(m.name)}</div>
          <div class="meal-food">${escapeHtml(m.food)}</div>
          <div class="meal-kcal">${m.calories} kcal · P${m.protein} C${m.carbs} F${m.fat} · ${escapeHtml(m.when)}</div>
          ${note}
          ${swap}
        </div>
      </div>`;
    })
    .join("");

  const eatenList = t.eaten || [];
  $("loggedList").innerHTML = eatenList.length
    ? eatenList
        .map(
          (x) => `<div class="log-item">
            <div><div class="log-name">${escapeHtml(x.name)}</div><div class="log-meta">${x.calories} kcal · P${round(x.protein)} C${round(x.carbs)} F${round(x.fat)}${x.kind === "extra" ? " · extra" : x.changed ? " · changed" : ""}</div></div>
            <button class="unlog" data-id="${x.id}" aria-label="Remove">×</button>
          </div>`,
        )
        .join("")
    : `<div class="empty">Nothing logged yet.</div>`;
}

function mealEditor(dayKey, meal) {
  return `<div class="plan-meal-edit" data-day="${dayKey}" data-id="${escapeHtml(meal.id)}">
    <div class="edit-row">
      <input data-field="name" value="${escapeHtml(meal.name)}" placeholder="Meal name" />
      <input data-field="when" value="${escapeHtml(meal.when)}" placeholder="When" />
      <button type="button" class="danger-btn" data-remove>Remove</button>
    </div>
    <textarea data-field="food" placeholder="Food">${escapeHtml(meal.food)}</textarea>
    <div class="edit-row macro-inputs">
      <input data-field="calories" type="number" min="0" value="${meal.calories}" placeholder="kcal" />
      <input data-field="protein" type="number" min="0" value="${meal.protein}" placeholder="P" />
      <input data-field="carbs" type="number" min="0" value="${meal.carbs}" placeholder="C" />
      <input data-field="fat" type="number" min="0" value="${meal.fat}" placeholder="F" />
    </div>
  </div>`;
}

function renderPlan() {
  const plan = state.plan;
  if (!plan) return;
  const dayCard = (key) => {
    const d = plan.days[key];
    return `<div class="card" data-day-card="${key}">
      <div class="kicker">${escapeHtml(d.label)} · ${d.countPerWeek}× / week</div>
      <h2>${d.calories.toLocaleString()} kcal</h2>
      <p class="card-sub">P ${d.protein}g · C ${d.carbs}g · F ${d.fat}g</p>
      <input data-day-role="${key}" value="${escapeHtml(d.role)}" placeholder="Day role" style="width:100%;margin-bottom:12px" />
      <div data-meals="${key}">${d.meals.map((m) => mealEditor(key, m)).join("")}</div>
      <button type="button" class="add-meal-btn" data-add-meal="${key}">Add meal</button>
    </div>`;
  };
  $("planContent").innerHTML = `
    <div class="plan-grid">${dayCard("train")}${dayCard("rest")}</div>
    <div class="card" style="margin-top:16px">
      <h2>Rules</h2>
      <p class="card-sub">${escapeHtml(plan.profile.height)} · ${plan.profile.weightLb[0]}–${plan.profile.weightLb[1]} lb · ${escapeHtml(plan.profile.bodyFat)} · maintenance ~${plan.targets.maintenanceKcal}. One rule per line.</p>
      <textarea class="rules-edit" id="rulesEdit">${escapeHtml((plan.rules || []).join("\n"))}</textarea>
    </div>
  `;
}

function collectPlanFromDom() {
  const days = {};
  for (const key of ["train", "rest"]) {
    const meals = [...document.querySelectorAll(`.plan-meal-edit[data-day="${key}"]`)].map((el) => {
      const val = (field) => el.querySelector(`[data-field="${field}"]`)?.value ?? "";
      return {
        id: el.dataset.id,
        name: val("name"),
        when: val("when"),
        food: val("food"),
        calories: Number(val("calories") || 0),
        protein: Number(val("protein") || 0),
        carbs: Number(val("carbs") || 0),
        fat: Number(val("fat") || 0),
      };
    });
    days[key] = {
      meals,
      role: document.querySelector(`[data-day-role="${key}"]`)?.value,
    };
  }
  const rules = ($("rulesEdit")?.value || "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  return { days, rules };
}

function renderGrocery() {
  const g = state.grocery;
  if (!g) return;
  const need = (g.items || []).filter((i) => !i.have).length;
  $("groceryContent").innerHTML = `
    <div class="card">
      <p class="need-count">${need} item${need === 1 ? "" : "s"} still to get · ${(g.items || []).length} on the list</p>
      <input class="grocery-note" id="groceryNote" value="${escapeHtml(g.note || "")}" placeholder="Note for this haul" />
      <div id="haulList">
        ${(g.items || [])
          .map(
            (i) => `<div class="haul-item ${i.have ? "is-have" : ""}" data-id="${escapeHtml(i.id)}">
              <input type="checkbox" data-have ${i.have ? "checked" : ""} />
              <input type="text" data-field="item" value="${escapeHtml(i.item)}" />
              <input type="text" data-field="amount" value="${escapeHtml(i.amount)}" />
              <button type="button" class="unlog" data-delete aria-label="Remove">×</button>
            </div>`,
          )
          .join("")}
      </div>
      <form id="groceryAddForm" class="grocery-add">
        <input name="item" placeholder="Item" required />
        <input name="amount" placeholder="Amount" required />
        <button type="submit" class="primary-btn">Add</button>
      </form>
    </div>
  `;
}

function renderChat() {
  const html =
    !state.messages.length && !state.asking
      ? `<div class="empty">Ask anything. Diet, lifting, or random. Example: “I ate 200 g chicken instead of the plan — what’s left today?”</div>`
      : state.messages
          .map((m) => `<div class="bubble ${m.role === "user" ? "user" : "agent"}">${escapeHtml(m.content)}</div>`)
          .join("") + (state.asking ? `<div class="bubble agent pending">Thinking…</div>` : "");
  const el = $("chatLog");
  if (el) {
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }
}

async function loadToday() {
  state.today = await api(`/api/today?date=${DATE}`);
  renderGate();
  renderSteps();
  renderToday();
}

async function pickType(type) {
  state.today = await api("/api/today/type", {
    method: "POST",
    body: JSON.stringify({ date: DATE, type }),
  });
  renderGate();
  renderSteps();
  renderToday();
}

async function eatPlanned(mealId) {
  state.today = await api("/api/today/eat", {
    method: "POST",
    body: JSON.stringify({ date: DATE, mealId }),
  });
  renderToday();
}

async function fillFoodEstimate(formEl) {
  const form = formEl || $("extraForm");
  const fd = new FormData(form);
  const box = form.id === "extraForm" ? $("foodEstimate") : form.querySelector(".food-estimate");
  const est = await window.DietFoods.estimateFood({
    name: fd.get("name"),
    amount: fd.get("amount"),
    unit: fd.get("unit"),
    doneness: fd.get("doneness"),
  });
  state.foodEstimate = est;
  if (form.calories) form.calories.value = est.calories;
  if (form.protein) form.protein.value = est.protein;
  if (form.carbs) form.carbs.value = est.carbs;
  if (form.fat) form.fat.value = est.fat;
  if (box) {
    box.hidden = false;
    const cook = est.doneness === "uncooked" && est.cookedEquivG
      ? `${est.grams} g uncooked ≈ ${est.cookedEquivG} g cooked`
      : `${est.grams} g ${est.doneness || "cooked"}`;
    box.textContent = `${est.name} · ${cook} → ${est.calories} kcal · P ${est.protein}g · C ${est.carbs}g · F ${est.fat}g`;
  }
  return est;
}

async function eatExtra(fields) {
  state.today = await api("/api/today/eat", {
    method: "POST",
    body: JSON.stringify({ date: DATE, ...fields }),
  });
  renderToday();
}

async function logFoodFromForm(form, extra = {}) {
  const fd = new FormData(form);
  let calories = Number(fd.get("calories"));
  let protein = Number(fd.get("protein") || 0);
  let carbs = Number(fd.get("carbs") || 0);
  let fat = Number(fd.get("fat") || 0);
  if (!Number.isFinite(calories) || calories <= 0) {
    const est = await fillFoodEstimate(form);
    calories = est.calories;
    protein = est.protein;
    carbs = est.carbs;
    fat = est.fat;
  }
  const amount = fd.get("amount");
  const unit = fd.get("unit") || "g";
  const doneness = String(fd.get("doneness") || "cooked");
  const name = String(fd.get("name") || "").trim();
  const weighable = ["g", "oz", "lb"].includes(String(unit));
  const cookBit = weighable ? (doneness === "raw" ? "uncooked" : "cooked") : "";
  const label = amount ? `${name} · ${amount} ${unit}${cookBit ? " " + cookBit : ""}` : name;
  await eatExtra({ name: label, food: label, calories, protein, carbs, fat, ...extra });
  if (form.id === "extraForm") form.reset();
  state.foodEstimate = null;
  if (form.id === "extraForm" && $("foodEstimate")) $("foodEstimate").hidden = true;
}

async function logQuickFood(btn) {
  const form = $("extraForm");
  form.name.value = btn.dataset.food;
  form.amount.value = btn.dataset.amount;
  form.unit.value = btn.dataset.unit;
  if (form.doneness && btn.dataset.doneness === "raw") form.doneness.value = "raw";
  else if (form.doneness && (btn.dataset.doneness === "cooked" || !btn.dataset.doneness)) form.doneness.value = "cooked";
  form.calories.value = "";
  try {
    await logFoodFromForm(form);
  } catch (err) {
    const box = $("foodEstimate");
    if (box) {
      box.hidden = false;
      box.textContent = err.message;
    }
  }
}

async function uneat(id) {
  state.today = await api("/api/today/uneat", {
    method: "POST",
    body: JSON.stringify({ date: DATE, id }),
  });
  renderToday();
}

async function savePlan() {
  const status = $("planSaveStatus");
  status.hidden = false;
  status.classList.remove("is-error");
  status.textContent = "Saving…";
  try {
    state.plan = await api("/api/plan", {
      method: "PUT",
      body: JSON.stringify(collectPlanFromDom()),
    });
    renderPlan();
    await loadToday();
    status.textContent = "Plan saved. Today’s meals and calories updated.";
  } catch (err) {
    status.classList.add("is-error");
    status.textContent = err.message;
  }
}

async function persistGroceryNote() {
  const note = $("groceryNote")?.value ?? state.grocery.note;
  state.grocery = await api("/api/grocery", {
    method: "PUT",
    body: JSON.stringify({ note, items: state.grocery.items }),
  });
}

async function updateGroceryItem(id, patch) {
  state.grocery = await api("/api/grocery/item/update", {
    method: "POST",
    body: JSON.stringify({ id, ...patch }),
  });
  renderGrocery();
}

async function sendChat(message) {
  state.messages.push({ role: "user", content: message });
  state.asking = true;
  renderChat();
  try {
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ date: DATE, message }),
    });
    state.messages = data.messages;
    if (data.plan) {
      state.plan = data.plan;
      renderPlan();
    }
    if (data.grocery) {
      state.grocery = data.grocery;
      renderGrocery();
    }
    if (data.applied?.length) await loadToday();
  } catch (err) {
    state.messages.push({
      role: "agent",
      content: `Couldn't reach the agent: ${err.message}`,
    });
  } finally {
    state.asking = false;
    renderChat();
  }
}

function bind() {
  $("pickTrain").addEventListener("click", () => pickType("train"));
  $("pickRest").addEventListener("click", () => pickType("rest"));
  $("stepsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const steps = Number($("stepsInput").value);
    if (!Number.isFinite(steps) || steps < 0) return;
    await saveSteps(steps, "manual");
  });
  $("healthStepsBtn").addEventListener("click", () => {
    const help = $("healthHelp");
    help.hidden = !help.hidden;
  });
  $("runHealthShortcut").addEventListener("click", () => {
    location.href = "shortcuts://run-shortcut?name=Diet%20Hub%20Steps";
  });
  const dismiss = $("dismissInstall");
  if (dismiss) dismiss.addEventListener("click", () => { $("installBanner").hidden = true; });
  $("switchDayBtn").addEventListener("click", () => {
    showView("today");
    if (state.today?.type) {
      pickType(state.today.type === "train" ? "rest" : "train");
      return;
    }
    $("dayGate").hidden = false;
    if ($("todayBody")) $("todayBody").hidden = true;
  });
  $("changeDayBtn").addEventListener("click", () => {
    const next = state.today?.type === "train" ? "rest" : "train";
    pickType(next);
  });
  $("estimateFoodBtn").addEventListener("click", async () => {
    try {
      await fillFoodEstimate();
    } catch (err) {
      const box = $("foodEstimate");
      if (box) {
        box.hidden = false;
        box.textContent = err.message;
      }
    }
  });
  $("themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("diet-theme", next);
  });
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.section));
  });
  $("plannedList").addEventListener("click", (e) => {
    const swap = e.target.closest("[data-swap]");
    if (swap) {
      const form = $("plannedList").querySelector(`[data-swap-form="${swap.dataset.swap}"]`);
      if (form) form.hidden = !form.hidden;
      return;
    }
    const btn = e.target.closest("[data-meal]");
    if (btn && !btn.disabled) eatPlanned(btn.dataset.meal);
  });
  $("plannedList").addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-swap-form]");
    if (!form) return;
    e.preventDefault();
    try {
      await logFoodFromForm(form, { mealId: form.dataset.swapForm });
    } catch (err) {
      form.hidden = false;
      const hint = form.querySelector(".swap-error") || document.createElement("div");
      hint.className = "swap-error";
      hint.textContent = err.message;
      form.prepend(hint);
    }
  });
  $("loggedList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (btn) uneat(btn.dataset.id);
  });
  $("extraForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await logFoodFromForm(e.target);
    } catch (err) {
      const box = $("foodEstimate");
      if (box) {
        box.hidden = false;
        box.textContent = err.message;
      }
    }
  });
  $("quickAdds")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-food]");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      await logQuickFood(btn);
    } finally {
      btn.disabled = false;
    }
  });

  const onChatSubmit = (inputId) => async (e) => {
    e.preventDefault();
    const input = $(inputId);
    const message = input.value.trim();
    if (!message || state.asking) return;
    input.value = "";
    await sendChat(message);
  };
  $("chatForm").addEventListener("submit", onChatSubmit("chatInput"));
  $("clearChatBtn").addEventListener("click", async () => {
    await api("/api/chat/clear", { method: "POST", body: "{}" });
    state.messages = [];
    renderChat();
  });

  $("savePlanBtn").addEventListener("click", savePlan);
  $("planContent").addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-meal]");
    if (add) {
      const day = add.dataset.addMeal;
      const wrap = document.querySelector(`[data-meals="${day}"]`);
      wrap.insertAdjacentHTML(
        "beforeend",
        mealEditor(day, {
          id: `${day}-new-${Date.now()}`,
          name: "New meal",
          when: "",
          food: "",
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        }),
      );
      return;
    }
    const remove = e.target.closest("[data-remove]");
    if (remove) {
      const block = remove.closest(".plan-meal-edit");
      const day = block.dataset.day;
      const count = document.querySelectorAll(`.plan-meal-edit[data-day="${day}"]`).length;
      if (count > 1) block.remove();
    }
  });

  $("groceryContent").addEventListener("change", async (e) => {
    const row = e.target.closest(".haul-item");
    if (!row) return;
    if (e.target.matches("[data-have]")) {
      await updateGroceryItem(row.dataset.id, { have: e.target.checked });
      return;
    }
    if (e.target.matches("[data-field]")) {
      await updateGroceryItem(row.dataset.id, { [e.target.dataset.field]: e.target.value });
    }
  });
  $("groceryContent").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-delete]");
    if (!del) return;
    const row = del.closest(".haul-item");
    state.grocery = await api("/api/grocery/item/delete", {
      method: "POST",
      body: JSON.stringify({ id: row.dataset.id }),
    });
    renderGrocery();
  });
  $("groceryContent").addEventListener("change", async (e) => {
    if (e.target.id === "groceryNote") await persistGroceryNote();
  });
  $("groceryContent").addEventListener("submit", async (e) => {
    if (e.target.id !== "groceryAddForm") return;
    e.preventDefault();
    const fd = new FormData(e.target);
    state.grocery = await api("/api/grocery/item", {
      method: "POST",
      body: JSON.stringify({ item: fd.get("item"), amount: fd.get("amount"), have: false, category: "other" }),
    });
    renderGrocery();
  });
}

async function boot() {
  applyTheme();
  bind();
  if (!window.DietStore) throw new Error("App failed to load. Refresh.");
  state.plan = await api("/api/plan");
  state.grocery = await api("/api/grocery");
  renderPlan();
  renderGrocery();
  await loadToday();
  if (!state.today?.type) await pickType(guessDayType());
  const incoming = stepsFromUrl();
  if (incoming != null) {
    await saveSteps(incoming, "health");
    clearStepsFromUrl();
    showView("today");
  } else {
    showView(localStorage.getItem("diet-hub-view") || "today");
  }
  try {
    state.messages = await api("/api/chat");
  } catch {
    state.messages = [];
  }
  renderChat();
  if ($("metaLine").textContent === "loading…") {
    $("metaLine").textContent = "Today opens first. Switch train/rest in the header.";
  }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const banner = document.getElementById("installBanner");
  if (banner && ios && !standalone) banner.hidden = false;
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
  }
}

boot().catch((err) => {
  $("metaLine").textContent = err.message;
});
