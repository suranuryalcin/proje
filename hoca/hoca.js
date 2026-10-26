/* ========== DURUM ========== */
let students = [], courses = [];
let currentCourse = null, currentWeek = 1;
let currentCode = null;
let autoCam = true, cameraActive = false;
let broadcastTimer = null, qrStream = null, scanRAF = null;

const ATT_KEY = 'attendance';
const getAttendance = () => JSON.parse(localStorage.getItem(ATT_KEY) || '{}');
const saveAttendance = a => localStorage.setItem(ATT_KEY, JSON.stringify(a));

/* ========== VERİ YÜKLE ========== */
async function loadData() {
  const s = localStorage.getItem('students');
  const c = localStorage.getItem('courses');
  if (s && c) {
    students = JSON.parse(s); courses = JSON.parse(c);
  } else {
    students = await (await fetch('../shared/students.json')).json();
    courses  = await (await fetch('../shared/courses.json')).json();
    localStorage.setItem('students', JSON.stringify(students));
    localStorage.setItem('courses',  JSON.stringify(courses));
  }
}

/* ========== SELECT DOLDUR ========== */
function fillSelectors() {
  const cs = document.getElementById('courseSel');
  cs.innerHTML = courses.map(c => `<option value="${c.code}">${c.code} — ${c.name}</option>`).join('');
  cs.onchange = () => currentCourse = cs.value;

  const ws = document.getElementById('weekSel');
  ws.innerHTML = Array.from({ length: 14 }, (_, i) => `<option value="${i+1}">Hafta ${i+1}</option>`).join('');
  ws.onchange = () => currentWeek = +ws.value;

  currentCourse = courses[0]?.code || null;
  currentWeek = 1;
}

/* ========== UYARI ========== */
function showAlert(msg, ok = false) {
  const el = document.getElementById('alert');
  el.textContent = msg;
  el.className = ok ? 'ok' : 'err';
  el.style.display = 'block';
  clearTimeout(showAlert._t);
  showAlert._t = setTimeout(() => el.style.display = 'none', 4000);
}

/* ========== ÖĞRENCİ BİLGİ + FOTOĞRAF ========== */
function showStudentInfo(no) {
  const st = students.find(s => s.no === no);
  if (!st) return;

  const img = document.getElementById('stuPhoto');
  img.src = `../shared/photos/${no}.jpeg`;
  img.alt = `${st.ad} ${st.soyad}`;
  img.onerror = () => { img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110"><rect fill="%23ddd" width="110" height="110"/><text x="55" y="60" text-anchor="middle" fill="%23999" font-size="12">Foto yok</text></svg>'; };

  document.getElementById('stuName').textContent    = `${st.ad} ${st.soyad}`;
  document.getElementById('stuNo').textContent      = `No: ${st.no}`;
  document.getElementById('stuBolum').textContent   = `Bölüm: ${st.bolum}`;
  document.getElementById('stuProgram').textContent = `Program: ${st.program}`;
  document.getElementById('stuSinif').textContent   = `Sınıf: ${st.sinif}`;

  const card = document.getElementById('studentCard');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ========== DTMF SES ÜRETİMİ ========== */
const DTMF = {
  '0':[941,1336],'1':[697,1209],'2':[697,1336],'3':[697,1477],
  '4':[770,1209],'5':[770,1336],'6':[770,1477],
  '7':[852,1209],'8':[852,1336],'9':[852,1477]
};
let audioCtx = null;

function playDigit(d, dur = 0.65) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
  const [f1, f2] = DTMF[d];
  const o1 = audioCtx.createOscillator(), o2 = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o1.frequency.value = f1; o2.frequency.value = f2;
  o1.type = o2.type = 'sine'; g.gain.value = 0.3;
  o1.connect(g); o2.connect(g); g.connect(audioCtx.destination);
  const t = audioCtx.currentTime;
  o1.start(t); o2.start(t); o1.stop(t + dur); o2.stop(t + dur);
}

async function playCode(code) {
  for (const d of code) {
    playDigit(d, 0.65);
    await new Promise(r => setTimeout(r, 1000)); // 650ms ton + 350ms sessizlik
  }
}

/* ========== YAYIN DÖNGÜSÜ ========== */
async function startBroadcast() {
  if (audioCtx?.state === 'suspended') await audioCtx.resume();
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled  = false;
  if (autoCam) startCamera();

  const emit = () => {
    currentCode = String(Math.floor(1000 + Math.random() * 9000));
    document.getElementById('code').textContent = currentCode;
    playCode(currentCode);
  };
  emit();
  broadcastTimer = setInterval(emit, 13000);
}

function stopBroadcast() {
  clearInterval(broadcastTimer);
  broadcastTimer = null;
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled  = true;
  document.getElementById('code').textContent = '----';
  currentCode = null;
  stopCamera();
}

/* ========== KAMERA ========== */
async function startCamera() {
  if (cameraActive) return;
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }, audio: false
    });
    const video = document.getElementById('video');
    video.srcObject = qrStream;
    video.style.display = 'block';
    await video.play();
    cameraActive = true;

    const camBtn = document.getElementById('camBtn');
    camBtn.textContent = '📷 Kamerayı Kapat';
    camBtn.classList.add('danger');
    camBtn.onclick = stopCamera;

    scanLoop();
  } catch (e) { showAlert('Kamera açılamadı: ' + e.message); }
}

