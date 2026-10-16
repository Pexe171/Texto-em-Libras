'use strict';
const $ = id => document.getElementById(id);
const session = new LibrasSession.Session();
const HISTORY_KEY = 'projeto-libras-history-v1';
let history = [], saved = null, notice = 'Escreva um texto para começar.', wasReady = false;
const player = new LibrasPlayer.Player($('avatar'), renderPlayer);
function storageMessage(message) { $('storage-status').textContent = message; }
function save() {
  if (!$('save-session').checked) return;
  try { localStorage.setItem(LibrasSession.KEY, JSON.stringify(session.snapshot($('text').value,$('split-mode').checked))); storageMessage('Sessão salva somente neste navegador.'); }
  catch { storageMessage('Não foi possível salvar. A sessão continua em memória; confira o espaço e as permissões do navegador.'); }
}
function dirty() { return $('text').value.trim() !== session.text || $('split-mode').checked !== session.split; }
function hasWork() { return session.segments.some(s => s.gloss || s.text !== s.original); }
function prepare() {
  if (session.busy) return false;
  if (!dirty() && session.segments.length) return true;
  if (hasWork() && !confirm('Gerar uma nova divisão vai descartar as traduções e edições atuais. Continuar?')) return false;
  player.stop(); session.prepare($('text').value, $('split-mode').checked, LibrasText.splitText);
  $('segment-details').open=true;
  notice = 'Trechos preparados. Você pode revisar o português antes de traduzir.';
  changed(); return true;
}
function updateButtons() {
  $('translate').disabled = session.busy || !$('text').value.trim();
  $('translate').textContent = session.busy ? 'Traduzindo…' : 'Traduzir texto';
  $('cancel-translation').hidden = !session.busy;
  const pending = session.segments.some(s => !s.gloss);
  $('resume-translation').hidden = session.busy || !pending || !session.segments.some(s => s.gloss);
  $('resume-translation').disabled = dirty();
  $('play-all').disabled = !player.ready || !session.complete() || dirty();
  $('pause').disabled = !player.ready || !player.gloss || !['playing','paused','loading-signs'].includes(player.state);
  $('pause').textContent = player.state === 'paused' ? 'Continuar' : 'Pausar';
  $('pause').setAttribute('aria-label', player.state === 'paused' ? 'Continuar animação' : 'Pausar animação');
  $('repeat').disabled = !player.ready || !player.gloss;
  $('stop').disabled = !player.ready || !player.gloss;
  $('count').textContent = `${$('text').value.length} / 5000`;
  for (const id of ['text','split-mode','prepare','load-adapted','restore-session']) $(id).disabled = session.busy;
  document.querySelectorAll('[data-text], #history button, .segment textarea, .translate-segment').forEach(button => { button.disabled = session.busy; });
  document.querySelectorAll('.translate-segment').forEach(button => {button.disabled=session.busy||dirty();});
  document.querySelectorAll('.play-segment').forEach(button => { button.disabled = !player.ready || dirty() || !session.segments[Number(button.dataset.index)]?.gloss; });
}
function renderTranslation() {
  const index = session.segments.findIndex(s => s.state === 'translating');
  const failed = session.segments.find(s => s.error);
  const done = session.segments.filter(s => s.gloss).length;
  $('translation-status').textContent = session.busy ? `Traduzindo trecho ${index+1} de ${session.segments.length}…` : dirty() ? notice :
    failed ? failed.error.error : session.complete() && !dirty() ? 'Tradução pronta para revisão. Clique em Reproduzir quando quiser.' : notice;
  $('gloss').textContent = session.fullGloss() || (done ? `Tradução parcial: ${done} de ${session.segments.length} trechos. Confira os resultados abaixo.` : 'Sua tradução aparecerá aqui.');
  updateButtons();
}
const stateLabels = {pending:'Aguardando tradução',translating:'Traduzindo',done:'Revisão necessária',error:'Falha na tradução',cancelled:'Cancelado'};
function renderRows() {
  $('segment-details').hidden = !session.segments.length;
  $('segment-summary').textContent = `Revisar ${session.segments.length} trecho(s)`;
  $('segments').replaceChildren();
  session.segments.forEach((segment,index) => {
    const row = document.createElement('article'); row.className = 'segment';
    const heading = document.createElement('strong'); heading.textContent = `Trecho ${index+1} · ${stateLabels[segment.state]}`;
    const original = document.createElement('p'); original.textContent = `Original: ${segment.original}`;
    const label = document.createElement('label'); label.htmlFor = `segment-${index}`; label.textContent = 'Português para traduzir';
    const input = document.createElement('textarea'); input.id = label.htmlFor; input.value = segment.text; input.maxLength = 5000; input.rows = 2;
    const gloss = document.createElement('p'); gloss.className = 'segment-gloss'; gloss.textContent = segment.gloss || segment.error?.error || 'Sem tradução atual para este trecho.';
    const retry = document.createElement('button'); retry.id=`translate-segment-${index}`; retry.className = 'secondary translate-segment'; retry.textContent = segment.state === 'error' ? 'Tentar este trecho novamente' : 'Traduzir este trecho';
    retry.addEventListener('click', () => runTranslation(index));
    const play = document.createElement('button'); play.className = 'secondary play-segment'; play.dataset.index = index; play.textContent = 'Sinalizar trecho';
    play.addEventListener('click', () => player.play(segment.gloss));
    input.addEventListener('input', () => {
      const old = segment.text;
      if (!session.edit(index,input.value)) { input.value = old; notice = 'O total dos trechos não pode ultrapassar 5000 caracteres.'; renderTranslation(); return; }
      player.stop(); heading.textContent = `Trecho ${index+1} · Tradução anterior descartada`;
      gloss.textContent = 'Texto alterado. Traduza este trecho novamente.';
      notice = 'Apenas o trecho editado precisa ser traduzido novamente.';
      renderTranslation(); save();
    });
    row.append(heading,original,label,input,gloss,retry,play); $('segments').append(row);
  });
}
function changed() { renderRows(); renderTranslation(); save(); }
function renderPlayer() {
  if (player.ready && !wasReady) { player.send('Change',$('avatar-choice').value); player.send('setSlider',Number($('speed').value)); }
  wasReady = player.ready;
  $('connection').textContent = player.ready ? 'Pronto' : player.state === 'error' ? 'Indisponível' : 'Carregando';
  $('connection').className = `connection ${player.ready?'ready':player.state==='error'?'error':''}`;
  $('loading').hidden = player.ready;
  $('progress').value = player.progress; $('progress').hidden = player.state === 'error';
  $('retry').hidden = player.state !== 'error';
  $('loading-title').textContent = player.state === 'error' ? 'O avatar não carregou' : 'Preparando seu avatar';
  $('loading-subtitle').textContent = player.state === 'error' ? player.message : 'Você já pode traduzir enquanto o avatar carrega.';
  document.querySelector('.stage').classList.toggle('loaded',player.ready);
  const labels = {loading:'Carregando avatar… A tradução continua disponível.',error:'Avatar indisponível. Você ainda pode traduzir e revisar.',idle:'Avatar pronto, aguardando reprodução.',stopped:'Reprodução interrompida.',playing:'Sinalizando…',paused:'Animação pausada.','loading-signs':'Carregando sinais…'};
  $('status').textContent = labels[player.state] || 'Aguardando reprodução.';
  updateButtons();
}
async function requestTranslation(text,signal) {
  let response;
  try { response = await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal}); }
  catch (error) { if(error.name==='AbortError') throw error; throw Object.assign(new Error('Não foi possível conectar ao servidor local.'),{code:'CONNECTION_ERROR',retryable:true}); }
  let data;
  try { data = await response.json(); } catch { throw Object.assign(new Error('O servidor retornou uma resposta inválida.'),{code:'INVALID_RESPONSE',retryable:true}); }
  if (!response.ok) throw Object.assign(new Error(data.error || 'Não foi possível traduzir.'),{code:data.code||'UPSTREAM_ERROR',retryable:data.retryable!==false});
  return data;
}
async function runTranslation(index=null) {
  if (session.busy || !$('text').value.trim()) return;
  if(index!==null&&dirty()){notice='Prepare a nova divisão antes de traduzir um trecho.';renderTranslation();return;}
  if (!prepare()) return;
  // Uma nova divisao pode ter outros indices: nao aplica um clique antigo a outro trecho.
  if(index!==null && !session.segments[index]) return;
  const focusId=document.activeElement?.id;
  notice = 'Traduzindo…';
  const task=session.translate(requestTranslation,changed,index);
  const token=session.run;
  await task;
  if (token===session.run&&session.complete()) remember(session.text);
  if(token===session.run&&(document.activeElement===document.body||document.activeElement?.id===focusId)){
    const button=$(focusId);if(button&&!button.disabled)button.focus();
  }
}
function renderHistory() {
  $('history').replaceChildren(); $('empty-history').hidden = !!history.length; $('clear-history').hidden = !history.length;
  history.forEach(text => { const button = document.createElement('button'); button.textContent=text; button.title=text; button.addEventListener('click',()=>setText(text)); $('history').append(button); });
  updateButtons();
}
function remember(text) {
  history = [text,...history.filter(x=>x!==text)].slice(0,8);
  try { localStorage.setItem(HISTORY_KEY,JSON.stringify(history)); } catch { storageMessage('Não foi possível salvar o histórico. O aplicativo continua funcionando.'); }
  renderHistory();
}
function setText(text) { if(session.busy)return; $('text').value=text; notice='Prepare os trechos para revisar o novo texto.'; renderTranslation(); save(); $('text').focus(); }
function eraseSaved() {
  try { localStorage.removeItem(LibrasSession.KEY); saved=null; $('restore-banner').hidden=true; $('save-session').checked=false; storageMessage('Sessão salva apagada. O histórico é apagado separadamente.'); }
  catch { storageMessage('Não foi possível apagar a sessão salva. Confira as permissões de armazenamento.'); }
}
$('text').addEventListener('input',()=>{player.stop();notice='O texto foi alterado. Prepare a nova divisão antes de reproduzir.';renderTranslation();save();});
$('split-mode').addEventListener('change',()=>{notice='Prepare a nova divisão para aplicar esta opção.';renderTranslation();save();});
$('prepare').addEventListener('click',()=>{if(prepare())$('segment-details').open=true;});
$('translate').addEventListener('click',()=>runTranslation());
$('resume-translation').addEventListener('click',()=>runTranslation());
$('cancel-translation').addEventListener('click',()=>{session.cancel();notice='Tradução cancelada. Os trechos concluídos foram preservados.';changed();($('resume-translation').hidden?$('translate'):$('resume-translation')).focus();});
$('play-all').addEventListener('click',()=>{if(!dirty())player.play(session.fullGloss());});
$('pause').addEventListener('click',()=>player.pause());
$('repeat').addEventListener('click',()=>player.play(player.gloss));
$('stop').addEventListener('click',()=>player.stop());
$('retry').addEventListener('click',()=>player.load());
$('speed').addEventListener('change',()=>player.send('setSlider',Number($('speed').value)));
$('avatar-choice').addEventListener('change',()=>{player.stop();player.send('Change',$('avatar-choice').value);});
$('text').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();runTranslation();}});
$('save-session').addEventListener('change',()=>{if($('save-session').checked){saved=null;$('restore-banner').hidden=true;save();}else eraseSaved();});
$('erase-session').addEventListener('click',eraseSaved);
$('discard-session').addEventListener('click',eraseSaved);
$('restore-session').addEventListener('click',()=>{
  if(!saved || session.busy)return;
  if(hasWork()&&!confirm('Restaurar vai substituir a revisão atual. Continuar?'))return;
  try {player.stop();$('text').value=session.restore(saved);$('split-mode').checked=saved.inputSplit??session.split;$('save-session').checked=true;saved=null;$('restore-banner').hidden=true;$('segment-details').open=true;notice='Sessão restaurada sem enviar texto ou iniciar reprodução.';changed();$('text').focus();}
  catch {storageMessage('Não foi possível restaurar a sessão. Você pode descartá-la e continuar.');}
});
$('clear-history').addEventListener('click',()=>{history=[];try{localStorage.removeItem(HISTORY_KEY);}catch{storageMessage('Não foi possível apagar o histórico salvo.');}renderHistory();});
$('load-adapted').addEventListener('click',async()=>{try{const response=await fetch('texto-vida.txt');if(!response.ok)throw new Error();setText(await response.text());}catch{notice='Não foi possível carregar o exemplo.';renderTranslation();}});
 document.querySelectorAll('[data-text]').forEach(button=>button.addEventListener('click',()=>setText(button.dataset.text)));
try {const data=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(Array.isArray(data))history=data.filter(x=>typeof x==='string'&&x.length<=5000).slice(0,8);}catch{storageMessage('Histórico indisponível. Você pode usar o aplicativo normalmente.');}
try {saved=LibrasSession.load(localStorage);if(saved)$('restore-banner').hidden=false;}catch{storageMessage('A sessão salva está indisponível ou corrompida. Você pode apagá-la e continuar em memória.');}
renderRows();renderHistory();renderTranslation();player.load();
