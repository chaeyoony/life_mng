'use strict';
/* ============ 채윤 독서생활 ============ */

// ---------- 유틸 ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2400);
}

// ---------- 카테고리 & 자동 분류 ----------
const CATS = {
  '데이터분석': '#3b82f6', '사회학': '#e11d48', '경제·경영': '#f59e0b', '심리': '#ec4899',
  '철학': '#8b5cf6', '역사': '#a16207', '과학': '#14b8a6', 'SF': '#6366f1',
  '문학': '#16a34a', '에세이': '#f97316', '자기계발': '#84cc16', '비문학': '#78716c',
};
const CAT_RULES = [
  ['데이터분석', ['데이터', '분석', '통계', 'sql', '파이썬', 'python', '머신러닝', '딥러닝', '시각화', '빅데이터', 'data', 'statistic', 'analytic', '판다스', 'pandas', '태블로', 'tableau', '엑셀', '회귀', '인공지능', ' ai', 'r 프로그래밍', 'tidyverse']],
  ['사회학', ['사회학', '사회', '불평등', '젠더', '계급', '노동', '페미니즘', '정치', '차별', '공동체', '시민', 'sociolog', '자본주의']],
  ['경제·경영', ['경제', '경영', '투자', '주식', '마케팅', '재테크', '부동산', '금융', '창업', 'business', 'econom', 'financ', '브랜드']],
  ['심리', ['심리', '마음', '정신', '우울', '불안', '감정', 'psycholog', '상담', '트라우마']],
  ['철학', ['철학', '윤리', '존재', '사유', 'philosoph', '니체', '칸트', '인문학']],
  ['역사', ['역사', '전쟁', '제국', '왕조', '혁명', 'history', '고대', '근대']],
  ['과학', ['과학', '물리', '우주', '뇌', '진화', '생물', '수학', '화학', '양자', 'science', '천문', '유전자']],
  ['SF', ['sf', '과학소설', '공상', 'sci-fi', 'science fiction', '외계', '우주선', '디스토피아', '사이버펑크', '안드로이드', '로봇']],
  ['에세이', ['에세이', '산문', 'essay', '일기', '여행기', '단상']],
  ['자기계발', ['자기계발', '습관', '성공', '동기부여', '생산성', '목표', '루틴', 'self-help', '리더십']],
  ['문학', ['소설', '시집', '장편', '단편', '희곡', '문학', 'fiction', 'novel', 'poetry', 'literary', '시인', '동화']],
];
function classify(title = '', authors = '', categories = '', description = '') {
  const t = (title + ' ' + authors).toLowerCase();
  const c = categories.toLowerCase();
  const d = description.toLowerCase().slice(0, 500);
  let best = null, bestScore = 0;
  for (const [cat, kws] of CAT_RULES) {
    let s = 0;
    for (const k of kws) {
      if (t.includes(k)) s += 3;
      if (c.includes(k)) s += 3;
      if (d.includes(k)) s += 1;
    }
    if (cat === 'SF' && s > 0) s += 1; // SF가 일반 '문학'보다 우선
    if (s > bestScore) { best = cat; bestScore = s; }
  }
  if (best) return best;
  if (/fiction|novel/.test(c) && !/nonfiction/.test(c)) return '문학';
  return '비문학';
}
const catColor = (c) => CATS[c] || '#78716c';
const catTag = (c) => `<span class="tag" style="background:${catColor(c)}">${esc(c)}</span>`;
const STATUS = { reading: '읽는 중', done: '완독', wish: '읽고 싶은' };

// ---------- 상태 ----------
const state = {
  tab: 'library', filter: 'reading', query: '',
  month: new Date(), statYear: new Date().getFullYear(),
  books: [], logs: [], user: null,
};
let sb = null;

