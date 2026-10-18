import { normalizeConfig, snapshotSize, LIMITS } from '../shared/model.mjs';
import { normalizeSource, fetchVotes, readLimited } from '../shared/sheets.mjs';
const encoder=new TextEncoder();
class HttpError extends Error { constructor(status,message,retry=0){super(message);this.status=status;this.retry=retry;} }
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const unb64=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export async function sha256(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function createCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.getRandomValues(new Uint8Array(15));
  let bits=0,value=0,code='';
  for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;code+=alphabet[(value>>>bits)&31];}}
  return 'LVB-'+code.match(/.{4}/g).join('-');
}
export function normalizeCode(value){
  const compact=String(value||'').toUpperCase().replace(/[\s-]/g,'');
  if(!/^LVB[A-HJ-NP-Z2-9]{24}$/.test(compact))throw new HttpError(400,'代碼格式不正確，請完整貼上 LVB 開頭的設定代碼。');
  return 'LVB-'+compact.slice(3).match(/.{4}/g).join('-');
}
const integer=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Math.floor(Number(value)))):fallback;
function local(request,env){return env.LOCAL_DEVELOPMENT==='true'&&['127.0.0.1','localhost','[::1]'].includes(new URL(request.url).hostname);}
function allowedOrigin(request,env){
  const origin=request.headers.get('Origin');
  if(local(request,env)&&origin&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))return origin;
  return (env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).includes(origin)?origin:null;
}
async function limiter(binding,key,request,env){
  if(!binding){if(local(request,env))return;throw new HttpError(503,'服務尚未完成流量保護設定。');}
  if(!(await binding.limit({key})).success)throw new HttpError(429,'操作稍微頻繁，請等待一分鐘再試。',60);
}
async function budget(env,reads,writes,saves=0){
  const day=new Date().toISOString().slice(0,10);
  const rmax=integer(env.DAILY_READ_BUDGET,1000000,100,2000000),wmax=integer(env.DAILY_WRITE_BUDGET,40000,100,60000),smax=integer(env.DAILY_NEW_ACTIONS,150,1,300);
  const used=await env.DB.prepare('INSERT INTO daily_budget(day,reads,writes,saves) SELECT ?,?,?,? WHERE ?<=? AND ?<=? AND ?<=? ON CONFLICT(day) DO UPDATE SET reads=reads+excluded.reads,writes=writes+excluded.writes,saves=saves+excluded.saves WHERE reads+excluded.reads<=? AND writes+excluded.writes<=? AND saves+excluded.saves<=? RETURNING day').bind(day,reads,writes,saves,reads,rmax,writes,wmax,saves,smax,rmax,wmax,smax).first();
  if(!used)throw new HttpError(503,'今天的免費服務保護額度已達上限。已載入的看板仍可顯示；請稍後再試。',3600);
}
async function body(request,max=12000){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'請使用 JSON 格式。');
  try{return JSON.parse(await readLimited(request,max));}catch(e){throw new HttpError(400,e.message.includes('大小')?'上傳資料超過容量限制。':'資料格式不正確。');}
}
async function challenge(request,env,token,action){
  if(local(request,env))return;
  if(!env.TURNSTILE_SECRET_KEY)throw new HttpError(503,'網站尚未完成驗證服務設定。');
  if(typeof token!=='string'||token.length>2048)throw new HttpError(403,'請先完成安全驗證。');
  let result;
  try{
    const reply=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:request.headers.get('CF-Connecting-IP')||undefined}),signal:AbortSignal.timeout(5000)});
    result=await reply.json();
  }catch {throw new HttpError(503,'驗證服務暫時無法連線，請再試一次。',60);}
  const hosts=(env.TURNSTILE_HOSTNAMES||'').split(',').map(x=>x.trim());
  if(!result.success||result.action!==action||!hosts.includes(result.hostname))throw new HttpError(403,'安全驗證未通過或已過期，請重新驗證。');
}
async function hmacKey(env){
  if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw new HttpError(503,'網站尚未設定安全金鑰。');
  return crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function signSession(sources,env){
  const payload={v:1,exp:Date.now()+24*60*60*1000,id:crypto.randomUUID(),sources};
  const encoded=b64(encoder.encode(JSON.stringify(payload)));
  return encoded+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(env),encoder.encode(encoded))));
}
async function readSession(request,env){
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  if(token.length>8000)throw new HttpError(401,'連線已失效，請重新連接票源。');
  try{
    const [data,sig,...extra]=token.split('.');
    if(!data||!sig||extra.length)throw new Error();
    if(!await crypto.subtle.verify('HMAC',await hmacKey(env),unb64(sig),encoder.encode(data)))throw new Error();
    const payload=JSON.parse(new TextDecoder().decode(unb64(data)));
    if(payload.v!==1||!Array.isArray(payload.sources)||payload.exp<Date.now())throw new Error();
    return payload;
  }catch{throw new HttpError(401,'連線已失效，請重新連接票源。');}
}
async function cachedVotes(source,env){
  if(!source)return {status:'unconfigured',counts:null};
  const key=await sha256(JSON.stringify(source)),now=Date.now(),refresh=integer(env.MIN_REFRESH_SECONDS,15,15,300)*1000;
  const cached=await env.DB.prepare('SELECT content,fetched_at,locked_until FROM vote_cache WHERE key=?').bind(key).first();
  const old=cached?.content?JSON.parse(cached.content):null;
  if(cached&&now-cached.fetched_at<refresh)return {...old,status:'ok',cached:true};
  if(cached?.locked_until>now)return old?{...old,status:'stale',message:'正在更新，暫時保留上次票數。'}:{status:'waiting',counts:null,message:'正在取得票數，稍後自動重試。'};
  const lock=now+10000;
  const acquired=await env.DB.prepare("INSERT INTO vote_cache(key,content,fetched_at,locked_until) VALUES(?,'',0,?) ON CONFLICT(key) DO UPDATE SET locked_until=excluded.locked_until WHERE locked_until<=? RETURNING key").bind(key,lock,now).first();
  if(!acquired)return old?{...old,status:'stale',message:'正在更新。'}:{status:'waiting',counts:null};
  try{
    const result={...await fetchVotes(source),updatedAt:Date.now()};
    await env.DB.prepare('UPDATE vote_cache SET content=?,fetched_at=?,locked_until=0 WHERE key=? AND locked_until=?').bind(JSON.stringify(result),result.updatedAt,key,lock).run();
    return {...result,status:'ok',cached:false};
  }catch(e){
    await env.DB.prepare('UPDATE vote_cache SET locked_until=? WHERE key=? AND locked_until=?').bind(Date.now()+60000,key,lock).run();
    return {...(old||{counts:null}),status:old?'stale':'error',message:e.name==='TimeoutError'?'Google 回應逾時，保留上次資料。':e.message};
  }
}
async function votes(sources,env){
  // Sequential fetches bound memory and D1 query count for the Free plan.
  const results=[];for(const source of sources)results.push(await cachedVotes(source,env));
  return results;
}
async function route(request,env){
  const url=new URL(request.url),path=url.pathname,ip=request.headers.get('CF-Connecting-IP')||'local';
  await limiter(env.IP_LIMITER,ip,request,env);
  if(path==='/api/health'&&request.method==='GET')return json({ok:true,version:1,minRefresh:15});
  if(request.method!=='POST')throw new HttpError(405,'不支援此操作。');
  if(!env.DB)throw new HttpError(503,'資料庫尚未設定。');
  if(path==='/api/votes'){
    const session=await readSession(request,env);
    await limiter(env.SESSION_LIMITER,session.id,request,env);
    await budget(env,30,14);
    return json({groups:await votes(session.sources,env),nextPoll:integer(env.MIN_REFRESH_SECONDS,15,15,300)});
  }
  if(!['/api/session','/api/snapshots/save','/api/snapshots/load','/api/snapshots/delete'].includes(path))throw new HttpError(404,'找不到這個功能。');
  await limiter(env.ACTION_LIMITER,ip,request,env);
  const data=await body(request,path.endsWith('/save')?6*1024*1024:12000);
  const action=path.split('/').at(-1);
  await challenge(request,env,data.turnstile,action);
  if(path==='/api/session'){
    if(!Array.isArray(data.sources)||!data.sources.length||data.sources.length>2)throw new HttpError(400,'請提供一組或兩組票源。');
    const sources=data.sources.map(s=>s?.url?normalizeSource(s):null);
    if(!sources.some(Boolean))throw new HttpError(400,'請至少設定一組 Google 試算表票源。');
    await budget(env,40,20,1);
    const token=await signSession(sources,env);
    return json({token,groups:await votes(sources,env),expiresAt:Date.now()+86400000});
  }
  if(path==='/api/snapshots/save'){
    const config=normalizeConfig(data.config),size=snapshotSize(config);
    if(size>LIMITS.snapshotBytes)throw new HttpError(413,'整份設定含圖片最多 4 MB，請減少圖片或降低尺寸。');
    const serialized=JSON.stringify(config),parts=[];
    for(let i=0;i<serialized.length;i+=120000)parts.push(serialized.slice(i,i+120000));
    await budget(env,80,parts.length*2+15,1);
    const code=createCode(),hash=await sha256(code),now=Date.now(),expires=now+integer(env.SNAPSHOT_DAYS,180,7,365)*86400000,maxBytes=integer(env.STORAGE_BUDGET_BYTES,188743680,1048576,188743680);
    const statements=[env.DB.prepare('INSERT INTO snapshots(code_hash,created_at,expires_at,byte_size,chunks) SELECT ?,?,?,?,? WHERE (SELECT bytes FROM storage_usage WHERE id=1)+?<=?').bind(hash,now,expires,size,parts.length,size,maxBytes),...parts.map((part,i)=>env.DB.prepare('INSERT INTO snapshot_chunks(code_hash,part,content) VALUES(?,?,?)').bind(hash,i,part))];
    try{await env.DB.batch(statements);}catch{throw new HttpError(503,'雲端儲存空間暫時不足，設定仍保留在這台電腦。請稍後再試。',3600);}
    return json({code,expiresAt:expires,bytes:size},201);
  }
  const code=normalizeCode(data.code),hash=await sha256(code);
  await budget(env,80,action==='delete'?100:3);
  const info=await env.DB.prepare('SELECT expires_at,chunks FROM snapshots WHERE code_hash=?').bind(hash).first();
  if(!info||info.expires_at<Date.now())throw new HttpError(404,'找不到這組代碼，可能輸入有誤、已刪除或已過期。');
  if(action==='delete'){
    await env.DB.prepare('DELETE FROM snapshots WHERE code_hash=?').bind(hash).run();
    return json({deleted:true});
  }
  const rows=await env.DB.prepare('SELECT content FROM snapshot_chunks WHERE code_hash=? ORDER BY part').bind(hash).all();
  if(rows.results.length!==info.chunks)throw new HttpError(503,'設定資料不完整，請稍後重試。');
  const config=normalizeConfig(JSON.parse(rows.results.map(x=>x.content).join('')));
  return json({config,expiresAt:info.expires_at});
}
export default {
  async fetch(request,env){
    const origin=allowedOrigin(request,env);
    if(!origin)return json({error:'此網站來源未獲授權。'},403);
    const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'86400'};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    let response;
    try{response=await route(request,env);}
    catch(e){
      const status=e instanceof HttpError?e.status:(e.message?.includes('D1')?503:400);
      response=json({error:e instanceof HttpError||status===400?e.message:'服務暫時忙碌，已保留上次成功資料。',retryAfter:e.retry||0},status);
      if(e.retry)response.headers.set('Retry-After',String(e.retry));
    }
    for(const [key,value]of Object.entries(cors))response.headers.set(key,value);
    return response;
  },
  async scheduled(event,env,ctx){
    ctx.waitUntil((async()=>{
      await budget(env,10000,10000);
      await env.DB.prepare('DELETE FROM snapshots WHERE code_hash IN (SELECT code_hash FROM snapshots WHERE expires_at<? ORDER BY expires_at LIMIT 40)').bind(Date.now()).run();
      await env.DB.prepare('DELETE FROM vote_cache WHERE key IN (SELECT key FROM vote_cache WHERE fetched_at<? ORDER BY fetched_at LIMIT 500)').bind(Date.now()-86400000).run();
      await env.DB.prepare('DELETE FROM daily_budget WHERE day<?').bind(new Date(Date.now()-7*86400000).toISOString().slice(0,10)).run();
    })());
  }
};
