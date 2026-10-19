import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {root} from '../scripts/build.mjs';
import {defaults} from '../shared/model.mjs';
import {createCode,normalizeCode,sha256} from '../worker/index.mjs';
let script,mf,db,fetches=0,upstreamFailure=false;
async function runtime(bindings={},production=false){
  const runtime=new Miniflare(convertV4MiniflareOptions({script,modules:true,compatibilityDate:'2026-09-01',d1Databases:{DB:'test-'+crypto.randomUUID()},bindings:{LOCAL_DEVELOPMENT:production?'false':'true',SESSION_SECRET:'test-secret-with-more-than-thirty-two-characters',ALLOWED_ORIGINS:'https://board.example.test',TURNSTILE_HOSTNAMES:'board.example.test',TURNSTILE_SECRET_KEY:'test-secret',...bindings},...(production?{ratelimits:{IP_LIMITER:{namespace_id:'9101',simple:{limit:100,period:60}},ACTION_LIMITER:{namespace_id:'9102',simple:{limit:5,period:60}},SESSION_LIMITER:{namespace_id:'9103',simple:{limit:12,period:60}}}}:{}),
    outboundService:async request=>{
      if(request.url.includes('siteverify')){const body=await request.json();return Response.json({success:body.response.startsWith('valid-'),action:body.response.replace('valid-',''),hostname:body.response==='valid-wrong-host'?'evil.test':'board.example.test'});}
      fetches++;return upstreamFailure?new Response('unavailable',{status:503}):new Response('作品,票數\n甲,5\n乙,3\n丙,0',{headers:{'Content-Type':'text/csv'}});
    }
  }));
  await runtime.ready;const database=await runtime.getD1Database('DB');
  await database.exec((await readFile(join(root,'migrations/0001_initial.sql'),'utf8')).replace(/\r?\n/g,' '));
  return {runtime,database};
}
before(async()=>{script=(await build({entryPoints:[join(root,'worker/index.mjs')],bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;({runtime:mf,database:db}=await runtime());});
after(async()=>mf?.dispose());
const headers={Origin:'http://127.0.0.1:4173','Content-Type':'application/json'};
async function call(path,data={},extra={},instance=mf){const response=await instance.dispatchFetch('http://localhost'+path,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});return {response,data:await response.json()};}
test('codes contain 120 random bits and normalize copied formatting',()=>{const codes=new Set(Array.from({length:1000},()=>createCode()));assert.equal(codes.size,1000);const code=[...codes][0];assert.equal(normalizeCode(code.toLowerCase()),code);assert.throws(()=>normalizeCode('123456'));});
test('D1 save/load includes images and decimal settings; database only stores code hash',async()=>{
  const config=defaults();config.appearance.title.x=12.3;config.groups[1].card.texts.share.color='#aabbcc';config.appearance.logo.image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVukAAAAASUVORK5CYII=';
  const saved=await call('/api/snapshots/save',{config});assert.equal(saved.response.status,201);assert.match(saved.data.code,/^LVB-/);
  const loaded=await call('/api/snapshots/load',{code:saved.data.code});assert.equal(loaded.response.status,200);assert.deepEqual(loaded.data.config,config);
  const stored=await db.prepare('SELECT code_hash,byte_size,chunks FROM snapshots').all();assert.equal(stored.results[0].code_hash,await sha256(saved.data.code));assert.notEqual(stored.results[0].code_hash,saved.data.code);
  const usage=await db.prepare('SELECT bytes FROM storage_usage WHERE id=1').first();assert.equal(usage.bytes,stored.results[0].byte_size);
  const deletion=await call('/api/snapshots/delete',{code:saved.data.code});assert.equal(deletion.data.deleted,true);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM snapshot_chunks').first()).n,0);
  assert.equal((await db.prepare('SELECT bytes FROM storage_usage WHERE id=1').first()).bytes,0);
  assert.equal((await call('/api/snapshots/load',{code:saved.data.code})).response.status,404);
});
test('multiple chunks reconstruct Unicode without data loss',async()=>{
  const c=defaults();for(const g of c.groups)for(const item of g.candidates)item.image='data:image/png;base64,iVBORw0KGgo'+'A'.repeat(23001);
  const saved=await call('/api/snapshots/save',{config:c});assert.equal(saved.response.status,201);const loaded=await call('/api/snapshots/load',{code:saved.data.code});assert.equal(loaded.response.status,200);assert.deepEqual(loaded.data.config,c);
  await call('/api/snapshots/delete',{code:saved.data.code});
});
test('unknown source origins and wildcard impostors are rejected before DB work',async()=>{
  assert.equal((await call('/api/snapshots/save',{config:defaults()},{Origin:'https://evil.test'})).response.status,403);
  assert.equal((await call('/api/snapshots/save',{config:defaults()},{Origin:'https://board.example.test.evil.test'})).response.status,403);
});
test('CORS preflight exposes only allowed methods and headers',async()=>{const r=await mf.dispatchFetch('http://localhost/api/votes',{method:'OPTIONS',headers:{Origin:headers.Origin}});assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),headers.Origin);assert.equal(r.headers.get('Access-Control-Allow-Credentials'),null);});
test('source fetches are cached across separate sessions',async()=>{
  const sources=[{url:'https://docs.google.com/spreadsheets/d/TEST_SHEET_12345/edit',nameColumn:'A',countColumn:'B'}];
  const a=await call('/api/session',{sources});assert.equal(a.response.status,200);assert.equal(a.data.groups[0].total,8);const before=fetches;
  const b=await call('/api/session',{sources});assert.equal(b.data.groups[0].cached,true);assert.equal(fetches,before);
  const polled=await call('/api/votes',{}, {Authorization:'Bearer '+a.data.token});assert.equal(polled.response.status,200);assert.equal(fetches,before);
});
test('forged session cannot read or proxy arbitrary sources',async()=>{const r=await call('/api/votes',{}, {Authorization:'Bearer forged.invalid'});assert.equal(r.response.status,401);});
test('upstream outage preserves stale counts and suppresses immediate repeat fetches',async()=>{
  const sources=[{url:'https://docs.google.com/spreadsheets/d/OUTAGE_SHEET_12345/edit'}],session=await call('/api/session',{sources});
  await db.prepare('UPDATE vote_cache SET fetched_at=0,locked_until=0').run();upstreamFailure=true;
  const failed=await call('/api/votes',{}, {Authorization:'Bearer '+session.data.token});assert.equal(failed.data.groups[0].status,'stale');assert.equal(failed.data.groups[0].counts.甲,5);
  const before=fetches,again=await call('/api/votes',{}, {Authorization:'Bearer '+session.data.token});assert.equal(fetches,before);assert.equal(again.data.groups[0].message,failed.data.groups[0].message);assert.equal(again.data.groups[0].status,'stale');upstreamFailure=false;
});
test('initial source failure retains its reason across sessions and backoff, then clears on recovery',async()=>{
  const sources=[{url:'https://docs.google.com/spreadsheets/d/INITIAL_FAILURE_12345/edit'}];upstreamFailure=true;
  try{
    const first=await call('/api/session',{sources});assert.equal(first.data.groups[0].status,'error');assert.equal(first.data.groups[0].counts,null);const before=fetches;
    const second=await call('/api/session',{sources}),polled=await call('/api/votes',{}, {Authorization:'Bearer '+first.data.token});
    for(const result of [second,polled]){assert.equal(result.data.groups[0].status,'error');assert.equal(result.data.groups[0].message,first.data.groups[0].message);assert.equal(result.data.groups[0].counts,null);}assert.equal(fetches,before);
    upstreamFailure=false;await db.prepare('UPDATE vote_cache SET locked_until=0').run();const recovered=await call('/api/votes',{}, {Authorization:'Bearer '+first.data.token});assert.equal(recovered.data.groups[0].status,'ok');assert.equal(recovered.data.groups[0].message,undefined);assert.equal(recovered.data.groups[0].total,8);
  }finally{upstreamFailure=false;}
});
test('expired snapshots cannot be loaded',async()=>{
  const saved=await call('/api/snapshots/save',{config:defaults()});await db.prepare('UPDATE snapshots SET expires_at=0 WHERE code_hash=?').bind(await sha256(saved.data.code)).run();
  assert.equal((await call('/api/snapshots/load',{code:saved.data.code})).response.status,404);
});
test('production configuration fails closed without rate limit bindings',async()=>{
  const r=await mf.dispatchFetch('https://api.example.test/api/snapshots/save',{method:'POST',headers:{Origin:'https://board.example.test','Content-Type':'application/json'},body:JSON.stringify({config:defaults()})});assert.equal(r.status,503);
});
test('Turnstile failures do not create snapshots; production verification validates action',async()=>{
  const {runtime:prod,database}=await runtime({},true);
  try{
    const h={Origin:'https://board.example.test'};
    assert.equal((await call('/api/snapshots/save',{config:defaults(),turnstile:'bad'},h,prod)).response.status,403);
    assert.equal((await call('/api/snapshots/save',{config:defaults(),turnstile:'valid-load'},h,prod)).response.status,403);
    assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM snapshots').first()).n,0);
    assert.equal((await call('/api/snapshots/save',{config:defaults(),turnstile:'valid-save'},h,prod)).response.status,201);
  }finally{await prod.dispose();}
});
test('per-IP action limiter rejects repeated requests before writes',async()=>{
  const {runtime:prod}=await runtime({},true);
  try{let rejected=0;for(let i=0;i<12;i++){const r=await call('/api/snapshots/load',{code:createCode(),turnstile:'valid-load'},{Origin:'https://board.example.test','CF-Connecting-IP':'198.51.100.4'},prod);if(r.response.status===429)rejected++;}assert.ok(rejected>0);}
  finally{await prod.dispose();}
});
test('daily write guard is atomic under concurrent requests',async()=>{
  const {runtime:limited,database}=await runtime({DAILY_WRITE_BUDGET:'100'});
  try{const today=new Date().toISOString().slice(0,10);await database.prepare('INSERT INTO daily_budget(day,reads,writes,saves) VALUES(?,0,90,0)').bind(today).run();
    const results=await Promise.all(Array.from({length:5},()=>call('/api/snapshots/save',{config:defaults()},{},limited)));assert.ok(results.every(r=>r.response.status===503));assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM snapshots').first()).n,0);
  }finally{await limited.dispose();}
});
test('storage guard rolls back all snapshot chunks and accounting',async()=>{
  const {runtime:limited,database}=await runtime({STORAGE_BUDGET_BYTES:'1048576'});
  try{await database.prepare('UPDATE storage_usage SET bytes=1048570 WHERE id=1').run();const r=await call('/api/snapshots/save',{config:defaults()},{},limited);assert.equal(r.response.status,503);assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM snapshot_chunks').first()).n,0);assert.equal((await database.prepare('SELECT bytes FROM storage_usage WHERE id=1').first()).bytes,1048570);}
  finally{await limited.dispose();}
});
