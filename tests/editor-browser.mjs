import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {root} from '../scripts/build.mjs';
const supplied=process.env.EDITOR_TEST_URL,base=supplied||'http://127.0.0.1:4193',out=join(root,'artifacts'),checks=[],errors=[];
await mkdir(out,{recursive:true});
let server,browser,page,logs='';
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function stored(page){return page.evaluate(async()=>{const {getStored}=await import('../assets/storage.mjs');return getStored('draft');});}
async function flushed(page){await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('已儲存'));}
async function selectLayer(suffix){const value=await page.locator('#canvas-layer option').evaluateAll((options,s)=>options.find(o=>o.value.endsWith(s))?.value,suffix);assert.ok(value,'missing layer '+suffix);await page.selectOption('#canvas-layer',value);return value;}
async function dragTarget(selector,dx,dy){
  const target=page.locator(selector);await target.scrollIntoViewIfNeeded();const r=await target.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:8});await page.mouse.up();await flushed(page);
}
async function connect(){await page.click('#tab-source');await page.getByRole('button',{name:'連接並讀取候選作品',exact:true}).click();await page.locator('#cloud-dialog button.primary').click();await page.waitForSelector('#cloud-dialog:not([open])',{state:'attached'});}
try{
  if(!supplied){
    server=spawn(process.execPath,['scripts/dev.mjs','--fixtures'],{cwd:root,env:{...process.env,PORT:'4193',API_PORT:'8798'},windowsHide:true,stdio:['pipe','pipe','pipe']});
    server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server timeout '+logs)),25000);server.stdout.on('data',b=>{if(String(b).includes('Local:')){clearTimeout(timer);resolve();}});server.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+logs));});});
  }
  let channel;if(process.platform==='win32'){try{await access('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');channel='msedge';}catch{}}
  browser=await chromium.launch({headless:true,...(channel?{channel}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',d=>d.accept());
  await page.goto(base+'/studio/');await page.locator('.vote-card').first().waitFor();
  await check('responses default and authorized demo source use C/D columns',async()=>{
    assert.ok((await page.inputValue('#f-groups-0-source-url')).includes('11nxtR0'));
    assert.equal(await page.inputValue('#f-groups-0-source-mode'),'responses');assert.equal(await page.inputValue('#f-groups-0-source-nameColumn'),'C');
    await page.getByRole('button',{name:'B 組',exact:true}).click();assert.equal(await page.inputValue('#f-groups-1-source-nameColumn'),'D');
    assert.equal(await page.innerText('#mode-dual'),'雙組看板');
  });
  await check('single board removes all grouping UI and balances five cards 3+2',async()=>{
    await page.click('#mode-single');assert.equal(await page.locator('.group-name').count(),0);assert.equal(await page.locator('.group-select').count(),0);
    assert.ok(!(await page.locator('#settings-panel').innerText()).includes('A 組'));
    await page.click('#tab-group');assert.equal(await page.locator('#f-groups-0-name').count(),0);assert.equal(await page.innerText('#tab-group'),'票數與卡片');
    const rects=await page.locator('.vote-card').evaluateAll(nodes=>nodes.map(n=>({top:n.offsetTop,left:n.offsetLeft,height:n.offsetHeight})));
    assert.equal(new Set(rects.map(r=>r.top)).size,2);assert.ok(rects[3].left>rects[0].left);
    await page.screenshot({path:join(out,'editor-single-five.png')});
  });
  await check('image upload area stays below author field with a contained file input',async()=>{
    await page.click('#tab-candidates');const label=page.locator('label.upload-zone');await label.scrollIntoViewIfNeeded();
    const field=await page.locator('#f-groups-0-candidates-0-author').boundingBox(),zone=await label.boundingBox(),file=await label.locator('input').boundingBox();
    assert.ok(zone.y>=field.y+field.height);assert.ok(zone.height>=100);assert.ok(file.y>=zone.y&&file.y+file.height<=zone.y+zone.height+1);
    await page.screenshot({path:join(out,'editor-upload-fixed.png')});
    await page.locator('input[type=file]').setInputFiles(join(root,'public/assets/social.png'));await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('圖片已加入'));await flushed(page);
  });
  await check('preset button stays visible on every category and stores all settings',async()=>{
    for(const id of ['source','common','group','candidates']){
      await page.click('#tab-'+id);await page.evaluate(()=>scrollTo(0,600));const r=await page.locator('#save-preset').boundingBox();assert.ok(r.y>=0&&r.y<innerHeightFallback());
    }
    await page.click('#save-preset');const preset=await page.evaluate(async()=>{const {getStored}=await import('../assets/storage.mjs');return getStored('defaults');});assert.ok(preset.groups[0].candidates[0].image.startsWith('data:image/webp'));
  });
  await check('source help is keyboard accessible and visible on hover',async()=>{
    await page.click('#tab-source');await page.locator('.field-help').first().scrollIntoViewIfNeeded();await page.locator('.field-help').first().hover();assert.ok(await page.locator('.field-tooltip').first().isVisible());assert.ok((await page.locator('.field-tooltip').first().innerText()).includes('回應'));
  });
  await check('header toggle removes mistakenly discovered header card immediately and on reconnect',async()=>{
    // Restore the untouched candidates; the uploaded image is covered by the preset check above.
    await page.reload();await page.locator('.vote-card').first().waitFor();
    await page.click('#mode-dual');await page.click('#tab-source');await page.getByRole('button',{name:'A 組',exact:true}).click();await page.uncheck('#f-groups-0-source-header');
    await connect();assert.deepEqual(await page.locator('.total-number').allTextContents(),['31','30']);assert.equal(await page.locator('.vote-card').count(),11);assert.ok((await page.locator('.card-name').allTextContents()).includes('A 組投票選項'));
    await page.check('#f-groups-0-source-header');assert.equal(await page.locator('.vote-card').count(),10);assert.deepEqual(await page.locator('.total-number').allTextContents(),['30','30']);
    await connect();assert.equal(await page.locator('.vote-card').count(),10);assert.ok(!(await page.locator('.card-name').allTextContents()).includes('A 組投票選項'));
    await page.screenshot({path:join(out,'editor-demo-connected.png')});
  });
  await check('canvas title drag, resize, direct text and undo/redo work in sequence',async()=>{
    await page.evaluate(()=>scrollTo(0,0));await page.selectOption('#canvas-layer','title');await flushed(page);const before=(await stored(page)).appearance.title.x;
    await dragTarget('.board-title',40,12);assert.ok((await stored(page)).appearance.title.x>before);
    const size=(await stored(page)).appearance.title.size;await dragTarget('.canvas-selection [data-handle=se]',35,8);assert.ok((await stored(page)).appearance.title.size>size);
    await page.getByRole('button',{name:'編輯文字',exact:true}).click();await page.locator('.canvas-inline-text').fill('畫布直接編輯測試');await page.locator('.canvas-inline-text').press('Enter');await flushed(page);assert.equal(await page.innerText('.board-title'),'畫布直接編輯測試');
    await page.click('#undo-edit');assert.notEqual(await page.innerText('.board-title'),'畫布直接編輯測試');await page.click('#redo-edit');assert.equal(await page.innerText('.board-title'),'畫布直接編輯測試');
  });
  await check('individual card text moves/resizes/edits without altering other cards or vote answers',async()=>{
    const key=await selectLayer('-name');const id=key.slice(2,-5),answer=(await stored(page)).groups.flatMap(g=>g.candidates).find(c=>c.id===id).answer;
    const selector='[data-canvas="'+key+'"]';await dragTarget(selector,12,6);await page.fill('#canvas-size','');await page.locator('#canvas-size').pressSequentially('28.5');await flushed(page);
    await page.click('#canvas-edit-text');await page.locator('.canvas-inline-text').fill('個別作品名稱');await page.locator('.canvas-inline-text').press('Enter');await flushed(page);
    const config=await stored(page),items=config.groups.flatMap(g=>g.candidates),item=items.find(c=>c.id===id);assert.equal(item.answer,answer);assert.equal(item.label,'個別作品名稱');assert.equal(item.design.texts.name.size,28.5);assert.ok(item.design.texts.name.x>0);assert.ok(items.filter(c=>c.id!==id).every(c=>!c.design.texts?.name));
  });
  await check('images, ranking, vote bars, totals and whole cards expose working canvas controls',async()=>{
    for(const suffix of ['-image','-rank','-bar','-card']){
      const key=await selectLayer(suffix);const selector='[data-canvas="'+key+'"]';await dragTarget(suffix==='-card'?'.canvas-selection-label':selector,6,4);assert.equal(await page.inputValue('#canvas-layer'),key);await dragTarget('.canvas-selection [data-handle=se]',7,5);
    }
    await page.selectOption('#canvas-layer','g0-total');await dragTarget('.canvas-selection [data-handle=se]',8,6);
    const c=await stored(page);assert.ok(c.groups[0].total.width>110);assert.ok(c.groups[0].candidates.some(x=>x.layout.scale>1));
    const key=await selectLayer('-number');assert.equal(await page.locator('#canvas-edit-text').isDisabled(),true);assert.ok(key);
  });
  await check('canvas zoom keeps selection usable without horizontal page overflow',async()=>{
    await page.selectOption('#canvas-zoom','1');assert.equal(await page.locator('#preview').evaluate(n=>n.clientWidth),1600);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.selectOption('#canvas-zoom','fit');
    await page.screenshot({path:join(out,'editor-canvas-controls.png')});
  });
  let code;
  await check('cloud code preserves individual canvas settings and edited text across isolated browsers',async()=>{
    await page.click('#save-code');await page.getByRole('button',{name:'儲存並取得代碼',exact:true}).click();await page.locator('.code-value').waitFor();code=await page.innerText('.code-value');await page.getByRole('button',{name:'關閉',exact:true}).click();
    const other=await browser.newContext(),p=await other.newPage();p.on('dialog',d=>d.accept());await p.goto(base+'/studio/');await p.click('#load-code');await p.fill('#cloud-code',code);await p.locator('#cloud-dialog button.primary').click();await p.waitForSelector('#cloud-dialog:not([open])',{state:'attached'});await flushed(p);
    const saved=await stored(page),loaded=await stored(p);assert.deepEqual(loaded,saved);await other.close();
  });
  await check('projection screen chooser handles denied permission and fullscreen hides every control',async()=>{
    const wait=context.waitForEvent('page');await page.click('#open-display');const p=await wait;await p.waitForSelector('.vote-card');
    p.on('pageerror',e=>errors.push(e.message));
    await p.evaluate(()=>{window.getScreenDetails=async()=>{throw new DOMException('Denied','NotAllowedError');};});
    await p.click('#fullscreen');await p.getByRole('button',{name:'偵測可用螢幕',exact:true}).click();assert.ok((await p.locator('.screen-note').innerText()).includes('尚未取得'));
    await p.getByRole('button',{name:'目前螢幕 · 進入全螢幕',exact:true}).click();await p.waitForFunction(()=>!!document.fullscreenElement);
    assert.equal(await p.locator('.display-controls').isVisible(),false);await p.mouse.move(100,100);assert.equal(await p.locator('.display-controls').isVisible(),false);await p.screenshot({path:join(out,'projection-fullscreen-clean.png')});
    await p.evaluate(()=>document.exitFullscreen());await p.mouse.move(120,100);await p.locator('.display-controls').waitFor({state:'visible'});
    await p.evaluate(()=>{window.getScreenDetails=async()=>({screens:[{label:'測試螢幕 1',width:1920,height:1080,isPrimary:true},{label:'測試投影機 2',width:2560,height:1440}],addEventListener(){}});document.documentElement.requestFullscreen=async options=>{window.requestedScreen=options.screen?.label;};});
    await p.click('#fullscreen');await p.getByRole('button',{name:'偵測可用螢幕',exact:true}).click();await p.getByRole('button',{name:'測試投影機 2 · 2560 × 1440',exact:true}).click();assert.equal(await p.evaluate(()=>window.requestedScreen),'測試投影機 2');
    await p.close();
  });
  await check('single and dual layouts 1 through 20 remain within the board',async()=>{
    const p=await context.newPage();await p.goto(base+'/studio/');const result=await p.evaluate(async()=>{
      const {Board}=await import('../assets/board.mjs'),{defaults,candidate}=await import('../shared/model.mjs');
      const host=document.createElement('div');host.style.width='1600px';document.body.append(host);const b=new Board(host);let count=0;
      for(const mode of ['single','dual'])for(let n=1;n<=20;n++){const config=defaults();config.mode=mode;config.groups.forEach(g=>g.candidates=Array.from({length:n},(_,i)=>candidate('作品'+i,i)));b.render(config);
        for(const card of host.querySelectorAll('.vote-card')){const grid=card.parentElement;if(card.offsetLeft<0||card.offsetTop<0||card.offsetLeft+card.offsetWidth>grid.clientWidth+2||card.offsetTop+card.offsetHeight>grid.clientHeight+2)throw new Error('Layout overflow '+mode+' '+n);count++;}
      }
      b.destroy();host.remove();return count;
    });assert.equal(result,630);await p.close();
  });
  await check('mobile editor upload and canvas toolbar remain within viewport',async()=>{
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true}),p=await mobile.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/studio/');await p.click('#tab-candidates');await p.locator('.upload-zone').scrollIntoViewIfNeeded();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await p.screenshot({path:join(out,'editor-mobile-upload.png')});await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:join(out,'editor-mobile-v1.1.png')});await p.click('#tab-source');await p.locator('.field-help').first().focus();const help=await p.locator('.field-tooltip').first().boundingBox();assert.ok(help.x>=0&&help.x+help.width<=390);await mobile.close();
  });
  await check('no browser runtime exceptions during new interactions',async()=>assert.deepEqual(errors,[]));
}catch(e){errors.push(e.stack);console.error(e);process.exitCode=1;await page?.screenshot({path:join(out,'editor-failure.png'),fullPage:false}).catch(()=>{});}
finally{
  await browser?.close();
  if(server){server.stdin.end('shutdown\n');await new Promise(r=>{server.once('exit',r);setTimeout(()=>{server.kill();r();},5000).unref();});}
  await writeFile(join(out,'editor-report.json'),JSON.stringify({status:errors.length?'FAIL':'PASS',checks,errors,source:process.env.LIVE_SHEET_TEST==='1'?'Live user-authorized public Google Sheet through local Worker/D1':'Fixed Sheet fixtures through local Worker/D1',screenValidation:'Real current-screen Fullscreen API; two-screen routing uses simulated screen descriptors, not a physical projector'},null,2));
  if(logs)await writeFile(join(out,'editor-server.log'),logs);
}
function innerHeightFallback(){return 1000;}
