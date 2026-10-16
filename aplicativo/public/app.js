'use strict';
const $ = (id) => document.getElementById(id);
const PLAYER_ORIGIN = 'https://vlibras.gov.br';
const PLAYER_URL = `${PLAYER_ORIGIN}/app/unity/index.html`;
const DICTIONARY = 'https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/';
const HISTORY_KEY = 'projeto-libras-history-v1';
let ready = false, busy = false, paused = false, lastGloss = '', loadTimer;
let currentController = null, cancelled = false, segments = [];
let history = [];
try { const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); if (Array.isArray(stored)) history = stored.filter(x => typeof x === 'string' && x.length <= 5000).slice(0, 8); } catch {}

function status(text) { $('status').textContent = text; }
function send(method, params) {
  if (!ready) return;
  $('avatar').contentWindow.postMessage({type: 'unity', object: 'PlayerManager', method, params}, PLAYER_ORIGIN);
}
function updateButtons() {
  $('translate').disabled = !ready || busy || !$('text').value.trim();
  $('translate').textContent = busy ? 'Traduzindo…' : 'Traduzir e sinalizar ↗';
  for (const id of ['pause', 'repeat', 'stop']) $(id).disabled = !ready || busy || !lastGloss;
  $('pause').textContent = paused ? 'Continuar' : 'Pausar';
  $('pause').setAttribute('aria-label', paused ? 'Continuar animação' : 'Pausar animação');
  $('count').textContent = `${$('text').value.length} / 5000`;
  $('cancel-translation').hidden = !busy;
  $('resume-translation').hidden = busy || !segments.some(segment => segment.gloss) || !segments.some(segment => !segment.gloss);
  $('resume-translation').disabled = !ready;
  for (const id of ['text', 'split-mode', 'prepare', 'load-adapted']) $(id).disabled = busy;
  document.querySelectorAll('[data-text], #history button, .play-segment').forEach(button => { button.disabled = busy || (button.classList.contains('play-segment') && !ready); });
}
function prepareSegments() {
  const text = $('text').value.trim();
  segments = ($('split-mode').checked ? LibrasText.splitText(text) : text ? [text] : []).map(text => ({text, gloss:'', state:'Aguardando tradução'}));
  renderSegments();
}
function renderSegments() {
  $('segment-details').hidden = segments.length === 0;
  $('segment-summary').textContent = `Revisar ${segments.length} trecho${segments.length === 1 ? '' : 's'}`;
  $('segments').replaceChildren();
  segments.forEach((segment, index) => {
    const row = document.createElement('article'); row.className = 'segment';
    const heading = document.createElement('strong'); heading.textContent = `Trecho ${index + 1} · ${segment.state}`;
    const source = document.createElement('p'); source.textContent = segment.text;
    const gloss = document.createElement('p'); gloss.className = 'segment-gloss'; gloss.textContent = segment.gloss || 'A sequência traduzida aparecerá aqui.';
    row.append(heading, source, gloss);
    if (segment.gloss) {
      const button = document.createElement('button'); button.className = 'secondary play-segment'; button.textContent = 'Sinalizar trecho'; button.disabled = busy || !ready;
      button.addEventListener('click', () => { lastGloss = segment.gloss; paused = false; send('playNow', lastGloss); status(`Sinalizando trecho ${index + 1}.`); updateButtons(); });
      row.append(button);
    }
    $('segments').append(row);
  });
}
function renderHistory() {
  $('history').replaceChildren();
  $('empty-history').hidden = history.length > 0;
  $('clear-history').hidden = history.length === 0;
  for (const text of history) {
    const button = document.createElement('button');
    button.textContent = text; button.title = text;
    button.addEventListener('click', () => { $('text').value = text; prepareSegments(); updateButtons(); $('text').focus(); });
    $('history').append(button);
  }
}
function remember(text) {
  history = [text, ...history.filter(x => x !== text)].slice(0, 8);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  renderHistory();
}
function failLoad(message) {
  ready = false; updateButtons();
  $('connection').textContent = 'Sem conexão'; $('connection').className = 'connection error';
  $('loading-title').textContent = 'O avatar não carregou';
  $('loading-subtitle').textContent = message;
  $('loading').hidden = false; $('progress').hidden = true; $('retry').hidden = false;
  document.querySelector('.stage').classList.remove('loaded');
  status('Verifique a internet e tente carregar o avatar novamente.');
}
function loadPlayer() {
  clearTimeout(loadTimer); ready = false; lastGloss = ''; paused = false; updateButtons();
  $('loading').hidden = false; $('progress').hidden = false; $('progress').value = 0; $('retry').hidden = true;
  $('loading-title').textContent = 'Preparando seu avatar';
  $('loading-subtitle').textContent = 'O primeiro acesso pode demorar um pouco.';
  $('connection').textContent = 'Carregando'; $('connection').className = 'connection';
  document.querySelector('.stage').classList.remove('loaded');
  status('Carregando o avatar VLibras…');
  $('avatar').src = `${PLAYER_URL}?v=7.12.2&retry=${Date.now()}`;
  loadTimer = setTimeout(() => failLoad('O serviço VLibras demorou a responder. Confira a conexão ou tente novamente.'), 120000);
}
window.addEventListener('message', (event) => {
  if (event.origin !== PLAYER_ORIGIN || event.source !== $('avatar').contentWindow || event.data?.type !== 'unity_event') return;
  const {event: type, data} = event.data;
  if (type === 'update_progress') {
    const value = Number(data); if (Number.isFinite(value)) $('progress').value = Math.max(0, Math.min(100, value * 100));
  } else if (type === 'on_load_player') {
    clearTimeout(loadTimer); ready = true;
    send('setBaseUrl', DICTIONARY); send('Change', $('avatar-choice').value);
    send('setSlider', Number($('speed').value)); send('setSubtitlesState', 1);
    $('loading').hidden = true; document.querySelector('.stage').classList.add('loaded');
    $('connection').textContent = 'Pronto'; $('connection').className = 'connection ready';
    status('Avatar pronto. Escreva uma frase para começar.'); updateButtons();
  } else if (type === 'on_error') { clearTimeout(loadTimer); failLoad('Não foi possível iniciar o WebGL. Tente um navegador atualizado com aceleração de hardware.'); }
  else if (type === 'counter_gloss' && Array.isArray(data)) {
    const [current, total] = data.map(Number);
    if (Number.isFinite(current) && Number.isFinite(total) && total > 0) status(`Sinalizando · ${current} de ${total}`);
  } else if (type === 'on_playing_state_change' && Array.isArray(data)) {
    const playing = String(data[0]).toLowerCase() === 'true';
    paused = String(data[1]).toLowerCase() === 'true';
    const loading = String(data[3]).toLowerCase() === 'true';
    if (lastGloss && !busy) status(loading ? 'Carregando sinais…' : paused ? 'Animação pausada.' : playing ? 'Sinalizando…' : 'Animação concluída.');
    updateButtons();
  }
});
async function translateAndPlay(resume = false) {
  const text = $('text').value.trim();
  if (!ready || busy || !text) return;
  busy = true; cancelled = false; send('stopAll'); paused = false; lastGloss = '';
  $('gloss').textContent = 'Tradução em andamento…';
  if (!resume) prepareSegments();
  updateButtons();
  if (segments.length > 1) $('segment-details').open = true;
  try {
    for (let index = 0; index < segments.length; index++) {
      if (cancelled) throw new DOMException('Cancelado', 'AbortError');
      if (segments[index].gloss) continue;
      const segment = segments[index]; segment.state = 'Traduzindo'; renderSegments();
      status(`Traduzindo trecho ${index + 1} de ${segments.length}…`);
      currentController = new AbortController();
      const timeout = setTimeout(() => currentController?.abort(), 35000);
      try {
        const response = await fetch('/api/translate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:segment.text}), signal:currentController.signal});
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível traduzir.');
        if (typeof result.gloss !== 'string' || !result.gloss.trim()) throw new Error('O tradutor não retornou sinais.');
        segment.gloss = result.gloss; segment.state = 'Revisão necessária';
      } catch (error) { segment.state = cancelled ? 'Cancelado' : 'Falha na tradução'; throw error; }
      finally { clearTimeout(timeout); currentController = null; renderSegments(); }
    }
    if (cancelled) throw new DOMException('Cancelado', 'AbortError');
    lastGloss = segments.map(segment => segment.gloss).join(' '); $('gloss').textContent = lastGloss;
    send('playNow', lastGloss); remember(text); status('Trechos traduzidos. Carregando sinais no avatar…');
  } catch (error) {
    $('gloss').textContent = 'A tradução completa não foi concluída. Confira os trechos abaixo.';
    status(cancelled ? 'Tradução cancelada.' : error.name === 'AbortError' ? 'O tradutor demorou a responder. Confira os trechos e tente novamente.' : error.message);
  }
  finally { busy = false; currentController = null; renderSegments(); updateButtons(); }
}
$('translate').addEventListener('click', () => translateAndPlay());
$('text').addEventListener('input', () => { segments = []; renderSegments(); updateButtons(); });
$('prepare').addEventListener('click', () => { prepareSegments(); $('segment-details').open = true; });
$('resume-translation').addEventListener('click', () => translateAndPlay(true));
$('split-mode').addEventListener('change', () => { prepareSegments(); updateButtons(); });
$('cancel-translation').addEventListener('click', () => { cancelled = true; currentController?.abort(); });
$('load-adapted').addEventListener('click', async () => {
  try {
    const response = await fetch('texto-vida.txt');
    if (!response.ok) throw new Error('Não foi possível carregar o exemplo.');
    $('text').value = await response.text(); prepareSegments(); updateButtons(); $('text').focus();
    status('Versão mais direta carregada. Leia e ajuste o texto antes de traduzir.');
  } catch (error) { status(error.message); }
});
$('text').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); translateAndPlay(); } });
document.querySelectorAll('[data-text]').forEach(button => button.addEventListener('click', () => { $('text').value = button.dataset.text; prepareSegments(); updateButtons(); $('text').focus(); }));
$('pause').addEventListener('click', () => { paused = !paused; send('setPauseState', paused ? 1 : 0); status(paused ? 'Animação pausada.' : 'Continuando…'); updateButtons(); });
$('repeat').addEventListener('click', () => { if (!lastGloss) return; paused = false; send('playNow', lastGloss); status('Repetindo…'); updateButtons(); });
$('stop').addEventListener('click', () => { send('stopAll'); paused = false; status('Animação interrompida.'); updateButtons(); });
$('speed').addEventListener('change', () => send('setSlider', Number($('speed').value)));
$('avatar-choice').addEventListener('change', () => { send('Change', $('avatar-choice').value); status('Avatar alterado.'); });
$('retry').addEventListener('click', loadPlayer);
$('clear-history').addEventListener('click', () => { history = []; try { localStorage.removeItem(HISTORY_KEY); } catch {} renderHistory(); });
renderHistory(); updateButtons(); loadPlayer();
