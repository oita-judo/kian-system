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

    body.innerHTML =
      `<tr>
        <td colspan="8">
          決定済はありません
        </td>
      </tr>`;

    return;
  }


  body.innerHTML = items.map(item => `

    <tr>

      <td>
        ${esc(item.createdAt || "")}
      </td>

      <td>
        ${esc(item.typeLabel || "")}
      </td>

      <td>
        ${esc(item.seiriNo || "")}
      </td>

      <td>
        ${esc(item.title || "")}
      </td>


      <!-- 完成PDF -->
      <td>

        ${
          item.mergedPdfUrl

            ? `
              <span class="merged-done">
                ✓ 結合済
              </span>

              <a
                class="pdf-link"
                href="${esc(item.mergedPdfUrl)}"
                target="_blank"
                rel="noopener noreferrer">
                開く
              </a>
            `

            : `
              <button
                type="button"
                class="merge-btn"
                onclick="mergePdf('${esc(item.kianId)}')">
                PDF結合
              </button>
            `
        }

      </td>


      <td>
        ${esc(item.writer || "")}
      </td>

      <td>
        ${esc(item.doneAt || "")}
      </td>


      <!-- 決定版PDF -->
      <td>

        ${
          item.finalPdfUrl

            ? `
              <a
                class="pdf-link"
                href="${esc(item.finalPdfUrl)}"
                target="_blank"
                rel="noopener noreferrer">
                PDF
              </a>
            `

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
// ========================================
// PDF結合
// ========================================

async function mergePdf(kianId) {

  if (!confirm("起案書と決定版を結合しますか？")) {
    return;
  }

  await runWithLoading(
    null,
    "PDFを結合しています...",
    async () => {

      try {

        // -------------------------------
        // 1. 結合可能か確認
        // -------------------------------

        const target = await api({
          action: "getMergeTarget",
          kianId: kianId
        });


        if (!target.ok) {

          if (target.alreadyDone) {

            setMsg(
              "この文書はすでに結合済みです。"
            );

            await loadDataCountsOnly();
            showDoneTable();

          } else {

            setMsg(
              "結合できません: " +
              (target.message || "")
            );
          }

          return;
        }


        // -------------------------------
        // 2. 起案書PDFを取得
        // -------------------------------

        setMsg("起案書PDFを取得しています...");

        const kianData = await api({
          action: "getPdfBase64",
          kianId: kianId,
          kind: "kian"
        });


        if (!kianData.ok) {

          setMsg(
            "起案書PDFの取得に失敗しました: " +
            (kianData.message || "")
          );

          return;
        }


        // -------------------------------
        // 3. 決定版PDFを取得
        // -------------------------------

        setMsg("決定版PDFを取得しています...");

        const finalData = await api({
          action: "getPdfBase64",
          kianId: kianId,
          kind: "final"
        });


        if (!finalData.ok) {

          setMsg(
            "決定版PDFの取得に失敗しました: " +
            (finalData.message || "")
          );

          return;
        }


        // -------------------------------
        // 4. Base64 → バイト列
        // -------------------------------

        const kianBytes =
          base64ToBytes(
            kianData.base64
          );

        const finalBytes =
          base64ToBytes(
            finalData.base64
          );


        // -------------------------------
        // 5. PDF結合
        // -------------------------------

        setMsg("PDFを結合しています...");


        if (
          typeof PDFLib === "undefined"
        ) {

          setMsg(
            "PDF結合ライブラリを読み込めませんでした。"
          );

          return;
        }


        const mergedPdf =
          await PDFLib.PDFDocument.create();


 // 決定版
const finalPdf =
  await PDFLib.PDFDocument.load(
    finalBytes
  );

const finalPages =
  await mergedPdf.copyPages(
    finalPdf,
    finalPdf.getPageIndices()
  );

finalPages.forEach(page => {
  mergedPdf.addPage(page);
});


// 起案書
const kianPdf =
  await PDFLib.PDFDocument.load(
    kianBytes
  );

const kianPages =
  await mergedPdf.copyPages(
    kianPdf,
    kianPdf.getPageIndices()
  );

kianPages.forEach(page => {
  mergedPdf.addPage(page);
});

        // -------------------------------
        // 6. 結合PDFを作成
        // -------------------------------

        const mergedBytes =
          await mergedPdf.save();


        const mergedBase64 =
          bytesToBase64(
            mergedBytes
          );


        // -------------------------------
        // 7. Google Driveへ保存
        // -------------------------------

        setMsg(
          "結合PDFを保存しています..."
        );


        const saved = await api({
          action: "saveMergedPdf",
          kianId: kianId,
          base64Data: mergedBase64
        });


        if (!saved.ok) {

          if (saved.alreadyDone) {

            setMsg(
              "この文書はすでに結合済みです。"
            );

          } else {

            setMsg(
              "保存に失敗しました: " +
              (saved.message || "")
            );
          }

          await loadDataCountsOnly();
          showDoneTable();

          return;
        }


        // -------------------------------
        // 8. 完了
        // -------------------------------

        setMsg(
          "PDF結合完了：" +
          saved.fileName
        );


        // 一覧を再取得
        await loadDataCountsOnly();

        // 決定済一覧を再表示
        showDoneTable();


      } catch (err) {

        console.error(err);

        setMsg(
          "PDF結合エラー: " +
          err.message
        );
      }
    }
  );
}


// ========================================
// Base64 → Uint8Array
// ========================================

function base64ToBytes(base64) {

  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );


  for (
    let i = 0;
    i < binary.length;
    i++
  ) {

    bytes[i] =
      binary.charCodeAt(i);
  }


  return bytes;
}


// ========================================
// Uint8Array → Base64
// ========================================

function bytesToBase64(bytes) {

  let binary = "";

  const chunkSize =
    0x8000;


  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {

    const chunk =
      bytes.subarray(
        i,
        i + chunkSize
      );


    binary +=
      String.fromCharCode(
        ...chunk
      );
  }


  return btoa(binary);
}


// onclick から使用できるようにする
window.mergePdf = mergePdf;
