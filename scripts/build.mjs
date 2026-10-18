import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export async function build({local=false,apiBase,turnstileSiteKey,siteUrl}={}){
  const config=JSON.parse(await readFile(join(root,'site.config.json'),'utf8'));
  let localConfig={};try{localConfig=JSON.parse(await readFile(join(root,'site.local.json'),'utf8'));}catch{}
  Object.assign(config,localConfig);
  config.apiBase=apiBase??process.env.API_BASE??config.apiBase;
  config.siteUrl=siteUrl??process.env.SITE_URL??config.siteUrl;
  config.turnstileSiteKey=turnstileSiteKey??process.env.TURNSTILE_SITE_KEY??config.turnstileSiteKey;
  if(config.siteUrl){const u=new URL(config.siteUrl);if(u.protocol!=='https:'||u.search||u.hash||u.username||u.password)throw new Error('SITE_URL 必須是正式 HTTPS 網址，且不含 query/hash 或登入資訊。');config.siteUrl=u.href.replace(/\/?$/,'/');}
  if(config.apiBase){const u=new URL(config.apiBase);if(u.protocol!=='https:'&&!(local&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw new Error('API_BASE 必須使用 HTTPS。');if(u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw new Error('API_BASE 請填 Worker 網域，不要加 /api 或登入資訊。');}
  if(process.env.REQUIRE_DEPLOY_CONFIG==='1'&&(!config.siteUrl||!config.apiBase||!config.turnstileSiteKey||local))throw new Error('正式部署需要 SITE_URL、API_BASE、TURNSTILE_SITE_KEY，且不可使用本機開發模式。');
  const out=join(root,'dist');await mkdir(out,{recursive:true});
  // Delete only generated output whose absolute path is fixed inside this checkout.
  await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
  await cp(join(root,'public'),out,{recursive:true});await cp(join(root,'shared'),join(out,'shared'),{recursive:true});
  await writeFile(join(out,'assets','config.mjs'),'export const site='+JSON.stringify({...config,localDevelopment:local}).replaceAll('<','\\u003c')+';\n');
  const pages=[
    {id:'home',path:'',title:config.name+'｜免費 Google 表單即時投票看板',description:'Google 表單投票開好了，卻缺少即時呈現票數的介面？免費串接票數工作表，自訂作品圖片、Logo、背景與配色，支援單組、雙組上下排列及代碼跨電腦載入。',script:'home',index:true},
    {id:'guide',path:'guide/',title:'Google 表單即時投票看板教學｜'+config.name,description:'從 Google 表單回應連結試算表、發布彙總票數，到上傳作品圖片、設定即時更新與開啟全螢幕投影的完整教學。',index:true},
    {id:'privacy',path:'privacy/',title:'資料與隱私說明｜'+config.name,description:'了解看板圖片、Google 試算表票源、私人設定代碼和本機草稿的儲存方式、保存期限及刪除方法。',index:true},
    {id:'terms',path:'terms/',title:'免費服務使用說明｜'+config.name,description:'即時投票看板的免費功能、合理使用限制、票數更新延遲與活動前檢查。',index:true},
    {id:'studio',path:'studio/',title:'看板編輯器｜'+config.name,description:'自訂你的單組或雙組即時投票看板。',script:'studio',className:'studio-body'},
    {id:'display',path:'display/',title:'現場投影｜'+config.name,description:'現場即時投票投影畫面。',script:'display',className:'display-body'},
    {id:'404',path:'404.html',title:'找不到頁面｜'+config.name,description:'請回到首頁重新開始。'},
  ];
  for(const page of pages){
    const prefix=page.id==='404'?(config.siteUrl?new URL(config.siteUrl).pathname:'/'):page.path.endsWith('/')?'../':'./',canonical=config.siteUrl?new URL(page.path,config.siteUrl).href:'',indexable=page.index&&!!config.siteUrl;
    let body=await readFile(join(root,'content','zh-Hant',page.id+'.html'),'utf8');
    body=body.replaceAll('{{NAME}}',escape(config.name)).replaceAll('{{ROOT}}',escape(config.siteUrl||'/'));
    const brand='<a class="brand" href="'+prefix+'"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>'+escape(config.name)+'</a>';
    const navigation='<header class="site-header wrap">'+brand+'<nav aria-label="主要導覽"><a href="'+prefix+'#how">如何使用</a><a href="'+prefix+'guide/">串接教學</a><a href="'+prefix+'#faq">常見問題</a><a class="button primary" href="'+prefix+'studio/">免費開始 ↗</a></nav></header>';
    const footer='<footer class="site-footer wrap"><span>© '+new Date().getFullYear()+' '+escape(config.name)+' · 讓每一票，都有畫面。</span><nav class="footer-links" aria-label="網站資訊"><a href="'+prefix+'guide/">使用教學</a><a href="'+prefix+'privacy/">隱私說明</a><a href="'+prefix+'terms/">使用說明</a><span lang="zh-Hant">繁體中文</span></nav></footer>';
    const schema=page.id==='home'?{'@context':'https://schema.org','@type':'WebApplication',name:config.name,applicationCategory:'UtilitiesApplication',operatingSystem:'Web',inLanguage:'zh-Hant',description:page.description,offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},...(canonical?{url:canonical}:{})}:null;
    const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#226653"><meta name="robots" content="'+(indexable?'index,follow':'noindex,nofollow')+'"><title>'+escape(page.title)+'</title><meta name="description" content="'+escape(page.description)+'">'+(canonical?'<link rel="canonical" href="'+escape(canonical)+'">':'')+'<meta property="og:type" content="website"><meta property="og:locale" content="zh_TW"><meta property="og:site_name" content="'+escape(config.name)+'"><meta property="og:title" content="'+escape(page.title)+'"><meta property="og:description" content="'+escape(page.description)+'">'+(canonical?'<meta property="og:url" content="'+escape(canonical)+'"><meta property="og:image" content="'+config.siteUrl+'assets/social.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">':'')+'<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="'+prefix+'assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="'+prefix+'assets/site.css">'+(page.id==='studio'?'<link rel="stylesheet" href="../assets/studio.css">':'')+(schema?'<script type="application/ld+json">'+JSON.stringify(schema).replaceAll('<','\\u003c')+'</script>':'');
    const special=['studio','display'].includes(page.id);
    const policy="default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://challenges.cloudflare.com "+(config.apiBase?new URL(config.apiBase).origin:'')+"; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'none'";
    const html='<!doctype html>\n<html lang="zh-Hant"><head>'+head+'<meta http-equiv="Content-Security-Policy" content="'+escape(policy)+'"></head><body'+(page.className?' class="'+page.className+'"':'')+'><a class="skip" href="#main">跳到主要內容</a>'+(special?'':navigation)+body+(special?'':footer)+(page.script?'<script type="module" src="'+prefix+'assets/'+page.script+'.mjs"></script>':'')+'</body></html>\n';
    const dest=page.path.endsWith('/')?join(out,page.path,'index.html'):join(out,page.path||'index.html');await mkdir(dirname(dest),{recursive:true});await writeFile(dest,html);
  }
  const sitemap=config.siteUrl?'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+pages.filter(p=>p.index).map(p=>'<url><loc>'+new URL(p.path,config.siteUrl).href+'</loc></url>').join('')+'</urlset>':'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>';
  await writeFile(join(out,'sitemap.xml'),sitemap);
  await writeFile(join(out,'robots.txt'),config.siteUrl?'User-agent: *\nAllow: /\nSitemap: '+config.siteUrl+'sitemap.xml\n':'User-agent: *\nDisallow: /\n');
  await writeFile(join(out,'.nojekyll'),'');
  if(config.siteUrl&&!new URL(config.siteUrl).hostname.endsWith('.github.io'))await writeFile(join(out,'CNAME'),new URL(config.siteUrl).hostname+'\n');
  return {out,pages:pages.length,config};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await build(),null,2));
