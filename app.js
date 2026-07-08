/* ============================================================
   Do It — application script (STEP 1: data model + storage)

   This step establishes:
     - the todo data model and category definitions,
     - the in-memory app state,
     - a persistence module (loadTodos / saveTodos) encapsulating
       localStorage so it can later be swapped for a server KV store,
     - a toast helper for user-facing errors,
     - app initialization that restores saved todos on load.

   Feature logic (add/edit/complete/filter/progress) arrives in later steps.
   ============================================================ */

"use strict";

/* ---------- Data model & constants ------------------------------------ */

/**
 * A todo is a plain object:
 *   { id: string, title: string, category: CategoryKey,
 *     completed: boolean, createdAt: string (ISO 8601) }
 */

/** Category definitions: key -> Korean label + CSS color variable. */
const CATEGORIES = {
    work:     { label: "업무", colorVar: "--color-work" },
    personal: { label: "개인", colorVar: "--color-personal" },
    study:    { label: "학습", colorVar: "--color-study" },
};

/** Default category applied when adding a todo. */
const DEFAULT_CATEGORY = "work";

/** Filter tabs, in display order. "all" shows every category. */
const FILTERS = [
    { key: "all", label: "전체" },
    { key: "work", label: "업무" },
    { key: "personal", label: "개인" },
    { key: "study", label: "학습" },
];

/**
 * Keywords used to auto-classify a todo by its title.
 * Matching is case-insensitive substring matching; the category with the
 * most keyword hits wins. Keep entries multi-character to avoid false
 * positives from short substrings.
 */
const CATEGORY_KEYWORDS = {
    work: [
        "회의", "미팅", "보고서", "보고", "업무", "프로젝트", "기획", "발표",
        "이메일", "메일", "결재", "계약", "출장", "고객", "거래처", "클라이언트",
        "마감", "검토", "리뷰", "문서", "회사", "report", "meeting", "deadline",
    ],
    personal: [
        "장보기", "쇼핑", "마트", "운동", "헬스", "산책", "병원", "약속",
        "청소", "빨래", "세탁", "요리", "은행", "가족", "친구", "생일",
        "여행", "예약", "미용실", "점심", "저녁", "강아지", "반려",
    ],
    study: [
        "공부", "학습", "강의", "인강", "수업", "시험", "과제", "숫제",
        "복습", "예습", "영어", "단어", "독서", "자격증", "토익", "수학",
        "코딩", "알고리즘", "논문", "study", "exam",
    ],
};

/** localStorage key under which the todo list is persisted. */
const STORAGE_KEY = "do-it.todos.v1";

/** Maximum length allowed for a todo title. */
const MAX_TITLE_LENGTH = 80;

/* ---------- App state ------------------------------------------------- */

/** In-memory list of todos (source of truth while the app is running). */
let todos = [];

/** Current category filter: "all" | "work" | "personal" | "study". */
let currentFilter = "all";

/** Category currently selected in the add form (default: 업무). */
let selectedCategory = DEFAULT_CATEGORY;

/** Id of the todo currently being edited inline, or null. */
let editingId = null;

/* ---------- Persistence module ---------------------------------------- */
/* Only loadTodos() and saveTodos() are used by the rest of the app.
   The storage mechanism (localStorage + JSON) is confined to this section,
   so migrating to a server KV store later means changing only these two. */

/**
 * Load the persisted todo list.
 * Returns an empty array if nothing is stored or the stored data is corrupt,
 * so a bad payload never crashes the app.
 * @returns {Array<Object>}
 */
function loadTodos() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        // Guard against non-array payloads (corrupted or tampered data).
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        // Corrupted JSON or storage access error: recover with an empty list.
        console.error("Failed to load todos; starting empty.", err);
        return [];
    }
}

/**
 * Persist the given todo list immediately (auto-save).
 * On failure (e.g. quota exceeded), notify the user via a toast.
 * @param {Array<Object>} list
 */
