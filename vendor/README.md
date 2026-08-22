# Vendored / local scripts

초근누구 v0.3.21은 실행 시 외부 CDN JavaScript를 불러오지 않습니다.

- `jszip.min.js`: JSZip 3.10.1, 로컬 번들
  - SHA-256: `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e`
  - 라이선스: `JSZIP-LICENSE.markdown`
- `xlsx-lite.js`: 초근누구 전용 최소 XLSX reader
  - SHA-256: `e034189c52058b520177d998073fd43d0863d2aa3c644e9e29feb34d6ce11126`
  - JSZip과 브라우저 DOMParser를 이용해 첫 번째 워크시트 값을 읽습니다.

배포 시 이 폴더를 `index.html`과 함께 그대로 올려야 합니다.