function stopCamera() {
  if (!cameraActive) return;
  cancelAnimationFrame(scanRAF);
  qrStream?.getTracks().forEach(t => t.stop());
  qrStream = null; cameraActive = false;

  const camBtn = document.getElementById('camBtn');
  camBtn.textContent = '📷 Kamerayı Aç';
  camBtn.classList.remove('danger');
  camBtn.onclick = startCamera;

  const video = document.getElementById('video');
  video.srcObject = null;
  video.style.display = 'none';
}

/* ========== QR TARAMA (jsQR) ========== */
async function scanLoop() {
  const video = document.getElementById('video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!window.jsQR) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  let last = { data: '', t: 0 };

  const tick = () => {
    if (!cameraActive) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = window.jsQR(img.data, img.width, img.height);
      if (qr?.data) {
        const now = Date.now();
        if (qr.data !== last.data || now - last.t > 2000) {
          last = { data: qr.data, t: now };
          handleQR(qr.data);
        }
      }
    }
    scanRAF = requestAnimationFrame(tick);
  };
  tick();
}

/* ========== DOĞRULAMA ========== */
function handleQR(payload) {
  let parsed;
  try { parsed = JSON.parse(payload); }
  catch { showAlert('❌ Geçersiz QR kod'); return; }

  const { c, s } = parsed;
  const studentNo = String(s);

  if (!currentCode || c !== currentCode) {
    showAlert('❌ Kod eşleşmiyor! Eski/farklı QR.');
    return;
  }
  if (!currentCourse) { showAlert('⚠️ Önce ders seçin.'); return; }

  const course = courses.find(co => co.code === currentCourse);
  if (!course || !course.students.includes(studentNo)) {
    showAlert(`⚠️ ${studentNo} bu derse (${currentCourse}) kayıtlı değil!`);
    return;
  }

  const key = `${currentCourse}_${studentNo}_${currentWeek}`;
  const att = getAttendance();
  if (att[key]) { showAlert('⚠️ Öğrenci bu hafta zaten yoklamaya katıldı.'); return; }

  att[key] = { code: c, time: Date.now() };
  saveAttendance(att);

  showStudentInfo(studentNo);
  showAlert('✅ Yoklama başarılı!', true);
  if (autoCam) stopCamera();
}

/* ========== BAŞLAT ========== */
(async function init() {
  await loadData();
  fillSelectors();

  document.getElementById('autoCam').onchange = e => autoCam = e.target.checked;
  document.getElementById('startBtn').onclick = startBroadcast;
  document.getElementById('stopBtn').onclick  = stopBroadcast;
  document.getElementById('camBtn').onclick   = startCamera;

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn);
})();