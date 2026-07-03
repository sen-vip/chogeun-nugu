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

const MEAL_LIMIT = 9000;

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

function parseMoney(value) {
  const text = String(value || '').replaceAll(',', '').trim();
  const match = text.match(/-?\d+/);
  return match ? Number(match[0]) : 0;
}

function normalizeHeader(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function parseWorkbook(workbook) {
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

  return rows.slice(2)
    .map((row, index) => {
      const date = normalizeDate(row[COL.date]);
      const actualMinutes = minutesFromTime(row[COL.actualTotal]);
      const name = String(row[COL.name] || '').trim();
      return {
        id: `${date}-${name}-${index}`,
        seq: String(row[COL.seq] || '').trim(),
        dept: String(row[COL.dept] || '').trim(),
        position: String(row[COL.position] || '').trim(),
        name,
        date,
        type: String(row[COL.type] || '').trim(),
        personalStart: String(row[COL.personalStart] || '').trim(),
        personalEnd: String(row[COL.personalEnd] || '').trim(),
        requestStart: String(row[COL.requestStart] || '').trim(),
        requestEnd: String(row[COL.requestEnd] || '').trim(),
        requestTotal: String(row[COL.requestTotal] || '').trim(),
        actualStart: String(row[COL.actualStart] || '').trim(),
        actualEnd: String(row[COL.actualEnd] || '').trim(),
        afterClassDeduct: String(row[COL.afterClassDeduct] || '').trim(),
        actualTotal: String(row[COL.actualTotal] || '').trim() || '00:00',
        actualMinutes,
        requestStatus: String(row[COL.requestStatus] || '').trim(),
        approvalStatus: String(row[COL.approvalStatus] || '').trim(),
        holidayRequest: String(row[COL.holidayRequest] || '').trim(),
        flexibleRequest: String(row[COL.flexibleRequest] || '').trim(),
        dinnerDeduct: String(row[COL.dinnerDeduct] || '').trim(),
        substituteHoliday: String(row[COL.substituteHoliday] || '').trim(),
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
  const amountPattern = amount > 0 && (amount <= MEAL_LIMIT || amount % MEAL_LIMIT === 0 || (amount <= 45000 && amount % 1000 === 0));
  const isMealCandidate = !isCancel && !isExcluded && amount > 0 && (keywordHit || amountPattern);

  let label = '일반';
  if (isCancel) label = '취소/차감';
  else if (isExcluded) label = '제외 추정';
  else if (isMealCandidate) label = keywordHit ? '식사 후보' : '금액 후보';

  return { isCancel, isExcluded, isMealCandidate, keywordHit, amountPattern, label };
}

function parseCardWorkbook(workbook) {
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const headerIndex = rows.findIndex(row => {
    const joined = row.map(normalizeHeader).join('|');
    return joined.includes('가맹점명') && joined.includes('청구금액') && (joined.includes('승인일자') || joined.includes('접수일자'));
  });

  if (headerIndex < 0) {
    throw new Error('BC카드 이용내역 헤더를 찾지 못했습니다.');
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const dateIdx = findColumn(headers, [h => h.includes('접수일자') || h.includes('승인일자')]);
  const claimDateIdx = findColumn(headers, [h => h === '청구일자' || h.includes('청구일자')]);
  const cardIdx = findColumn(headers, [h => h.includes('카드번호')]);
  const merchantIdx = findColumn(headers, [h => h.includes('가맹점명')]);
  const amountIdx = findColumn(headers, [h => h.includes('청구금액') || h.includes('이용금액')]);
  const approvalNoIdx = findColumn(headers, [h => h.includes('승인번호')]);
  const salesTypeIdx = findColumn(headers, [h => h.includes('매출종류')]);
  const noteIdx = findColumn(headers, [h => h === '비고' || h.includes('비고')]);

  if ([dateIdx, merchantIdx, amountIdx].some(idx => idx < 0)) {
    throw new Error('카드내역의 필수 열을 찾지 못했습니다.');
  }

  return rows.slice(headerIndex + 1)
    .map((row, index) => {
      const merchant = String(row[merchantIdx] || '').trim();
      const amount = parseMoney(row[amountIdx]);
      const firstCell = String(row[0] || '').replace(/\s+/g, '');
      if (!merchant || firstCell.includes('합계')) return null;

      const dates = extractCardDates(row[dateIdx]);
      const salesType = String(row[salesTypeIdx] || '').trim();
      const note = String(row[noteIdx] || '').trim();
      const category = classifyCard(merchant, amount, salesType, note);
      const requiredPeople = amount > 0 ? Math.ceil(amount / MEAL_LIMIT) : 0;

      return {
        id: `${dates.approvalDate}-${merchant}-${index}`,
        date: dates.approvalDate,
        postingDate: dates.postingDate,
        claimDate: claimDateIdx >= 0 ? normalizeDate(row[claimDateIdx]) : '',
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
    if (query && !record.name.toLowerCase().includes(query)) return false;
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
  const possibleMeal = worked.length * MEAL_LIMIT;

  const items = [
    ['전체 건수', `${state.records.length}건`],
    ['실제 초근', `${worked.length}건`],
    ['초근 일수', `${days.size}일`],
    ['초근 인원', `${people.size}명`],
    ['매식 가능액', `${moneyFormat(possibleMeal)}원`],
  ];

  if (state.cardRecords.length) {
    const mealCards = state.cardRecords.filter(c => c.isMealCandidate);
    const cardTotal = state.cardRecords.reduce((sum, c) => sum + c.amount, 0);
    const mealTotal = mealCards.reduce((sum, c) => sum + c.amount, 0);
    const riskyDates = countRiskyMealDates();
    items.push(
      ['카드 이용', `${state.cardRecords.length}건`],
      ['카드 합계', `${moneyFormat(cardTotal)}원`],
      ['식사 후보', `${mealCards.length}건`],
      ['후보 금액', `${moneyFormat(mealTotal)}원`],
      ['주의 일자', `${riskyDates}일`],
    );
  }

  summaryGrid.innerHTML = items.map(([label, value]) => `
    <div class="summary-item">
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
    return total > 0 && (workedCount === 0 || Math.ceil(total / MEAL_LIMIT) > workedCount);
  }).length;
}

function renderApprovalOptions() {
  const values = Array.from(new Set(state.records.map(r => r.approvalStatus).filter(Boolean))).sort();
  approvalFilter.innerHTML = '<option value="all">승인상태 전체</option>' +
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
  const needed = Math.ceil(mealTotal / MEAL_LIMIT);
  if (workedCount === 0) return { className: 'danger', label: '초근없음' };
  if (needed > workedCount) return { className: 'danger', label: `${needed}명 필요` };
  if (mealTotal > MEAL_LIMIT) return { className: 'warn', label: `${needed}명분` };
  return { className: 'ok', label: '금액가능' };
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
        <strong>${escapeHtml(r.name)}</strong>
        <span>${escapeHtml(r.actualTotal)}</span>
      </div>
    `).join('');
    const more = dayRecords.length > 3 ? `<div class="more-text">외 ${dayRecords.length - 3}명</div>` : '';
    const cardLine = mealCards.length ? `
      <div class="card-line ${mealStatus.className}" aria-label="식사후보 ${mealCards.length}건 ${moneyFormat(mealTotal)}원 ${mealStatus.label}">
        <span class="meal-label">식사후보</span>
        <strong class="meal-amount">${moneyFormat(mealTotal)}원</strong>
        <em class="meal-meta">${mealCards.length}건 · ${mealStatus.label}</em>
      </div>
    ` : '';

    cells.push(`
      <button type="button" class="day-cell ${hasData ? 'has-data' : ''} ${state.selectedDate === dateKey ? 'selected' : ''}" data-date="${dateKey}">
        <div class="day-top">
          <span class="day-num">${day}</span>
          ${count ? `<span class="day-count">${zeroOnly ? '00:00' : '초근'} ${count}</span>` : ''}
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
        <p>캘린더에서 날짜를 누르면 해당일 초과근무자와 카드 식사 후보가 표시됩니다.</p>
      </div>
    `;
    return;
  }

  const dayRecords = state.filtered
    .filter(r => r.date === targetDate)
    .sort((a, b) => b.actualMinutes - a.actualMinutes || a.name.localeCompare(b.name, 'ko'));
  const worked = dayRecords.filter(r => r.actualMinutes > 0);
  const totalMinutes = worked.reduce((sum, r) => sum + r.actualMinutes, 0);
  const possibleMeal = worked.length * MEAL_LIMIT;
  const dayCards = state.cardRecords
    .filter(c => c.date === targetDate)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const displayCards = showAllCards.checked ? dayCards : dayCards.filter(c => c.isMealCandidate);
  const mealCards = dayCards.filter(c => c.isMealCandidate);
  const mealTotal = mealCards.reduce((sum, c) => sum + c.amount, 0);
  const neededPeople = mealTotal > 0 ? Math.ceil(mealTotal / MEAL_LIMIT) : 0;
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
        <strong>${escapeHtml(record.name)}</strong>
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
  }).join('') : `<div class="empty-box">${state.cardRecords.length ? '식사 후보 카드내역이 없습니다. 카드 전체 보기를 켜면 전체 내역을 볼 수 있어요.' : '카드내역을 업로드하면 이곳에 표시됩니다.'}</div>`;

  detailCard.innerHTML = `
    <div class="detail-title">
      <h2>${dateLabel(targetDate)}</h2>
      <span>${worked.length}명</span>
    </div>
    <div class="detail-summary">
      <div class="detail-mini"><span>실제 초근자</span><strong>${worked.length}명</strong></div>
      <div class="detail-mini"><span>인정 가능액</span><strong>${moneyFormat(possibleMeal)}원</strong></div>
      <div class="detail-mini"><span>식사 후보금액</span><strong>${moneyFormat(mealTotal)}원</strong></div>
      <div class="detail-mini"><span>필요 인원</span><strong>${neededPeople}명</strong></div>
    </div>
    ${mealTotal > 0 ? `<div class="meal-judgement ${mealStatus.className}">${escapeHtml(mealStatus.label)} · 최종 확인은 원인행위/실제 사용 목적 기준으로 해주세요.</div>` : ''}
    <section class="detail-section">
      <h3>초과근무자</h3>
      <div class="detail-list">${overtimeRows}</div>
    </section>
    <section class="detail-section">
      <h3>카드 식사 후보${showAllCards.checked ? ' / 전체' : ''}</h3>
      <div class="detail-list">${cardRows}</div>
    </section>
    <button type="button" class="copy-day" id="copyDayBtn">이 날짜 내용 복사</button>
  `;

  $('#copyDayBtn').addEventListener('click', () => copyDayText(targetDate, dayRecords, dayCards, possibleMeal, mealTotal));
}

function getSingleCardStatus(card, workedCount) {
  if (!card.isMealCandidate) return { className: 'zero', label: card.label };
  if (workedCount === 0) return { className: 'danger', label: '초근없음' };
  if (card.requiredPeople > workedCount) return { className: 'danger', label: `${card.requiredPeople}명 필요` };
  if (card.amount > MEAL_LIMIT) return { className: 'warn', label: `${card.requiredPeople}명분` };
  return { className: 'ok', label: '1명 이내' };
}

function renderTable() {
  const rows = state.filtered
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'ko'))
    .map(record => `
      <tr class="${record.actualMinutes <= 0 ? 'zero-row' : ''}">
        <td>${dateLabel(record.date)}</td>
        <td><strong>${escapeHtml(record.name)}</strong></td>
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
    `카드 식사 후보 ${mealCards.length}건 / 후보금액 ${moneyFormat(mealTotal)}원`,
    '',
    '[초과근무자]',
    ...worked.map(r => `- ${r.name}: ${r.actualStart || '-'}~${r.actualEnd || '-'} / ${r.actualTotal}`),
    '',
    '[카드 식사 후보]',
    ...mealCards.map(c => `- ${c.merchant}: ${moneyFormat(c.amount)}원 / ${c.label} / ${c.requiredPeople}명 필요`),
  ];
  navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('날짜 내용을 복사했어요.'));
}

function copyFilteredText() {
  const lines = state.filtered
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ko'))
    .map(r => `${dateLabel(r.date)}\t${r.name}\t${r.actualStart || '-'}~${r.actualEnd || '-'}\t${r.actualTotal}\t${r.approvalStatus || '-'}`);
  if (!lines.length) return showToast('복사할 자료가 없어요.');
  navigator.clipboard.writeText(['일자\t성명\t실제시간\t시간합\t승인상태', ...lines].join('\n'))
    .then(() => showToast('표 내용을 복사했어요.'));
}

function copyCardText() {
  const lines = state.cardRecords
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(c => `${dateLabel(c.date)}\t${c.postingDate || '-'}\t${c.merchant}\t${c.amount}\t${c.label}\t${c.requiredPeople || '-'}\t${c.cardNo || '-'}\t${c.approvalNo || '-'}`);
  if (!lines.length) return showToast('복사할 카드내역이 없어요.');
  navigator.clipboard.writeText(['승인일자\t접수일자\t가맹점\t금액\t분류\t필요인원\t카드번호\t승인번호', ...lines].join('\n'))
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

  if (lower.endsWith('.pdf')) {
    throw new Error('PDF는 표 구조상 금액 파싱이 불안정합니다. BC카드 엑셀 또는 ZIP 파일을 사용해주세요.');
  }

  if (lower.endsWith('.zip')) {
    if (!window.JSZip) throw new Error('ZIP 읽기 라이브러리를 불러오지 못했습니다.');
    const zip = await JSZip.loadAsync(buffer);
    const target = Object.values(zip.files).find(entry => !entry.dir && /\.(xlsx|xls)$/i.test(entry.name));
    if (!target) throw new Error('ZIP 안에서 엑셀 파일을 찾지 못했습니다.');
    const xlsxBuffer = await target.async('arraybuffer');
    return XLSX.read(xlsxBuffer, { type: 'array', cellDates: true });
  }

  if (!/\.(xlsx|xls)$/i.test(lower)) {
    throw new Error(`${purpose} 파일은 엑셀 또는 ZIP만 지원합니다.`);
  }

  return XLSX.read(buffer, { type: 'array', cellDates: true });
}

async function handleFile(file) {
  if (!file) return;
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
    statusCard.classList.remove('hidden');
    toolbar.classList.remove('hidden');
    contentGrid.classList.remove('hidden');
    setView('calendar');
    showToast('초과근무자료를 불러왔어요.');
  } catch (error) {
    console.error(error);
    showToast(error.message || '파일을 읽는 중 오류가 발생했어요.');
  }
}

async function handleCardFile(file) {
  if (!file) return;
  try {
    const workbook = await readExcelLikeFile(file, '카드내역');
    const records = parseCardWorkbook(workbook);
    if (!records.length) {
      showToast('읽을 수 있는 카드 이용내역을 찾지 못했어요.');
      return;
    }

    state.cardRecords = records;
    if (!state.currentYear) setupInitialMonth();
    renderAll();

    const mealCards = records.filter(c => c.isMealCandidate);
    const total = records.reduce((sum, c) => sum + c.amount, 0);
    const mealTotal = mealCards.reduce((sum, c) => sum + c.amount, 0);
    cardFileName.textContent = file.name;
    cardParseNote.textContent = `카드 ${records.length}건, 식사 후보 ${mealCards.length}건, 후보금액 ${moneyFormat(mealTotal)}원, 카드합계 ${moneyFormat(total)}원을 읽었습니다.`;
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
  fileInput.value = '';
  cardFileInput.value = '';
  nameSearch.value = '';
  approvalFilter.innerHTML = '<option value="all">승인상태 전체</option>';
  showZero.checked = false;
  showAllCards.checked = false;
  statusCard.classList.add('hidden');
  cardStatusCard.classList.add('hidden');
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
      <p>캘린더에서 날짜를 누르면 해당일 초과근무자와 카드 식사 후보가 표시됩니다.</p>
    </div>
  `;
}

function resetCard() {
  state.cardRecords = [];
  cardFileInput.value = '';
  showAllCards.checked = false;
  cardStatusCard.classList.add('hidden');
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

fileInput.addEventListener('change', (event) => handleFile(event.target.files[0]));
cardFileInput.addEventListener('change', (event) => handleCardFile(event.target.files[0]));
resetBtn.addEventListener('click', resetApp);
resetCardBtn.addEventListener('click', resetCard);
nameSearch.addEventListener('input', applyFilters);
approvalFilter.addEventListener('change', applyFilters);
showZero.addEventListener('change', applyFilters);
showAllCards.addEventListener('change', renderDetail);
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
