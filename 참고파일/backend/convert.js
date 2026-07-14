/**
 * convert.js - 문서 변환 엔진
 * 
 * kordoc, pandoc, LibreOffice 등 다양한 엔진을 통합하여
 * HWP/HWPX/DOCX/PDF/MD/HTML 간 상호 변환을 수행합니다.
 */

const fs = require("fs");
const path = require("path");
const { execSync, exec } = require("child_process");
const os = require("os");

// 지원하는 입력/출력 포맷
const SUPPORTED_INPUT = ["hwp", "hwpx", "docx", "pdf", "md", "html", "htm", "txt"];
const SUPPORTED_OUTPUT = ["hwpx", "docx", "pdf", "md", "html", "txt"];

/**
 * 메인 변환 함수
 * @param {string} inputPath - 입력 파일 경로
 * @param {string} inputExt - 입력 파일 확장자
 * @param {string} outputPath - 출력 파일 경로
 * @param {string} outputExt - 출력 파일 확장자
 */
async function convert(inputPath, inputExt, outputPath, outputExt) {
  const ext = inputExt.toLowerCase();
  const target = outputExt.toLowerCase();

  // 1. kordoc을 이용한 HWP/HWPX 변환
  if ((ext === "hwp" || ext === "hwpx") && (target === "md" || target === "html" || target === "docx")) {
    await convertWithKordoc(inputPath, outputPath, target);
    return;
  }

  // 2. kordoc을 이용한 MD/HTML → HWPX 변환
  if ((ext === "md" || ext === "html" || ext === "htm") && target === "hwpx") {
    await convertToHwpxWithKordoc(inputPath, outputPath, ext);
    return;
  }

  // 3. Pandoc을 이용한 범용 변환
  if (await isPandocAvailable()) {
    await convertWithPandoc(inputPath, ext, outputPath, target);
    return;
  }

  // 4. LibreOffice를 이용한 변환 (폴백)
  if (await isLibreOfficeAvailable()) {
    await convertWithLibreOffice(inputPath, outputPath, target);
    return;
  }

  // 5. 기본 텍스트 변환 (최후의 폴백)
  await convertWithFallback(inputPath, ext, outputPath, target);
}

/**
 * kordoc을 이용한 HWP/HWPX → MD/HTML/DOCX 변환
 */
async function convertWithKordoc(inputPath, outputPath, target) {
  try {
    const kordoc = require("kordoc");
    const arrayBuffer = fs.readFileSync(inputPath).buffer;
    const parsedDoc = await kordoc.parse(arrayBuffer);

    let content = "";

    if (target === "md") {
      content = parsedDocToMarkdown(parsedDoc);
      fs.writeFileSync(outputPath, content, "utf-8");
    } else if (target === "html") {
      content = parsedDocToHtml(parsedDoc);
      fs.writeFileSync(outputPath, content, "utf-8");
    } else if (target === "docx") {
      // MD로 변환 후 pandoc으로 DOCX 생성
      content = parsedDocToMarkdown(parsedDoc);
      const mdPath = outputPath + ".md";
      fs.writeFileSync(mdPath, content, "utf-8");
      try {
        execSync(`pandoc "${mdPath}" -o "${outputPath}"`, { stdio: "pipe" });
      } catch (e) {
        // pandoc 실패 시 html-docx-js 사용
        const htmlContent = parsedDocToHtml(parsedDoc);
        const htmlDocx = require("html-docx-js");
        const docxBuffer = htmlDocx.asBlob(htmlContent);
        fs.writeFileSync(outputPath, Buffer.from(await docxBuffer.arrayBuffer()));
      }
      fs.unlinkSync(mdPath);
    }
  } catch (err) {
    throw new Error(`kordoc 변환 실패: ${err.message}`);
  }
}

/**
 * kordoc을 이용한 MD/HTML → HWPX 변환
 */
async function convertToHwpxWithKordoc(inputPath, outputPath, ext) {
  try {
    const kordoc = require("kordoc");
    const content = fs.readFileSync(inputPath, "utf-8");

    // HTML인 경우 마크다운으로 변환
    let mdContent = content;
    if (ext === "html" || ext === "htm") {
      const { marked } = require("marked");
      // HTML을 MD로 변환 (marked는 HTML→MD를 직접 지원하지 않으므로 turndown 사용)
      try {
        const TurndownService = require("turndown");
        const turndownService = new TurndownService();
        mdContent = turndownService.turndown(content);
      } catch (e) {
        // turndown 없으면 HTML을 그대로 사용
        mdContent = content;
      }
    }

    const hwpxBuffer = await kordoc.markdownToHwpx(mdContent, {
      keepLayout: true,
      defaultFont: "함초롬바탕",
      lineSpacing: 1.6,
      parseTable: true,
    });

    fs.writeFileSync(outputPath, Buffer.from(hwpxBuffer));
  } catch (err) {
    throw new Error(`kordoc HWPX 변환 실패: ${err.message}`);
  }
}

