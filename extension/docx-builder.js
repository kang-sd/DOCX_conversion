/**
 * docx-builder.js — 브라우저 단독 네이티브 DOCX(OOXML) 생성기
 *
 * html-docx-js 는 HTML을 altChunk(MHT)로 감싸기만 해서 MS 워드에서만 열리는 문제가 있다.
 * 이 빌더는 진짜 <w:p><w:r><w:t> 문단을 직접 만들어 워드·한글·LibreOffice·구글독스 어디서나
 * 열리는 표준 .docx 를 생성한다. (HWPX 빌더와 대칭 구조 → HWPX↔DOCX 상호변환의 기반)
 *
 * 의존: window.JSZip
 * 노출: window.DocxBuilder = { fromText, fromMarkdown, fromHtml }  → Promise<Blob>
 *
 * 블록 표현: { type: 'h1'|'h2'|'h3'|'p'|'li', runs:[{text, bold, italic}] }
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---- 입력 → 블록 배열 ----

  // 평문: 짧거나 번호로 시작하는 줄은 제목(h2)으로 간주 (HWPX 빌더와 동일 휴리스틱)
  function textToBlocks(text) {
    return String(text).split(/\r?\n/).filter((l) => l.trim()).map((line) => {
      const t = line.trim();
      const isTitle = /^[\dIVXⅠ-Ⅹ가-힣一-龥]+[.)]\s/.test(t) || t.length < 30;
      return { type: isTitle ? "h2" : "p", runs: [{ text: t }] };
    });
  }

  function mdInline(s) {
    // **굵게**, *기울임*, `코드` → run 분할
    const runs = [];
    let rest = String(s);
    const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/;
    let m;
    while ((m = rest.match(re))) {
      if (m.index > 0) runs.push({ text: rest.slice(0, m.index) });
      if (m[2] != null) runs.push({ text: m[2], bold: true });
      else if (m[3] != null) runs.push({ text: m[3], italic: true });
      else if (m[4] != null) runs.push({ text: m[4] });
      rest = rest.slice(m.index + m[0].length);
    }
    if (rest) runs.push({ text: rest });
    return runs.length ? runs : [{ text: String(s) }];
  }

  function markdownToBlocks(md) {
    const blocks = [];
    for (const raw of String(md).replace(/\r\n?/g, "\n").split("\n")) {
      const line = raw.replace(/\s+$/, "");
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      const li = line.match(/^\s*[-*+]\s+(.*)$/);
      if (h) {
        const lv = Math.min(h[1].length, 3);
        blocks.push({ type: "h" + lv, runs: mdInline(h[2]) });
      } else if (li) {
        blocks.push({ type: "li", runs: mdInline(li[1]) });
      } else if (line.trim()) {
        blocks.push({ type: "p", runs: mdInline(line) });
      }
    }
    return blocks;
  }

  function htmlToBlocks(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const els = doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,td,th,pre,blockquote");
    const blocks = [];
    els.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      let type = "p";
      if (/^h[1-6]$/.test(tag)) type = "h" + Math.min(parseInt(tag[1], 10), 3);
      else if (tag === "li") type = "li";
      blocks.push({ type, runs: [{ text: t }] });
    });
    if (!blocks.length) {
      const t = (doc.body.textContent || "").trim();
      if (t) blocks.push({ type: "p", runs: [{ text: t }] });
    }
    return blocks;
  }

  // ---- 블록 → document.xml ----

  function runXml(run) {
    const rpr = [];
    if (run.bold) rpr.push("<w:b/>");
    if (run.italic) rpr.push("<w:i/>");
    const rprXml = rpr.length ? `<w:rPr>${rpr.join("")}</w:rPr>` : "";
    return `<w:r>${rprXml}<w:t xml:space="preserve">${esc(run.text)}</w:t></w:r>`;
  }

  function paragraphXml(block) {
    const styleMap = { h1: "Heading1", h2: "Heading2", h3: "Heading3", li: "ListParagraph" };
    const ppr = [];
    if (styleMap[block.type]) ppr.push(`<w:pStyle w:val="${styleMap[block.type]}"/>`);
    if (block.type === "li") ppr.push('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
    const pprXml = ppr.length ? `<w:pPr>${ppr.join("")}</w:pPr>` : "";
    const runs = (block.runs || []).map(runXml).join("");
    return `<w:p>${pprXml}${runs}</w:p>`;
  }

  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

  // 한글 기본 폰트(맑은 고딕) + 제목 스타일 정의
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕" w:cs="맑은 고딕"/>
    <w:sz w:val="22"/><w:szCs w:val="22"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720"/></w:pPr></w:style>
</w:styles>`;

  const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0">
    <w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
  </w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

  function buildDocumentXml(blocks) {
    const body = blocks.map(paragraphXml).join("\n    ");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  }

  async function buildBlob(blocks) {
    if (!window.JSZip) throw new Error("JSZip 라이브러리가 로드되지 않았습니다.");
    if (!blocks.length) throw new Error("변환할 내용이 없습니다.");
    const zip = new window.JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.folder("_rels").file(".rels", RELS);
    const word = zip.folder("word");
    word.file("document.xml", buildDocumentXml(blocks));
    word.file("styles.xml", STYLES);
    word.file("numbering.xml", NUMBERING);
    word.folder("_rels").file("document.xml.rels", DOC_RELS);
    return await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  async function fromText(text) { return buildBlob(textToBlocks(text)); }
  async function fromMarkdown(md) { return buildBlob(markdownToBlocks(md)); }
  async function fromHtml(html) { return buildBlob(htmlToBlocks(html)); }

  window.DocxBuilder = { fromText, fromMarkdown, fromHtml, _textToBlocks: textToBlocks, _buildDocumentXml: buildDocumentXml };
})();
