const COL = {
  seq: 0,
  dept: 1,
  position: 2,
  name: 3,
  date: 4,
  type: 5,
  personalStart: 6,
  personalEnd: 7,
  requestStart: 8,
  requestEnd: 9,
  requestTotal: 10,
  actualStart: 11,
  actualEnd: 12,
  afterClassDeduct: 13,
  actualTotal: 14,
  requestStatus: 16,
  approvalStatus: 17,
  holidayRequest: 18,
  flexibleRequest: 19,
  dinnerDeduct: 20,
  substituteHoliday: 21,
};

// 헤더 행을 찾지 못한 구형/변형 NEIS 파일용 안전한 고정열 매핑.
// 핵심 시간/성명 열만 기존 위치를 사용하고, 상태·선택형 열은 절대 추정하지 않는다.
// 잘못된 17번째 열 값이 결재상태 배지로 노출되는 문제(예: '사김')를 방지한다.
const SAFE_LEGACY_COL = {
  ...COL,
  requestStatus: -1,
  approvalStatus: -1,
  holidayRequest: -1,
  flexibleRequest: -1,
  dinnerDeduct: -1,
  substituteHoliday: -1,
};

const DEFAULT_MEAL_LIMIT = 9000;

const EXCLUDE_KEYWORDS = [
  'g마켓', '지마켓', '11번가', '예스이십사', '예스24', 'yes24', 'kcp', 'nice_', 'nice',
  '결제대행', 'ssg', '에스에스지', '우체국', '테크빌', '티처몰', '바이팜', '의약품',
  '스포츠', '도서', '문화비', '휴대폰메시지', '센티맷', '윈윈스포츠'
];

const FOOD_KEYWORDS = [
  '김밥', '토스트', '통닭', '치킨', '떡볶', '포케', '분식', '푸드', '식당', '장어',
  '갈릭', '카페', '커피', '베이커리', '과자점', '빵', '마켓', '편의점', 'cu', 'gs25',
  '세븐', '도시락', '밥', '국밥', '곰탕', '설렁탕', '돈까스', '돈가스', '스시', '초밥',
  '우동', '라멘', '짜장', '짬뽕', '한식', '중식', '일식', '양식', '레스토랑', '뽕나무',
  '달콤', '오토김밥', '바르다김선생', '나폴레옹', '매드포갈릭', '이삭토스트', '옛날통닭'
];

const state = {
  records: [],
  filtered: [],
  cardRecords: [],
  currentYear: null,
  currentMonth: null,
  selectedDate: null,
  currentView: 'calendar',
  mealLimit: DEFAULT_MEAL_LIMIT,
  maskNames: false,
  demoMode: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const fileInput = $('#fileInput');
const cardFileInput = $('#cardFileInput');
const dropZone = $('#dropZone');
const cardDropZone = $('#cardDropZone');
const statusCard = $('#statusCard');
const cardStatusCard = $('#cardStatusCard');
const fileName = $('#fileName');
const cardFileName = $('#cardFileName');
const parseNote = $('#parseNote');
const cardParseNote = $('#cardParseNote');
const resetBtn = $('#resetBtn');
const resetCardBtn = $('#resetCardBtn');
const summaryGrid = $('#summaryGrid');
const toolbar = $('#toolbar');
const contentGrid = $('#contentGrid');
const tableView = $('#tableView');
const cardView = $('#cardView');
const calendarGrid = $('#calendarGrid');
const detailCard = $('#detailCard');
const monthTitle = $('#monthTitle');
const nameSearch = $('#nameSearch');
const approvalFilter = $('#approvalFilter');
const showZero = $('#showZero');
const showAllCards = $('#showAllCards');
const tableBody = $('#tableBody');
const cardTableBody = $('#cardTableBody');
const toast = $('#toast');
const mealLimitInput = $('#mealLimitInput');
const maskNames = $('#maskNames');
const demoBtn = $('#demoBtn');
const demoBanner = $('#demoBanner');
const exitDemoBtn = $('#exitDemoBtn');
const helpModal = $('#helpModal');
const helpOpenBtn = $('#helpOpenBtn');
const helpCloseBtn = $('#helpCloseBtn');
let helpReturnFocus = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1900);
}

