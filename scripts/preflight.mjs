import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {root} from './build.mjs';
let config;
try{config=JSON.parse(await readFile(join(root,'wrangler.jsonc'),'utf8'));}catch{throw new Error('請先複製 wrangler.example.jsonc 為 wrangler.jsonc，依部署指南填入正式設定（保留 JSON 格式）。');}
const bad=/(YOUR-|REPLACE|localhost|127\.0\.0\.1|example\.(com|test))/i;
if(!config.d1_databases?.some(d=>d.binding==='DB'&&/^[0-9a-f-]{36}$/i.test(d.database_id)))throw new Error('尚未設定有效的 D1 database_id。');
if(config.vars?.LOCAL_DEVELOPMENT)throw new Error('正式 Worker 不可設定 LOCAL_DEVELOPMENT。');
for(const field of ['ALLOWED_ORIGINS','TURNSTILE_HOSTNAMES'])if(!config.vars?.[field]||bad.test(config.vars[field]))throw new Error(field+' 必須填正式網域。');
for(const origin of config.vars.ALLOWED_ORIGINS.split(',')){const u=new URL(origin.trim());if(u.protocol!=='https:'||u.origin!==origin.trim())throw new Error('ALLOWED_ORIGINS 請只填完整 HTTPS origin，不含路徑。');}
for(const name of ['IP_LIMITER','ACTION_LIMITER','SESSION_LIMITER'])if(!config.ratelimits?.some(x=>x.name===name&&x.simple?.limit>0))throw new Error('缺少流量限制 binding: '+name);
if(!config.triggers?.crons?.length)throw new Error('請保留到期資料清理排程。');
console.log('Deployment configuration checks passed. Ensure SESSION_SECRET and TURNSTILE_SECRET_KEY have been set with wrangler secret put.');