const bookById = (id) => state.books.find((b) => b.id === id);
const logsOf = (bookId) => state.logs.filter((l) => l.book_id === bookId);
const maxPage = (bookId) => Math.max(0, ...logsOf(bookId).map((l) => l.page_to || 0));
function bookYear(b) {
  const ls = logsOf(b.id).map((l) => l.log_date).sort();
  const d = b.finished_at || ls[ls.length - 1] || b.started_at || (b.created_at || '').slice(0, 10);
  return num((d || '').slice(0, 4)) || new Date().getFullYear();
}
function coverHtml(b, cls = 'cover') {
  if (b.cover_url) return `<img class="${cls}" src="${esc(b.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  return `<div class="${cls}">${esc(b.title)}</div>`;
}

// ---------- 초기화 ----------
function configured() {
  const c = window.READING_CONFIG || {};
  return c.SUPABASE_URL && !c.SUPABASE_URL.startsWith('YOUR_') && c.SUPABASE_ANON_KEY && !c.SUPABASE_ANON_KEY.startsWith('YOUR_');
}
async function init() {
  document.querySelectorAll('#tabbar button').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); }));
  $('#fab').addEventListener('click', onFab);
  $('#btnLogout').addEventListener('click', async () => { await sb.auth.signOut(); });
  $('#overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeSheet(); });

  if (!configured()) return renderSetup();
  sb = window.supabase.createClient(window.READING_CONFIG.SUPABASE_URL, window.READING_CONFIG.SUPABASE_ANON_KEY);
  const { data } = await sb.auth.getSession();
  state.user = data.session?.user || null;
  sb.auth.onAuthStateChange((_e, session) => {
    const was = state.user?.id;
    state.user = session?.user || null;
    if (state.user && state.user.id !== was) loadAll();
    if (!state.user) { state.books = []; state.logs = []; render(); }
  });
  if (state.user) loadAll(); else render();
}

async function fetchAll(table, orderCol, asc) {
  const out = []; let from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select('*').order(orderCol, { ascending: asc }).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}
async function loadAll() {
  try {
    [state.books, state.logs] = await Promise.all([fetchAll('books', 'created_at', false), fetchAll('reading_logs', 'log_date', false)]);
  } catch (e) { toast('불러오기 실패: ' + e.message); }
  render();
}

// ---------- 렌더 ----------
function render() {
  const loggedIn = !!state.user;
  $('#tabbar').hidden = !loggedIn;
  $('#fab').hidden = !loggedIn;
  $('#btnLogout').hidden = !loggedIn;
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
  const m = $('#main');
  if (!loggedIn) { m.innerHTML = loginHtml(); bindLogin(); return; }
  if (state.tab === 'library') { m.innerHTML = libraryHtml(); bindLibrary(); }
  else if (state.tab === 'calendar') { m.innerHTML = calendarHtml(); bindCalendar(); }
  else { m.innerHTML = statsHtml(); bindStats(); }
}
function onFab() {
  if (state.tab === 'library') openAddBook();
  else openLogForm({});
}

// ---------- 설정 안내 / 로그인 ----------
function renderSetup() {
  $('#main').innerHTML = `<div class="setup"><h2>⚙️ Supabase 연결이 필요해요</h2>
    <p class="muted" style="margin:8px 0">1) <code>sql/schema.sql</code> 을 Supabase SQL Editor에서 실행<br>
    2) <code>config.js</code> 에 Project URL, anon key 입력<br>
    3) Authentication → Users 에서 내 계정 만들기<br>자세한 순서는 README.md 를 보세요.</p></div>`;
}
function loginHtml() {
  return `<form class="login" id="loginForm"><div class="emoji">📚</div><h2>채윤 독서생활</h2>
    <input type="email" id="lgEmail" placeholder="이메일" autocomplete="email" required>
    <input type="password" id="lgPw" placeholder="비밀번호 (6자 이상)" autocomplete="current-password" required>
    <button class="primary" type="submit">로그인</button>
    <button class="ghost" type="button" id="lgSignup" style="width:100%;margin-top:8px">처음이면 회원가입</button></form>`;
}
function bindLogin() {
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: $('#lgEmail').value.trim(), password: $('#lgPw').value });
    if (error) toast('로그인 실패: ' + error.message);
  });
  $('#lgSignup').addEventListener('click', async () => {
    const email = $('#lgEmail').value.trim(), password = $('#lgPw').value;
    if (!email || password.length < 6) return toast('이메일과 6자 이상 비밀번호를 입력하세요');
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return toast('가입 실패: ' + error.message);
    toast(data.session ? '가입 완료!' : '확인 메일을 보냈어요. 메일 인증 후 로그인하세요');
  });
}

// ---------- 서재 ----------
function libraryHtml() {
  const q = state.query.trim().toLowerCase();
  const list = state.books.filter((b) => (state.filter === 'all' || b.status === state.filter) &&
    (!q || (b.title + ' ' + b.author + ' ' + b.category).toLowerCase().includes(q)));
  const chips = [['reading', '읽는 중'], ['done', '완독'], ['wish', '읽고 싶은'], ['all', '전체']]
    .map(([k, l]) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
  const cards = list.map((b) => {
    const mp = maxPage(b.id);
    const pct = b.total_pages ? Math.min(100, Math.round((mp / b.total_pages) * 100)) : 0;
    return `<button class="book" data-id="${b.id}">${coverHtml(b)}
      <div class="t">${esc(b.title)}</div><div class="a">${esc(b.author)}</div>
      <div style="margin-top:5px">${catTag(b.category)}</div>
      ${b.total_pages && b.status !== 'wish' ? `<div class="bar"><i style="width:${b.status === 'done' ? 100 : pct}%"></i></div>` : ''}</button>`;
  }).join('');
  return `<input id="q" type="search" placeholder="🔍 내 서재에서 책 이름·저자 검색" value="${esc(state.query)}">
    <div class="chips">${chips}</div>
    ${list.length ? `<div class="grid">${cards}</div>` : `<div class="empty">${state.books.length ? '조건에 맞는 책이 없어요' : '아직 등록한 책이 없어요.<br>오른쪽 아래 ＋ 버튼으로 첫 책을 추가해 보세요 📖'}</div>`}`;
}
function bindLibrary() {
  $('#q').addEventListener('input', (e) => {
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    render(); const el = $('#q'); el.focus(); el.setSelectionRange(pos, pos);
  });
  document.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.f; render(); }));
  document.querySelectorAll('.book').forEach((b) => b.addEventListener('click', () => openBook(b.dataset.id)));
}

// ---------- 캘린더 ----------
function calendarHtml() {
  const y = state.month.getFullYear(), mo = state.month.getMonth();
  const first = new Date(y, mo, 1);
  const start = new Date(y, mo, 1 - first.getDay());
  const prefix = `${y}-${pad(mo + 1)}`;
  const byDay = {};
  for (const l of state.logs) (byDay[l.log_date] ||= []).push(l);
  const monthLogs = state.logs.filter((l) => l.log_date.startsWith(prefix));
  const totalPages = monthLogs.reduce((s, l) => s + (l.pages_read || 0), 0);
  const days = new Set(monthLogs.map((l) => l.log_date)).size;
  const bookCnt = new Set(monthLogs.map((l) => l.book_id)).size;
  let cells = '';
  const rows = Math.ceil((first.getDay() + new Date(y, mo + 1, 0).getDate()) / 7);
  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = ymd(d), ls = byDay[key] || [];
    const pages = ls.reduce((s, l) => s + (l.pages_read || 0), 0);
    const ids = [...new Set(ls.map((l) => l.book_id))];
    const heat = !ls.length ? '' : pages >= 60 ? 'h3' : pages >= 25 ? 'h2' : 'h1';
    const covers = ids.slice(0, 4).map((id) => { const b = bookById(id); return b ? (b.cover_url ? `<img class="mc" src="${esc(b.cover_url)}" alt="" referrerpolicy="no-referrer">` : `<div class="mc">${esc(b.title.slice(0, 8))}</div>`) : ''; }).join('');
    cells += `<button class="cell ${d.getMonth() !== mo ? 'out' : ''} ${key === todayStr() ? 'today' : ''} ${heat}" data-day="${key}">
      <div class="d">${d.getDate()}</div><div class="covers">${covers}</div>${pages ? `<div class="pg">${pages}쪽</div>` : ''}</button>`;
  }
  return `<div class="cal-head"><button data-m="-1">‹</button><b>${y}년 ${mo + 1}월</b><button data-m="1">›</button></div>
    <div class="summary"><div><b>${totalPages}</b><span>읽은 쪽수</span></div><div><b>${days}</b><span>읽은 날</span></div><div><b>${bookCnt}</b><span>읽은 책</span></div></div>
    <div class="dow">${'일월화수목금토'.split('').map((d) => `<div>${d}</div>`).join('')}</div><div class="cal">${cells}</div>`;
}
function bindCalendar() {
  document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + Number(b.dataset.m), 1); render();
  }));
  document.querySelectorAll('.cell').forEach((c) => c.addEventListener('click', () => openDay(c.dataset.day)));
}
function openDay(day) {
  const ls = state.logs.filter((l) => l.log_date === day);
  const total = ls.reduce((s, l) => s + (l.pages_read || 0), 0);
  openSheet(`<button class="close" data-close>✕</button><h2>${day.replace(/-/g, '.')}</h2>
    <div class="muted">${ls.length ? `총 ${total}쪽 읽음` : '이 날은 기록이 없어요'}</div>
    ${ls.map((l) => logCard(l, true)).join('')}
    <button class="primary" id="addHere" style="width:100%;margin-top:12px">＋ 이 날 독서 기록하기</button>`);
  $('#addHere').onclick = () => openLogForm({ date: day });
  bindLogCards();
}

// ---------- 연간 통계 ----------
function statsHtml() {
  const years = [...new Set(state.books.map(bookYear))].sort((a, b) => b - a);
  if (!years.length) return '<div class="empty">책을 등록하면 연도별 독서 취향이 여기에 보여요 📊</div>';
  if (!years.includes(state.statYear)) state.statYear = years[0];
  const yr = state.statYear;
  const countBy = (list) => { const m = {}; list.forEach((b) => (m[b.category] = (m[b.category] || 0) + 1)); return m; };
  const used = new Set();
  const overview = years.slice().sort((a, b) => a - b).map((y) => {
    const m = countBy(state.books.filter((b) => b.status !== 'wish' && bookYear(b) === y)); const tot = Object.values(m).reduce((a, b) => a + b, 0);
    Object.keys(m).forEach((k) => used.add(k));
    return `<div class="yrow"><div class="y"><span>${y}</span><span class="muted">${tot}권</span></div><div class="stack">${
      Object.entries(m).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<i style="width:${(n / tot) * 100}%;background:${catColor(c)}" title="${esc(c)} ${n}권"></i>`).join('')}</div></div>`;
  }).join('');
  const legend = [...used].map((c) => `<span><i style="background:${catColor(c)}"></i>${esc(c)}</span>`).join('');
  const yBooks = state.books.filter((b) => b.status !== 'wish' && bookYear(b) === yr);
  const cm = Object.entries(countBy(yBooks)).sort((a, b) => b[1] - a[1]);
  const maxC = Math.max(1, ...cm.map((x) => x[1]));
  const catBars = cm.map(([c, n]) => `<div class="hbar"><span class="n">${esc(c)}</span><span class="tr"><i style="width:${(n / maxC) * 100}%;background:${catColor(c)}"></i></span><span class="v">${n}권</span></div>`).join('');
  const mp = Array(12).fill(0);
  state.logs.filter((l) => l.log_date.startsWith(String(yr))).forEach((l) => (mp[num(l.log_date.slice(5, 7)) - 1] += l.pages_read || 0));
  const maxP = Math.max(1, ...mp), totalP = mp.reduce((a, b) => a + b, 0);
  const monthBars = mp.map((p, i) => `<div>${p ? `<em>${p}</em>` : ''}<i style="height:${(p / maxP) * 100}%"></i>${i + 1}월</div>`).join('');
  const top = cm[0] ? `올해 가장 많이 읽은 분야는 <b>${esc(cm[0][0])}</b> (${cm[0][1]}권)` : '';
  return `<div class="chips">${years.map((y) => `<button class="chip ${y === yr ? 'on' : ''}" data-y="${y}">${y}</button>`).join('')}</div>
    <div class="summary"><div><b>${yBooks.length}</b><span>${yr}년 책</span></div><div><b>${yBooks.filter((b) => b.status === 'done').length}</b><span>완독</span></div><div><b>${totalP}</b><span>읽은 쪽수</span></div></div>
    <div class="panel"><h3>🎯 ${yr}년 관심 분야</h3><div class="muted" style="margin-bottom:6px">${top}</div>${catBars || '<div class="muted">데이터 없음</div>'}</div>
    <div class="panel"><h3>📈 월별 읽은 쪽수</h3><div class="months">${monthBars}</div></div>
    <div class="panel"><h3>🧭 연도별 관심사 변화</h3>${overview}<div class="legend">${legend}</div></div>
    <div class="panel"><h3>📚 ${yr}년에 읽은 책</h3><div class="list-sm">${yBooks.map((b) => `<button class="it" data-id="${b.id}">${coverHtml(b)}<div><b>${esc(b.title)}</b><div class="muted">${esc(b.author)} · ${catTag(b.category)}</div></div></button>`).join('') || '<div class="muted">없음</div>'}</div></div>`;
}
function bindStats() {
  document.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => { state.statYear = Number(b.dataset.y); render(); }));
  document.querySelectorAll('.list-sm .it').forEach((b) => b.addEventListener('click', () => openBook(b.dataset.id)));
}