function minutesFromTime(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(minutes) {
  const safe = Math.max(0, Number(minutes) || 0);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value || '').trim();
  if (!text) return '';

  const iso = text.match(/(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const short = text.match(/(\d{1,2})[-./월\s]+(\d{1,2})/);
  if (short && state.currentYear) {
    const m = Number(short[1]);
    const d = Number(short[2]);
    return `${state.currentYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return text;
}

function extractCardDates(value) {
  const text = String(value || '').trim();
  const matches = Array.from(text.matchAll(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g));
  const dates = matches.map(match => {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });
  return {
    postingDate: dates[0] || '',
    approvalDate: dates[1] || dates[0] || '',
  };
}

function dateLabel(dateKey) {
  if (!dateKey) return '-';
  const [y, m, d] = dateKey.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${y}. ${m}. ${d}.(${weekdays[day]})`;
}

function moneyFormat(num) {
  return new Intl.NumberFormat('ko-KR').format(Number(num) || 0);
}

function getMealLimit() {
  return Number(state.mealLimit) > 0 ? Number(state.mealLimit) : DEFAULT_MEAL_LIMIT;
}

function sanitizeName(name) {
  return String(name || '')
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function displayName(name, context = 'detail') {
  const clean = sanitizeName(name);
  return state.maskNames ? maskName(clean, context) : clean;
}

function maskName(name, context = 'detail') {
  const clean = sanitizeName(name);
  if (!clean) return '';

  if (context === 'calendar') {
    if (clean.length === 1) return '○';
    return `${clean[0]}○`;
  }

  if (clean.length === 1) return '○';
  if (clean.length === 2) return `${clean[0]}○`;
  return `${clean[0]}○${clean[clean.length - 1]}`;
}

function refreshCardCalculations() {
  const limit = getMealLimit();
  state.cardRecords.forEach(card => {
    const category = classifyCard(card.merchant, card.amount, card.salesType, card.note);
    Object.assign(card, category);
    card.requiredPeople = card.amount > 0 ? Math.ceil(card.amount / limit) : 0;
  });
}

function syncMealLimitFromInput({ format = false } = {}) {
  const digits = String(mealLimitInput?.value || '').replace(/[^\d]/g, '');
  const nextValue = digits ? Number(digits) : DEFAULT_MEAL_LIMIT;
  state.mealLimit = nextValue > 0 ? nextValue : DEFAULT_MEAL_LIMIT;
  if (format && mealLimitInput) mealLimitInput.value = moneyFormat(state.mealLimit);
  refreshCardCalculations();
  if (state.records.length || state.cardRecords.length) renderAll();
}


function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value || '').replace(/[,원\s]/g, '').trim();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Math.round(Number(match[0])) : 0;
}

function normalizeHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').replace(/\s+/g, '').trim();
}


function rowsFromWorkbook(workbook) {
  if (workbook?.__rows) return workbook.__rows;
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function isApprovalStatusHeader(header) {
  return (header.includes('승인') || header.includes('결재')) && header.includes('상태');
}

function sanitizeApprovalStatus(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  // 결재상태로 볼 수 있는 대표 표현만 허용한다.
  // 이름/직급/기타 열의 우연한 문자열이 배지로 노출되지 않도록 하는 2차 안전장치다.
  const validKeywords = ['승인', '결재', '완료', '반려', '기각', '대기', '진행', '상신', '취소', '사후', '사전'];
  return validKeywords.some(keyword => text.includes(keyword)) ? text : '';
}

function findOvertimeHeaderIndex(rows) {
  return rows.findIndex(row => {
    const headers = row.map(normalizeHeader);
    const hasName = headers.some(header => header === '성명');
    const hasDate = headers.some(header => header.includes('초과근무') && header.includes('일자'));
    const hasActualTotal = headers.some(header =>
      (header.includes('실제초과') || header.includes('실제')) && header.includes('시간합')
    );
    // NEIS 파일에 따라 '승인상태'가 아니라 '결재상태'로 내려오는 경우가 있으므로
    // 상태 열 존재 여부와 무관하게 핵심 열만으로 헤더 행을 찾는다.
    return hasName && hasDate && hasActualTotal;
  });
}

function getOvertimeColumns(headerRow) {
  const headers = (headerRow || []).map(normalizeHeader);
  const pick = (tests, fallback) => {
    const index = headers.findIndex(header => tests.some(test => test(header)));
    return index >= 0 ? index : fallback;
  };
  const pickOptional = (tests) => headers.findIndex(header => tests.some(test => test(header)));

  return {
    ...COL,
    seq: pick([h => h === '순번' || h === '번호'], COL.seq),
    dept: pick([h => h.includes('부서')], COL.dept),
    position: pick([h => h === '직위' || h.includes('직위')], COL.position),
    name: pick([h => h === '성명'], COL.name),
    date: pick([h => h.includes('초과근무') && h.includes('일자')], COL.date),
    type: pick([h => h.includes('근무') && (h.includes('유형') || h.includes('종별'))], COL.type),
    personalStart: pick([h => h.includes('개인') && h.includes('시작')], COL.personalStart),
    personalEnd: pick([h => h.includes('개인') && (h.includes('종료') || h.includes('끝'))], COL.personalEnd),
    requestStart: pick([h => h.includes('신청') && h.includes('시작')], COL.requestStart),
    requestEnd: pick([h => h.includes('신청') && (h.includes('종료') || h.includes('끝'))], COL.requestEnd),
    requestTotal: pick([h => h.includes('신청') && h.includes('시간합')], COL.requestTotal),
    actualStart: pick([h => h.includes('실제') && h.includes('시작')], COL.actualStart),
    actualEnd: pick([h => h.includes('실제') && (h.includes('종료') || h.includes('끝'))], COL.actualEnd),
    afterClassDeduct: pick([h => h.includes('방과후') && (h.includes('차감') || h.includes('공제'))], COL.afterClassDeduct),
    actualTotal: pick([h => (h.includes('실제초과') || h.includes('실제')) && h.includes('시간합')], COL.actualTotal),

    // 상태/선택형 열은 못 찾았을 때 예전 고정 열번호로 돌아가지 않는다.
    // 잘못된 열의 텍스트(예: '사김')가 배지로 표시되는 것을 막는다.
    requestStatus: pickOptional([h => h.includes('신청') && h.includes('상태')]),
    approvalStatus: pickOptional([h => isApprovalStatusHeader(h)]),
    holidayRequest: pickOptional([h => h.includes('휴일') && h.includes('신청')]),
    flexibleRequest: pickOptional([h => (h.includes('유연') || h.includes('탄력')) && h.includes('신청')]),
    dinnerDeduct: pickOptional([h => (h.includes('저녁') || h.includes('석식')) && (h.includes('공제') || h.includes('차감'))]),
    substituteHoliday: pickOptional([h => (h.includes('대체') || h.includes('보상')) && (h.includes('휴무') || h.includes('휴일'))]),
  };
}

function readCell(row, index) {
  return index >= 0 ? String(row[index] || '').trim() : '';
}

function decodeTextBuffer(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (utf8.includes('\uFFFD')) {
    try {
      return new TextDecoder('euc-kr').decode(buffer).replace(/^\uFEFF/, '');
    } catch (error) {
      return utf8.replace(/^\uFEFF/, '');
    }
  }
  return utf8.replace(/^\uFEFF/, '');
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      if (text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (char === '\n') {
      row.push(field);
      if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
  }

  return rows;
}

function workbookFromCsvBuffer(buffer) {
  const text = decodeTextBuffer(buffer);
  return { __rows: parseCsvRows(text), __kind: 'csv' };
}

function parseWorkbook(workbook) {
  const rows = rowsFromWorkbook(workbook);
  const headerIndex = findOvertimeHeaderIndex(rows);
  const columns = headerIndex >= 0 ? getOvertimeColumns(rows[headerIndex]) : SAFE_LEGACY_COL;
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows.slice(2);

  return dataRows
    .map((row, index) => {
      const date = normalizeDate(row[columns.date]);
      const actualMinutes = minutesFromTime(row[columns.actualTotal]);
      const rawName = String(row[columns.name] || '').trim();
      const name = sanitizeName(rawName);
      return {
        id: `${date}-${rawName || name}-${index}`,
        seq: readCell(row, columns.seq),
        dept: readCell(row, columns.dept),
        position: readCell(row, columns.position),
        name,
        rawName,
        date,
        type: readCell(row, columns.type),
        personalStart: readCell(row, columns.personalStart),
        personalEnd: readCell(row, columns.personalEnd),
        requestStart: readCell(row, columns.requestStart),
        requestEnd: readCell(row, columns.requestEnd),
        requestTotal: readCell(row, columns.requestTotal),
        actualStart: readCell(row, columns.actualStart),
        actualEnd: readCell(row, columns.actualEnd),
        afterClassDeduct: readCell(row, columns.afterClassDeduct),
        actualTotal: readCell(row, columns.actualTotal) || '00:00',
        actualMinutes,
        requestStatus: readCell(row, columns.requestStatus),
        approvalStatus: sanitizeApprovalStatus(readCell(row, columns.approvalStatus)),
        holidayRequest: readCell(row, columns.holidayRequest),
        flexibleRequest: readCell(row, columns.flexibleRequest),
        dinnerDeduct: readCell(row, columns.dinnerDeduct),
        substituteHoliday: readCell(row, columns.substituteHoliday),
      };
    })
    .filter(record => record.name && record.date);
}

function findColumn(headers, tests) {
  return headers.findIndex(header => tests.some(test => test(header)));
}

function classifyCard(merchant, amount, salesType = '', note = '') {
  const text = `${merchant} ${salesType} ${note}`.toLowerCase();
  const isCancel = amount < 0 || text.includes('취소');
  const isExcluded = EXCLUDE_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()));
  const keywordHit = FOOD_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()));
  const amountPattern = amount > 0 && (amount <= getMealLimit() || amount % getMealLimit() === 0 || (amount <= 45000 && amount % 1000 === 0));
  const isMealCandidate = !isCancel && !isExcluded && amount > 0 && (keywordHit || amountPattern);

  let label = '일반';
  if (isCancel) label = '취소/차감';
  else if (isExcluded) label = '제외 추정';
  else if (isMealCandidate) label = keywordHit ? '식비 후보' : '금액 후보';

  return { isCancel, isExcluded, isMealCandidate, keywordHit, amountPattern, label };
}

