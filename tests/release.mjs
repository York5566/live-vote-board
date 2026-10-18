import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat,access} from 'node:fs/promises';
import {join,resolve,sep,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {build,root} from '../scripts/build.mjs';
const out=join(root,'artifacts'),checks=[],errors=[];
const siteUrl='https://example.github.io/live-vote-board/',basePath='/live-vote-board/';
let server,browser;
await mkdir(out,{recursive:true});
async function check(name,task){await task();checks.push(name);console.log('PASS '+name);}
try{
  await check('GitHub Pages subpath build, canonical, sitemap, noindex and no CNAME',async()=>{
    await build({siteUrl,apiBase:'https://vote-api.example.workers.dev',turnstileSiteKey:'release-test-public-key'});
    execFileSync(process.execPath,['scripts/check.mjs'],{cwd:root,stdio:'pipe',windowsHide:true});
    const home=await readFile(join(root,'dist/index.html'),'utf8');
    assert.ok(home.includes('href="'+siteUrl+'"'));
    assert.ok(home.includes('content="'+siteUrl+'assets/social.png"'));
    const sitemap=await readFile(join(root,'dist/sitemap.xml'),'utf8');
    assert.equal([...sitemap.matchAll(/<loc>/g)].length,4);
    assert.ok(sitemap.includes(siteUrl+'guide/'));
    assert.ok(!sitemap.includes('/studio/')&&!sitemap.includes('/display/'));
    await assert.rejects(access(join(root,'dist/CNAME')));
    await access(join(root,'dist/.nojekyll'));
  });
  const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml','.txt':'text/plain'};
  server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost'),path=decodeURIComponent(url.pathname);
      if(!path.startsWith(basePath)){res.writeHead(404);res.end();return;}
      const base=join(root,'dist');let file=resolve(base,path.slice(basePath.length));
      if(file!==base&&!file.startsWith(base+sep)){res.writeHead(403);res.end();return;}
      let status=200;
      try{if((await stat(file)).isDirectory())file=join(file,'index.html');}catch{file=join(base,'404.html');status=404;}
      res.writeHead(status,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(await readFile(file));
    }catch{res.writeHead(500);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,local=origin+basePath;
  let channel;
  if(process.platform==='win32'){try{await access('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');channel='msedge';}catch{}}
  browser=await chromium.launch({headless:true,...(channel?{channel}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await check('real browser loads landing, editor and projection assets under repository path',async()=>{
    await page.goto(local);await page.locator('#hero-board .vote-card').first().waitFor();
    assert.equal(await page.locator('h1').count(),1);
    await page.goto(local+'studio/');await page.locator('.vote-card').first().waitFor();
    assert.equal(await page.locator('.group-region').count(),2);
    await page.goto(local+'display/?demo=1');await page.locator('.vote-card').first().waitFor();
    assert.equal(await page.locator('.group-region').count(),2);
  });
  await check('projection fills the viewport with dark letterbox background',async()=>{
    const dimensions=await page.evaluate(()=>({height:document.body.getBoundingClientRect().height,screen:innerHeight,color:getComputedStyle(document.body).backgroundColor}));
    assert.ok(dimensions.height>=dimensions.screen);
    assert.equal(dimensions.color,'rgb(16, 40, 39)');
    await page.locator('.display-controls').evaluate(n=>n.classList.add('quiet'));
    await page.screenshot({path:join(out,'projection-release.png')});
  });
  await check('nested missing-page fallback keeps navigation and styling under repository path',async()=>{
    const failures=[];page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400&&!r.url().includes('missing/deep/page'))failures.push(r.url());});
    const response=await page.goto(local+'missing/deep/page');
    assert.equal(response.status(),404);assert.ok((await page.locator('h1').innerText()).includes('還沒有畫面'));
    assert.equal(await page.locator('.brand').getAttribute('href'),basePath);
    assert.equal(await page.locator('link[rel=stylesheet]').first().getAttribute('href'),basePath+'assets/site.css');
    await page.locator('.brand').click();await page.locator('#hero-board .vote-card').first().waitFor();
    assert.deepEqual(failures,[]);
  });
  await browser.close();browser=null;
  await check('custom domain build creates CNAME and canonical URLs',async()=>{
    await build({siteUrl:'https://votes.example.org/',apiBase:'https://vote-api.example.workers.dev',turnstileSiteKey:'release-test-public-key'});
    assert.equal(await readFile(join(root,'dist/CNAME'),'utf8'),'votes.example.org\n');
    execFileSync(process.execPath,['scripts/check.mjs'],{cwd:root,stdio:'pipe',windowsHide:true});
  });
  await check('build rejects embedded URL credentials',async()=>{
    await assert.rejects(build({siteUrl:'https://user:password@example.org/'}));
    await assert.rejects(build({apiBase:'https://user:password@api.example.org/'}));
  });
  assert.deepEqual(errors,[]);
}catch(e){errors.push(e.message);process.exitCode=1;console.error(e);}
finally{
  await browser?.close();
  if(server)await new Promise(r=>server.close(r));
  await build({local:false,siteUrl:'',apiBase:'',turnstileSiteKey:''});
  execFileSync(process.execPath,['scripts/check.mjs'],{cwd:root,stdio:'inherit',windowsHide:true});
  await writeFile(join(out,'release-report.json'),JSON.stringify({status:errors.length?'FAIL':'PASS',checks,errors,scope:'Local repository-subpath simulation, not an actual GitHub or Cloudflare deployment'},null,2));
}
