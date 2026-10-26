/* ========== Goertzel ========== */
const DTMF_FREQS = [697, 770, 852, 941, 1209, 1336, 1477];

function goertzel(samples, targetFreq, sr) {
  const N = samples.length;
  const k = Math.round((N * targetFreq) / sr);
  const w = (2 * Math.PI * k) / N;
  const c = 2 * Math.cos(w);
  let q0 = 0, q1 = 0, q2 = 0;
  for (let i = 0; i < N; i++) { q0 = c * q1 - q2 + samples[i]; q2 = q1; q1 = q0; }
  return Math.sqrt(q1 * q1 + q2 * q2 - c * q1 * q2) / N;
}

function detectDigit(samples, sr) {
  const mags = DTMF_FREQS.map(f => ({ f, m: goertzel(samples, f, sr) }));
  const low  = mags.filter(m => m.f < 1100).sort((a, b) => b.m - a.m)[0];
  const high = mags.filter(m => m.f >= 1100).sort((a, b) => b.m - a.m)[0];
  const T = 0.02;
  if (!low || !high || low.m < T || high.m < T) return null;
  const map = {
    '697-1209':'1','697-1336':'2','697-1477':'3',
    '770-1209':'4','770-1336':'5','770-1477':'6',
    '852-1209':'7','852-1336':'8','852-1477':'9',
    '941-1336':'0'
  };
  return map[`${low.f}-${high.f}`] || null;
}

/* ========== QR ÜRETİMİ ========== */
function makeQR(cryptoCode) {
  const studentNo = document.getElementById('studentNo').value.trim();
  const status = document.getElementById('status');
  if (!studentNo) { status.textContent = '⚠️ Önce öğrenci no girin'; return; }
  if (!/^\d{4}$/.test(cryptoCode)) { status.textContent = '⚠️ 4 haneli kod gerekli'; return; }

  const payload = JSON.stringify({ c: cryptoCode, s: studentNo, t: Date.now() });
  const qrDiv = document.getElementById('qr');
  qrDiv.innerHTML = '';
  new QRCode(qrDiv, { text: payload, width: 260, height: 260 });
  status.textContent = `✅ Kod: ${cryptoCode} — QR hazır (güncelleniyor)`;
}

/* ========== MİKROFON DÖNGÜSÜ ========== */
let current = '';
let lastDigitAt = 0;
let silentSince = null;

async function startMic() {
  const status = document.getElementById('status');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      }
    });
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);

    setInterval(() => {
      an.getFloatTimeDomainData(buf);
      const d = detectDigit(buf, ctx.sampleRate);
      const now = Date.now();

      if (d) {
        if (current.length === 0) current = d;
        else if (now - lastDigitAt > 400) current += d;
        lastDigitAt = now;
        silentSince = null;

        if (current.length === 4) {
          makeQR(current);
          current = '';
        }
      } else {
        if (!silentSince) silentSince = now;
        if (now - silentSince > 600 && current.length > 0 && current.length < 4) {
          current = '';
          status.textContent = '🔄 Yarım kod sıfırlandı, yeni kod bekleniyor...';
        }
      }
    }, 50);
  } catch (e) {
    status.textContent = '⚠️ Mikrofon hatası: ' + e.message + ' — Manuel giriş kullanın';
  }
}

/* ========== MANUEL GİRİŞ ========== */
function bindManual() {
  document.getElementById('manualBtn').onclick = () => {
    const code = document.getElementById('manualCode').value.trim();
    if (!/^\d{4}$/.test(code)) {
      document.getElementById('status').textContent = '⚠️ 4 haneli kod girin';
      return;
    }
    makeQR(code);
  };
}

/* ========== BAŞLAT ========== */
(async function init() {
  // qrcodejs CDN
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  bindManual();
  startMic();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn);
})();