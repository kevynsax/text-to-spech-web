const API = 'https://tts.kevyn.com.br';
const QWENVL_API = 'https://qwenvl.kevyn.com.br';
const QWENVL_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct-AWQ';
const PDF_RENDER_MAX_SIDE = 1200;
const PDF_RENDER_MAX_SCALE = 1.5;
const PDF_IMAGE_QUALITY = 0.78;
const QWENVL_MAX_TOKENS = 2048;
const EXTRACTOR_SYSTEM_PROMPT = [
  'You are a document OCR and transcription engine.',
  'Return one valid JSON object and nothing else.',
  'The JSON object must have this exact shape: {"language":"pt","content":"..."}',
  'Use language as a lowercase ISO 639-1 code such as "pt", "en", "es", or "unknown".',
  'Escape quotes and line breaks inside content so the response remains valid JSON.',
  'Never add explanations, summaries, references, citations, commentary, confidence notes, markdown fences, or greetings.',
].join(' ');
const FILE_CONTENT_PROMPT = [
  'Extract the document text for text-to-speech.',
  'Detect the primary language of the main content.',
  'Put only the main readable body content in the JSON content field, in the same language as the file.',
  'Preserve the original reading order: title, headings, paragraphs, lists, and quoted text.',
  'Ignore page numbers, running headers, running footers, footnotes, references, copyright notices, scanner marks, watermarks, and decorative text.',
  'Ignore superscript footnote markers, whether they are numbers, letters, or symbols placed beside words.',
  'Do not include footnote text, endnote text, bibliography entries, reference lists, or citation-only notes.',
  'Join words that were split by line-break hyphenation, for example "trata- dos" must become "tratados".',
  'Preserve real hyphenated compound words only when the hyphen is part of the original word.',
  'Preserve visible punctuation such as commas, periods, semicolons, colons, question marks, and exclamation marks because it controls text-to-speech pauses.',
  'Do not describe the page, image quality, layout, fonts, margins, or visual elements.',
  'Do not summarize, correct, modernize, translate, or add any text that is not part of the main content.',
  'If a page has multiple columns, read each column from top to bottom, left to right.',
  'If a word is unclear, transcribe your best reading without adding notes.',
].join(' ');
const FILE_PAGE_PROMPT = [
  FILE_CONTENT_PROMPT,
  'Extract only this page. Do not mention the page number.',
].join(' ');

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
    uploadDrop:   'Drop a PDF or image, or',
    uploadBrowse: 'browse',
    uploadFormats:'PDF · PNG · JPG · WebP',
    uploadReading:'Reading file…',
    uploadDone:   'Content loaded into the text box.',
    errFileType:  'Please upload a PDF or image file.',
    errFileRead:  'Failed to read the uploaded file:',
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
    uploadDrop:   'Solte um PDF ou imagem, ou',
    uploadBrowse: 'procurar',
    uploadFormats:'PDF · PNG · JPG · WebP',
    uploadReading:'Lendo arquivo…',
    uploadDone:   'Conteúdo carregado na caixa de texto.',
    errFileType:  'Envie um arquivo PDF ou imagem.',
    errFileRead:  'Falha ao ler o arquivo enviado:',
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
    uploadDrop:   'Suelta un PDF o imagen, o',
    uploadBrowse: 'buscar',
    uploadFormats:'PDF · PNG · JPG · WebP',
    uploadReading:'Leyendo archivo…',
    uploadDone:   'Contenido cargado en el cuadro de texto.',
    errFileType:  'Sube un archivo PDF o imagen.',
    errFileRead:  'Error al leer el archivo subido:',
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

function setUploadBusy(isBusy, message = '') {
  const uploadArea = document.getElementById('upload-area');
  const uploadIdle = document.getElementById('upload-idle');
  const uploadBusy = document.getElementById('upload-busy');
  const uploadStatus = document.getElementById('upload-status');

  uploadArea.classList.toggle('is-busy', isBusy);
  uploadIdle.hidden = isBusy;
  uploadBusy.hidden = !isBusy;
  uploadStatus.textContent = message;
}

function updateCharCount() {
  const textEl = document.getElementById('text');
  document.getElementById('char-count').textContent = textEl.value.length;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

function canvasToJpegDataUrl(canvas) {
  return canvas.toDataURL('image/jpeg', PDF_IMAGE_QUALITY);
}

async function renderPdfPageToDataUrl(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    PDF_RENDER_MAX_SCALE,
    PDF_RENDER_MAX_SIDE / Math.max(baseViewport.width, baseViewport.height)
  );
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;

  const dataUrl = canvasToJpegDataUrl(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}

async function renderPdfToImageUrls(file) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js is not available.');
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const imageUrls = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    imageUrls.push(await renderPdfPageToDataUrl(pdf, pageNumber));
  }

  return imageUrls;
}

async function getImageQwenContent(file) {
  const dataUrl = await fileToDataUrl(file);
  return [
    { type: 'text', text: FILE_CONTENT_PROMPT },
    { type: 'image_url', image_url: { url: dataUrl } },
  ];
}

function getPageQwenContent(pageImageUrl) {
  return [
    { type: 'text', text: FILE_PAGE_PROMPT },
    { type: 'image_url', image_url: { url: pageImageUrl } },
  ];
}

