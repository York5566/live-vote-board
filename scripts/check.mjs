import {readFile,readdir,stat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {root} from './build.mjs';
const out=join(root,'dist');let links=0;
async function files(dir){const found=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())found.push(...await files(path));else found.push(path);}return found;}
const all=await files(out),pages=all.filter(p=>p.endsWith('.html')),config=JSON.parse((await readFile(join(out,'assets/config.mjs'),'utf8')).replace(/^export const site=/,'').replace(/;\s*$/,''));
assert.equal(pages.length,7);
for(const path of pages){
  const html=await readFile(path,'utf8');assert.match(html,/<html lang="zh-Hant">/);assert.match(html,/<title>[^<]+<\/title>/);assert.match(html,/<meta name="description"/);assert.ok(!html.includes('{{'));
  assert.match(html,/<h1[\s>]/);
  if(path.includes('studio')||path.includes('display'))assert.match(html,/noindex,nofollow/);
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
    const url=match[1].split(/[?#]/)[0];if(!url||/^(https?:|data:)/.test(url))continue;
    const basePath=config.siteUrl?new URL(config.siteUrl).pathname:'/';
    if(url.startsWith('/')&&!url.startsWith(basePath))throw new Error('Link outside site base path: '+url);
    let target=url.startsWith('/')?resolve(out,url.slice(basePath.length)):resolve(dirname(path),url);if(!target.startsWith(out))throw new Error('Path outside site: '+url);
    const s=await stat(target);if(s.isDirectory())target=join(target,'index.html');await stat(target);links++;
  }
  for(const schema of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)){const parsed=JSON.parse(schema[1]);assert.equal(parsed['@type'],'WebApplication');assert.equal(parsed.offers.price,'0');assert.equal(parsed.aggregateRating,undefined);}
  assert.doesNotMatch(html,/結算投票|左右排列|guaranteed|100% uptime/);
}
for(const path of all.filter(x=>x.endsWith('.mjs'))){const js=await readFile(path,'utf8');for(const m of js.matchAll(/from\s+['"](\.[^'"]+)['"]/g)){await stat(resolve(dirname(path),m[1]));links++;}}
const sitemap=await readFile(join(out,'sitemap.xml'),'utf8');assert.ok(!sitemap.includes('/studio/')&&!sitemap.includes('/display/'));
if(config.siteUrl){assert.ok(sitemap.includes(config.siteUrl));assert.match(await readFile(join(out,'index.html'),'utf8'),/index,follow/);}else assert.match(await readFile(join(out,'robots.txt'),'utf8'),/Disallow: \//);
assert.ok(all.every(p=>!p.endsWith('.map')&&!p.includes('node_modules')));
console.log(JSON.stringify({status:'PASS',pages:pages.length,files:all.length,localLinksAndImports:links,canonicalConfigured:!!config.siteUrl,localDevelopment:config.localDevelopment},null,2));
