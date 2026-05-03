const $ = (id) => document.getElementById(id);

let currentType = "";
let allApprovedItems = [];
let allDoneItems = [];

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setMsg(msg) {
  if ($("msg")) $("msg").textContent = msg || "";
}

function showLoading(text = "処理中です...") {
  const el = $("loadingOverlay");
  const label = $("loadingText");
  if (label) label.textContent = text;
  if (el) el.classList.remove("hidden");
}

function hideLoading() {
  const el = $("loadingOverlay");
  if (el) el.classList.add("hidden");
}

async function runWithLoading(btn, text, fn) {
  try {
    showLoading(text);
    if (btn) btn.disabled = true;
    await fn();
  } finally {
    if (btn) btn.disabled = false;
    hideLoading();
  }
}

async function api(payload) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(appendAuth(payload))
  });

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSONではない応答: " + text);
  }
}

function currentSort() {
  return {
    sortKey: $("sortKey")?.value || "createdAt",
    sortDir: $("sortDir")?.value || "desc"
  };
}

function sortItems(items) {
  const { sortKey, sortDir } = currentSort();

  return [...items].sort((a, b) => {
    const av = String(a[sortKey] ?? "");
    const bv = String(b[sortKey] ?? "");
    const cmp = av.localeCompare(bv, "ja");
    return sortDir === "asc" ? cmp : -cmp;
  });
}

function filterItems(items) {
  if (!currentType) return items;
  return items.filter(x => String(x.type) === currentType);
}

function getApprovedFiltered() {
  return sortItems(filterItems(allApprovedItems));
}

function getDoneFiltered() {
  return sortItems(filterItems(allDoneItems));
}

function updateCounts() {
  const approvedCount = getApprovedFiltered().length;
  const doneCount = getDoneFiltered().length;

  if ($("approvedCount")) $("approvedCount").textContent = `件数：${approvedCount}`;
  if ($("doneCount")) $("doneCount").textContent = `件数：${doneCount}`;
}

function renderApprovedBefore(items) {
  const body = $("approvedBeforeBody");
  if (!body) return;

  if (!items || items.length === 0) {
    body.innerHTML = `<tr><td colspan="7">承認済（決定前）はありません</td></tr>`;
    return;
  }

  body.innerHTML = items.map(item => `
    <tr>
      <td>${esc(item.createdAt || "")}</td>
      <td>${esc(item.typeLabel || "")}</td>
      <td>${esc(item.seiriNo || "")}</td>
      <td>${esc(item.title || "")}</td>
      <td>${esc(item.writer || "")}</td>
      <td>${esc(item.updatedAt || "")}</td>
      <td>
        <button class="decide-btn" type="button" onclick="markDone('${esc(item.kianId)}')">決定</button>
      </td>
    </tr>
  `).join("");
}

function renderDone(items) {
  const body = $("doneBody");
  if (!body) return;

  if (!items || items.length === 0) {
    body.innerHTML = `<tr><td colspan="7">決定済はありません</td></tr>`;
    return;
  }

  body.innerHTML = items.map(item => `
    <tr>
      <td>${esc(item.createdAt || "")}</td>
      <td>${esc(item.typeLabel || "")}</td>
      <td>${esc(item.seiriNo || "")}</td>
      <td>${esc(item.title || "")}</td>
      <td>${esc(item.writer || "")}</td>
      <td>${esc(item.doneAt || item.updatedAt || "")}</td>
      <td>
        ${item.finalPdfUrl
          ? `<a class="pdf-link" href="${esc(item.finalPdfUrl)}" target="_blank" rel="noopener noreferrer">PDF</a>`
          : ""
        }
      </td>
    </tr>
  `).join("");
}

function hideTables() {
  if ($("approvedBeforeWrap")) $("approvedBeforeWrap").style.display = "none";
  if ($("doneWrap")) $("doneWrap").style.display = "none";
}

function showApprovedTable() {
  renderApprovedBefore(getApprovedFiltered());
  if ($("approvedBeforeWrap")) $("approvedBeforeWrap").style.display = "";
}

function showDoneTable() {
  renderDone(getDoneFiltered());
  if ($("doneWrap")) $("doneWrap").style.display = "";
}

async function loadDataCountsOnly() {
  const data = await api({ action: "getAllDataFast" });

  if (!data.ok) {
    setMsg("取得失敗: " + (data.message || "unknown"));
    return;
  }

  allApprovedItems = data.approvedItems || [];
  allDoneItems = data.doneItems || [];

  updateCounts();
  hideTables();
  setMsg("");
}

async function reloadCountsOnly() {
  await runWithLoading(null, "件数を読み込んでいます...", async () => {
    await loadDataCountsOnly();
  });
}

async function markDone(kianId) {
  if (!confirm("この承認済データを決定しますか？")) return;

  await runWithLoading(null, "決定処理中です...", async () => {
    const data = await api({
      action: "markDone",
      kianId
    });

    if (!data.ok) {
      setMsg("失敗: " + (data.message || "unknown"));
      return;
    }

    setMsg("決定しました");
    await loadDataCountsOnly();
  });
}

window.markDone = markDone;

window.addEventListener("load", async () => {
  const auth = requirePageAuth(["admin"]);
  if (!auth) return;

  if ($("authUserText")) {
    $("authUserText").textContent = `${auth.name}（${auth.role}）`;
  }

  if ($("logoutBtn")) {
    $("logoutBtn").addEventListener("click", logoutToRoot);
  }

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type || "";

      updateCounts();
      hideTables();
    });
  });

  if ($("sortKey")) {
    $("sortKey").addEventListener("change", () => {
      updateCounts();
      hideTables();
    });
  }

  if ($("sortDir")) {
    $("sortDir").addEventListener("change", () => {
      updateCounts();
      hideTables();
    });
  }

  if ($("reloadBtn")) {
    $("reloadBtn").addEventListener("click", reloadCountsOnly);
  }

  if ($("showApprovedBtn")) {
    $("showApprovedBtn").addEventListener("click", () => {
      showApprovedTable();
    });
  }

  if ($("showDoneBtn")) {
    $("showDoneBtn").addEventListener("click", () => {
      showDoneTable();
    });
  }

  await reloadCountsOnly();
});