function saveTodos(list) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
        console.error("Failed to save todos.", err);
        showToast("저장에 실패했어요. 다시 시도해주세요.");
    }
}

/* ---------- UI helpers ------------------------------------------------ */

let toastTimer = null;

/**
 * Show a transient toast message at the bottom of the screen.
 * @param {string} message
 */
function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
}

/** Generate a reasonably unique id for a new todo. */
function genId() {
    if (window.crypto && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/* ---------- CRUD operations ------------------------------------------- */
/* Every mutation saves immediately (auto-save) and re-renders. */

/**
 * Add a new todo. Trims/caps the title and rejects empty titles.
 * @param {string} rawTitle
 * @param {string} category
 * @returns {boolean} true if a todo was added
 */
function addTodo(rawTitle, category) {
    const title = rawTitle.trim().slice(0, MAX_TITLE_LENGTH);
    if (title.length === 0) {
        showToast("할일 제목을 입력해주세요.");
        return false;
    }
    todos.push({
        id: genId(),
        title,
        category: CATEGORIES[category] ? category : DEFAULT_CATEGORY,
        completed: false,
        createdAt: new Date().toISOString(),
    });
    saveTodos(todos);
    renderList();
    return true;
}

/** Delete a todo after user confirmation. */
function deleteTodo(id) {
    const todo = todos.find((t) => t.id === id);
    const label = todo ? `\n\n"${todo.title}"` : "";
    if (!window.confirm(`이 할일을 삭제할까요?${label}`)) return;
    todos = todos.filter((t) => t.id !== id);
    saveTodos(todos);
    renderList();
}

/** Toggle a todo's completed state and persist immediately. */
function toggleComplete(id) {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    todo.completed = !todo.completed;
    saveTodos(todos);
    renderList();
}

/** Enter inline-edit mode for a todo and focus its input. */
function startEdit(id) {
    editingId = id;
    renderList();
    const input = document.querySelector(`.todo[data-id="${id}"] .todo__edit`);
    if (input) {
        input.focus();
        input.select();
    }
}

/**
 * Commit an inline edit. Ignores empty titles (keeps the original) and
 * is guarded so a trailing blur after Enter/Esc does nothing.
 */
function commitEdit(id, rawValue) {
    if (editingId !== id) return; // already committed or cancelled
    editingId = null;
    const title = rawValue.trim().slice(0, MAX_TITLE_LENGTH);
    const todo = todos.find((t) => t.id === id);
    if (todo && title.length > 0 && todo.title !== title) {
        todo.title = title;
        saveTodos(todos);
    }
    renderList();
}

/** Cancel inline editing without saving. */
function cancelEdit() {
    editingId = null;
    renderList();
}

/* ---------- Rendering ------------------------------------------------- */

/** Build a single todo row element. */
function renderItem(todo) {
    const row = document.createElement("div");
    row.className = "todo" + (todo.completed ? " todo--done" : "");
    row.dataset.id = todo.id;

    // Completion checkbox: toggles the completed state.
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo__check";
    checkbox.checked = todo.completed;
    checkbox.setAttribute("aria-label", "완료 여부");
    checkbox.addEventListener("change", () => toggleComplete(todo.id));
    row.appendChild(checkbox);

    // Category color label (color comes from the data-category attribute in CSS).
    const cat = document.createElement("span");
    cat.className = "todo__cat";
    cat.dataset.category = todo.category;
    cat.textContent = CATEGORIES[todo.category] ? CATEGORIES[todo.category].label : "";
    row.appendChild(cat);

    if (editingId === todo.id) {
        // Inline edit input: Enter/blur commits, Esc cancels.
        const input = document.createElement("input");
        input.type = "text";
        input.className = "todo__edit";
        input.value = todo.title;
        input.maxLength = MAX_TITLE_LENGTH;
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                commitEdit(todo.id, input.value);
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
            }
        });
        input.addEventListener("blur", () => commitEdit(todo.id, input.value));
        row.appendChild(input);
    } else {
        // Title (double-click to edit) + edit/delete buttons.
        const title = document.createElement("span");
        title.className = "todo__title";
        title.textContent = todo.title;
        title.addEventListener("dblclick", () => startEdit(todo.id));
        row.appendChild(title);

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "todo__btn";
        editBtn.textContent = "수정";
        editBtn.addEventListener("click", () => startEdit(todo.id));
        row.appendChild(editBtn);

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "todo__btn todo__btn--danger";
        delBtn.textContent = "삭제";
        delBtn.addEventListener("click", () => deleteTodo(todo.id));
        row.appendChild(delBtn);
    }
    return row;
}

