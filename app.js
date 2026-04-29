const API = 'https://tts.kevyn.com.br';

// Only en and pt have voices in Kokoro; es is UI-only
const VOICE_LANGS = [
  { id: 'en', prefixes: ['af', 'am', 'bf', 'bm', 'ef', 'em'] },
  { id: 'pt', prefixes: ['pf', 'pm'] },
];

const T = {
  en: {
    language:     'Language',
    voice:        'Voice',
    speed:        'Speed',
    text:         'Text',
    placeholder:  'Enter the text you want to convert to speech…',
    generateBtn:  'Generate Speech',
    generatingBtn:'Generating…',
    download:     'Download',
    outputLabel:  'Generated Audio',
    chars:        'chars',
    errEmpty:     'Please enter some text to synthesize.',
    errVoice:     'Please select a voice.',
    errFailed:    'Failed to generate audio:',
    genderF:      'Female',
    genderM:      'Male',
    voiceLabels:  { en: 'English', pt: 'Portuguese' },
  },
  pt: {
    language:     'Idioma',
    voice:        'Voz',
    speed:        'Velocidade',
    text:         'Texto',
    placeholder:  'Digite o texto que deseja converter em áudio…',
    generateBtn:  'Gerar Áudio',
    generatingBtn:'Gerando…',
    download:     'Baixar',
    outputLabel:  'Áudio Gerado',
    chars:        'chars',
    errEmpty:     'Por favor, insira um texto para sintetizar.',
    errVoice:     'Por favor, selecione uma voz.',
    errFailed:    'Falha ao gerar áudio:',
    genderF:      'Feminino',
    genderM:      'Masculino',
    voiceLabels:  { en: 'Inglês', pt: 'Português' },
  },
  es: {
    language:     'Idioma',
    voice:        'Voz',
    speed:        'Velocidad',
    text:         'Texto',
    placeholder:  'Ingresa el texto que deseas convertir a audio…',
    generateBtn:  'Generar Audio',
    generatingBtn:'Generando…',
    download:     'Descargar',
    outputLabel:  'Audio Generado',
    chars:        'chars',
    errEmpty:     'Por favor, ingresa un texto para sintetizar.',
    errVoice:     'Por favor, selecciona una voz.',
    errFailed:    'Error al generar audio:',
    genderF:      'Femenino',
    genderM:      'Masculino',
    voiceLabels:  { en: 'Inglés', pt: 'Portugués' },
  },
};

const FALLBACK_VOICES = [
  'af_alloy','af_aoede','af_bella','af_heart','af_jadzia','af_jessica',
  'af_kore','af_nicole','af_nova','af_river','af_sarah','af_sky',
  'am_adam','am_echo','am_eric','am_fenrir','am_liam','am_michael','am_onyx','am_puck',
  'bf_alice','bf_emma','bf_lily',
  'bm_daniel','bm_fable','bm_george','bm_lewis',
  'ef_dora','em_alex','em_santa',
  'pf_dora','pm_alex','pm_santa',
];

let allVoices = [];
let wavesurfer = null;
let audioBlob = null;
let audioObjectUrl = null;
let duration = 0;
let t = T.en;

// ── Language detection ────────────────────────────────────────────

function detectUILang() {
  const code = (navigator.language || 'en').toLowerCase().split('-')[0];
  if (code === 'pt') return 'pt';
  if (code === 'es') return 'es';
  return 'en';
}

function applyTranslations(uiLang) {
  t = T[uiLang] ?? T.en;
  document.documentElement.lang = uiLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) el.textContent = t[key];
  });

  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    if (t[key] !== undefined) el.innerHTML = t[key];
  });

  document.getElementById('text').placeholder = t.placeholder;
}

// ── Utilities ─────────────────────────────────────────────────────

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function capFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function voiceDisplayName(voiceId) {
  const name = voiceId.split('_').slice(1).join(' ');
  return capFirst(name);
}

function showError(msg) {
  const toast = document.getElementById('error-toast');
  document.getElementById('error-message').textContent = msg;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 6000);
}

// ── Voice fetching ────────────────────────────────────────────────

