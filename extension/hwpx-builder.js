/**
 * hwpx-builder.js — 브라우저 단독 HWPX 생성기 (서버·AI 불필요)
 *
 * 동작 원리:
 *  HWPX는 XML들을 묶은 ZIP 패키지다. 확장에 동봉한 정상 템플릿(assets/template.hwpx)을
 *  JSZip으로 열어서, 본문에 해당하는 Contents/section0.xml 만 새로 만든 단락으로 교체한다.
 *  header.xml(폰트·스타일 정의) 등 나머지 필수 구조는 검증된 템플릿 것을 그대로 재사용하므로
 *  한글에서 정상적으로 열리는 파일이 나온다.
 *
 *  ※ HWPX 단락 XML 구조(textToHpParagraphs, SEC_PR_P)는 NotebookLM Ultra Suite 프로젝트의
 *    검증된 HWPX 빌더 로직을 이식한 것이다.
 *
 * 의존성: window.JSZip (vendor/jszip.min.js 가 먼저 로드되어야 함)
 * 노출:   window.HwpxBuilder = { fromText, fromMarkdown, fromHtml }  → 각각 Promise<Blob> 반환
 */
(function () {
  "use strict";

  // XML 텍스트 노드 특수문자 이스케이프 (파일 손상 방지)
  function escapeXml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // 텍스트(줄 단위)를 hwpml <hp:p> 단락 XML로 변환.
  // 짧은 줄이나 번호로 시작하는 줄은 제목으로 보고 글자 크기를 키운다.
  function textToHpParagraphs(text, startId) {
    let id = startId;
    return text
      .split("\n")
      .filter((l) => l.trim())
      .map((line) => {
        const t = line.trim();
        const isTitle = /^[\dIVXⅠ-Ⅹ가-힣一-龥]+[.)]\s/.test(t) || t.length < 30;
        const vsize = isTitle ? "1400" : "1000";
        const base = isTitle ? "1190" : "850";
        const safe = escapeXml(t);
        return `<hp:p id="${id++}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
  <hp:run charPrIDRef="0"><hp:t>${safe}</hp:t></hp:run>
  <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${vsize}" textheight="${vsize}" baseline="${base}" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
</hp:p>`;
      })
      .join("\n");
  }

  // 섹션 네임스페이스
  const SEC_NS = `xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"`;

  // 섹션 최초 단락(용지·여백 등 secPr 정의) — A4 세로, 기본 여백
  const SEC_PR_P = `  <hp:p id="1000000001" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0">
      <hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">
        <hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>
        <hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>
        <hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>
        <hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>
        <hp:pagePr landscape="NONE" width="59528" height="84186" gutterType="LEFT_ONLY">
          <hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/>
        </hp:pagePr>
        <hp:footNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="EACH_COLUMN" beneathText="0"/>
        </hp:footNotePr>
        <hp:endNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="END_OF_DOCUMENT" beneathText="0"/>
        </hp:endNotePr>
        <hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
        </hp:pageBorderFill>
        <hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
        </hp:pageBorderFill>
        <hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
        </hp:pageBorderFill>
      </hp:secPr>
      <hp:ctrl>
        <hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>
      </hp:ctrl>
    </hp:run>
    <hp:run charPrIDRef="0"><hp:t/></hp:run>
    <hp:linesegarray>
      <hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/>
    </hp:linesegarray>
  </hp:p>`;

  function buildSection0(bodyParagraphs) {
    return `<?xml version='1.0' encoding='UTF-8'?>
<hs:sec ${SEC_NS}>
${SEC_PR_P}
${bodyParagraphs}
</hs:sec>`;
  }

  // 생성된 본문 XML이 실제로 유효한지 파싱 검사 (깨진 파일 방지)
  function assertValidSectionXml(bodyParagraphs) {
    const testXml = `<?xml version='1.0' encoding='UTF-8'?><hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">${bodyParagraphs}</hs:sec>`;
    const doc = new DOMParser().parseFromString(testXml, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) {
      throw new Error("생성된 본문 XML이 유효하지 않습니다: " + (err.textContent || "").slice(0, 100));
    }
  }

  /**
   * 평문 텍스트 → HWPX Blob
   * @param {string} text   본문 (줄바꿈 = 단락 구분)
   * @param {string} title  미리보기/제목용
   * @returns {Promise<Blob>}
   */
  async function fromText(text, title) {
    if (!window.JSZip) throw new Error("JSZip 라이브러리가 로드되지 않았습니다. (vendor/jszip.min.js)");

    const body = textToHpParagraphs(text || "", 2000000001);
    if (!body.trim()) throw new Error("변환할 텍스트 내용이 없습니다.");
    assertValidSectionXml(body);

    // 동봉 템플릿 열기 → section0 만 교체
    const tmplUrl = chrome.runtime.getURL("assets/template.hwpx");
    const resp = await fetch(tmplUrl);
    if (!resp.ok) throw new Error("HWPX 템플릿을 불러올 수 없습니다.");
    const zip = await window.JSZip.loadAsync(await resp.arrayBuffer());

    // mimetype은 반드시 무압축(STORE)으로 유지
    zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
    zip.file("Contents/section0.xml", buildSection0(body));
    zip.file("Preview/PrvText.txt", (title || "문서"));

    return await zip.generateAsync({ type: "blob", mimeType: "application/hwp+zip" });
  }

  // 마크다운 → 평문(기호 제거) 후 HWPX. 표/이미지 등 복잡 요소는 텍스트로 단순화된다.
  function markdownToPlain(md) {
    return String(md)
      .replace(/^#{1,6}\s+/gm, "")          // 제목 기호
      .replace(/\*\*([^*]+)\*\*/g, "$1")    // 굵게
      .replace(/\*([^*]+)\*/g, "$1")        // 기울임
      .replace(/`([^`]+)`/g, "$1")          // 인라인 코드
      .replace(/^\s*[-*+]\s+/gm, "· ")      // 글머리표
      .replace(/^\s*>\s?/gm, "")            // 인용
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // 이미지
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // 링크 → 텍스트
  }

  async function fromMarkdown(md, title) {
    return fromText(markdownToPlain(md), title);
  }

  // HTML → 블록 단위 텍스트 후 HWPX
  function htmlToPlain(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const blocks = doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,td,th,pre,blockquote,div");
    const lines = [];
    if (blocks.length) {
      blocks.forEach((el) => {
        // 자식 블록이 또 있는 컨테이너 div는 건너뛰어 중복 방지
        if (el.tagName === "DIV" && el.querySelector("h1,h2,h3,h4,h5,h6,p,li,td,th,pre,blockquote")) return;
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (t) lines.push(t);
      });
    }
    if (!lines.length) {
      const t = (doc.body.textContent || "").trim();
      if (t) lines.push(t);
    }
    return lines.join("\n");
  }

  async function fromHtml(html, title) {
    return fromText(htmlToPlain(html), title);
  }

  window.HwpxBuilder = { fromText, fromMarkdown, fromHtml, _htmlToPlain: htmlToPlain, _markdownToPlain: markdownToPlain };
})();