/** Count todos for a filter key ("all" counts everything). */
function countFor(key) {
    return key === "all"
        ? todos.length
        : todos.filter((t) => t.category === key).length;
}

/** Render the category filter tabs with live per-category counts. */
function renderTabs() {
    const nav = document.getElementById("category-tabs");
    if (!nav) return;
    nav.innerHTML = "";
    for (const filter of FILTERS) {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "tab" + (currentFilter === filter.key ? " tab--active" : "");
        tab.dataset.filter = filter.key;
        tab.setAttribute("aria-pressed", currentFilter === filter.key ? "true" : "false");

        const label = document.createElement("span");
        label.className = "tab__label";
        label.textContent = filter.label;
        tab.appendChild(label);

        const badge = document.createElement("span");
        badge.className = "tab__badge";
        badge.textContent = String(countFor(filter.key));
        tab.appendChild(badge);

        tab.addEventListener("click", () => setFilter(filter.key));
        nav.appendChild(tab);
    }
}

/** Switch the active filter and re-render. */
function setFilter(key) {
    currentFilter = key;
    renderList();
}

/** Render today's date in the header (Korean format). */
function renderDate() {
    const el = document.getElementById("today-date");
    if (!el) return;
    const now = new Date();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    el.textContent =
        `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
}

/** Render the overall progress dial (% of completed todos). */
function renderOverallProgress() {
    const el = document.getElementById("overall-progress");
    if (!el) return;
    const total = todos.length;
    const done = todos.filter((t) => t.completed).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100); // avoid /0

    el.innerHTML = "";
    const dial = document.createElement("div");
    dial.className = "dial";
    // Filled arc via conic-gradient; remainder is the track color.
    dial.style.background =
        `conic-gradient(var(--color-work) ${pct}%, var(--border) ${pct}% 100%)`;
    const inner = document.createElement("div");
    inner.className = "dial__inner";
    inner.textContent = pct + "%";
    dial.appendChild(inner);
    el.appendChild(dial);
}

/** Render per-category progress bars (completed / total). */
function renderCategoryProgress() {
    const wrap = document.getElementById("category-progress");
    if (!wrap) return;
    wrap.innerHTML = "";

    for (const key of Object.keys(CATEGORIES)) {
        const items = todos.filter((t) => t.category === key);
        const total = items.length;
        const done = items.filter((t) => t.completed).length;
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);

        const row = document.createElement("div");
        row.className = "cat-prog";

        const label = document.createElement("span");
        label.className = "cat-prog__label";
        label.textContent = CATEGORIES[key].label;
        row.appendChild(label);

        const bar = document.createElement("div");
        bar.className = "cat-prog__bar";
        const fill = document.createElement("div");
        fill.className = "cat-prog__fill";
        fill.style.width = pct + "%";
        fill.style.background = `var(${CATEGORIES[key].colorVar})`;
        bar.appendChild(fill);
        row.appendChild(bar);

        const count = document.createElement("span");
        count.className = "cat-prog__count";
        count.textContent = `${done}/${total}`;
        row.appendChild(count);

        wrap.appendChild(row);
    }
}

/** Recompute and repaint all progress indicators. */
function renderProgress() {
    renderOverallProgress();
    renderCategoryProgress();
}

/** Render the todo list, filtered by the active tab. */
function renderList() {
    renderTabs();     // keep tab highlight + counts in sync with the data
    renderProgress(); // keep progress indicators in sync (F-15)

    const list = document.getElementById("todo-list");
    if (!list) return;
    list.innerHTML = "";

    const visible = currentFilter === "all"
        ? todos
        : todos.filter((t) => t.category === currentFilter);
    if (visible.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "할일이 없어요";
        list.appendChild(empty);
        return;
    }
    for (const todo of visible) {
        list.appendChild(renderItem(todo));
    }
}

/** Reflect the selected add-form category on its buttons. */
function renderCategorySelect() {
    const buttons = document.querySelectorAll("#category-select .cat-btn");
    buttons.forEach((btn) => {
        const active = btn.dataset.category === selectedCategory;
        btn.classList.toggle("cat-btn--active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
}

/**
 * Guess a category from a title by counting keyword matches.
 * @param {string} title
 * @returns {string|null} the best-matching category key, or null if none match
 */
function classifyByKeywords(title) {
    const text = title.toLowerCase();
    let best = null;
    let bestCount = 0;
    for (const key of Object.keys(CATEGORY_KEYWORDS)) {
        let count = 0;
        for (const kw of CATEGORY_KEYWORDS[key]) {
            if (text.includes(kw.toLowerCase())) count++;
        }
        if (count > bestCount) {
            bestCount = count;
            best = key;
        }
    }
    return best;
}

/** Show the auto-classify hint with a message. */
function showAutoHint(message) {
    const hint = document.getElementById("auto-hint");
    if (!hint) return;
    hint.textContent = message;
    hint.hidden = false;
}

/** Hide the auto-classify hint. */
function hideAutoHint() {
    const hint = document.getElementById("auto-hint");
    if (hint) hint.hidden = true;
}

/**
 * Classify the current title by keywords and set the category.
 * Triggered by the "자동 분류" button (not automatically while typing).
 */
function runAutoClassify() {
    const input = document.getElementById("title-input");
    if (!input) return;

    const value = input.value.trim();
    if (value === "") {
        showAutoHint("제목을 먼저 입력해주세요.");
        return;
    }
    const guess = classifyByKeywords(value);
    if (guess) {
        selectedCategory = guess;
        renderCategorySelect();
        showAutoHint(`자동 분류: ${CATEGORIES[guess].label}`);
    } else {
        showAutoHint("추천할 카테고리를 찾지 못했어요.");
    }
}

/* ---------- Event wiring ---------------------------------------------- */

/** Wire the add form (submit + Enter key both trigger addTodo). */
function wireAddForm() {
    const form = document.getElementById("add-form");
    const input = document.getElementById("title-input");
    if (!form || !input) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (addTodo(input.value, selectedCategory)) {
            input.value = "";
            input.focus();
            // Reset the add form to a fresh state for the next todo.
            selectedCategory = DEFAULT_CATEGORY;
            renderCategorySelect();
            hideAutoHint();
        }
    });
}

/** Wire the add-form category buttons (event delegation). */
function wireCategorySelect() {
    const container = document.getElementById("category-select");
    if (!container) return;
    container.addEventListener("click", (e) => {
        const btn = e.target.closest(".cat-btn");
        if (!btn) return;
        selectedCategory = btn.dataset.category;
        hideAutoHint(); // manual pick clears the auto-classify hint
        renderCategorySelect();
    });
}

/** Wire the "자동 분류" button. */
function wireAutoClassify() {
    const btn = document.getElementById("auto-classify-btn");
    if (!btn) return;
    btn.addEventListener("click", runAutoClassify);
}

/* ---------- Initialization -------------------------------------------- */

/** Restore state from storage and paint the initial screen. */
function init() {
    todos = loadTodos();
    selectedCategory = DEFAULT_CATEGORY;
    wireAddForm();
    wireCategorySelect();
    wireAutoClassify();
    renderCategorySelect();
    renderDate();
    renderList();
}

document.addEventListener("DOMContentLoaded", init);
