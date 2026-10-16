const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--enable-unsafe-swiftshader'], downloadsPath:path.join(__dirname,'downloads')});
  const context = await browser.newContext({viewport:{width:1280,height:1000}});
  const page = await context.newPage();
  const report = {errors:[], requestsFailed:[], events:[]};
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('requestfailed', request => report.requestsFailed.push({url:request.url(), error:request.failure()?.errorText}));
  try {
    const health = await context.request.get('http://127.0.0.1:8765/api/health');
    assert.equal(health.status(), 200);
    const invalid = await context.request.post('http://127.0.0.1:8765/api/translate', {data:{text:''}});
    assert.equal(invalid.status(), 400);
    const foreign = await context.request.post('http://127.0.0.1:8765/api/translate', {data:{text:'Olá'},headers:{Origin:'https://example.com'}});
    assert.equal(foreign.status(), 403);
    console.log('Servidor: saude, validacao e origem OK');
    await page.addInitScript(() => { window.qaEvents=[]; window.addEventListener('message', e => { if(e.data?.type==='unity_event') window.qaEvents.push({event:e.data.event,data:e.data.data}); }); });
    await page.goto('http://127.0.0.1:8765', {waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Olá, tudo bem?',exact:true}).click();
    assert.equal(await page.locator('#text').inputValue(), 'Olá, tudo bem?');
    console.log('Interface aberta; aguardando o player real…');
    await page.locator('#connection.ready').waitFor({timeout:115000});
    console.log('Avatar real carregado');
    const translation = page.waitForResponse(r => r.url().endsWith('/api/translate') && r.request().method()==='POST');
    await page.locator('#translate').click();
    const result = await translation;
    assert.equal(result.status(),200);
    await page.waitForFunction(() => document.getElementById('gloss').textContent.includes('OI'),null,{timeout:40000});
    await page.waitForFunction(() => window.qaEvents.some(e=>e.event==='counter_gloss' && Number(e.data?.[1])>0),null,{timeout:60000});
    console.log('Traducao e sinais reais recebidos pelo avatar');
    await page.locator('#speed').selectOption('0.75');
    await page.locator('#repeat').click();
    await page.locator('#pause').click();
    await page.locator('#stop').click();
    assert.equal(await page.locator('#history button').count(),1);
    await page.screenshot({path:path.join(__dirname,'desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:path.join(__dirname,'mobile.png'),fullPage:true});
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#history button').count(),1);
    await page.locator('#clear-history').click();
    assert.equal(await page.locator('#history button').count(),0);
    report.result='PASS';
    console.log('Controles, historico e layout movel OK');
  } catch(error) { report.result='FAIL'; report.failure=error.stack; console.error(error.message); await page.screenshot({path:path.join(__dirname,'falha.png'),fullPage:true}).catch(()=>{}); process.exitCode=1; }
  finally { report.events=await page.evaluate(()=>window.qaEvents||[]).catch(()=>[]); fs.writeFileSync(path.join(__dirname,'resultado.json'),JSON.stringify(report,null,2)); await browser.close(); }
})();
