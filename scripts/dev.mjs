import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build,root} from './build.mjs';
import {randomBytes} from 'node:crypto';
import {build as bundle} from 'esbuild';
const fixtures=process.argv.includes('--fixtures'),port=Number(process.env.PORT||4173),apiPort=Number(process.env.API_PORT||8787);
await build({local:true,apiBase:'http://127.0.0.1:'+apiPort});
const bundled=await bundle({entryPoints:[join(root,'worker/index.mjs')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const mf=new Miniflare(convertV4MiniflareOptions({script:bundled.outputFiles[0].text,modules:true,compatibilityDate:'2026-09-01',host:'127.0.0.1',port:apiPort,
  d1Databases:{DB:'local-vote-board'},d1Persist:fixtures?false:join(root,'.wrangler','local-d1'),
  bindings:{LOCAL_DEVELOPMENT:'true',SESSION_SECRET:randomBytes(48).toString('hex'),DAILY_READ_BUDGET:'1000000',DAILY_WRITE_BUDGET:'40000',MIN_REFRESH_SECONDS:'15'},
  ...(fixtures?{outboundService:request=>new Response(request.url.includes('TEST_FIXTURE_SHEET')?'作品名稱,票數\n晨光,8\n山嶼,5\n微風,5\n夜色,0\n':request.url.includes('TEST_RESPONSE_SHEET')?'時間,選項\n2026-10-09,晨光\n2026-10-09,山嶼\n2026-10-09,晨光\n':'fixture not found',{status:request.url.includes('TEST_')?200:404,headers:{'Content-Type':'text/csv'}})}:{}),
}));
await mf.ready;const db=await mf.getD1Database('DB');await db.exec((await readFile(join(root,'migrations/0001_initial.sql'),'utf8')).replace(/\r?\n/g,' '));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml','.txt':'text/plain'};
const server=createServer(async(req,res)=>{
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),base=join(root,'dist'),file=resolve(base,'.'+pathname);if(!file.startsWith(base+sep)&&file!==base)throw new Error('outside');
    let path=file;try{if((await stat(path)).isDirectory())path=join(path,'index.html');}catch{res.writeHead(404,{'Content-Type':'text/html'});res.end(await readFile(join(base,'404.html')));return;}
    const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port+'\nAPI: http://127.0.0.1:'+apiPort+(fixtures?'\nFIXTURE MODE: deterministic test data, not live Google responses.':'')));
const stop=async()=>{server.close();await mf.dispose();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
process.stdin.on('data',value=>{if(String(value).trim()==='shutdown')stop();});
