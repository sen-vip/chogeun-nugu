/*
 * 초근누구용 최소 XLSX reader
 * - 외부 네트워크 요청 없음
 * - JSZip + 브라우저 DOMParser만 사용
 * - 첫 번째 워크시트를 2차원 문자열 배열로 변환
 * - 사용자 파일을 실행하지 않고 XML 텍스트/숫자 값만 읽음
 */
(() => {
  'use strict';

  const MAX_XLSX_ENTRIES = 1500;
  const MAX_WORKSHEET_XML_SIZE = 50 * 1024 * 1024;
  const MAX_SHARED_STRINGS_SIZE = 25 * 1024 * 1024;
  const MAX_ROWS = 100000;
  const MAX_CELLS = 500000;

  function entrySize(entry) {
    const size = Number(entry?._data?.uncompressedSize);
    return Number.isFinite(size) && size >= 0 ? size : null;
  }

  function assertEntrySize(entry, limit, label) {
    const size = entrySize(entry);
    if (size !== null && size > limit) {
      throw new Error(`${label}의 압축 해제 크기가 너무 큽니다.`);
    }
  }

  function parseXml(text, label) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error(`${label} XML을 안전하게 읽지 못했습니다.`);
    }
    return doc;
  }

  function firstText(parent, tagName) {
    const node = parent.getElementsByTagName(tagName)[0];
    return node ? node.textContent || '' : '';
  }

  function columnIndexFromRef(ref) {
    const letters = String(ref || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
    let value = 0;
    for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64);
    return Math.max(0, value - 1);
  }

  function normalizeTarget(target) {
    const raw = String(target || '').replace(/\\/g, '/');
    if (!raw) return '';
    if (raw.startsWith('/')) return raw.replace(/^\//, '');
    if (raw.startsWith('xl/')) return raw;
    const parts = ['xl'];
    raw.split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') parts.pop();
      else parts.push(part);
    });
    return parts.join('/');
  }

  function builtInDateFormat(numFmtId) {
    return (numFmtId >= 14 && numFmtId <= 22) || (numFmtId >= 27 && numFmtId <= 36) ||
      (numFmtId >= 45 && numFmtId <= 47) || (numFmtId >= 50 && numFmtId <= 58);
  }

  function classifyFormat(numFmtId, formatCode = '') {
    if (builtInDateFormat(numFmtId)) {
      if (numFmtId >= 45 && numFmtId <= 47) return { kind: 'time', duration: numFmtId === 46 };
      return { kind: 'date', duration: false };
    }

    const original = String(formatCode || '').toLowerCase();
    const duration = /\[[hms]+\]/i.test(original);
    const cleaned = original
      .replace(/"[^"]*"/g, '')
      .replace(/\\./g, '')
      .replace(/\[[^\]]*(?:color|red|blue|green|black|white|>=|<=|=|>|<)[^\]]*\]/gi, '')
      .replace(/_.|\*./g, '');

    const hasYear = /y/.test(cleaned);
    const hasDay = /d/.test(cleaned);
    const hasHour = /h/.test(cleaned) || /\[h\]/.test(cleaned);
    const hasSecond = /s/.test(cleaned) || /\[s\]/.test(cleaned);
    const hasMonth = /m/.test(cleaned);

    if (hasYear || hasDay) return { kind: hasHour || hasSecond ? 'datetime' : 'date', duration };
    if (hasHour || hasSecond || (hasMonth && /:/.test(cleaned)) || duration) return { kind: 'time', duration };
    return { kind: 'number', duration: false };
  }

  function formatExcelNumber(value, styleInfo, date1904) {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value ?? '');
    const { kind, duration } = styleInfo || { kind: 'number', duration: false };
    if (kind === 'number') return String(num);

    const totalSeconds = Math.round(num * 86400);
    const secondOfDay = ((totalSeconds % 86400) + 86400) % 86400;
    const hh = duration ? Math.floor(Math.abs(totalSeconds) / 3600) : Math.floor(secondOfDay / 3600);
    const mm = Math.floor((duration ? Math.abs(totalSeconds) : secondOfDay) % 3600 / 60);
    const ss = Math.floor((duration ? Math.abs(totalSeconds) : secondOfDay) % 60);
    const timeText = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${ss ? `:${String(ss).padStart(2, '0')}` : ''}`;

    if (kind === 'time') return timeText;

    const wholeDays = Math.floor(num);
    const fraction = num - wholeDays;
    let millis;
    if (date1904) {
      millis = Date.UTC(1904, 0, 1) + wholeDays * 86400000;
    } else {
      // 1900 date system의 윤년 버그를 포함한 현대 Excel 날짜와 호환되는 기준.
      millis = Date.UTC(1899, 11, 30) + wholeDays * 86400000;
    }
    const date = new Date(millis);
    const dateText = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    if (kind === 'datetime' || fraction > 0.000001) return `${dateText} ${timeText}`;
    return dateText;
  }

  async function readSharedStrings(zip) {
    const entry = zip.file('xl/sharedStrings.xml');
    if (!entry) return [];
    assertEntrySize(entry, MAX_SHARED_STRINGS_SIZE, '공유문자열');
    const doc = parseXml(await entry.async('string'), '공유문자열');
    return Array.from(doc.getElementsByTagName('si')).map(si =>
      Array.from(si.getElementsByTagName('t')).map(node => node.textContent || '').join('')
    );
  }

  async function readStyles(zip) {
    const entry = zip.file('xl/styles.xml');
    if (!entry) return [];
    const doc = parseXml(await entry.async('string'), '스타일');
    const custom = new Map();
    Array.from(doc.getElementsByTagName('numFmt')).forEach(node => {
      const id = Number(node.getAttribute('numFmtId'));
      const code = node.getAttribute('formatCode') || '';
      if (Number.isFinite(id)) custom.set(id, code);
    });

    const cellXfs = doc.getElementsByTagName('cellXfs')[0];
    if (!cellXfs) return [];
    return Array.from(cellXfs.getElementsByTagName('xf')).map(xf => {
      const id = Number(xf.getAttribute('numFmtId') || 0);
      return classifyFormat(id, custom.get(id) || '');
    });
  }

  async function getFirstWorksheet(zip) {
    const workbookEntry = zip.file('xl/workbook.xml');
    const relsEntry = zip.file('xl/_rels/workbook.xml.rels');
    if (!workbookEntry || !relsEntry) throw new Error('올바른 XLSX 통합문서가 아닙니다.');

    const workbookDoc = parseXml(await workbookEntry.async('string'), '통합문서');
    const relsDoc = parseXml(await relsEntry.async('string'), '통합문서 관계');
    const sheet = workbookDoc.getElementsByTagName('sheet')[0];
    if (!sheet) throw new Error('XLSX에서 워크시트를 찾지 못했습니다.');

    const relId = sheet.getAttribute('r:id') || sheet.getAttribute('id');
    const relationship = Array.from(relsDoc.getElementsByTagName('Relationship'))
      .find(node => node.getAttribute('Id') === relId);
    if (!relationship) throw new Error('XLSX 워크시트 경로를 찾지 못했습니다.');

    const target = normalizeTarget(relationship.getAttribute('Target'));
    const entry = zip.file(target);
    if (!entry) throw new Error('XLSX 워크시트 파일을 찾지 못했습니다.');
    assertEntrySize(entry, MAX_WORKSHEET_XML_SIZE, '워크시트');

    const workbookPr = workbookDoc.getElementsByTagName('workbookPr')[0];
    const date1904 = workbookPr?.getAttribute('date1904') === '1' || workbookPr?.getAttribute('date1904') === 'true';
    return { entry, date1904 };
  }

  function readCellValue(cell, sharedStrings, styles, date1904) {
    const type = cell.getAttribute('t') || '';
    if (type === 'inlineStr') {
      const inline = cell.getElementsByTagName('is')[0];
      return inline ? Array.from(inline.getElementsByTagName('t')).map(node => node.textContent || '').join('') : '';
    }

    const raw = firstText(cell, 'v');
    if (type === 's') return sharedStrings[Number(raw)] ?? '';
    if (type === 'str' || type === 'e') return raw;
    if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
    if (type === 'd') return raw;
    if (!raw) return '';

    const styleId = Number(cell.getAttribute('s') || 0);
    return formatExcelNumber(raw, styles[styleId], date1904);
  }

  async function readRows(buffer) {
    if (!window.JSZip) throw new Error('로컬 ZIP 읽기 라이브러리를 불러오지 못했습니다.');
    const zip = await window.JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files);
    if (entries.length > MAX_XLSX_ENTRIES) throw new Error('XLSX 내부 파일 수가 비정상적으로 많습니다.');

    const [{ entry: sheetEntry, date1904 }, sharedStrings, styles] = await Promise.all([
      getFirstWorksheet(zip),
      readSharedStrings(zip),
      readStyles(zip),
    ]);

    const sheetDoc = parseXml(await sheetEntry.async('string'), '워크시트');
    const rows = [];
    let cellCount = 0;

    const rowNodes = Array.from(sheetDoc.getElementsByTagName('row'));
    if (rowNodes.length > MAX_ROWS) throw new Error('워크시트 행 수가 너무 많습니다.');

    rowNodes.forEach((rowNode, logicalRowIndex) => {
      const rowIndex = Math.max(0, Number(rowNode.getAttribute('r') || logicalRowIndex + 1) - 1);
      if (rowIndex >= MAX_ROWS) throw new Error('워크시트 행 번호가 허용 범위를 벗어났습니다.');
      const row = [];
      Array.from(rowNode.getElementsByTagName('c')).forEach((cell, sequentialIndex) => {
        cellCount += 1;
        if (cellCount > MAX_CELLS) throw new Error('워크시트 셀 수가 너무 많습니다.');
        const colIndex = cell.getAttribute('r') ? columnIndexFromRef(cell.getAttribute('r')) : sequentialIndex;
        if (colIndex > 5000) throw new Error('워크시트 열 수가 비정상적으로 많습니다.');
        row[colIndex] = readCellValue(cell, sharedStrings, styles, date1904);
      });
      while (row.length && (row[row.length - 1] === '' || row[row.length - 1] == null)) row.pop();
      rows[rowIndex] = row;
    });

    return rows.map(row => row || []);
  }

  window.XLSX_LITE = Object.freeze({ readRows });
})();
