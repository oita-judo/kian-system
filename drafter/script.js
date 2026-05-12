// drafter/script.js PDFプレビュー対応版

const SUMMARY_CONFIG = {
  draft:    { countId: "countDraft",    wrapId: "draftListWrap",    listId: "draftSheetList" },
  pending:  { countId: "countPending",  wrapId: "pendingListWrap",  listId: "pendingSheetList" },
  returned: { countId: "countReturned", wrapId: "returnedListWrap", listId: "returnedSheetList" },
  approved: { countId: "countApproved", wrapId: "approvedListWrap", listId: "approvedSheetList" }
};

const caches = {
  draft: [],
  pending: [],
  returned: [],
  approved: []
};

let selectedFiles = [];

const $ = (id) => document.getElementById(id);
const v = (id) => ($(id)?.value || "").trim();

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

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg || "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------- 金額表示 ---------- */

function formatYenInput(value) {
  const num = String(value || "").replace(/[^\d]/g, "");
  if (!num) return "";
  return "¥ " + Number(num).toLocaleString("ja-JP") + "-";
}

function unformatYenInput(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function bindMoneyAmountFormat() {
  const el = $("moneyAmount");
  if (!el) return;

  if (el.value) {
    el.value = formatYenInput(el.value);
  }

  el.addEventListener("focus", () => {
    el.value = unformatYenInput(el.value);
  });

  el.addEventListener("input", () => {
    el.value = el.value.replace(/[^\d]/g, "");
  });

  el.addEventListener("blur", () => {
    const num = unformatYenInput(el.value);
    el.value = num ? formatYenInput(num) : "";
  });
}

function typeLabelJa(type) {
  if (type === "shishutsu") return "支出";
  if (type === "shuunyuu") return "収入";
  return "稟議";
}

function canMarkDone_() {
  const auth = getAuth();
  return !!auth && auth.role === "admin";
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
    throw new Error("GASの応答がJSONではありません: " + text);
  }
}

/* ---------- UI ---------- */

function syncCommonToHiddenFields() {
  const type = $("type")?.value || "";
  const title = v("commonTitle");
  const writer = v("commonWriter");
  const content = v("commonContent");

  const map = {
    shishutsu: ["s_title", "s_writer", "s_content"],
    shuunyuu:  ["r_title", "r_writer", "r_content"],
    ringi:     ["g_title", "g_writer", "g_content"]
  };

  const ids = map[type];
  if (!ids) return;

  [title, writer, content].forEach((value, i) => {
    if ($(ids[i])) $(ids[i]).value = value;
  });
}

function applyTypeUI() {
  const type = $("type")?.value || "";
  const isRingi = type === "ringi";

  if ($("afterTypeFields")) $("afterTypeFields").style.display = type ? "" : "none";
  if ($("rowKms")) $("rowKms").style.display = isRingi ? "none" : "";
  if ($("rowMoney")) $("rowMoney").style.display = isRingi ? "none" : "";

  const labels = {
    shishutsu: ["支払金額", "支払先", "支払方法", "支出年月日"],
    shuunyuu:  ["収入金額", "納入者", "納入方法", "納入年月日"],
    ringi:     ["金額", "相手先", "方法", "年月日"]
  }[type] || ["金額", "相手先", "方法", "年月日"];

  ["labelAmount", "labelPartner", "labelMethod", "labelDate"].forEach((id, i) => {
    if ($(id)) $(id).textContent = labels[i];
  });

  syncCommonToHiddenFields();
}

function bindSeiriNoRule() {
  const el = $("seiriNo");
  if (!el) return;

  el.addEventListener("input", () => {
    el.value = el.value.replace(/[^0-9]/g, "").replace(/^0+/, "");
  });
}

function showReturnComments(item) {
  const box = $("returnBox");
  const a = $("returnCommentA");
  const b = $("returnCommentB");
  if (!box || !a || !b) return;

  const textA = item?.returnCommentA || "";
  const textB = item?.returnCommentB || "";

  if (!textA && !textB) {
    box.style.display = "none";
    a.textContent = "なし";
    b.textContent = "なし";
    return;
  }

  box.style.display = "";
  a.textContent = textA || "なし";
  b.textContent = textB || "なし";
}

