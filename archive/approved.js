//const GAS_URL = "https://script.google.com/macros/s/AKfycbxAFwRbhcNFfd2p5PmrzyGis7cS0p90Z0UMsHD0gCf31ZP945ZjQuyiC-22SlXx4_QX/exec";
const $ = (id) => document.getElementById(id);

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

let currentType = "";

/* ===== ローディング ===== */
function showLoading(text="処理中です..."){
  const el = $("loadingOverlay");
  const label = $("loadingText");
  if(label) label.textContent = text;
  if(el) el.classList.remove("hidden");
}

function hideLoading(){
  const el = $("loadingOverlay");
  if(el) el.classList.add("hidden");
}

async function runWithLoading(btn,text,fn){
  try{
    showLoading(text);
    if(btn) btn.disabled = true;
    await fn();
  }finally{
    if(btn) btn.disabled = false;
    hideLoading();
  }
}

/* ===== API ===== */
async function api(payload) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(appendAuth(payload))
  });

  const text = await res.text();
  return JSON.parse(text);
}

function currentSort() {
  return {
    sortKey: $("sortKey")?.value || "createdAt",
    sortDir: $("sortDir")?.value || "desc"
  };
}

/* ===== 描画 ===== */

function renderApprovedBefore(items) {
  const body = $("approvedBeforeBody");
  if (!items?.length) {
    body.innerHTML = `<tr><td colspan="7">承認済（決定前）はありません</td></tr>`;
    return;
  }

  body.innerHTML = items.map(item => `
    <tr>
      <td>${esc(item.createdAt)}</td>
      <td>${esc(item.typeLabel)}</td>
      <td>${esc(item.seiriNo)}</td>
      <td>${esc(item.title)}</td>
      <td>${esc(item.writer)}</td>
      <td>${esc(item.updatedAt)}</td>
      <td>
        <button class="decide-btn" onclick="markDone('${esc(item.kianId)}')">決定</button>
      </td>
    </tr>
  `).join("");
}

function renderDone(items) {
  const body = $("doneBody");

  if (!items?.length) {
    body.innerHTML = `<tr><td colspan="7">決定済はありません</td></tr>`;
    return;
  }

  body.innerHTML = items.map(item => `
    <tr>
      <td>${esc(item.createdAt)}</td>
      <td>${esc(item.typeLabel)}</td>
      <td>${esc(item.seiriNo)}</td>
      <td>${esc(item.title)}</td>
      <td>${esc(item.writer)}</td>
      <td>${esc(item.doneAt || item.updatedAt)}</td>
      <td>
        ${item.finalPdfUrl
          ? `<a href="${esc(item.finalPdfUrl)}" target="_blank">PDF</a>`
          : ""
        }
      </td>
    </tr>
  `).join("");
}

/* ===== 一括取得（高速化） ===== */
async function loadAllFast(){

  await runWithLoading(null,"データを読み込んでいます...",async ()=>{

    const data = await api({ action:"getAllDataFast" });

    if(!data.ok){
      setMsg("取得失敗");
      return;
    }

    let approved = data.approvedItems || [];
    let done = data.doneItems || [];

    if(currentType){
      approved = approved.filter(x => x.type === currentType);
      done = done.filter(x => x.type === currentType);
    }

    renderApprovedBefore(approved);
    renderDone(done);

    setMsg("");
  });
}

/* ===== 決定 ===== */
async function markDone(kianId){

  if(!confirm("この承認済データを決定しますか？")) return;

  await runWithLoading(null,"決定処理中...",async ()=>{

    const data = await api({
      action:"markDone",
      kianId
    });

    if(!data.ok){
      setMsg("失敗");
      return;
    }

    setMsg("決定しました");
    await loadAllFast();
  });
}
window.markDone = markDone;

/* ===== 初期化 ===== */
window.addEventListener("load", async () => {

  const auth = requirePageAuth(["admin"]);
  if (!auth) return;

  $("authUserText").textContent = `${auth.name}（${auth.role}）`;

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type || "";
      await loadAllFast();
    });
  });

  $("sortKey").addEventListener("change", loadAllFast);
  $("sortDir").addEventListener("change", loadAllFast);
  $("reloadBtn").addEventListener("click", loadAllFast);

  await loadAllFast();
});
