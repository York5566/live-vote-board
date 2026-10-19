import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {root} from '../scripts/build.mjs';
const supplied=process.env.EDITOR_TEST_URL,base=supplied||'http://127.0.0.1:4193',out=join(root,'artifacts'),checks=[],errors=[];
await mkdir(out,{recursive:true});let server,browser,page,logs='';
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function stored(p=page){await p.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('已儲存'));return p.evaluate(async()=>{const {getStored}=await import('../assets/storage.mjs');return getStored('draft');});}
async function color(selector,value){await page.locator(selector).evaluate((n,v)=>{n.value=v;n.dispatchEvent(new Event('input',{bubbles:true}));},value);await stored();}
async function choose(key){await page.selectOption('#canvas-layer',key);await page.waitForFunction(k=>document.querySelector('.inspector-active')?.dataset.inspector===k,key.startsWith('c-')?key.split('-').at(-1):key.startsWith('g')?key.endsWith('heading')?'heading':'total':key==='background-image'?'background':key);}
async function connect(){await page.click('#tab-source');await page.getByRole('button',{name:'連接並讀取候選作品',exact:true}).click();await page.locator('#cloud-dialog button.primary').click();await page.waitForSelector('#cloud-dialog:not([open])',{state:'attached'});}
try{
  if(!supplied){server=spawn(process.execPath,['scripts/dev.mjs','--fixtures'],{cwd:root,env:{...process.env,PORT:'4193',API_PORT:'8798'},windowsHide:true,stdio:['pipe','pipe','pipe']});server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(logs)),25000);server.stdout.on('data',b=>{if(String(b).includes('Local:')){clearTimeout(timer);resolve();}});server.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+logs));});});}
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(base+'/studio/');await page.locator('.vote-card').first().waitFor();
  await check('native hover titles are absent while document title and accessible custom help remain',async()=>{
    assert.equal(await page.locator('[title]').count(),0);assert.ok(await page.title());const help=page.locator('.field-help').first();await help.focus();const id=await help.getAttribute('aria-describedby');assert.ok(await page.locator('#'+id).isVisible());const r=await page.locator('#'+id).boundingBox();assert.ok(r.x>=0&&r.x+r.width<410&&r.y>=74&&r.y+r.height<=1000);await page.mouse.move(1000,100);await help.blur();
  });
  let first,second,bid;
  await check('clicking a vote bar opens and reveals the exact candidate inspector without moving the canvas',async()=>{
    const track=page.locator('.vote-track').first(),before=await page.locator('#preview').boundingBox();first=(await track.getAttribute('data-canvas')).slice(2,-4);await track.click();await page.waitForTimeout(80);const detail=page.locator('.inspector-active');assert.equal(await detail.getAttribute('data-inspector'),'bar');assert.ok((await detail.innerText()).includes('只調整：A 組'));const r=await detail.boundingBox(),dock=await page.locator('.settings-dock').boundingBox();assert.ok(r.y>=dock.y+dock.height-1&&r.y<850);assert.equal((await page.locator('#preview').boundingBox()).y,before.y);for(const s of ['','-end','-track'])assert.ok(await page.locator('#canvas-color'+s).isVisible());await page.screenshot({path:join(out,'inspector-colors.png')});
  });
  await check('three toolbar colors and track opacity edit only the selected candidate',async()=>{
    for(const [s,v]of [['','#123456'],['-end','#654321'],['-track','#fedcba']])await color('#canvas-color'+s,v);
    await page.fill('#f-groups-0-candidates-0-design-barTrackOpacity','77.5');let c=await stored();const d=c.groups[0].candidates.find(c=>c.id===first).design;assert.deepEqual([d.barStart,d.barEnd,d.barTrack,d.barTrackOpacity],['#123456','#654321','#fedcba',77.5]);assert.ok(c.groups.flatMap(g=>g.candidates).filter(c=>c.id!==first).every(c=>!c.design.barStart));
    const gradient=await page.locator('[data-canvas="c-'+first+'-bar"] .vote-fill').evaluate(n=>getComputedStyle(n).backgroundImage);assert.ok(gradient.includes('18, 52, 86')&&gradient.includes('101, 67, 33'));second=c.groups[0].candidates[1].id;bid=c.groups[1].candidates[0].id;
  });
  await check('left individual colors, group defaults, apply-all, undo and reset have explicit scopes',async()=>{
    await choose('c-'+second+'-bar');await color('#f-groups-0-candidates-1-design-barStart','#112233');await page.fill('#f-groups-0-candidates-1-design-barX','12.5');await stored();await page.click('#tab-group');await page.getByText('票數長條（整組預設）',{exact:true}).click();await color('#f-groups-0-card-barStart','#778899');let c=await stored();assert.equal(c.groups[0].candidates[0].design.barStart,'#123456');assert.equal(c.groups[0].candidates[1].design.barStart,'#112233');
    await page.getByRole('button',{name:'將整組長條配色套用到所有作品',exact:true}).click();c=await stored();assert.ok(c.groups[0].candidates.every(c=>!c.design.barStart));assert.equal(c.groups[0].candidates[1].design.barX,12.5);await page.click('#undo-edit');c=await stored();assert.equal(c.groups[0].candidates[0].design.barStart,'#123456');
    await choose('c-'+second+'-bar');await page.getByRole('button',{name:'恢復這張作品的整組長條配色',exact:true}).click();c=await stored();assert.equal(c.groups[0].candidates[1].design.barStart,undefined);assert.equal(c.groups[0].candidates[1].design.barX,12.5);assert.equal(c.groups[0].candidates[0].design.barStart,'#123456');
  });
  await check('all rendered canvas targets navigate to their own settings; manual tabs do not stick',async()=>{
    const keys=await page.locator('#canvas-layer option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(k=>k&&!k.startsWith('c-')||k.startsWith('c-')).filter(k=>k));
    for(const key of keys.filter(k=>!k.startsWith('c-')||k.startsWith('c-'+first+'-')||k.startsWith('c-'+bid+'-'))){await choose(key);if(key.startsWith('c-'+bid+'-'))assert.ok((await page.locator('.inspector-active').innerText()).includes('只調整：B 組'));}
    await page.click('#tab-source');assert.equal(await page.inputValue('#canvas-layer'),'');await page.locator('[data-canvas="c-'+bid+'-bar"]').click();assert.ok((await page.locator('.inspector-active').innerText()).includes('只調整：B 組'));
    await color('#canvas-color-end','#aabbcc');assert.equal((await stored()).groups[1].candidates[0].design.barEnd,'#aabbcc');
  });
  await check('cloud save and load preserve individual three-color bars in an isolated browser',async()=>{
    const saved=await stored();await page.click('#save-code');await page.getByRole('button',{name:'儲存並取得代碼',exact:true}).click();await page.locator('.code-value').waitFor();const code=await page.innerText('.code-value');await page.getByRole('button',{name:'關閉',exact:true}).click();
    const other=await browser.newContext(),p=await other.newPage();p.on('dialog',d=>d.accept());await p.goto(base+'/studio/');await p.click('#load-code');await p.fill('#cloud-code',code);await p.locator('#cloud-dialog button.primary').click();await p.waitForSelector('#cloud-dialog:not([open])',{state:'attached'});assert.deepEqual(await stored(p),saved);await other.close();
  });
  await check('real fixture aggregation failure directly identifies B and its reason; A remains successful',async()=>{
    await page.click('#tab-source');await page.getByRole('button',{name:'B 組',exact:true}).click();await page.selectOption('#f-groups-1-source-mode','summary');await page.fill('#f-groups-1-source-nameColumn','C');await page.fill('#f-groups-1-source-countColumn','D');await connect();
    for(const selector of ['#toast','#connection-detail','.source-feedback']){const s=await page.innerText(selector);assert.match(s,/B 組/);assert.match(s,/整數/);assert.ok(!s.includes('保留上次成功'));}assert.deepEqual(await page.locator('.total-number').allTextContents(),['30','—']);await page.screenshot({path:join(out,'inspector-source-failure.png')});
    await page.selectOption('#f-groups-1-source-mode','responses');await page.fill('#f-groups-1-source-nameColumn','D');await connect();assert.deepEqual(await page.locator('.total-number').allTextContents(),['30','30']);assert.ok(await page.locator('.source-feedback').isHidden());
  });
  await check('poll retry preserves detailed group reason and accurately states retained votes',async()=>{
    // Only the failure response is simulated; the prior successful totals come from local Worker/D1.
    await page.route('**/api/votes',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({groups:[{status:'ok',counts:{'作品 1':30},updatedAt:Date.now()},{status:'error',counts:null,message:'Google 試算表目前無法讀取，請檢查共用權限。'}]})}));await page.click('#refresh-now');await page.waitForFunction(()=>document.querySelector('#connection-detail').textContent.includes('共用權限'));
    const detail=await page.innerText('#connection-detail');assert.match(detail,/B 組/);assert.match(detail,/保留上次成功票數/);assert.match(detail,/秒後自動重試/);assert.match(await page.innerText('.source-feedback'),/共用權限/);assert.equal((await page.locator('.total-number').allTextContents())[1],'30');await page.unroute('**/api/votes');
  });
  await check('invalid URLs identify the group before connecting and single mode uses an ungrouped label',async()=>{
    await page.fill('#f-groups-1-source-url','https://forms.gle/wrong-link');await page.getByRole('button',{name:'連接並讀取候選作品',exact:true}).click();assert.match(await page.innerText('#connection-detail'),/B 組/);assert.equal(await page.locator('#cloud-dialog[open]').count(),0);
    await page.click('#mode-single');await page.fill('#f-groups-0-source-url','https://forms.gle/wrong-link');await page.getByRole('button',{name:'連接並讀取候選作品',exact:true}).click();assert.match(await page.innerText('#connection-detail'),/^票源：/);assert.ok(!(await page.innerText('#connection-detail')).includes('A 組'));
  });
  await check('mobile three-color toolbar and inspector remain readable without page overflow',async()=>{
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true}),p=await mobile.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/studio/');await p.locator('.vote-track').first().click();await p.waitForTimeout(100);assert.equal(await p.locator('.inspector-active').getAttribute('data-inspector'),'bar');assert.ok((await p.locator('.inspector-active').boundingBox()).y<844);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('#canvas-color-end').scrollIntoViewIfNeeded();await p.screenshot({path:join(out,'inspector-mobile.png')});await mobile.close();
  });
  await check('no browser runtime exceptions',async()=>assert.deepEqual(errors,[]));
}catch(e){errors.push(e.stack);process.exitCode=1;console.error(e);await page?.screenshot({path:join(out,'inspector-failure.png')}).catch(()=>{});}
finally{await browser?.close();if(server){server.stdin.end('shutdown\n');await new Promise(r=>{server.once('exit',r);setTimeout(()=>{server.kill();r();},5000).unref();});}await writeFile(join(out,'inspector-report.json'),JSON.stringify({status:errors.length?'FAIL':'PASS',checks,errors,source:'Local Worker/D1 with deterministic Sheet fixtures; subsequent poll failure is explicitly simulated'},null,2));if(logs)await writeFile(join(out,'inspector-server.log'),logs);}