/* ---------- files ---------- */

function renderSelectedFiles() {
  const box = $("fileList");
  if (!box) return;

  if (!selectedFiles.length) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = selectedFiles.map((file, i) => `
    <li>
      <div class="file-item-row">
        <span>${i + 1}. ${escapeHtml(file.name)}</span>
        <button type="button" class="mini-action-btn secondary" onclick="removeSelectedFile(${i})">削除</button>
      </div>
    </li>
  `).join("");
}

window.removeSelectedFile = function(index) {
  selectedFiles.splice(index, 1);
  renderSelectedFiles();
  setStatus(`添付を削除しました（${selectedFiles.length}件）`);
};

function addSelectedFile() {
  const input = $("fileOne");
  const file = input?.files?.[0];

  if (!file) {
    setStatus("追加するファイルを選んでください。");
    return;
  }

  if (selectedFiles.length >= 5) {
    setStatus("添付は最大5件です。");
    input.value = "";
    return;
  }

  const duplicated = selectedFiles.some(f =>
    f.name === file.name &&
    f.size === file.size &&
    f.lastModified === file.lastModified
  );

  if (duplicated) {
    setStatus("同じファイルは追加済みです。");
    input.value = "";
    return;
  }

  selectedFiles.push(file);
  input.value = "";
  renderSelectedFiles();
  setStatus(`添付を追加しました（${selectedFiles.length}件）`);
}

