const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const axios = require("axios");
const FormData = require("form-data");
const { convert, SUPPORTED_INPUT, SUPPORTED_OUTPUT } = require("./convert.js");

const app = express();
app.use(cors()); // 크롬 확장(다른 origin)에서의 요청 허용

const upload = multer({ dest: os.tmpdir() });

app.get("/health", (req, res) => {
  res.json({ status: "ok", supportedInput: SUPPORTED_INPUT, supportedOutput: SUPPORTED_OUTPUT });
});

app.post("/convert", upload.single("file"), async (req, res) => {
  const targetExt = (req.body.target || "").toLowerCase();
  const uploadedFile = req.file;

  if (!uploadedFile) {
    return res.status(400).json({ error: "file 필드로 파일을 첨부해주세요." });
  }
  if (!SUPPORTED_OUTPUT.includes(targetExt)) {
    return res.status(400).json({
      error: `target은 다음 중 하나여야 합니다: ${SUPPORTED_OUTPUT.join(", ")}`,
    });
  }

  const originalExt = path.extname(uploadedFile.originalname).replace(".", "").toLowerCase();
  const outputPath = uploadedFile.path + "." + targetExt;

  try {
    await convert(uploadedFile.path, originalExt, outputPath, targetExt);

    const baseName = path.basename(uploadedFile.originalname, path.extname(uploadedFile.originalname));
    res.download(outputPath, `${baseName}.${targetExt}`, (err) => {
      // 임시 파일 정리
      fs.unlink(uploadedFile.path, () => {});
      fs.unlink(outputPath, () => {});
      if (err) console.error("다운로드 전송 오류:", err);
    });
  } catch (err) {
    console.error(err);
    fs.unlink(uploadedFile.path, () => {});
    res.status(500).json({ error: err.message || "변환 중 오류가 발생했습니다." });
  }
});
app.post("/api/convert/local", upload.single("file"), (req, res) => {
  const targetExt = (req.body.target || "").toLowerCase();
  const uploadedFile = req.file;

  if (!uploadedFile) {
    return res.status(400).send("file 필드로 파일을 첨부해주세요.");
  }
  
  const originalExt = path.extname(uploadedFile.originalname).replace(".", "").toLowerCase();
  const outputPath = uploadedFile.path + "." + targetExt;
  
  // PDF to DOCX 요청인 경우 파이썬 pdf2docx 호출
  if (originalExt === "pdf" && targetExt === "docx") {
    // 패키징 환경(pkg) 지원: 서버 실행 파일(.exe)과 동일한 폴더에 있는 pdf_converter.exe 사용
    const exeDir = process.pkg ? path.dirname(process.execPath) : __dirname;
    const converterPath = path.join(exeDir, "pdf_converter.exe");
    const cmd = `"${converterPath}" "${uploadedFile.path}" "${outputPath}"`;
    exec(cmd, { cwd: exeDir }, (error, stdout, stderr) => {
      if (error) {
        console.error("Local conversion error:", stderr);
        fs.unlink(uploadedFile.path, () => {});
        return res.status(500).send("PDF 변환 중 서버 오류가 발생했습니다.");
      }
      
      const baseName = path.basename(uploadedFile.originalname, path.extname(uploadedFile.originalname));
      res.download(outputPath, `${baseName}.${targetExt}`, (err) => {
        fs.unlink(uploadedFile.path, () => {});
        fs.unlink(outputPath, () => {});
      });
    });
  } else {
    fs.unlink(uploadedFile.path, () => {});
    res.status(400).send("로컬 고품질 모드는 현재 PDF -> DOCX 변환만 지원합니다.");
  }
});

app.post("/api/convert/cloud", upload.single("file"), async (req, res) => {
  const targetExt = (req.body.target || "").toLowerCase();
  const uploadedFile = req.file;

  if (!uploadedFile) {
    return res.status(400).send("file 필드로 파일을 첨부해주세요.");
  }

  // TODO: 실제 상용 클라우드 API (ConvertAPI, Adobe 등) 연동
  // 사용자의 별도 Secret Key 제공 및 결제 연동이 필요하므로 현재는 안내 메시지를 반환합니다.
  fs.unlink(uploadedFile.path, () => {});
  return res.status(501).send("클라우드 변환 API (ConvertAPI) 키가 서버에 설정되지 않았습니다. 관리자에게 문의하세요.");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`문서 변환 다중 엔진 백엔드 서버 실행 중: http://localhost:${PORT}`);
});
