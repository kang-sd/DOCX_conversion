/**
 * sidepanel.js — 문서 변환기 (서버·AI 불필요, 브라우저 단독)
 *
 * 파이프라인:
 *   1) 입력 파일에서 { plain, html } 추출 (md/txt/html/docx/hwpx)
 *   2) 목표 포맷으로 렌더링 (hwpx=HwpxBuilder, docx=html-docx, md/html/txt=직접)
 *
 * 의존 전역:
 *   window.JSZip        (vendor/jszip.min.js)   — docx/hwpx 입력 파싱
 *   window.HwpxBuilder  (hwpx-builder.js)        — HWPX 생성
 *   window.DocxBuilder  (docx-builder.js)        — 네이티브 DOCX 생성
 */

// ===== 상태 =====
let selectedFile = null;

// ===== DOM =====
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const fileNameEl = document.getElementById("fileName");
const dropzoneLabel = document.getElementById("dropzoneLabel");
const targetFormat = document.getElementById("targetFormat");
const convertBtn = document.getElementById("convertBtn");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("progressBar");
const progressFill = document.getElementById("progressFill");

const INPUT_EXTS = ["md", "markdown", "txt", "html", "htm", "docx", "hwpx"];
// 브라우저 단독으로 원본을 읽을 수 없는 포맷(안내용)
const UNSUPPORTED_INPUT = ["hwp", "pdf"];
// 구버전 바이너리 포맷 — 저장변환 안내
const LEGACY_INPUT = { doc: "docx", ppt: "pptx", xls: "xlsx" };

// ===== 파일 선택 =====
dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("click", (e) => e.stopPropagation());
dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) setFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) setFile(fileInput.files[0]);
});

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function setFile(file) {
  const ext = extOf(file.name);
  if (LEGACY_INPUT[ext]) {
    setStatus(`🚫 구버전 .${ext}는 지원되지 않습니다. 워드/오피스에서 "다른 이름으로 저장 → .${LEGACY_INPUT[ext]}"로 저장한 뒤 올려주세요.`, "error");
    return;
  }
  if (UNSUPPORTED_INPUT.includes(ext)) {
    setStatus(`🚫 .${ext} 원본 읽기는 브라우저 단독으로 지원되지 않습니다. (생성은 가능)`, "error");
    return;
  }
  if (!INPUT_EXTS.includes(ext)) {
    setStatus("🚫 지원하지 않는 입력 포맷입니다. (md, txt, html, docx, hwpx)", "error");
    return;
  }
  selectedFile = file;
  fileNameEl.textContent = file.name;
  dropzoneLabel.textContent = "다른 파일 선택하려면 클릭";
  dropzone.classList.add("has-file");
  setStatus("✅ 파일 준비 완료! 포맷 선택 후 변환하세요.", "");
}

// ===== 상태/진행 표시 =====
function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.style.color = type === "error" ? "var(--accent)" : type === "ok" ? "green" : "var(--text-dim)";
}
function setProgress(pct) {
  progressBar.style.display = "block";
  progressFill.style.width = pct + "%";
}
function hideProgress() {
  progressBar.style.display = "none";
  progressFill.style.width = "0%";
}

