# 초근누구 보안 메모

## v0.3.21 개인정보 처리 원칙

- 업로드한 NEIS·BC카드 자료는 브라우저 메모리에서만 분석합니다.
- 업무자료를 서버로 전송하는 API 요청을 사용하지 않습니다.
- 업무자료를 localStorage, sessionStorage, IndexedDB, Cookie에 저장하지 않습니다.
- CSP에서 `connect-src 'none'`을 적용해 앱의 외부 연결을 제한합니다.
- 실행 JavaScript는 같은 사이트에서만 불러오도록 `script-src 'self'`를 적용합니다.
- 외부 CDN JavaScript 의존성을 제거했습니다.

## 로컬 의존성

- JSZip 3.10.1: `vendor/jszip.min.js`
- JSZip 라이선스: `vendor/JSZIP-LICENSE.markdown`
- XLSX reader: `vendor/xlsx-lite.js` (초근누구용 로컬 코드)

기존 SheetJS 런타임 의존성은 제거했습니다. XLSX는 JSZip으로 압축 구조를 연 뒤 브라우저 DOMParser로 필요한 워크시트 값만 읽습니다.

## 입력 제한

- 업로드 파일: 20MB 이하
- 외부 ZIP: 파일 최대 100개
- ZIP에서 꺼낸 대상 업무파일: 50MB 이하
- XLSX 내부 워크시트 XML: 50MB 이하
- XLSX 공유문자열 XML: 25MB 이하
- 워크시트: 최대 100,000행 / 500,000셀
- 구형 `.xls`: 직접 파싱하지 않음 (`.xlsx`로 재저장 안내)

## 출력 최소화

- 카드번호는 화면 및 카드표 복사 시 마스킹합니다.
- 엑셀 셀에서 읽은 문자열을 HTML에 넣을 때 `escapeHtml()` 처리를 유지합니다.
- 사용자 파일 처리 오류 객체를 콘솔에 그대로 출력하지 않습니다.

## 배포 전 점검

1. 프로젝트 코드에서 `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` 등 외부 전송 코드가 없는지 확인합니다.
2. `localStorage`, `sessionStorage`, `indexedDB` 저장 코드가 없는지 확인합니다.
3. `index.html`에 외부 CDN `<script>`가 없는지 확인합니다.
4. 실제 브라우저 개발자도구 Network에서 파일 업로드 후 외부 요청이 발생하지 않는지 확인합니다.
5. 자료 초기화와 새로고침 후 이전 업무자료가 다시 나타나지 않는지 확인합니다.

## v0.3.21 검증 결과

현재 빌드에서 다음 항목을 확인했습니다.

- `app.js`, `vendor/xlsx-lite.js` JavaScript 구문 검사 통과
- 실행 코드의 외부 CDN JavaScript 참조 0건
- `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` 사용 0건
- `localStorage`, `sessionStorage`, `IndexedDB` 업무자료 저장 코드 0건
- NEIS XLSX/CSV/ZIP 샘플 파싱 통과
- BC카드 XLSX/ZIP 샘플 파싱 통과
- BC카드 `이용내역`의 `접수일자/(승인일자)` 형식 파싱 통과
- 동일 승인번호의 승인/취소 상계 로직 회귀 테스트 통과
- 카드번호 화면 표시 마스킹 확인
- HTML/XSS 형태 문자열 이스케이프 확인
- 20MB 초과 파일 차단 확인
- ZIP 내부 파일 100개 초과 차단 확인
- 구형 `.xls` 차단 및 `.xlsx` 재저장 안내 확인

### 배포 후 수동 확인 1건

현재 제작 환경에서는 Chromium의 로컬/임시 페이지 탐색이 관리자 정책으로 차단되어 실제 GitHub Pages 환경의 DevTools Network 검증을 자동화하지 못했습니다. 배포 후 아래 한 번만 확인합니다.

1. Chrome DevTools → Network 기록을 비웁니다.
2. NEIS 자료와 BC카드 자료를 각각 업로드합니다.
3. 사람/날짜/상세내역을 확인하고 `자료 초기화`를 실행합니다.
4. 같은 사이트의 정적 HTML/CSS/JS 외에 외부 도메인 요청이 생기지 않는지 확인합니다.
5. Console에서 CSP 위반으로 정상 기능이 깨지지 않는지 확인합니다.
