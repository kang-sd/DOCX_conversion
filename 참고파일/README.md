# 문서 변환기 (HWPX / DOCX / MD / HTML / TXT)

**서버·AI·설치 없이 브라우저(크롬 확장) 안에서만 동작하는 문서 변환기.**
불특정 다수에게 그대로 배포할 수 있다 — 사용자는 확장만 설치하면 된다.

## 핵심: HWPX ↔ DOCX 상호 변환

아래아한글(HWPX)과 MS 워드(DOCX)를 **양방향**으로 변환한다. 생성되는 파일은 실제 표준 구조라
한글·워드·LibreOffice·구글독스 어디서나 열린다.

| 입력 → 출력 | HWPX | DOCX | MD | HTML | TXT |
|---|---|---|---|---|---|
| **MD**   | ✅ | ✅ | — | ✅ | ✅ |
| **TXT**  | ✅ | ✅ | ✅ | ✅ | — |
| **HTML** | ✅ | ✅ | ✅ | — | ✅ |
| **DOCX** | ✅ | — | ✅ | ✅ | ✅ |
| **HWPX** | — | ✅ | ✅ | ✅ | ✅ |

> 레거시 `.hwp`(구버전 바이너리)와 `.pdf`의 **원본 읽기**는 브라우저 단독으로 불가하여 입력에서 제외한다.
> (생성 측은 지원. 원본 읽기가 필요하면 별도 서버 엔진이 필요함)

## 동작 원리 (서버가 없는 이유)

HWPX·DOCX는 모두 **XML들을 묶은 ZIP 패키지**다. 따라서 무거운 네이티브 파서 없이도
브라우저 안에서 JSZip으로 직접 조립할 수 있다.

- `hwpx-builder.js` — 동봉한 정상 템플릿(`assets/template.hwpx`)을 열어 본문 `Contents/section0.xml`만
  교체해 진짜 HWPX 생성. (한컴 hwpml 단락 구조 사용)
- `docx-builder.js` — 표준 OOXML(`<w:p><w:r><w:t>`)을 직접 생성. 제목·굵게/기울임·글머리표·한글 폰트 지원.
  (※ `html-docx-js`는 HTML을 altChunk로 감싸 MS 워드에서만 열리므로 사용하지 않음)
- `sidepanel.js` — 입력 파일에서 텍스트/구조를 추출해 목표 포맷으로 렌더링.
- `vendor/jszip.min.js` — ZIP 패키징 (일반 스크립트로 로드).

## 설치 / 사용

1. Chrome에서 `chrome://extensions` 접속 → 우측 상단 **개발자 모드** 켜기
2. **압축해제된 확장 프로그램을 로드** → `extension/` 폴더 선택
3. 툴바 아이콘 클릭 → 사이드패널에서 파일 선택 → 변환 포맷 선택 → **변환 시작**

## 파일 구조 (extension/)

```
extension/
├── manifest.json          # MV3, 권한: downloads·storage·sidePanel (외부 통신 없음)
├── background.js          # 사이드패널 열기만
├── sidepanel.html/js      # UI + 변환 파이프라인
├── hwpx-builder.js        # 진짜 HWPX 생성 (JSZip + 템플릿)
├── docx-builder.js        # 네이티브 DOCX 생성 (OOXML)
├── vendor/jszip.min.js    # ZIP 라이브러리
├── assets/template.hwpx   # HWPX 골격 템플릿
└── icons/
```

## 한계

- 표·도형·각주 등 복잡한 서식은 변환 과정에서 단순화될 수 있다(문단·제목·기본 텍스트는 보존).
- 입력 원본 읽기는 텍스트/문단 수준. 레거시 `.hwp`·`.pdf` 원본은 미지원(위 표 참고).
- `backend/`, `popup*`, `content.js`, `build.js` 등은 구(舊) 백엔드/AI 방식의 잔재로 현재 확장이
  사용하지 않는다(정리 대상).