function getCardWorkbookLayout(headers) {
  const joined = headers.join('|');
  const hasMerchant = joined.includes('가맹점명');
  const hasApprovalAmount = joined.includes('승인금액');
  const hasClaimAmount = joined.includes('청구금액');
  const hasApprovalDate = joined.includes('승인일자');
  const hasPostingApprovalDate = joined.includes('접수일자') && joined.includes('승인일자');

  if (hasMerchant && hasApprovalAmount && hasApprovalDate) return 'approval';
  if (hasMerchant && hasClaimAmount && hasPostingApprovalDate) return 'usage';
  if (hasMerchant && hasClaimAmount) return 'usage';
  return '';
}

function parseCardWorkbook(workbook) {
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const headerIndex = rows.findIndex(row => {
    const headers = row.map(normalizeHeader);
    return Boolean(getCardWorkbookLayout(headers));
  });

  if (headerIndex < 0) {
    throw new Error('BC카드 승인내역/이용내역 헤더를 찾지 못했습니다.');
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const layout = getCardWorkbookLayout(headers);
  parseCardWorkbook.lastLayout = layout;

  const approvalDateIdx = findColumn(headers, [h => h.includes('승인일자')]);
  const usageDateIdx = findColumn(headers, [h => h.includes('접수일자') && h.includes('승인일자')]);
  const claimDateIdx = findColumn(headers, [h => h === '청구일자' || h.includes('청구일자')]);
  const approvalTimeIdx = findColumn(headers, [h => h.includes('승인시간')]);
  const cardIdx = findColumn(headers, [h => h.includes('카드번호')]);
  const merchantIdx = findColumn(headers, [h => h.includes('가맹점명')]);
  const approvalAmountIdx = findColumn(headers, [h => h.includes('승인금액')]);
  const claimAmountIdx = findColumn(headers, [h => h.includes('청구금액')]);
  const amountIdx = layout === 'approval' ? approvalAmountIdx : claimAmountIdx;
  const approvalNoIdx = findColumn(headers, [h => h.includes('승인번호')]);
  const salesTypeIdx = findColumn(headers, [h => h.includes('매출종류')]);
  const noteIdx = findColumn(headers, [h => h === '비고' || h.includes('비고')]);

  if ([merchantIdx, amountIdx].some(idx => idx < 0)) {
    throw new Error('카드내역의 필수 열을 찾지 못했습니다.');
  }
  if (layout === 'approval' && approvalDateIdx < 0) {
    throw new Error('승인내역의 승인일자 열을 찾지 못했습니다.');
  }
  if (layout === 'usage' && usageDateIdx < 0 && approvalDateIdx < 0) {
    throw new Error('이용내역의 접수일자/(승인일자) 열을 찾지 못했습니다.');
  }

  const rawRecords = rows.slice(headerIndex + 1)
    .map((row, index) => {
      const merchant = String(row[merchantIdx] || '').trim();
      const amount = parseMoney(row[amountIdx]);
      const firstCell = String(row[0] || '').replace(/\s+/g, '');
      if (!merchant || firstCell.includes('합계')) return null;

      let date = '';
      let postingDate = '';
      if (layout === 'approval') {
        date = normalizeDate(row[approvalDateIdx]);
        postingDate = date;
      } else {
        const dates = extractCardDates(row[usageDateIdx >= 0 ? usageDateIdx : approvalDateIdx]);
        date = dates.approvalDate || normalizeDate(row[approvalDateIdx]);
        postingDate = dates.postingDate || date;
      }

      const salesType = salesTypeIdx >= 0 ? String(row[salesTypeIdx] || '').trim() : '';
      const note = noteIdx >= 0 ? String(row[noteIdx] || '').trim() : '';
      const category = classifyCard(merchant, amount, salesType, note);
      const requiredPeople = amount > 0 ? Math.ceil(amount / getMealLimit()) : 0;

      return {
        id: `${date}-${merchant}-${index}`,
        sourceType: layout === 'approval' ? '승인내역' : '이용내역',
        date,
        postingDate,
        claimDate: claimDateIdx >= 0 ? normalizeDate(row[claimDateIdx]) : '',
        approvalTime: approvalTimeIdx >= 0 ? String(row[approvalTimeIdx] || '').trim() : '',
        merchant,
        amount,
        cardNo: cardIdx >= 0 ? String(row[cardIdx] || '').trim() : '',
        approvalNo: approvalNoIdx >= 0 ? String(row[approvalNoIdx] || '').trim() : '',
        salesType,
        note,
        requiredPeople,
        ...category,
      };
    })
    .filter(record => record && record.date && record.amount !== 0);

  const records = layout === 'approval' ? settleApprovalRecords(rawRecords) : rawRecords;
  return records.filter(record => record && record.date && record.amount > 0);
}

function approvalGroupKey(record) {
  const approvalNo = String(record.approvalNo || '').replace(/\D/g, '');
  if (approvalNo && !/^0+$/.test(approvalNo)) return `no:${approvalNo}`;
  return `fallback:${record.date}|${record.cardNo || ''}|${record.merchant}|${Math.abs(record.amount)}`;
}

function settleApprovalRecords(records) {
  const groups = new Map();
  records.forEach(record => {
    const key = approvalGroupKey(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return Array.from(groups.values()).map((items, groupIndex) => {
    const positive = items.find(item => item.amount > 0 && !item.isCancel) || items.find(item => item.amount > 0) || items[0];
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    if (total <= 0) return null;

    const settled = {
      ...positive,
      id: `${positive.date}-${positive.approvalNo || positive.merchant}-${groupIndex}`,
      amount: total,
      note: items.length > 1 ? `${positive.note || ''} 취소상계 ${items.length}건`.trim() : positive.note,
    };
    const category = classifyCard(settled.merchant, settled.amount, settled.salesType, settled.note);
    return {
      ...settled,
      requiredPeople: settled.amount > 0 ? Math.ceil(settled.amount / getMealLimit()) : 0,
      ...category,
    };
  }).filter(Boolean);
}

function makeDemoOvertimeRecord({ id, name, date, start, end, total, position = '교사', approvalStatus = '결재완료', dinnerDeduct = '' }) {
  return {
    id,
    seq: id,
    dept: '가상부서',
    position,
    name,
    rawName: name,
    date,
    type: '평일',
    personalStart: '',
    personalEnd: '',
    requestStart: start,
    requestEnd: end,
    requestTotal: total,
    actualStart: start,
    actualEnd: end,
    afterClassDeduct: '',
    actualTotal: total,
    actualMinutes: minutesFromTime(total),
    requestStatus: '신청완료',
    approvalStatus,
    holidayRequest: '',
    flexibleRequest: '',
    dinnerDeduct,
    substituteHoliday: '',
  };
}

function makeDemoCardRecord({ id, date, merchant, amount, postingDate = date, cardNo, approvalNo, meal = false, excluded = false, label, salesType = '일반', note = '' }) {
  return {
    id,
    date,
    postingDate,
    merchant,
    amount,
    cardNo,
    approvalNo,
    salesType,
    note,
    requiredPeople: amount > 0 ? Math.ceil(amount / getMealLimit()) : 0,
    isCancel: false,
    isExcluded: excluded,
    isMealCandidate: meal,
    keywordHit: meal,
    amountPattern: meal,
    label: label || (excluded ? '제외 추정' : meal ? '식비 후보' : '일반'),
  };
}

function getDemoData() {
  const overtime = [
    makeDemoOvertimeRecord({ id: 'D-001', name: '김가람', date: '2026-06-03', start: '18:10', end: '20:20', total: '02:10' }),
    makeDemoOvertimeRecord({ id: 'D-002', name: '이누리', date: '2026-06-03', start: '18:05', end: '19:35', total: '01:30', position: '주무관' }),
    makeDemoOvertimeRecord({ id: 'D-003', name: '박다온', date: '2026-06-10', start: '18:00', end: '20:30', total: '02:30' }),
    makeDemoOvertimeRecord({ id: 'D-004', name: '최한결', date: '2026-06-17', start: '18:20', end: '21:10', total: '02:50' }),
    makeDemoOvertimeRecord({ id: 'D-005', name: '정라온', date: '2026-06-17', start: '18:10', end: '20:00', total: '01:50', position: '주무관' }),
    makeDemoOvertimeRecord({ id: 'D-006', name: '강온유', date: '2026-06-17', start: '18:05', end: '19:20', total: '01:15' }),
    makeDemoOvertimeRecord({ id: 'D-007', name: '김가람', date: '2026-06-24', start: '18:00', end: '18:00', total: '00:00', approvalStatus: '결재완료' }),
    makeDemoOvertimeRecord({ id: 'D-008', name: '윤새봄', date: '2026-06-29', start: '18:10', end: '21:30', total: '03:20', dinnerDeduct: 'O' }),
  ];

  const cards = [
    makeDemoCardRecord({ id: 'C-001', date: '2026-06-03', merchant: '한그릇식당', amount: 18000, cardNo: '9490-****-****-1203', approvalNo: '26060301', meal: true }),
    makeDemoCardRecord({ id: 'C-002', date: '2026-06-03', merchant: '가상문구센터', amount: 32000, cardNo: '9490-****-****-1203', approvalNo: '26060302' }),
    makeDemoCardRecord({ id: 'C-003', date: '2026-06-10', merchant: '소담김밥', amount: 18000, cardNo: '9490-****-****-1203', approvalNo: '26061001', meal: true }),
    makeDemoCardRecord({ id: 'C-004', date: '2026-06-17', merchant: '정담도시락', amount: 9000, cardNo: '9490-****-****-1203', approvalNo: '26061701', meal: true }),
    makeDemoCardRecord({ id: 'C-005', date: '2026-06-17', merchant: '다온베이커리', amount: 8500, cardNo: '9490-****-****-1203', approvalNo: '26061702', meal: true }),
    makeDemoCardRecord({ id: 'C-006', date: '2026-06-24', merchant: '온기분식', amount: 9000, cardNo: '9490-****-****-1203', approvalNo: '26062401', meal: true }),
    makeDemoCardRecord({ id: 'C-007', date: '2026-06-29', merchant: '우리동네국밥', amount: 9000, cardNo: '9490-****-****-1203', approvalNo: '26062901', meal: true }),
    makeDemoCardRecord({ id: 'C-008', date: '2026-06-29', merchant: '온라인교육몰', amount: 45000, cardNo: '9490-****-****-1203', approvalNo: '26062902', excluded: true }),
  ];

  return { overtime, cards };
}

function setDemoUi(active) {
  state.demoMode = active;
  demoBanner?.classList.toggle('hidden', !active);
  demoBtn?.classList.toggle('active', active);
  if (demoBtn) demoBtn.querySelector('span:nth-child(2)').textContent = active ? '체험 다시 보기' : '초근누구 체험하기';
}

function loadDemoData() {
  state.mealLimit = DEFAULT_MEAL_LIMIT;
  const { overtime, cards } = getDemoData();

  state.records = overtime;
  state.filtered = [];
  state.cardRecords = cards;
  state.currentYear = null;
  state.currentMonth = null;
  state.selectedDate = null;
  state.maskNames = false;

  mealLimitInput.value = moneyFormat(DEFAULT_MEAL_LIMIT);
  maskNames.checked = false;
  nameSearch.value = '';
  showZero.checked = false;
  showAllCards.checked = false;

  setupInitialMonth();
  renderApprovalOptions();
  applyFilters();

  fileName.textContent = '가상_NEIS_초과근무자료.xlsx';
  parseNote.textContent = `가상 초과근무자료 ${overtime.length}건을 불러왔습니다.`;
  cardFileName.textContent = '가상_BC카드_이용내역.xlsx';
  const mealCards = cards.filter(card => card.isMealCandidate);
  const mealTotal = mealCards.reduce((sum, card) => sum + card.amount, 0);
  cardParseNote.textContent = `가상 이용내역 ${cards.length}건, 식비 후보 ${mealCards.length}건, 후보금액 ${moneyFormat(mealTotal)}원을 불러왔습니다.`;

  dropZone.classList.add('has-file');
  cardDropZone.classList.add('has-file');
  statusCard.classList.remove('hidden');
  cardStatusCard.classList.remove('hidden');
  toolbar.classList.remove('hidden');
  contentGrid.classList.remove('hidden');
  setDemoUi(true);
  setView('calendar');
  showToast('가상자료로 체험 화면을 열었어요.');

  requestAnimationFrame(() => {
    demoBanner?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function setupInitialMonth() {
  const worked = state.records.filter(r => r.actualMinutes > 0);
  const base = worked[0] || state.records[0] || state.cardRecords[0];
  if (!base) return;
  const [year, month] = base.date.split('-').map(Number);
  state.currentYear = year;
  state.currentMonth = month;
  state.selectedDate = base.date;
}

function applyFilters() {
  const query = nameSearch.value.trim().toLowerCase();
  const approval = approvalFilter.value;
  const includeZero = showZero.checked;

  state.filtered = state.records.filter(record => {
    if (!includeZero && record.actualMinutes <= 0) return false;
    const searchTarget = `${record.name || ''} ${record.rawName || ''}`.toLowerCase();
    if (query && !searchTarget.includes(query)) return false;
    if (approval !== 'all' && record.approvalStatus !== approval) return false;
    return true;
  });

  renderAll();
}

function renderSummary() {
  const worked = state.records.filter(r => r.actualMinutes > 0);
  const zero = state.records.filter(r => r.actualMinutes <= 0);
  const people = new Set(worked.map(r => r.name));
  const days = new Set(worked.map(r => r.date));
  const totalMinutes = worked.reduce((sum, r) => sum + r.actualMinutes, 0);
  const possibleMeal = worked.length * getMealLimit();

  const items = [
    { label: '전체 건수', value: `${state.records.length}건` },
    { label: '실제 초근', value: `${worked.length}건` },
    { label: '초근 일수', value: `${days.size}일` },
    { label: '초근 인원', value: `${people.size}명` },
    { label: '매식 가능액', value: `${moneyFormat(possibleMeal)}원`, tone: 'meal' },
  ];

  if (state.cardRecords.length) {
    const mealCards = state.cardRecords.filter(c => c.isMealCandidate);
    const cardTotal = state.cardRecords.reduce((sum, c) => sum + c.amount, 0);
    const mealTotal = mealCards.reduce((sum, c) => sum + c.amount, 0);
    const riskyDates = countRiskyMealDates();
    items.push(
      { label: '카드 이용', value: `${state.cardRecords.length}건` },
      { label: '카드 합계', value: `${moneyFormat(cardTotal)}원` },
      { label: '식비 후보', value: `${mealCards.length}건`, tone: 'meal' },
      { label: '후보 금액', value: `${moneyFormat(mealTotal)}원`, tone: 'meal' },
      { label: '주의 일자', value: `${riskyDates}일`, tone: riskyDates ? 'alert' : '' },
    );
  }

  summaryGrid.innerHTML = items.map(({ label, value, tone = '' }) => `
    <div class="summary-item ${tone ? `summary-${tone}` : ''}">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join('');

  parseNote.textContent = `실제 초근 ${worked.length}건, 00:00 ${zero.length}건을 읽었습니다.`;
}

function countRiskyMealDates() {
  const byCard = recordsByDate(state.cardRecords.filter(c => c.isMealCandidate));
  return Object.keys(byCard).filter(date => {
    const workedCount = state.records.filter(r => r.date === date && r.actualMinutes > 0).length;
    const total = byCard[date].reduce((sum, c) => sum + c.amount, 0);
    return total > 0 && (workedCount === 0 || Math.ceil(total / getMealLimit()) > workedCount);
  }).length;
}

function renderApprovalOptions() {
  const values = Array.from(new Set(state.records.map(r => r.approvalStatus).filter(Boolean))).sort();
  approvalFilter.innerHTML = '<option value="all">결재상태 전체</option>' +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function recordsByDate(records) {
  return records.reduce((map, record) => {
    if (!map[record.date]) map[record.date] = [];
    map[record.date].push(record);
    return map;
  }, {});
}

function getMealStatus(workedCount, mealTotal) {
  if (!mealTotal) return { className: '', label: '' };
  const limit = getMealLimit();
  const possible = workedCount * limit;
  if (workedCount === 0) return { className: 'danger', label: '근거없음' };
  if (mealTotal > possible) return { className: 'warn', label: '기준초과' };
  return { className: 'ok', label: '지급기준 충족' };
}

function getMealShortLabel(status) {
  if (!status?.label) return '';
  if (status.label === '지급기준 충족') return '충족';
  if (status.label === '기준초과') return '초과';
  if (status.label === '근거없음') return '근거없음';
  return status.label;
}

function getMealJudgementText(status) {
  if (status.label === '지급기준 충족') {
    return '금액은 기준 이내입니다. 실제 대상자와 사용 목적은 원인행위/증빙자료로 확인하세요.';
  }
  if (status.label === '기준초과') {
    return '식비 후보금액이 초근자 기준 가능액을 초과합니다. 원인행위와 실제 사용 목적을 확인하세요.';
  }
  if (status.label === '근거없음') {
    return '식비 후보 카드 사용은 있으나, 해당 날짜의 실제 초과근무자가 없습니다. 원인행위와 실제 사용 목적을 확인하세요.';
  }
  return '';
}

function renderCalendar() {
  const y = state.currentYear;
  const m = state.currentMonth;
  if (!y || !m) return;

  monthTitle.textContent = `${y}년 ${m}월`;
  const byDate = recordsByDate(state.filtered);
  const cardByDate = recordsByDate(state.cardRecords);
  const firstDay = new Date(y, m - 1, 1).getDay();
  const lastDate = new Date(y, m, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstDay; i += 1) {
    cells.push('<button type="button" class="day-cell empty" tabindex="-1"></button>');
  }

  for (let day = 1; day <= lastDate; day += 1) {
    const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayRecords = (byDate[dateKey] || []).sort((a, b) => b.actualMinutes - a.actualMinutes || a.name.localeCompare(b.name, 'ko'));
    const worked = dayRecords.filter(r => r.actualMinutes > 0);
    const zeroOnly = dayRecords.length > 0 && worked.length === 0;
    const count = worked.length || dayRecords.length;
    const dayCards = cardByDate[dateKey] || [];
    const mealCards = dayCards.filter(c => c.isMealCandidate);
    const mealTotal = mealCards.reduce((sum, c) => sum + c.amount, 0);
    const mealStatus = getMealStatus(worked.length, mealTotal);
    const hasData = dayRecords.length || mealCards.length;

    const preview = dayRecords.slice(0, 3).map(r => `
      <div class="person-chip ${r.actualMinutes <= 0 ? 'zero' : ''}">
        <strong>${escapeHtml(displayName(r.name, 'calendar'))}</strong>
        <span>${escapeHtml(r.actualTotal)}</span>
      </div>
    `).join('');
    const more = dayRecords.length > 3 ? `<div class="more-text">+${dayRecords.length - 3}명</div>` : '';
    const cardLine = mealCards.length ? `
      <div class="card-line ${mealStatus.className}" aria-label="식비후보 ${mealCards.length}건 ${moneyFormat(mealTotal)}원 ${mealStatus.label}">
        <div class="meal-main">
          <span class="meal-label">식비</span>
          <strong class="meal-amount">${moneyFormat(mealTotal)}원</strong>
        </div>
        <em class="meal-status">${escapeHtml(getMealShortLabel(mealStatus))}</em>
      </div>
    ` : '';

    cells.push(`
      <button type="button" class="day-cell ${hasData ? 'has-data' : ''} ${state.selectedDate === dateKey ? 'selected' : ''}" data-date="${dateKey}">
        <div class="day-top">
          <span class="day-num">${day}</span>
          ${count ? `<span class="day-count" data-kind="${zeroOnly ? '00:00' : '초근'}" data-count="${count}">${zeroOnly ? '00:00' : '초근'} ${count}</span>` : ''}
        </div>
        <div class="person-list">${preview}${more}</div>
        ${cardLine}
      </button>
    `);
  }

  calendarGrid.innerHTML = cells.join('');
  calendarGrid.querySelectorAll('[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      state.selectedDate = cell.dataset.date;
      renderCalendar();
      renderDetail();
    });
  });
}

function renderDetail() {
  const targetDate = state.selectedDate;
  if (!targetDate) {
    detailCard.innerHTML = `
      <div class="empty-detail">
        <strong>날짜를 선택하세요</strong>
        <p>캘린더에서 날짜를 누르면 해당일 초과근무자와 카드 식비 후보가 표시됩니다.</p>
      </div>
    `;
    return;
  }

  const dayRecords = state.filtered
    .filter(r => r.date === targetDate)
    .sort((a, b) => b.actualMinutes - a.actualMinutes || a.name.localeCompare(b.name, 'ko'));
  const worked = dayRecords.filter(r => r.actualMinutes > 0);
  const totalMinutes = worked.reduce((sum, r) => sum + r.actualMinutes, 0);
  const possibleMeal = worked.length * getMealLimit();
  const dayCards = state.cardRecords
    .filter(c => c.date === targetDate)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const displayCards = showAllCards.checked ? dayCards : dayCards.filter(c => c.isMealCandidate);
  const mealCards = dayCards.filter(c => c.isMealCandidate);
  const mealTotal = mealCards.reduce((sum, c) => sum + c.amount, 0);
  const neededPeople = mealTotal > 0 ? Math.ceil(mealTotal / getMealLimit()) : 0;
  const mealStatus = getMealStatus(worked.length, mealTotal);

  if (!dayRecords.length && !displayCards.length) {
    detailCard.innerHTML = `
      <div class="detail-title">
        <h2>${dateLabel(targetDate)}</h2>
      </div>
      <div class="empty-detail">
        <strong>표시할 자료가 없습니다.</strong>
        <p>필터 조건을 바꾸거나 실제 00:00 포함, 카드 전체 보기를 켜보세요.</p>
      </div>
    `;
    return;
  }

  const overtimeRows = dayRecords.length ? dayRecords.map(record => `
    <div class="detail-row ${record.actualMinutes <= 0 ? 'zero' : ''}">
      <div class="detail-row-main">
        <strong>${escapeHtml(displayName(record.name))}</strong>
        <span>${escapeHtml(record.actualTotal)}</span>
      </div>
      <div class="detail-row-sub">
        실제 ${escapeHtml(record.actualStart || '-')}~${escapeHtml(record.actualEnd || '-')}
        <span class="badge ${record.actualMinutes <= 0 ? 'zero' : ''}">${record.actualMinutes <= 0 ? '00:00' : '초근'}</span>
        ${record.approvalStatus ? `<span class="badge ${record.approvalStatus.includes('사후') ? 'warn' : ''}">${escapeHtml(record.approvalStatus)}</span>` : ''}
        ${record.dinnerDeduct === 'O' ? '<span class="badge warn">저녁공제 O</span>' : ''}
      </div>
    </div>
  `).join('') : '<div class="empty-box">이 날짜의 초과근무자가 없습니다.</div>';

  const cardRows = displayCards.length ? displayCards.map(card => {
    const cardStatus = getSingleCardStatus(card, worked.length);
    return `
      <div class="card-detail-row ${card.isMealCandidate ? 'meal' : ''} ${card.isExcluded ? 'excluded' : ''} ${card.isCancel ? 'cancel' : ''}">
        <div class="card-row-main">
          <strong>${escapeHtml(card.merchant)}</strong>
          <span>${moneyFormat(card.amount)}원</span>
        </div>
        <div class="detail-row-sub">
          접수 ${escapeHtml(card.postingDate || '-')} · 승인번호 ${escapeHtml(card.approvalNo || '-')}
          <span class="badge ${card.isMealCandidate ? 'warn' : 'zero'}">${escapeHtml(card.label)}</span>
          ${card.isMealCandidate ? `<span class="badge ${cardStatus.className}">${escapeHtml(cardStatus.label)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('') : `<div class="empty-box">${state.cardRecords.length ? '식비 후보 카드내역이 없습니다. 카드 전체 보기를 켜면 전체 내역을 볼 수 있어요.' : '카드내역을 업로드하면 이곳에 표시됩니다.'}</div>`;

  detailCard.innerHTML = `
    <div class="detail-title">
      <h2>${dateLabel(targetDate)}</h2>
      <span>${worked.length}명</span>
    </div>
    <div class="detail-summary">
      <div class="detail-mini"><span>실제 초근자</span><strong>${worked.length}명</strong></div>
      <div class="detail-mini"><span>인정 가능액</span><strong>${moneyFormat(possibleMeal)}원</strong></div>
      <div class="detail-mini"><span>식비 후보금액</span><strong>${moneyFormat(mealTotal)}원</strong></div>
      <div class="detail-mini"><span>금액 기준인원</span><strong>${neededPeople}명</strong></div>
    </div>
    ${mealTotal > 0 ? `<div class="meal-judgement ${mealStatus.className}">${escapeHtml(getMealJudgementText(mealStatus))}</div>` : ''}
    <section class="detail-section">
      <h3>초과근무자</h3>
      <div class="detail-list">${overtimeRows}</div>
    </section>
    <section class="detail-section">
      <h3>카드 식비 후보${showAllCards.checked ? ' / 전체' : ''}</h3>
      <div class="detail-list">${cardRows}</div>
    </section>
    <button type="button" class="copy-day" id="copyDayBtn">이 날짜 내용 복사</button>
  `;

  $('#copyDayBtn').addEventListener('click', () => copyDayText(targetDate, dayRecords, dayCards, possibleMeal, mealTotal));
}

function getSingleCardStatus(card, workedCount) {
  if (!card.isMealCandidate) return { className: 'zero', label: card.label };
  if (workedCount === 0) return { className: 'danger', label: '근거없음' };
  if (card.amount > workedCount * getMealLimit()) return { className: 'warn', label: '기준초과' };
  return { className: 'ok', label: '지급기준 충족' };
}

function renderTable() {
  const rows = state.filtered
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'ko'))
    .map(record => `
      <tr class="${record.actualMinutes <= 0 ? 'zero-row' : ''}">
        <td>${dateLabel(record.date)}</td>
        <td><strong>${escapeHtml(displayName(record.name))}</strong></td>
        <td>${escapeHtml(record.position || '-')}</td>
        <td>${escapeHtml(record.actualStart || '-')}</td>
        <td>${escapeHtml(record.actualEnd || '-')}</td>
        <td>${escapeHtml(record.actualTotal || '00:00')}</td>
        <td>${escapeHtml(record.approvalStatus || '-')}</td>
        <td>${escapeHtml(record.dinnerDeduct || '-')}</td>
      </tr>
    `).join('');

  tableBody.innerHTML = rows || `<tr><td colspan="8">표시할 자료가 없습니다.</td></tr>`;
}

function renderCardTable() {
  const rows = state.cardRecords
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.amount) - Math.abs(a.amount))
    .map(card => {
      const status = getSingleCardStatus(card, countWorkedByDate(card.date));
      return `
        <tr class="${card.isMealCandidate ? 'meal-row' : ''} ${card.isCancel || card.isExcluded ? 'zero-row' : ''}">
          <td>${dateLabel(card.date)}</td>
          <td>${escapeHtml(card.postingDate || '-')}</td>
          <td><strong>${escapeHtml(card.merchant)}</strong></td>
          <td>${moneyFormat(card.amount)}원</td>
          <td>${escapeHtml(card.label)}${card.isMealCandidate ? ` · ${escapeHtml(status.label)}` : ''}</td>
          <td>${card.requiredPeople || '-'}</td>
          <td>${escapeHtml(card.cardNo || '-')}</td>
          <td>${escapeHtml(card.approvalNo || '-')}</td>
        </tr>
      `;
    }).join('');

  cardTableBody.innerHTML = rows || `<tr><td colspan="8">카드 이용내역을 업로드하면 표시됩니다.</td></tr>`;
}

function countWorkedByDate(dateKey) {
  return state.records.filter(r => r.date === dateKey && r.actualMinutes > 0).length;
}

function renderAll() {
  renderSummary();
  renderCalendar();
  renderDetail();
  renderTable();
  renderCardTable();
}

function copyDayText(dateKey, records, cards, possibleMeal, mealTotal) {
  const worked = records.filter(r => r.actualMinutes > 0);
  const mealCards = cards.filter(c => c.isMealCandidate);
  const lines = [
    `[초근 누구] ${dateLabel(dateKey)}`,
    `실제 초근자 ${worked.length}명 / 매식 가능액 ${moneyFormat(possibleMeal)}원`,
    `카드 식비 후보 ${mealCards.length}건 / 후보금액 ${moneyFormat(mealTotal)}원`,
    '',
    '[초과근무자]',
    ...worked.map(r => `- ${displayName(r.name)}: ${r.actualStart || '-'}~${r.actualEnd || '-'} / ${r.actualTotal}`),
    '',
    '[카드 식비 후보]',
    ...mealCards.map(c => {
      const cardStatus = getSingleCardStatus(c, worked.length);
      return `- ${c.merchant}: ${moneyFormat(c.amount)}원 / ${c.label} / ${cardStatus.label}`;
    }),
  ];
  navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('날짜 내용을 복사했어요.'));
}

function copyFilteredText() {
  const lines = state.filtered
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ko'))
    .map(r => `${dateLabel(r.date)}\t${displayName(r.name)}\t${r.actualStart || '-'}~${r.actualEnd || '-'}\t${r.actualTotal}\t${r.approvalStatus || '-'}`);
  if (!lines.length) return showToast('복사할 자료가 없어요.');
  navigator.clipboard.writeText(['일자\t성명\t실제시간\t시간합\t결재상태', ...lines].join('\n'))
    .then(() => showToast('표 내용을 복사했어요.'));
}

function copyCardText() {
  const lines = state.cardRecords
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(c => `${dateLabel(c.date)}\t${c.postingDate || '-'}\t${c.merchant}\t${c.amount}\t${c.label}\t${c.requiredPeople || '-'}\t${c.cardNo || '-'}\t${c.approvalNo || '-'}`);
  if (!lines.length) return showToast('복사할 카드내역이 없어요.');
  navigator.clipboard.writeText(['승인일자\t접수일자\t가맹점\t금액\t분류\t기준인원\t카드번호\t승인번호', ...lines].join('\n'))
    .then(() => showToast('카드표 내용을 복사했어요.'));
}

function setView(view) {
  state.currentView = view;
  $$('.view-toggle button').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  contentGrid.classList.toggle('hidden', view !== 'calendar');
  tableView.classList.toggle('hidden', view !== 'table');
  cardView.classList.toggle('hidden', view !== 'card');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function readExcelLikeFile(file, purpose) {
  if (!window.XLSX) {
    throw new Error('엑셀 읽기 라이브러리를 불러오지 못했습니다.');
  }

  const lower = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  const allowCsv = purpose === '초과근무';

  if (lower.endsWith('.pdf')) {
    throw new Error('PDF는 표 구조상 파싱이 불안정합니다. 엑셀, CSV 또는 ZIP 파일을 사용해주세요.');
  }

  if (lower.endsWith('.csv')) {
    if (!allowCsv) throw new Error(`${purpose} 파일은 엑셀 또는 ZIP만 지원합니다.`);
    return workbookFromCsvBuffer(buffer);
  }

  if (lower.endsWith('.zip')) {
    if (!window.JSZip) throw new Error('ZIP 읽기 라이브러리를 불러오지 못했습니다.');
    const zip = await JSZip.loadAsync(buffer);
    const pattern = allowCsv ? /\.(xlsx|xls|csv)$/i : /\.(xlsx|xls)$/i;
    const target = Object.values(zip.files).find(entry => !entry.dir && pattern.test(entry.name));
    if (!target) {
      throw new Error(allowCsv ? 'ZIP 안에서 엑셀 또는 CSV 파일을 찾지 못했습니다.' : 'ZIP 안에서 엑셀 파일을 찾지 못했습니다.');
    }
    const targetBuffer = await target.async('arraybuffer');
    if (/\.csv$/i.test(target.name)) return workbookFromCsvBuffer(targetBuffer);
    return XLSX.read(targetBuffer, { type: 'array', cellDates: true });
  }

  if (!/\.(xlsx|xls)$/i.test(lower)) {
    throw new Error(allowCsv ? `${purpose} 파일은 엑셀, CSV 또는 ZIP만 지원합니다.` : `${purpose} 파일은 엑셀 또는 ZIP만 지원합니다.`);
  }

  return XLSX.read(buffer, { type: 'array', cellDates: true });
}

async function handleFile(file) {
  if (!file) return;
  if (state.demoMode) resetApp();
  try {
    const workbook = await readExcelLikeFile(file, '초과근무');
    const records = parseWorkbook(workbook);
    if (!records.length) {
      showToast('읽을 수 있는 초과근무 자료를 찾지 못했어요.');
      return;
    }

    state.records = records;
    setupInitialMonth();
    renderApprovalOptions();
    applyFilters();

    fileName.textContent = file.name;
    parseNote.textContent = `초과근무 자료 ${records.length}건을 읽었습니다.`;
    dropZone.classList.add('has-file');
    statusCard.classList.remove('hidden');
    toolbar.classList.remove('hidden');
    contentGrid.classList.remove('hidden');
    setView('calendar');
    showToast(file.name.toLowerCase().endsWith('.csv') ? 'CSV 초과근무자료를 불러왔어요.' : '초과근무자료를 불러왔어요.');
  } catch (error) {
    console.error(error);
    showToast(error.message || '파일을 읽는 중 오류가 발생했어요.');
  }
}

async function handleCardFile(file) {
  if (!file) return;
  if (state.demoMode) resetApp();
  try {
    const workbook = await readExcelLikeFile(file, '카드내역');
    const records = parseCardWorkbook(workbook);
    if (!records.length) {
      showToast('읽을 수 있는 카드 승인내역/이용내역을 찾지 못했어요.');
      return;
    }

    state.cardRecords = records;
    if (!state.currentYear) setupInitialMonth();
    renderAll();

    const mealCards = records.filter(c => c.isMealCandidate);
    const total = records.reduce((sum, c) => sum + c.amount, 0);
    const mealTotal = mealCards.reduce((sum, c) => sum + c.amount, 0);
    cardFileName.textContent = file.name;
    cardDropZone.classList.add('has-file');
    const layoutLabel = parseCardWorkbook.lastLayout === 'approval' ? '승인내역' : '이용내역';
    cardParseNote.textContent = `${layoutLabel} ${records.length}건, 식비 후보 ${mealCards.length}건, 후보금액 ${moneyFormat(mealTotal)}원, 카드합계 ${moneyFormat(total)}원을 읽었습니다.`;
    cardStatusCard.classList.remove('hidden');
    toolbar.classList.remove('hidden');
    contentGrid.classList.remove('hidden');
    showToast('카드 이용내역을 불러왔어요.');
  } catch (error) {
    console.error(error);
    showToast(error.message || '카드내역을 읽는 중 오류가 발생했어요.');
  }
}

function resetApp() {
  state.records = [];
  state.filtered = [];
  state.cardRecords = [];
  state.currentYear = null;
  state.currentMonth = null;
  state.selectedDate = null;
  setDemoUi(false);
  fileInput.value = '';
  cardFileInput.value = '';
  nameSearch.value = '';
  approvalFilter.innerHTML = '<option value="all">결재상태 전체</option>';
  showZero.checked = false;
  showAllCards.checked = false;
  statusCard.classList.add('hidden');
  cardStatusCard.classList.add('hidden');
  dropZone.classList.remove('has-file');
  cardDropZone.classList.remove('has-file');
  toolbar.classList.add('hidden');
  contentGrid.classList.add('hidden');
  tableView.classList.add('hidden');
  cardView.classList.add('hidden');
  summaryGrid.innerHTML = '';
  calendarGrid.innerHTML = '';
  tableBody.innerHTML = '';
  cardTableBody.innerHTML = '';
  detailCard.innerHTML = `
    <div class="empty-detail">
      <strong>날짜를 선택하세요</strong>
      <p>캘린더에서 날짜를 누르면 해당일 초과근무자와 카드 식비 후보가 표시됩니다.</p>
    </div>
  `;
}

function resetCard() {
  state.cardRecords = [];
  cardFileInput.value = '';
  showAllCards.checked = false;
  cardStatusCard.classList.add('hidden');
  cardDropZone.classList.remove('has-file');
  renderAll();
  if (state.currentView === 'card') setView('calendar');
  showToast('카드내역을 지웠어요.');
}

function bindDrop(zone, handler) {
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('dragover');
    handler(event.dataTransfer.files[0]);
  });
}


function openHelpModal() {
  if (!helpModal) return;
  helpReturnFocus = document.activeElement;
  helpModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    const panel = helpModal.querySelector('.help-modal-panel');
    if (panel) panel.focus();
  });
}

function closeHelpModal() {
  if (!helpModal || helpModal.classList.contains('hidden')) return;
  helpModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  if (helpReturnFocus && typeof helpReturnFocus.focus === 'function') helpReturnFocus.focus();
}

function handleHelpKeydown(event) {
  if (event.key === 'Escape' && helpModal && !helpModal.classList.contains('hidden')) {
    closeHelpModal();
  }
}

demoBtn?.addEventListener('click', loadDemoData);
exitDemoBtn?.addEventListener('click', () => {
  resetApp();
  showToast('체험을 종료했어요. 내 자료를 올려주세요.');
  requestAnimationFrame(() => document.querySelector('.upload-stack')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
});

fileInput.addEventListener('change', (event) => handleFile(event.target.files[0]));
cardFileInput.addEventListener('change', (event) => handleCardFile(event.target.files[0]));
resetBtn.addEventListener('click', resetApp);
resetCardBtn.addEventListener('click', resetCard);
nameSearch.addEventListener('input', applyFilters);
approvalFilter.addEventListener('change', applyFilters);
showZero.addEventListener('change', applyFilters);
showAllCards.addEventListener('change', renderDetail);
mealLimitInput.addEventListener('input', () => syncMealLimitFromInput());
mealLimitInput.addEventListener('blur', () => syncMealLimitFromInput({ format: true }));
maskNames.addEventListener('change', () => { state.maskNames = maskNames.checked; renderAll(); });
helpOpenBtn?.addEventListener('click', openHelpModal);
$$('[data-open-help]').forEach(el => el.addEventListener('click', openHelpModal));
helpCloseBtn?.addEventListener('click', closeHelpModal);
helpModal?.querySelectorAll('[data-help-close]').forEach(el => el.addEventListener('click', closeHelpModal));
document.addEventListener('keydown', handleHelpKeydown);
$('#copyFilteredBtn').addEventListener('click', copyFilteredText);
$('#copyCardBtn').addEventListener('click', copyCardText);

$('#prevMonth').addEventListener('click', () => {
  if (!state.currentYear) return;
  state.currentMonth -= 1;
  if (state.currentMonth < 1) {
    state.currentMonth = 12;
    state.currentYear -= 1;
  }
  state.selectedDate = null;
  renderCalendar();
  renderDetail();
});

$('#nextMonth').addEventListener('click', () => {
  if (!state.currentYear) return;
  state.currentMonth += 1;
  if (state.currentMonth > 12) {
    state.currentMonth = 1;
    state.currentYear += 1;
  }
  state.selectedDate = null;
  renderCalendar();
  renderDetail();
});

$$('.view-toggle button').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
bindDrop(dropZone, handleFile);
bindDrop(cardDropZone, handleCardFile);
