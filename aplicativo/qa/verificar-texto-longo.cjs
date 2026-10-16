const {chromium}=require('playwright-core');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:1100}});
  const report={errors:[],translations:[],note:'Traducao longa simulada para testar a interface; isso nao valida qualidade linguistica ou disponibilidade do servico externo.'};
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',async response=>{
    if(response.url().endsWith('/api/translate')&&response.status()===200){
      report.translations.push({text:response.request().postDataJSON().text,...await response.json()});
    }
  });
  try{
    await page.goto('http://127.0.0.1:8766',{waitUntil:'domcontentloaded'});
    await page.locator('#connection.ready').waitFor({timeout:115000});
    // A disponibilidade do tradutor e avaliada separadamente; aqui isolamos a interface.
    await page.route('**/api/translate',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({gloss:'TESTE [PONTO]'})}));
    await page.locator('.adaptation summary').click();
    await page.locator('#load-adapted').click();
    await page.waitForFunction(()=>document.getElementById('text').value.length>500);
    const prepared=await page.locator('#text').inputValue();
    await page.locator('#prepare').click();
    const count=await page.locator('.segment').count();
    assert.ok(count>10);
    console.log(`Versao preparada com ${count} trechos; respostas simuladas para testar a interface.`);
    await page.locator('#translate').click();
    await page.waitForFunction(()=>!document.getElementById('cancel-translation').hidden,null,{timeout:5000});
    await page.waitForFunction(()=>document.getElementById('cancel-translation').hidden,null,{timeout:180000});
    assert.equal(await page.locator('.play-segment').count(),count,await page.locator('#status').textContent());
    assert.equal(report.translations.length,count);
    const normalize=text=>text.replace(/\s+/g,' ').trim();
    assert.equal(normalize(report.translations.map(x=>x.text).join(' ')),normalize(prepared));
    await page.locator('#stop').click();
    await page.locator('.play-segment').first().click();
    await page.screenshot({path:path.join(__dirname,'texto-longo.png'),fullPage:true});
    console.log('Fila de trechos preserva o conteudo; reproducao individual acionada.');
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    // Falha parcial: nenhum restante e enviado como se fosse uma traducao completa.
    await page.unroute('**/api/translate');
    await page.locator('#text').fill('Primeira frase. Segunda frase.');
    let calls=0;
    await page.route('**/api/translate',route=>{
      calls++;
      return route.fulfill({status:calls===1?200:502,contentType:'application/json',body:JSON.stringify(calls===1?{gloss:'PRIMEIRO'}:{error:'Falha externa de teste'})});
    });
    await page.locator('#translate').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent==='Falha externa de teste');
    assert.match(await page.locator('#gloss').textContent(),/não foi concluída/);
    assert.equal(await page.locator('.play-segment').count(),1);
    assert.equal(await page.locator('#repeat').isDisabled(),true);
    await page.unroute('**/api/translate');
    let resumed=0;
    await page.route('**/api/translate',route=>{resumed++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({gloss:'SEGUNDO'})});});
    await page.locator('#resume-translation').click();
    await page.waitForFunction(()=>document.getElementById('gloss').textContent==='PRIMEIRO SEGUNDO');
    assert.equal(resumed,1,'Retomar deve traduzir apenas o trecho pendente.');
    await page.unroute('**/api/translate');
    // Cancelamento deve interromper a fila de trechos.
    await page.route('**/api/translate',route=>new Promise(resolve=>setTimeout(()=>resolve(route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({gloss:'TESTE'})}).catch(()=>{})),2000)));
    await page.locator('#translate').click();
    await page.locator('#cancel-translation').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent==='Tradução cancelada.');
    assert.equal(await page.locator('#repeat').isDisabled(),true);
    assert.deepEqual(report.errors,[]);
    report.result='PASS'; console.log('Falha parcial, retomada, cancelamento e layout movel OK.');
  }catch(error){report.result='FAIL';report.failure=error.stack;console.error(error.message);process.exitCode=1;}
  finally{fs.writeFileSync(path.join(__dirname,'resultado-texto-longo.json'),JSON.stringify(report,null,2));await browser.close();}
})();