/**
 * Pandoc을 이용한 변환
 */
async function convertWithPandoc(inputPath, inputExt, outputPath, outputExt) {
  return new Promise((resolve, reject) => {
    const fromFormat = getPandocInputFormat(inputExt);
    const toFormat = getPandocOutputFormat(outputExt);

    const cmd = `pandoc "${inputPath}" -f ${fromFormat} -t ${toFormat} -o "${outputPath}" --wrap=preserve`;

    exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Pandoc 변환 실패: ${stderr || error.message}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * LibreOffice를 이용한 변환
 */
async function convertWithLibreOffice(inputPath, outputPath, targetExt) {
  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(outputPath);
    const cmd = `soffice --headless --convert-to ${targetExt} --outdir "${outputDir}" "${inputPath}"`;

    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`LibreOffice 변환 실패: ${stderr || error.message}`));
        return;
      }
      // LibreOffice는 입력 파일명 기반으로 출력 파일 생성
      const baseName = path.basename(inputPath, path.extname(inputPath));
      const loOutputPath = path.join(outputDir, `${baseName}.${targetExt}`);
      if (fs.existsSync(loOutputPath) && loOutputPath !== outputPath) {
        fs.renameSync(loOutputPath, outputPath);
      }
      resolve();
    });
  });
}

/**
 * 기본 텍스트 변환 (최후의 폴백)
 */
async function convertWithFallback(inputPath, inputExt, outputPath, outputExt) {
  let content = "";

  try {
    // 텍스트 파일 읽기
    if (["md", "html", "htm", "txt"].includes(inputExt)) {
      content = fs.readFileSync(inputPath, "utf-8");
    } else if (inputExt === "docx") {
      // docx → txt 기본 추출
      const { execSync } = require("child_process");
      try {
        content = execSync(`pandoc "${inputPath}" -t plain --wrap=none`, {
          encoding: "utf-8",
          timeout: 30000,
        });
      } catch (e) {
        content = `[DOCX 파일: ${path.basename(inputPath)}]\n\n파일을 텍스트로 변환할 수 없습니다. Pandoc 또는 LibreOffice 설치가 필요합니다.`;
      }
    } else {
      content = `[${inputExt.toUpperCase()} 파일: ${path.basename(inputPath)}]\n\n이 파일 형식은 기본 변환기를 지원하지 않습니다.`;
    }

    // 출력 포맷에 따라 저장
    if (outputExt === "md") {
      fs.writeFileSync(outputPath, content, "utf-8");
    } else if (outputExt === "html") {
      const htmlContent = `<html><body><pre>${escapeHtml(content)}</pre></body></html>`;
      fs.writeFileSync(outputPath, htmlContent, "utf-8");
    } else if (outputExt === "txt") {
      fs.writeFileSync(outputPath, content, "utf-8");
    } else if (outputExt === "docx") {
      // html-docx-js로 DOCX 생성
      const htmlDocx = require("html-docx-js");
      const htmlContent = `<html><body>${content.replace(/\n/g, "<br>")}</body></html>`;
      const docxBlob = htmlDocx.asBlob(htmlContent);
      const buffer = Buffer.from(await docxBlob.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);
    } else {
      throw new Error(`지원하지 않는 출력 포맷: ${outputExt}`);
    }
  } catch (err) {
    throw new Error(`기본 변환 실패: ${err.message}`);
  }
}

/**
 * 파싱된 문서를 마크다운으로 변환
 */