async function fetchVoices() {
  try {
    const res = await fetch(`${API}/v1/audio/voices`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (Array.isArray(data))        return data;
    if (Array.isArray(data.voices)) return data.voices;
    if (Array.isArray(data.data))   return data.data;
    return [];
  } catch {
    return [];
  }
}

// ── Populate UI ───────────────────────────────────────────────────

function populateLanguages() {
  const sel = document.getElementById('language');
  sel.innerHTML = VOICE_LANGS.map(l =>
    `<option value="${l.id}">${t.voiceLabels[l.id] ?? l.id}</option>`
  ).join('');
}

function populateVoices(voiceLangId) {
  const lang = VOICE_LANGS.find(l => l.id === voiceLangId);
  if (!lang) return;

  const fPfx = lang.prefixes.filter(p => p[1] === 'f');
  const mPfx = lang.prefixes.filter(p => p[1] === 'm');

  const fVoices = allVoices.filter(v => fPfx.some(p => v.startsWith(p + '_')));
  const mVoices = allVoices.filter(v => mPfx.some(p => v.startsWith(p + '_')));

  const sel = document.getElementById('voice');
  sel.innerHTML = '';

  function addGroup(label, voices) {
    if (!voices.length) return;
    const grp = document.createElement('optgroup');
    grp.label = label;
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = voiceDisplayName(v);
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }

  addGroup(t.genderF, fVoices);
  addGroup(t.genderM, mVoices);
}

// ── WaveSurfer ────────────────────────────────────────────────────

function createWaveSurfer() {
  if (wavesurfer) {
    wavesurfer.destroy();
    wavesurfer = null;
  }

  wavesurfer = WaveSurfer.create({
    container:     '#waveform',
    waveColor:     '#C8763E',
    progressColor: '#E89050',
    cursorColor:   'rgba(237, 213, 188, 0.45)',
    barWidth:      3,
    barRadius:     4,
    barGap:        2,
    height:        72,
    normalize:     true,
    interact:      true,
  });

  wavesurfer.on('error', (err) => {
    showError(`${t.errFailed} ${err}`);
  });

  wavesurfer.on('ready', () => {
    duration = wavesurfer.getDuration();
    document.getElementById('total-time').textContent = formatTime(duration);
    wavesurfer.play();
  });

  wavesurfer.on('timeupdate', (time) => {
    document.getElementById('current-time').textContent = formatTime(time);
    if (duration > 0) {
      document.getElementById('progress-fill').style.width = `${(time / duration) * 100}%`;
    }
  });

  wavesurfer.on('play', () => {
    document.getElementById('icon-play').style.display  = 'none';
    document.getElementById('icon-pause').style.display = '';
  });

  wavesurfer.on('pause', () => {
    document.getElementById('icon-play').style.display  = '';
    document.getElementById('icon-pause').style.display = 'none';
  });

  wavesurfer.on('finish', () => {
    document.getElementById('icon-play').style.display  = '';
    document.getElementById('icon-pause').style.display = 'none';
    document.getElementById('progress-fill').style.width = '100%';
  });

  const mini = document.getElementById('progress-mini');
  mini.addEventListener('click', (e) => {
    if (!wavesurfer || !duration) return;
    wavesurfer.seekTo(e.offsetX / mini.offsetWidth);
  });
}

// ── Generate ──────────────────────────────────────────────────────

function restoreBtn(btn) {
  btn.disabled = false;
  btn.classList.remove('loading');
  btn.innerHTML = `
    <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/>
    </svg>
    <span class="btn-label">${t.generateBtn}</span>`;
}

async function generate() {
  const text  = document.getElementById('text').value.trim();
  const voice = document.getElementById('voice').value;
  const speed = parseFloat(document.getElementById('speed').value);
  const btn   = document.getElementById('generate-btn');

  if (!text)  { showError(t.errEmpty); return; }
  if (!voice) { showError(t.errVoice); return; }

  document.getElementById('error-toast').hidden = true;

  btn.disabled = true;
  btn.classList.add('loading');
  btn.innerHTML = `<span class="spinner"></span><span class="btn-label">${t.generatingBtn}</span>`;

  try {
    const res = await fetch(`${API}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:           'kokoro',
        input:           text,
        voice:           voice,
        response_format: 'mp3',
        speed:           speed,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `Server returned ${res.status}`);
    }

    audioBlob = await res.blob();

    if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = URL.createObjectURL(audioBlob);

    const voiceName = voiceDisplayName(voice);
    const langLabel = t.voiceLabels[document.getElementById('language').value] ?? '';

    const out = document.getElementById('output-section');
    out.hidden = true;
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('current-time').textContent = '0:00';
    document.getElementById('total-time').textContent = '0:00';

    createWaveSurfer();

    wavesurfer.once('ready', () => {
      document.getElementById('output-voice-tag').textContent = `${voiceName} · ${langLabel}`;
      document.getElementById('download-btn').onclick = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(audioBlob);
        a.download = `leia_${voiceName.toLowerCase()}_${Date.now()}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
      out.hidden = false;
      out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    wavesurfer.load(audioObjectUrl).catch(err => {
      showError(`${t.errFailed} ${err.message || err}`);
    });

  } catch (err) {
    showError(`${t.errFailed} ${err.message}`);
  } finally {
    restoreBtn(btn);
  }
}

// ── Init ──────────────────────────────────────────────────────────

async function init() {
  const uiLang = detectUILang();
  applyTranslations(uiLang);

  populateLanguages();

  // Auto-select voice language: pt browser → pt voices, others → en
  const langSel = document.getElementById('language');
  langSel.value = uiLang === 'pt' ? 'pt' : 'en';

  const fetched = await fetchVoices();
  allVoices = fetched.length ? fetched : FALLBACK_VOICES;

  populateVoices(langSel.value);

  langSel.addEventListener('change', (e) => {
    populateVoices(e.target.value);
  });

  const speedEl = document.getElementById('speed');
  function updateSpeedBadge() {
    document.getElementById('speed-value').textContent = `${parseFloat(speedEl.value)}×`;
  }
  speedEl.addEventListener('input', updateSpeedBadge);
  updateSpeedBadge();

  const textEl = document.getElementById('text');
  textEl.addEventListener('input', () => {
    document.getElementById('char-count').textContent = textEl.value.length;
  });

  document.getElementById('generate-btn').addEventListener('click', generate);

  document.getElementById('play-pause-btn').addEventListener('click', () => {
    if (wavesurfer) wavesurfer.playPause();
  });
}

document.addEventListener('DOMContentLoaded', init);