function extractMessageText(data) {
  const content = data?.choices?.[0]?.message?.content ?? data?.message?.content ?? data?.content ?? data?.text;

  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        return part?.text ?? part?.content ?? '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function stripMarkdownFence(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractLooseJsonResult(text) {
  const language = text.match(/"language"\s*:\s*"([^"]+)"/)?.[1]?.toLowerCase() || 'unknown';
  const contentMatch = text.match(/"content"\s*:\s*"/);
  if (!contentMatch) return null;

  const contentStart = contentMatch.index + contentMatch[0].length;
  const objectEnd = text.lastIndexOf('}');
  const contentEnd = objectEnd >= 0 ? text.lastIndexOf('"', objectEnd) : text.lastIndexOf('"');

  if (contentEnd <= contentStart) return null;

  let content = text.slice(contentStart, contentEnd).trim();

  try {
    content = JSON.parse(`"${content}"`);
  } catch {
    content = content
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
  }

  return {
    language,
    content: content.trim(),
  };
}

function parseExtractorResult(rawText) {
  const text = stripMarkdownFence(rawText.trim());
  const languageMatch = text.match(/^LANGUAGE:\s*([a-z]{2}|unknown)\s*\n+([\s\S]*)$/i);

  if (languageMatch) {
    return {
      language: languageMatch[1].toLowerCase(),
      content: languageMatch[2].replace(/^CONTENT:\s*/i, '').trim(),
    };
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return {
        language: typeof parsed.language === 'string' ? parsed.language.toLowerCase() : 'unknown',
        content: typeof parsed.content === 'string' ? parsed.content.trim() : '',
      };
    }
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          language: typeof parsed.language === 'string' ? parsed.language.toLowerCase() : 'unknown',
          content: typeof parsed.content === 'string' ? parsed.content.trim() : '',
        };
      } catch {
        // Fall through to plain text handling below.
      }
    }
  }

  const looseResult = extractLooseJsonResult(text);
  if (looseResult) return looseResult;

  return { language: 'unknown', content: text };
}

function selectDetectedLanguage(language) {
  const langCode = (language || '').toLowerCase().split('-')[0];
  const langSel = document.getElementById('language');
  const supported = VOICE_LANGS.some(lang => lang.id === langCode);

  if (!supported || langSel.value === langCode) return;

  langSel.value = langCode;
  populateVoices(langCode);
}

async function requestQwenExtraction(content) {
  const res = await fetch(`${QWENVL_API}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: QWENVL_MODEL,
      temperature: 0,
      max_tokens: QWENVL_MAX_TOKENS,
      messages: [
        {
          role: 'system',
          content: EXTRACTOR_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Server returned ${res.status}`);
  }

  const data = await res.json();
  const result = parseExtractorResult(extractMessageText(data));
  if (!result.content) throw new Error('No text returned by Qwen-VL.');
  return result;
}

function getMostCommonLanguage(languages) {
  const counts = languages.reduce((acc, language) => {
    const code = (language || 'unknown').toLowerCase().split('-')[0];
    if (code && code !== 'unknown') acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
}

function cleanFootnoteMarkers(text) {
  return text
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, '')
    .replace(/([.!?,;:])\s*[a-z]\b(?=\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, '$1')
    .replace(/(\p{L})\s+([a-z])\b(?=[,.;:!?])/gu, '$1');
}

function repairLineHyphenation(text) {
  return text.replace(/(\p{L}{2,})-\s+(\p{Ll}{2,})/gu, '$1$2');
}

function unwrapPageContent(content) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/(\p{L}{2,})-\n\s*(\p{Ll}{2,})/gu, '$1$2')
    .split(/\n{2,}/)
    .map(paragraph => paragraph
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,.;:!?])(?=\S)/g, '$1 ')
      .replace(/\s{2,}/g, ' ')
      .trim())
    .filter(Boolean)
    .map(paragraph => cleanFootnoteMarkers(repairLineHyphenation(paragraph)))
    .join('\n\n');
}

async function extractPdfContent(file) {
  const pageImageUrls = await renderPdfToImageUrls(file);
  const pageContents = [];
  const languages = [];

  for (let index = 0; index < pageImageUrls.length; index += 1) {
    setUploadBusy(true, `${t.uploadReading} ${index + 1}/${pageImageUrls.length}`);
    const result = await requestQwenExtraction(getPageQwenContent(pageImageUrls[index]));
    if (result.content) pageContents.push(unwrapPageContent(result.content));
    languages.push(result.language);
  }

  return {
    language: getMostCommonLanguage(languages),
    content: pageContents.join('\n\n'),
  };
}

async function extractFileContent(file) {
  if (!file || !(file.type === 'application/pdf' || file.type.startsWith('image/'))) {
    throw new Error(t.errFileType);
  }

  if (file.type === 'application/pdf') {
    return extractPdfContent(file);
  }

  return requestQwenExtraction(await getImageQwenContent(file));
}

async function handleUpload(file) {
  document.getElementById('error-toast').hidden = true;
  setUploadBusy(true, t.uploadReading);

  try {
    const { content, language } = await extractFileContent(file);
    const textEl = document.getElementById('text');
    selectDetectedLanguage(language);
    textEl.value = content;
    updateCharCount();
    setUploadBusy(false);
  } catch (err) {
    setUploadBusy(false);
    const message = err.message === t.errFileType
      ? err.message
      : `${t.errFileRead} ${err.message}`;
    showError(message);
  }
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
  textEl.addEventListener('input', updateCharCount);

  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('upload-browse-btn');

  browseBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files;
    if (file) handleUpload(file);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    uploadArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadArea.classList.add('is-dragging');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadArea.classList.remove('is-dragging');
    });
  });

  uploadArea.addEventListener('drop', (e) => {
    const [file] = e.dataTransfer.files;
    if (file) handleUpload(file);
  });

  document.getElementById('generate-btn').addEventListener('click', generate);

  document.getElementById('play-pause-btn').addEventListener('click', () => {
    if (wavesurfer) wavesurfer.playPause();
  });
}

document.addEventListener('DOMContentLoaded', init);