// ---------- 시트(모달) ----------
function openSheet(html) {
  $('#sheet').innerHTML = html; $('#overlay').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#sheet').scrollTop = 0;
  $('#sheet').querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeSheet));
}
function closeSheet() { $('#overlay').hidden = true; document.body.style.overflow = ''; }

// ---------- 책 추가 (검색) ----------
function openAddBook() {
  openSheet(`<button class="close" data-close>✕</button><h2>책 추가</h2>
    <form id="sf" class="row"><input id="sq" placeholder="책 제목 또는 저자로 검색" autofocus><button class="primary fit" style="flex:none">검색</button></form>
    <div id="sres" class="muted" style="margin-top:8px">제목을 검색하면 표지·저자·분류가 자동으로 채워져요.</div>
    <button class="ghost" id="manual" style="width:100%;margin-top:12px">검색 없이 직접 입력</button>`);
  $('#manual').onclick = () => openBookForm({});
  $('#sf').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('#sq').value.trim(); if (!q) return;
    $('#sres').textContent = '검색 중…';
    try {
      const results = await searchBooks(q);
      $('#sres').innerHTML = results.length ? results.map((r, i) => `<button class="result" data-i="${i}">${coverHtml(r)}<div><b>${esc(r.title)}</b><span class="muted">${esc(r.author)}${r.total_pages ? ' · ' + r.total_pages + '쪽' : ''}</span>${catTag(r.category)}</div></button>`).join('') : '검색 결과가 없어요. 직접 입력해 주세요.';
      document.querySelectorAll('.result').forEach((el) => (el.onclick = () => openBookForm(results[el.dataset.i])));
    } catch (err) { $('#sres').textContent = '검색 실패: ' + err.message; }
  };
}
async function searchBooks(q) {
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12&printType=books`);
  if (!res.ok) throw new Error('검색 서버 오류 (' + res.status + ')');
  const j = await res.json();
  return (j.items || []).map((it) => {
    const v = it.volumeInfo || {};
    const cats = (v.categories || []).join(' ');
    const author = (v.authors || []).join(', ');
    let cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '';
    cover = cover.replace(/^http:/, 'https:').replace('&edge=curl', '');
    const isbn = (v.industryIdentifiers || []).find((x) => x.type === 'ISBN_13')?.identifier || (v.industryIdentifiers || [])[0]?.identifier || '';
    return { title: v.title + (v.subtitle ? ': ' + v.subtitle : ''), author, cover_url: cover, isbn, total_pages: v.pageCount || null, category: classify(v.title, author, cats, v.description || '') };
  });
}

// ---------- 책 등록/수정 폼 ----------
function catOptions(sel) { return Object.keys(CATS).map((c) => `<option ${c === sel ? 'selected' : ''}>${c}</option>`).join(''); }
function openBookForm(b) {
  const edit = !!b.id;
  openSheet(`<button class="close" data-close>✕</button><h2>${edit ? '책 정보 수정' : '책 등록'}</h2>
    ${b.cover_url ? `<div style="width:80px;margin:8px 0">${coverHtml(b)}</div>` : ''}
    <label>제목</label><input id="bf_t" value="${esc(b.title)}">
    <label>저자</label><input id="bf_a" value="${esc(b.author)}">
    <label>분류 (자동 분류 · 바꿀 수 있어요)</label><select id="bf_c">${catOptions(b.category || '비문학')}</select>
    <div class="row"><div><label>상태</label><select id="bf_s">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${(b.status || 'reading') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div><label>전체 쪽수</label><input id="bf_p" type="number" inputmode="numeric" value="${b.total_pages ?? ''}"></div></div>
    <label>표지 이미지 주소 (선택)</label><input id="bf_cv" value="${esc(b.cover_url)}" placeholder="https://…">
    <button class="primary" id="bf_save" style="width:100%;margin-top:16px">저장</button>`);
  $('#bf_save').onclick = async () => {
    const title = $('#bf_t').value.trim(); if (!title) return toast('제목을 입력하세요');
    const status = $('#bf_s').value;
    const row = { title, author: $('#bf_a').value.trim(), category: $('#bf_c').value, status, total_pages: num($('#bf_p').value), cover_url: $('#bf_cv').value.trim() || null, isbn: b.isbn || null };
    if (!edit && status === 'reading') row.started_at = todayStr();
    if (status === 'done' && !b.finished_at) row.finished_at = todayStr();
    const q = edit ? sb.from('books').update(row).eq('id', b.id).select().single() : sb.from('books').insert(row).select().single();
    const { data, error } = await q;
    if (error) return toast('저장 실패: ' + error.message);
    state.books = edit ? state.books.map((x) => (x.id === b.id ? data : x)) : [data, ...state.books];
    toast('저장했어요'); render(); openBook(data.id);
  };
}

// ---------- 책 상세 ----------
function logCard(l, showBook) {
  const b = bookById(l.book_id);
  const range = l.page_from && l.page_to ? `p.${l.page_from}–${l.page_to}` : '';
  return `<div class="log"><div class="meta"><span>${showBook && b ? esc(b.title) + ' · ' : ''}${l.log_date.slice(5).replace('-', '/')} ${range} · ${l.pages_read || 0}쪽</span>
    <button class="ghost small" data-editlog="${l.id}">수정</button></div>
    ${l.quote ? `<div class="quote">${esc(l.quote)}</div>` : ''}${l.thought ? `<div class="thought">💭 ${esc(l.thought)}</div>` : ''}</div>`;
}
function bindLogCards() {
  document.querySelectorAll('[data-editlog]').forEach((b) => (b.onclick = () => openLogForm({ log: state.logs.find((l) => l.id === b.dataset.editlog) })));
}
function openBook(id) {
  const b = bookById(id); if (!b) return closeSheet();
  const ls = logsOf(id).sort((a, c) => (c.log_date + c.created_at).localeCompare(a.log_date + a.created_at));
  const total = ls.reduce((s, l) => s + (l.pages_read || 0), 0), mp = maxPage(id);
  openSheet(`<button class="close" data-close>✕</button>
    <div class="hero">${coverHtml(b)}<div class="info"><h2>${esc(b.title)}</h2><div class="muted">${esc(b.author) || '저자 미상'}</div>
    <div style="margin:6px 0">${catTag(b.category)} <span class="tag" style="background:var(--sub)">${STATUS[b.status]}</span></div>
    <div class="muted">${b.total_pages ? `${mp}/${b.total_pages}쪽 · ` : ''}누적 ${total}쪽 · 기록 ${ls.length}개</div>
    ${b.started_at ? `<div class="muted">시작 ${b.started_at}${b.finished_at ? ' → 완독 ' + b.finished_at : ''}</div>` : ''}</div></div>
    <div class="row" style="margin:10px 0"><button class="primary" id="bk_log">✍️ 독서 기록</button><button class="ghost" id="bk_edit">정보 수정</button></div>
    <div class="row" style="margin-bottom:6px">${b.status === 'done' ? '<button class="ghost" id="bk_re">다시 읽는 중으로</button>' : '<button class="ghost" id="bk_done">✅ 완독 처리</button>'}<button class="ghost danger" id="bk_del">삭제</button></div>
    ${ls.map((l) => logCard(l, false)).join('') || '<div class="empty" style="padding:24px">아직 기록이 없어요</div>'}`);
  $('#bk_log').onclick = () => openLogForm({ bookId: id });
  $('#bk_edit').onclick = () => openBookForm(b);
  const setStatus = async (patch) => {
    const { data, error } = await sb.from('books').update(patch).eq('id', id).select().single();
    if (error) return toast('실패: ' + error.message);
    state.books = state.books.map((x) => (x.id === id ? data : x)); render(); openBook(id);
  };
  if ($('#bk_done')) $('#bk_done').onclick = () => setStatus({ status: 'done', finished_at: todayStr() });
  if ($('#bk_re')) $('#bk_re').onclick = () => setStatus({ status: 'reading', finished_at: null });
  $('#bk_del').onclick = async () => {
    if (!confirm(`'${b.title}' 와 모든 독서 기록을 삭제할까요?`)) return;
    const { error } = await sb.from('books').delete().eq('id', id);
    if (error) return toast('삭제 실패: ' + error.message);
    state.books = state.books.filter((x) => x.id !== id); state.logs = state.logs.filter((l) => l.book_id !== id);
    closeSheet(); render(); toast('삭제했어요');
  };
  bindLogCards();
}

// ---------- 독서 기록 폼 ----------
function openLogForm({ bookId, date, log }) {
  const edit = !!log;
  const l = log || {};
  const cand = state.books.filter((b) => b.status !== 'done' || b.id === (bookId || l.book_id));
  if (!cand.length) { toast('먼저 책을 등록해 주세요'); return openAddBook(); }
  const selId = bookId || l.book_id || cand.find((b) => b.status === 'reading')?.id || cand[0].id;
  const startPage = (id) => (maxPage(id) ? maxPage(id) + 1 : '');
  openSheet(`<button class="close" data-close>✕</button><h2>${edit ? '기록 수정' : '독서 기록'}</h2>
    <label>책</label><select id="lg_b">${cand.map((b) => `<option value="${b.id}" ${b.id === selId ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select>
    <label>날짜</label><input id="lg_d" type="date" value="${l.log_date || date || todayStr()}">
    <div class="row"><div><label>시작 쪽</label><input id="lg_f" type="number" inputmode="numeric" value="${l.page_from ?? (edit ? '' : startPage(selId))}"></div>
    <div><label>끝 쪽</label><input id="lg_t" type="number" inputmode="numeric" value="${l.page_to ?? ''}"></div>
    <div><label>읽은 쪽수</label><input id="lg_n" type="number" inputmode="numeric" value="${l.pages_read ?? ''}"></div></div>
    <label>필사 (옮겨 적고 싶은 문장 · 비워도 돼요)</label><textarea id="lg_q">${esc(l.quote)}</textarea>
    <label>내 생각 (자유롭게 · 비워도 돼요)</label><textarea id="lg_th">${esc(l.thought)}</textarea>
    <button class="primary" id="lg_save" style="width:100%;margin-top:16px">저장</button>
    ${edit ? '<button class="ghost danger" id="lg_del" style="width:100%;margin-top:8px">이 기록 삭제</button>' : ''}`);
  const auto = () => { const f = num($('#lg_f').value), t = num($('#lg_t').value); if (f && t && t >= f) $('#lg_n').value = t - f + 1; };
  $('#lg_f').oninput = auto; $('#lg_t').oninput = auto;
  if (!edit) $('#lg_b').onchange = () => { $('#lg_f').value = startPage($('#lg_b').value); };
  $('#lg_save').onclick = async () => {
    const f = num($('#lg_f').value), t = num($('#lg_t').value);
    const pages = num($('#lg_n').value) ?? (f && t && t >= f ? t - f + 1 : 0);
    const row = { book_id: $('#lg_b').value, log_date: $('#lg_d').value || todayStr(), page_from: f, page_to: t, pages_read: pages, quote: $('#lg_q').value.trim() || null, thought: $('#lg_th').value.trim() || null };
    const q = edit ? sb.from('reading_logs').update(row).eq('id', l.id).select().single() : sb.from('reading_logs').insert(row).select().single();
    const { data, error } = await q;
    if (error) return toast('저장 실패: ' + error.message);
    state.logs = edit ? state.logs.map((x) => (x.id === l.id ? data : x)) : [data, ...state.logs];
    const b = bookById(row.book_id);
    if (b && b.status === 'wish') {
      const { data: nb } = await sb.from('books').update({ status: 'reading', started_at: b.started_at || row.log_date }).eq('id', b.id).select().single();
      if (nb) state.books = state.books.map((x) => (x.id === nb.id ? nb : x));
    } else if (b && !b.started_at) {
      const { data: nb } = await sb.from('books').update({ started_at: row.log_date }).eq('id', b.id).select().single();
      if (nb) state.books = state.books.map((x) => (x.id === nb.id ? nb : x));
    }
    toast('기록했어요 ✍️'); render(); openBook(row.book_id);
  };
  if (edit) $('#lg_del').onclick = async () => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    const { error } = await sb.from('reading_logs').delete().eq('id', l.id);
    if (error) return toast('삭제 실패: ' + error.message);
    state.logs = state.logs.filter((x) => x.id !== l.id); render(); openBook(l.book_id);
  };
}

init();
