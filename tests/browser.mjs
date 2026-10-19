import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {root} from '../scripts/build.mjs';
const out=join(root,'artifacts'),base='http://127.0.0.1:4183',checks=[],errors=[],api=[];
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['scripts/dev.mjs','--fixtures'],{cwd:root,env:{...process.env,PORT:'4183',API_PORT:'8798'},windowsHide:true,stdio:['pipe','pipe','pipe']});
let logs='',browser,active;
server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Preview timeout: '+logs)),25000);server.stdout.on('data',b=>{if(String(b).includes('Local:')){clearTimeout(timer);resolve();}});server.once('exit',code=>{clearTimeout(timer);reject(new Error('Preview exited '+code+': '+logs));});});
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
function watch(page){page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes(':8798/'))api.push(r.url());});page.on('dialog',d=>d.accept());}
async function waitText(page,selector,part){await page.waitForFunction(([s,t])=>document.querySelector(s)?.textContent.includes(t),[selector,part]);}
async function wheelAll(page){
  await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
  return page.locator('input[type=number]').evaluateAll(inputs=>{
    let count=0;
    for(const input of inputs){
      if(!input.checkVisibility())continue;
      const original=Number(input.value),step=Number(input.step)||1,direction=original+step<=Number(input.max)?1:-1,style=getComputedStyle(input),rect=input.getBoundingClientRect();
      const x=rect.left+parseFloat(style.paddingLeft)+parseFloat(style.borderLeftWidth)+2,y=rect.top+rect.height/2;
      const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:x,clientY:y,deltaY:-direction*100});input.dispatchEvent(event);
      if(!event.defaultPrevented||Math.abs(Number(input.value)-(original+step*direction))>.001)throw new Error('number wheel failed: '+input.id);
      input.value=original;input.dispatchEvent(new Event('input',{bubbles:true}));
      const outside=new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:rect.left+2,clientY:y,deltaY:-100});input.dispatchEvent(outside);
      if(Number(input.value)!==original)throw new Error('padding changed number: '+input.id);
      count++;
    }
    return count;
  });
}
try{
  await ready;
  let channel;
  if(process.platform==='win32'){try{await access('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');channel='msedge';}catch{}}
  browser=await chromium.launch({headless:true,...(channel?{channel}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();active=page;watch(page);
  await check('static marketing content and desktop layout',async()=>{await page.goto(base+'/');await page.locator('#hero-board .vote-card').first().waitFor();assert.equal(await page.locator('h1').count(),1);assert.ok((await page.locator('h1').innerText()).includes('精彩'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(out,'home-desktop.png'),fullPage:true});});
  await page.goto(base+'/studio/');await page.locator('.vote-card').first().waitFor();
  await check('dual defaults, single toggle and restore B configuration',async()=>{assert.equal(await page.locator('.group-region').count(),2);await page.click('#mode-single');assert.equal(await page.locator('.group-region').count(),1);await page.click('#mode-dual');assert.equal(await page.locator('.group-region').count(),2);assert.equal(await page.locator('.vote-card').count(),10);});
  await check('A summary and B raw responses connect independently via real local Worker/D1',async()=>{
    await page.fill('#f-groups-0-source-url','https://docs.google.com/spreadsheets/d/TEST_FIXTURE_SHEET_12345/edit');
    await page.selectOption('#f-groups-0-source-mode','summary');await page.fill('#f-groups-0-source-nameColumn','A');
    await page.getByRole('button',{name:'B 組',exact:true}).click();
    await page.fill('#f-groups-1-source-url','https://docs.google.com/spreadsheets/d/TEST_RESPONSE_SHEET_12345/edit');
    await page.selectOption('#f-groups-1-source-mode','responses');await page.fill('#f-groups-1-source-nameColumn','B');
    await page.getByRole('button',{name:'連接並讀取候選作品',exact:true}).click();await page.locator('#cloud-dialog button.primary').click();
    await page.waitForSelector('#cloud-dialog:not([open])',{state:'attached'});assert.equal(await page.locator('.vote-card').count(),6);assert.deepEqual(await page.locator('.total-number').allTextContents(),['18','3']);
    assert.equal(await page.locator('#demo-badge').isVisible(),false);
  });
  await check('title decimal input and real wheel responds only to number text',async()=>{
    await page.click('#tab-common');await page.fill('#f-title','測試活動 · 精彩上場');await page.fill('#f-appearance-title-size','45.5');
    const field=page.locator('#f-appearance-title-size');await field.scrollIntoViewIfNeeded();let box=await field.boundingBox();await page.mouse.move(box.x+11,box.y+box.height/2);await page.mouse.wheel(0,-100);await page.waitForTimeout(100);assert.equal(Number(await field.inputValue()),45.6);
    box=await field.boundingBox();await page.mouse.move(box.x+box.width-22,box.y+box.height/2);await page.mouse.wheel(0,-100);await page.waitForTimeout(100);assert.equal(Number(await field.inputValue()),45.6);
    assert.equal(await page.locator('.board-title').innerText(),'測試活動 · 精彩上場');
  });
  await check('all numeric controls support wheel digits and ignore padding',async()=>{
    let total=await wheelAll(page);
    await page.click('#tab-group');total+=await wheelAll(page);
    await page.getByRole('button',{name:'A 組',exact:true}).click();total+=await wheelAll(page);
    await page.click('#tab-candidates');total+=await wheelAll(page);
    assert.ok(total>100);checks.push('numeric wheel controls verified: '+total);
  });
  await check('image upload and transform, card background and colors update live',async()=>{
    await page.locator('input[type=file]').setInputFiles(join(root,'public/assets/social.png'));await waitText(page,'#toast','圖片已加入');
    await page.fill('#f-groups-0-candidates-0-zoom','1.2');
    assert.ok((await page.locator('.candidate-image>img').first().getAttribute('src')).startsWith('data:image/webp'));
    await page.click('#tab-group');await page.getByText('卡片底圖',{exact:true}).evaluate(n=>n.parentElement.open=true);await page.locator('#f-groups-0-card-color').fill('#243848');await page.locator('#f-groups-0-card-color').dispatchEvent('change');
    assert.equal(await page.locator('.vote-card').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(36, 56, 72)');
  });
  await check('drag preview updates number fields and preview stays visible after scrolling',async()=>{
    await page.click('#tab-common');await page.evaluate(()=>scrollTo(0,0));const title=page.locator('.board-title'),box=await title.boundingBox();const before=Number(await page.locator('#f-appearance-title-x').inputValue());
    await page.mouse.move(box.x+15,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+65,box.y+box.height/2+8,{steps:5});await page.mouse.up();
    assert.ok(Number(await page.locator('#f-appearance-title-x').inputValue())>before);
    await page.evaluate(()=>scrollTo(0,600));const preview=await page.locator('#preview').boundingBox();assert.ok(preview.y>=70&&preview.y<260);
    await page.screenshot({path:join(out,'studio-customized.png'),fullPage:false});
  });
  let code,imageData;
  await check('cloud code persists full settings and image',async()=>{
    imageData=await page.locator('.candidate-image>img').first().getAttribute('src');
    await page.click('#save-code');await page.getByRole('button',{name:'儲存並取得代碼',exact:true}).click();await page.locator('.code-value').waitFor();code=await page.locator('.code-value').innerText();assert.match(code,/^LVB-/);assert.ok(!page.url().includes(code));await page.getByRole('button',{name:'關閉',exact:true}).click();
  });
  await check('fresh browser context loads code and image without sharing local storage',async()=>{
    const other=await browser.newContext({viewport:{width:1440,height:900}}),second=await other.newPage();watch(second);await second.goto(base+'/studio/');await second.click('#load-code');await second.fill('#cloud-code',code);await second.locator('#cloud-dialog button.primary').click();await second.waitForSelector('#cloud-dialog:not([open])',{state:'attached'});
    assert.equal(await second.locator('.board-title').innerText(),'測試活動 · 精彩上場');assert.equal(await second.locator('.candidate-image>img').first().getAttribute('src'),imageData);assert.equal(await second.locator('.vote-card').count(),6);await other.close();
  });
  let projection;
  await check('projection receives exact edited board without displaying setting code',async()=>{
    const popup=context.waitForEvent('page');await page.click('#open-display');projection=await popup;watch(projection);await projection.waitForSelector('.vote-card');assert.equal(await projection.locator('.board-title').innerText(),'測試活動 · 精彩上場');assert.ok(!projection.url().includes(code));assert.equal(await projection.locator('.vote-card').count(),6);
    await projection.screenshot({path:join(out,'projection.png')});
  });
  await check('projection polls while operator hidden and shares lease with other view',async()=>{
    const countBefore=api.filter(x=>x.endsWith('/api/votes')).length;
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    await projection.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    await projection.waitForRequest(r=>r.url().endsWith('/api/votes'),{timeout:40000});
    const countAfter=api.filter(x=>x.endsWith('/api/votes')).length;assert.ok(countAfter>countBefore,'projection should take over polling');
    const lease=await projection.evaluate(async()=>{const {coordinatedPoll}=await import('../assets/live.mjs');let calls=0;const token='test-shared-lease-'+crypto.randomUUID();await Promise.all([coordinatedPoll(token,30,async()=>{calls++;return 1;}),coordinatedPoll(token,30,async()=>{calls++;return 2;})]);return calls;});assert.equal(lease,1);
  });
  await check('cloud delete invalidates code',async()=>{await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await page.click('#delete-code');await page.fill('#cloud-code',code);await page.locator('#cloud-dialog button.primary').click();await page.waitForSelector('#cloud-dialog:not([open])',{state:'attached'});await page.click('#load-code');await page.fill('#cloud-code',code);await page.locator('#cloud-dialog button.primary').click();await waitText(page,'.code-error','找不到');await page.getByRole('button',{name:'關閉',exact:true}).click();});
  await check('mobile landing and studio have no horizontal overflow',async()=>{
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1}),p=await mobile.newPage();watch(p);await p.goto(base+'/');await p.locator('#hero-board .vote-card').first().waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:join(out,'home-mobile.png'),fullPage:true});await p.goto(base+'/studio/');await p.locator('.vote-card').first().waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:join(out,'studio-mobile.png'),fullPage:true});await mobile.close();
  });
  await check('no browser runtime exceptions',async()=>assert.deepEqual(errors,[]));
}catch(e){console.error(e);errors.push(e.message);if(active)await active.screenshot({path:join(out,'browser-failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{
  await browser?.close();server.stdin.end('shutdown\n');
  await new Promise(resolve=>{server.once('exit',resolve);setTimeout(()=>{server.kill();resolve();},5000).unref();});
  await writeFile(join(out,'browser-report.json'),JSON.stringify({status:errors.length?'FAIL':'PASS',checks,errors,apiRequests:api.length,testData:'Fixed CSV fixtures through real local Worker/D1, not a live Google Form',screenshots:['home-desktop.png','studio-customized.png','projection.png','home-mobile.png','studio-mobile.png']},null,2));
  await writeFile(join(out,'browser-server.log'),logs);
}