// ===== 입력 파싱: { plain, html, md } =====
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 아주 가벼운 마크다운 → HTML (제목/목록/굵게/기울임/단락)
function markdownToHtml(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let inList = false;
  const inline = (s) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const li = line.match(/^\s*[-*+]\s+(.*)$/);
    if (h) {
      if (inList) { out.push("</ul>"); inList = false; }
      const lv = h[1].length;
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
    } else if (li) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(li[1])}</li>`);
    } else if (line.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

// HTML → 블록 단위 평문
function htmlToPlain(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,td,th,pre,blockquote");
  const lines = [];
  blocks.forEach((el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t) lines.push(t);
  });
  if (!lines.length) {
    const t = (doc.body.textContent || "").trim();
    if (t) lines.push(t);
  }
  return lines.join("\n");
}

// DOCX(zip)에서 텍스트 추출 → 단락 배열
async function docxToPlain(file) {
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const f = zip.file("word/document.xml");
  if (!f) throw new Error("DOCX 구조를 읽을 수 없습니다 (word/document.xml 없음).");
  const xml = await f.async("string");
  // 단락(<w:p>) 단위로 나누고 각 단락 내 <w:t> 텍스트를 이어붙임
  const paras = xml.split(/<w:p[ >]/).slice(1).map((chunk) => {
    const texts = chunk.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
    return texts.map((m) => m.replace(/<[^>]+>/g, "")).join("")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  });
  return paras.filter((p) => p.trim()).join("\n");
}

// HWPX(zip)에서 텍스트 추출 → 단락 배열 (<hp:t>)
async function hwpxToPlain(file) {
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const secNames = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/i.test(n)).sort();
  if (!secNames.length) throw new Error("HWPX 구조를 읽을 수 없습니다 (section 없음).");
  const lines = [];
  for (const name of secNames) {
    const xml = await zip.file(name).async("string");
    const paras = xml.split(/<hp:p[ >]/).slice(1);
    for (const chunk of paras) {
      const texts = chunk.match(/<hp:t>([\s\S]*?)<\/hp:t>/g) || [];
      const line = texts.map((m) => m.replace(/<[^>]+>/g, "")).join("")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      if (line.trim()) lines.push(line.trim());
    }
  }
  return lines.join("\n");
}

// 입력 파일 → 정규화 표현
async function readInput(file, ext) {
  if (ext === "md" || ext === "markdown") {
    const md = await file.text();
    return { kind: "md", md, plain: window.HwpxBuilder._markdownToPlain(md), html: markdownToHtml(md) };
  }
  if (ext === "txt") {
    const plain = await file.text();
    return { kind: "txt", md: plain, plain, html: plain.split(/\r?\n/).filter(Boolean).map((l) => `<p>${escapeHtml(l)}</p>`).join("\n") };
  }
  if (ext === "html" || ext === "htm") {
    const html = await file.text();
    const plain = htmlToPlain(html);
    return { kind: "html", md: plain, plain, html };
  }
  if (ext === "docx") {
    const plain = await docxToPlain(file);
    return { kind: "docx", md: plain, plain, html: plain.split("\n").filter(Boolean).map((l) => `<p>${escapeHtml(l)}</p>`).join("\n") };
  }
  if (ext === "hwpx") {
    const plain = await hwpxToPlain(file);
    return { kind: "hwpx", md: plain, plain, html: plain.split("\n").filter(Boolean).map((l) => `<p>${escapeHtml(l)}</p>`).join("\n") };
  }
  throw new Error("지원하지 않는 입력 포맷입니다.");
}

// ===== 출력 렌더링 =====
function fullHtml(bodyHtml, title) {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title || "문서")}</title>
<style>body{font-family:"함초롬바탕","맑은 고딕",serif;line-height:1.6;margin:40px;}
h1,h2,h3,h4,h5,h6{font-family:"함초롬돋움","맑은 고딕",sans-serif;}
table{border-collapse:collapse;}td,th{border:1px solid #333;padding:6px;}</style></head><body>
${bodyHtml}
</body></html>`;
}

async function renderOutput(input, target, title) {
  // 진짜 HWPX
  if (target === "hwpx") {
    if (input.kind === "md") return await window.HwpxBuilder.fromMarkdown(input.md, title);
    if (input.kind === "html") return await window.HwpxBuilder.fromHtml(input.html, title);
    return await window.HwpxBuilder.fromText(input.plain, title);
  }
  // 진짜 네이티브 DOCX (어디서나 열림)
  if (target === "docx") {
    if (input.kind === "md") return await window.DocxBuilder.fromMarkdown(input.md);
    if (input.kind === "html") return await window.DocxBuilder.fromHtml(input.html);
    return await window.DocxBuilder.fromText(input.plain);
  }
  if (target === "md") {
    // 입력이 md면 원본 유지, 아니면 평문을 md로
    const md = input.kind === "md" ? input.md : input.plain;
    return new Blob([md], { type: "text/markdown;charset=utf-8" });
  }
  if (target === "html") {
    return new Blob([fullHtml(input.html, title)], { type: "text/html;charset=utf-8" });
  }
  if (target === "txt") {
    return new Blob([input.plain], { type: "text/plain;charset=utf-8" });
  }
  throw new Error("지원하지 않는 출력 포맷입니다.");
}

// ===== 변환 실행 =====
convertBtn.addEventListener("click", async () => {
  if (!selectedFile) {
    setStatus("⚠️ 변환할 파일을 먼저 선택하세요.", "error");
    return;
  }
  const target = targetFormat.value;
  const ext = extOf(selectedFile.name);
  const baseName = selectedFile.name.slice(0, selectedFile.name.lastIndexOf(".")) || selectedFile.name;
  const outName = `${baseName}.${target}`;

  convertBtn.disabled = true;
  try {
    // 같은 포맷 → 원본 그대로
    if (ext === target || (target === "html" && ext === "htm") || (target === "md" && ext === "markdown")) {
      setProgress(60);
      await downloadBlob(new Blob([await selectedFile.arrayBuffer()]), outName);
      setStatus("🎉 동일 포맷 — 원본을 저장했습니다.", "ok");
      return;
    }

    setProgress(20);
    setStatus("🔄 문서 분석 중...", "");
    const input = await readInput(selectedFile, ext);

    setProgress(60);
    setStatus("🔄 변환 중...", "");
    const blob = await renderOutput(input, target, baseName);

    setProgress(90);
    await downloadBlob(blob, outName);
    setStatus("🎉 변환 완료! 다운로드를 시작합니다.", "ok");
  } catch (err) {
    console.error(err);
    setStatus("❌ " + err.message, "error");
  } finally {
    convertBtn.disabled = false;
    setTimeout(hideProgress, 800);
  }
});

function downloadBlob(blob, filename) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: true }, () => {
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      resolve();
    });
  });
}

console.log("문서 변환기 사이드바 로드 완료 (서버·AI 없음)");
