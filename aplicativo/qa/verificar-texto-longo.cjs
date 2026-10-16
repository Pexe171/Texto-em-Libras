const {chromium}=require('playwright-core');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8766';
const iframeHTML=`<!doctype html><html><body>Player de teste<script>window.commands=[];addEventListener('message',e=>{if(e.data?.type==='unity')window.commands.push(e.data);});window.ready=()=>parent.postMessage({type:'unity_event',event:'on_load_player'},'*');<\/script></body></html>`;
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1280,height:1000}});
  await context.route('https://vlibras.gov.br/**',route=>route.fulfill({status:200,contentType:'text/html',body:iframeHTML}));
  await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const page=await context.newPage();const report={errors:[],result:'FAIL',note:'Player e tradutor simulados; teste deterministico de comportamento, nao de Libras.'};
  page.on('pageerror',e=>report.errors.push(e.message));
  const calls=[];
  let failure=null,hold=null;
  await context.route('**/api/translate',async route=>{
    const text=route.request().postDataJSON().text;calls.push(text);
    if(hold)await hold;
    if(failure&&text===failure)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Limite temporário de teste',code:'RATE_LIMIT',retryable:true,upstream_status:429})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({gloss:`SINAL ${text}`})}).catch(()=>{});
  });
  const done=()=>page.waitForFunction(()=>document.getElementById('cancel-translation').hidden);
  const commands=async()=>{const frame=page.frames().find(f=>f.url().startsWith('https://vlibras.gov.br/'));return frame.evaluate(()=>window.commands.filter(c=>c.method==='playNow'));};
  try{
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.locator('#text').fill('Primeira. Segunda. Terceira.');
    failure='Terceira.';
    await page.locator('#translate').click();await done();
    assert.equal(calls.length,3);assert.equal(await page.locator('#connection.ready').count(),0);
    assert.match(await page.locator('#translation-status').textContent(),/Limite temporário/);
    assert.equal(await page.locator('#play-all').isDisabled(),true);
    failure=null;await page.locator('#resume-translation').click();await done();
    assert.equal(calls.length,4);assert.equal(calls[3],'Terceira.');
    assert.match(await page.locator('#translation-status').textContent(),/pronta para revisão/);
    const frame=page.frames().find(f=>f.url().startsWith('https://vlibras.gov.br/'));
    await frame.evaluate(()=>window.ready());await page.locator('#connection.ready').waitFor();
    assert.equal((await commands()).length,0,'Traduzir e carregar o avatar nao iniciam reproducao.');
    await page.locator('#play-all').click();await page.waitForTimeout(50);assert.equal((await commands()).length,1);
    await page.locator('#stop').click();
    await frame.evaluate(()=>parent.postMessage({type:'unity_event',event:'on_playing_state_change',data:['False','False','False','False']},'*'));
    assert.match(await page.locator('#status').textContent(),/interrompida/);
    const before=calls.length;
    await page.locator('#segment-1').fill('Segunda reformulada.');
    assert.equal(await page.locator('#play-all').isDisabled(),true);
    assert.equal(await page.locator('.play-segment').nth(1).isDisabled(),true);
    assert.equal(await page.locator('.play-segment').first().isDisabled(),false);
    await page.locator('.translate-segment').nth(1).click();await done();
    assert.equal(calls.length,before+1);assert.equal(calls.at(-1),'Segunda reformulada.');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'translate-segment-1');
    // Alterar o texto principal so descarta o trabalho depois de confirmar a nova divisao.
    await page.locator('#text').fill('Outro texto.');page.once('dialog',dialog=>dialog.dismiss());
    await page.locator('#prepare').click();assert.equal(await page.locator('.segment').count(),3);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#prepare').click();assert.equal(await page.locator('.segment').count(),1);
    // Uma resposta atrasada nao pode se aplicar a uma traducao nova.
    let release;hold=new Promise(resolve=>release=resolve);
    await page.locator('#translate').click();await page.locator('#cancel-translation').click();
    await page.locator('#text').fill('Nova sessão.');hold=null;
    await page.locator('#text').press('Control+Enter');await done();release();await page.waitForTimeout(150);
    assert.match(await page.locator('#gloss').textContent(),/Nova sessão/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('texto-em-libras-session-v1')),null);
    await page.locator('#save-session').check();
    const previousCalls=calls.length;
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('#restore-banner').waitFor();
    assert.equal(calls.length,previousCalls);assert.equal(await page.locator('#save-session').isChecked(),false);
    await page.locator('#restore-session').click();assert.equal(await page.locator('#text').inputValue(),'Nova sessão.');
    assert.equal(calls.length,previousCalls);assert.equal((await commands()).length,0);
    await page.locator('#erase-session').click();assert.equal(await page.evaluate(()=>localStorage.getItem('texto-em-libras-session-v1')),null);
    // Sessao corrompida nao impede o uso nem gera requisicoes.
    await page.evaluate(()=>localStorage.setItem('texto-em-libras-session-v1','{quebrado'));
    await page.reload({waitUntil:'domcontentloaded'});assert.match(await page.locator('#storage-status').textContent(),/corrompida/);
    await page.locator('#erase-session').click();
    // Permissao negada e cota excedida deixam a sessao em memoria.
    await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota','QuotaExceededError');};});
    await page.locator('#save-session').check();assert.match(await page.locator('#storage-status').textContent(),/Não foi possível salvar/);
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(__dirname,'texto-longo.png'),fullPage:true});
    assert.deepEqual(report.errors,[]);report.result='PASS';
    console.log('Navegador: avatar independente, revisao, edicao isolada, retomada, cancelamento, restauracao, armazenamento e tela movel OK.');
  }catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;await page.screenshot({path:path.join(__dirname,'falha.png'),fullPage:true}).catch(()=>{});}
  finally{fs.writeFileSync(path.join(__dirname,'resultado-texto-longo.json'),JSON.stringify(report,null,2));await browser.close();}
})();