function clearSelectedFiles() {
  selectedFiles = [];
  if ($("fileOne")) $("fileOne").value = "";
  renderSelectedFiles();
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- payload ---------- */

async function buildPayload() {
  syncCommonToHiddenFields();

  const type = $("type")?.value || "";

  const payload = {
    action: "submit",
    type,
    seiriNo: v("seiriNo"),
    label: $("type")?.selectedOptions?.[0]?.text || "",
    kou: v("kou"),
    moku: v("moku"),
    setsu: v("setsu"),
    title: v("commonTitle"),
    writer: v("commonWriter"),
    content: $("commonContent")
  ? $("commonContent").innerHTML
  : "",
    attachments: []
  };

  if (type === "shishutsu") {
    payload.amount = unformatYenInput(v("moneyAmount"));
    payload.payee = v("moneyPartner");
    payload.method = $("moneyMethod")?.value || "";
    payload.date = v("moneyDate");
  } else if (type === "shuunyuu") {
    payload.amount = unformatYenInput(v("moneyAmount"));
    payload.payer = v("moneyPartner");
    payload.method = $("moneyMethod")?.value || "";
    payload.date = v("moneyDate");
  } else {
    payload.date = "";
  }

  for (const file of selectedFiles) {
    const dataUrl = await readFileAsDataURL(file);
    payload.attachments.push({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      dataUrl
    });
  }

  return payload;
}

async function buildPreviewPayload() {
  const payload = await buildPayload();
  payload.action = "previewPdf";
  return payload;
}

function validate(payload) {
  if (!payload.type) return "未入力：区分";
  if (!payload.seiriNo) return "未入力：整理番号";
  if (!/^[1-9][0-9]*$/.test(payload.seiriNo)) return "整理番号は1以上の半角数字です";
  if (!payload.title) return "未入力：件名";
  if (!payload.writer) return "未入力：記載者氏名";
  if (!payload.content) return "未入力：内容";

  if (payload.type === "shishutsu") {
    if (!payload.amount) return "未入力：支払金額";
    if (!payload.payee) return "未入力：支払先";
  }

  if (payload.type === "shuunyuu") {
    if (!payload.amount) return "未入力：収入金額";
    if (!payload.payer) return "未入力：納入者";
  }

  if ((payload.attachments || []).length > 5) return "添付は5件までです";
  return "";
}

/* ---------- actions ---------- */

function clearPreview() {
  const wrap = $("previewWrap");
  const frame = $("previewFrame");

  if (frame) frame.src = "";
  if (wrap) wrap.classList.add("hidden");
}

function clearForm() {
  [
    "type", "draftNo", "seiriNo", "commonWriter", "kou", "moku", "setsu",
    "commonTitle", "commonContent", "moneyAmount", "moneyPartner", "moneyDate"
  ].forEach(id => {
    if ($(id)) $(id).value = "";
  });

  if ($("moneyMethod")) $("moneyMethod").value = "口座振込";

  clearSelectedFiles();
  clearPreview();
  showReturnComments(null);
  applyTypeUI();
  setStatus("");
}

async function previewPdf() {
  const auth = getAuth();

  if (!auth || !["drafter", "admin"].includes(auth.role)) {
    setStatus("PDFプレビューの権限がありません。");
    return;
  }

  const payload = await buildPreviewPayload();
  const msg = validate(payload);

  if (msg) {
    setStatus(msg);
    return;
  }

  setStatus("PDFプレビューを作成しています...");

  const data = await api(payload);

  if (!data.ok) {
    setStatus("PDFプレビュー失敗: " + (data.message || "unknown"));
    return;
  }

  const previewUrl =
    data.previewUrl ||
    data.pdfPreviewUrl ||
    data.url ||
    data.pdfUrl ||
    "";

  if (!previewUrl) {
    setStatus("PDFプレビューURLが返ってきませんでした。GAS側の戻り値を確認してください。");
    return;
  }

  const wrap = $("previewWrap");
  const frame = $("previewFrame");

  if (frame) frame.src = previewUrl;
  if (wrap) wrap.classList.remove("hidden");

  setStatus("PDFプレビューを表示しました");
}

async function send() {
  const auth = getAuth();

  if (!auth || !["drafter", "admin"].includes(auth.role)) {
    setStatus("送信権限がありません。");
    return;
  }

  const payload = await buildPayload();
  const msg = validate(payload);

  if (msg) {
    setStatus(msg);
    return;
  }

  const data = await api(payload);

  if (!data.ok) {
    setStatus("送信失敗: " + (data.message || "unknown"));
    return;
  }

  const draftNo = v("draftNo");

  if (draftNo) {
    try {
      await api({ action: "deleteDraft", draftNo });
    } catch {}
  }

  clearForm();
  await loadAllFast();
  setStatus("送信しました");
}

async function saveDraftByNo() {
  const auth = getAuth();

  if (!auth || !["drafter", "admin"].includes(auth.role)) {
    setStatus("下書き保存の権限がありません。");
    return;
  }

  const draftNo = v("draftNo");

  if (!draftNo) {
    setStatus("下書き番号を入力してください。");
    return;
  }

  const payload = await buildPayload();
  payload.action = "saveDraft";
  payload.draftNo = draftNo;
  payload.attachments = [];

  const data = await api(payload);

  if (!data.ok) {
    setStatus("下書き保存失敗: " + (data.message || "unknown"));
    return;
  }

  await loadAllFast();
  setStatus("下書きを保存しました");
}

/* ---------- 高速読み込み ---------- */

async function loadAllFast() {
  const data = await api({ action: "getAllDataFast" });

  if (!data.ok) {
    setStatus("データ取得に失敗しました");
    return;
  }

  const counts = data.counts || {};

  if ($("countDraft")) $("countDraft").textContent = counts.draft ?? 0;
  if ($("countPending")) $("countPending").textContent = counts.pending ?? 0;
  if ($("countReturned")) $("countReturned").textContent = counts.returned ?? 0;
  if ($("countApproved")) $("countApproved").textContent = counts.approved ?? 0;

  caches.draft = data.draftItems || [];
  caches.pending = data.pendingItems || [];
  caches.returned = data.returnedItems || [];
  caches.approved = data.approvedItems || [];

  Object.keys(SUMMARY_CONFIG).forEach(mode => {
    renderStatusTable(mode, caches[mode]);
  });
}

/* ---------- lists ---------- */

function actionButtons(mode, item, index) {
  const buttons = [];

  if (mode === "draft" || mode === "returned") {
    buttons.push(`<button class="mini-btn primary" onclick="restoreItem('${mode}', ${index})">復元</button>`);
  }

  if (mode === "draft") {
    buttons.push(`<button class="mini-btn danger" onclick="deleteDraftItem(${index})">削除</button>`);
  }

  if (mode === "approved" && canMarkDone_()) {
    buttons.push(`<button class="mini-btn done" onclick="markApprovedDone('${escapeHtml(item.kianId)}')">確定</button>`);
  }
  if (mode === "pending") {
  buttons.push(`
    <button class="mini-btn danger"
      onclick="withdrawItem('${escapeHtml(item.kianId)}')">
      取下げ
    </button>
  `);
}

  return buttons.join("");
}

function renderStatusTable(mode, items) {
  const cfg = SUMMARY_CONFIG[mode];
  const box = $(cfg.listId);
  if (!box) return;

  if (!items?.length) {
    box.innerHTML = "（データはありません）";
    return;
  }

  box.innerHTML = `
    <div class="data-table">
      <div class="data-head">
        <div>番号</div>
        <div>区分</div>
        <div>整理番号</div>
        <div>件名</div>
        <div>更新</div>
        <div></div>
      </div>
      ${items.map((item, index) => `
        <div class="data-row">
          <div>${escapeHtml(item.draftNo || item.kianId || "")}</div>
          <div>${escapeHtml(item.typeLabel || typeLabelJa(item.type))}</div>
          <div>${escapeHtml(item.seiriNo || "")}</div>
          <div class="data-title">${escapeHtml(item.title || "(件名なし)")}</div>
          <div>${escapeHtml(item.updatedAt || item.createdAt || "")}</div>
          <div class="row-actions">${actionButtons(mode, item, index)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function showList(mode) {
  const cfg = SUMMARY_CONFIG[mode];
  if (!cfg || !$(cfg.wrapId)) return;
  $(cfg.wrapId).style.display = "";
}

function hideList(mode) {
  const cfg = SUMMARY_CONFIG[mode];
  if (!cfg || !$(cfg.wrapId)) return;
  $(cfg.wrapId).style.display = "none";
}

/* ---------- row operations ---------- */

window.restoreItem = function(mode, index) {
  const item = caches[mode]?.[index];
  if (!item) return;

  clearForm();

  if ($("draftNo")) $("draftNo").value = item.draftNo || "";
  if ($("type")) $("type").value = item.type || "";
  if ($("seiriNo")) $("seiriNo").value = item.seiriNo || "";
  if ($("commonWriter")) $("commonWriter").value = item.writer || "";
  if ($("kou")) $("kou").value = item.kou || "";
  if ($("moku")) $("moku").value = item.moku || "";
  if ($("setsu")) $("setsu").value = item.setsu || "";
  if ($("commonTitle")) $("commonTitle").value = item.title || "";
  if ($("commonContent")) $("commonContent").value = item.content || "";

  applyTypeUI();

  if (item.type === "shishutsu") {
    if ($("moneyAmount")) $("moneyAmount").value = formatYenInput(item.amount || "");
    if ($("moneyPartner")) $("moneyPartner").value = item.payee || "";
    if ($("moneyMethod")) $("moneyMethod").value = item.method || "口座振込";
    if ($("moneyDate")) $("moneyDate").value = item.date || "";
  } else if (item.type === "shuunyuu") {
    if ($("moneyAmount")) $("moneyAmount").value = formatYenInput(item.amount || "");
    if ($("moneyPartner")) $("moneyPartner").value = item.payer || "";
    if ($("moneyMethod")) $("moneyMethod").value = item.method || "口座振込";
    if ($("moneyDate")) $("moneyDate").value = item.date || "";
  }

  showReturnComments(item);
  setStatus("復元しました");
};

window.deleteDraftItem = async function(index) {
  const item = caches.draft[index];
  if (!item) return;

  if (!confirm(`下書き（番号：${item.draftNo}）を削除しますか？`)) return;

  await runWithLoading(null, "下書きを削除しています...", async () => {
    const data = await api({ action: "deleteDraft", draftNo: item.draftNo });

    if (!data.ok) {
      setStatus("削除失敗: " + (data.message || "unknown"));
      return;
    }

    await loadAllFast();
    setStatus("下書きを削除しました");
  });
};

window.markApprovedDone = async function(kianId) {
  if (!canMarkDone_()) {
    setStatus("確定の権限がありません。");
    return;
  }

  if (!kianId) return;
  if (!confirm("この承認済を確定しますか？")) return;

  await runWithLoading(null, "確定処理中です...", async () => {
    const data = await api({ action: "markDone", kianId });

    if (!data.ok) {
      setStatus("確定失敗: " + (data.message || "unknown"));
      return;
    }

    await loadAllFast();
    setStatus("確定しました");
  });
};
window.withdrawItem = async function(kianId) {

  if (!kianId) return;

  if (!confirm("この起案を取下げて下書きへ戻しますか？")) {
    return;
  }

  await runWithLoading(
    null,
    "取下げ中です...",
    async () => {

      const data = await api({
        action: "withdraw",
        kianId
      });

      if (!data.ok) {
        setStatus(data.message || "取下げ失敗");
        return;
      }

      await loadAllFast();

      setStatus("下書きへ戻しました");
    }
  );
};
/* ---------- init ---------- */

function bindSummaryButtons() {
  const binds = {
    btnToggleDraftListTop: () => showList("draft"),
    btnShowDraft: () => showList("draft"),
    btnHideDraft: () => hideList("draft"),
    btnShowPending: () => showList("pending"),
    btnHidePending: () => hideList("pending"),
    btnShowReturned: () => showList("returned"),
    btnHideReturned: () => hideList("returned"),
    btnShowApproved: () => showList("approved"),
    btnHideApproved: () => hideList("approved")
  };

  Object.entries(binds).forEach(([id, fn]) => {
    if ($(id)) $(id).addEventListener("click", fn);
  });
}

window.addEventListener("load", async () => {
  const auth = requirePageAuth(["drafter", "admin"]);
  if (!auth) return;

  bindMoneyAmountFormat();

  if ($("authUserText")) {
    $("authUserText").textContent = `${auth.name}（${auth.role}）`;
  }

  if ($("logoutBtn")) {
    $("logoutBtn").addEventListener("click", logoutToRoot);
  }

  applyTypeUI();
  bindSeiriNoRule();
  renderSelectedFiles();
  showReturnComments(null);
  clearPreview();

  if ($("type")) $("type").addEventListener("change", applyTypeUI);

  ["commonTitle", "commonWriter", "commonContent"].forEach(id => {
    if ($(id)) $(id).addEventListener("input", syncCommonToHiddenFields);
  });

  if ($("addFileBtn")) $("addFileBtn").addEventListener("click", addSelectedFile);
  if ($("clearFilesBtn")) $("clearFilesBtn").addEventListener("click", clearSelectedFiles);

  if ($("previewBtn")) {
    $("previewBtn").addEventListener("click", function () {
      runWithLoading(this, "PDFプレビューを作成しています...", previewPdf)
        .catch(err => setStatus("PDFプレビューエラー: " + err.message));
    });
  }

  if ($("closePreviewBtn")) {
    $("closePreviewBtn").addEventListener("click", clearPreview);
  }

  if ($("saveDraftBtn")) {
    $("saveDraftBtn").addEventListener("click", function () {
      runWithLoading(this, "下書きを保存しています...", saveDraftByNo)
        .catch(err => setStatus("下書き保存エラー: " + err.message));
    });
  }

  if ($("sendBtn")) {
    $("sendBtn").addEventListener("click", function () {
      runWithLoading(this, "送信中です。PDFを作成しています...", send)
        .catch(err => setStatus("送信エラー: " + err.message));
    });
  }

  if ($("clearBtn")) $("clearBtn").addEventListener("click", clearForm);

  bindSummaryButtons();

  await runWithLoading(null, "データを読み込んでいます...", async () => {
    await loadAllFast();
  });
});