function parsedDocToMarkdown(parsedDoc) {
  let md = "";

  if (!parsedDoc || !parsedDoc.sections) {
    return parsedDoc?.text || "";
  }

  for (const section of parsedDoc.sections) {
    if (section.paragraphs) {
      for (const para of section.paragraphs) {
        const text = para.text || "";
        const style = para.style || {};

        // 제목 스타일 처리
        if (style.headingLevel) {
          const prefix = "#".repeat(Math.min(style.headingLevel, 6));
          md += `${prefix} ${text}\n\n`;
        } else if (style.bold && style.italic) {
          md += `***${text}***\n\n`;
        } else if (style.bold) {
          md += `**${text}**\n\n`;
        } else if (style.italic) {
          md += `*${text}*\n\n`;
        } else {
          md += `${text}\n\n`;
        }
      }
    }

    // 표 처리
    if (section.tables) {
      for (const table of section.tables) {
        md += tableToMarkdown(table);
        md += "\n\n";
      }
    }
  }

  return md.trim();
}

/**
 * 파싱된 문서를 HTML로 변환
 */
function parsedDocToHtml(parsedDoc) {
  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:"함초롬바탕",serif;line-height:1.6;margin:40px;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #333;padding:8px;}</style></head><body>';

  if (!parsedDoc || !parsedDoc.sections) {
    html += `<p>${escapeHtml(parsedDoc?.text || "")}</p>`;
    html += "</body></html>";
    return html;
  }

  for (const section of parsedDoc.sections) {
    if (section.paragraphs) {
      for (const para of section.paragraphs) {
        const text = escapeHtml(para.text || "");
        const style = para.style || {};

        if (style.headingLevel) {
          const tag = `h${Math.min(style.headingLevel, 6)}`;
          html += `<${tag}>${text}</${tag}>`;
        } else {
          let styledText = text;
          if (style.bold) styledText = `<strong>${styledText}</strong>`;
          if (style.italic) styledText = `<em>${styledText}</em>`;
          html += `<p>${styledText}</p>`;
        }
      }
    }

    if (section.tables) {
      for (const table of section.tables) {
        html += tableToHtml(table);
      }
    }
  }

  html += "</body></html>";
  return html;
}

/**
 * 표 데이터를 마크다운으로 변환
 */
function tableToMarkdown(table) {
  if (!table.rows || table.rows.length === 0) return "";

  let md = "";
  const headers = table.rows[0].cells || [];

  // 헤더 행
  md += "| " + headers.map(h => h.text || "").join(" | ") + " |\n";
  // 구분선
  md += "| " + headers.map(() => "---").join(" | ") + " |\n";
  // 데이터 행
  for (let i = 1; i < table.rows.length; i++) {
    const cells = table.rows[i].cells || [];
    md += "| " + cells.map(c => c.text || "").join(" | ") + " |\n";
  }

  return md;
}

/**
 * 표 데이터를 HTML로 변환
 */
function tableToHtml(table) {
  if (!table.rows || table.rows.length === 0) return "";

  let html = "<table>";
  for (let i = 0; i < table.rows.length; i++) {
    html += "<tr>";
    const cells = table.rows[i].cells || [];
    for (const cell of cells) {
      const tag = i === 0 ? "th" : "td";
      let colspan = cell.colspan > 1 ? ` colspan="${cell.colspan}"` : "";
      let rowspan = cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : "";
      html += `<${tag}${colspan}${rowspan}>${escapeHtml(cell.text || "")}</${tag}>`;
    }
    html += "</tr>";
  }
  html += "</table>";

  return html;
}

/**
 * Pandoc 입력 포맷 반환
 */
function getPandocInputFormat(ext) {
  const formatMap = {
    md: "markdown",
    html: "html",
    htm: "html",
    docx: "docx",
    txt: "plain",
    hwp: "html",  // HWP는 직접 지원 안 함, HTML로 폴백
    hwpx: "html", // HWPX도 HTML로 폴백
    pdf: "pdf",
  };
  return formatMap[ext] || "plain";
}

/**
 * Pandoc 출력 포맷 반환
 */
function getPandocOutputFormat(ext) {
  const formatMap = {
    md: "markdown",
    html: "html",
    docx: "docx",
    pdf: "pdf",
    txt: "plain",
    hwpx: "html",  // HWPX 직접 출력 불가, HTML로 폴백
  };
  return formatMap[ext] || "plain";
}

/**
 * Pandoc 사용 가능 여부 확인
 */
async function isPandocAvailable() {
  try {
    execSync("pandoc --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * LibreOffice 사용 가능 여부 확인
 */
async function isLibreOfficeAvailable() {
  try {
    execSync("soffice --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """)
      .replace(/'/g, "&#039;");
}

module.exports = { convert, SUPPORTED_INPUT, SUPPORTED_OUTPUT };