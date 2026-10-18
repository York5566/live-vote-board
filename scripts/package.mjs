import {readFile,writeFile,readdir,mkdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {root,build} from './build.mjs';

// Only this explicit source list is distributed. Never collect the entire checkout.
const folders=['public','content','shared','worker','migrations','scripts','tests','docs','.github','dist'];
const singles=['README.md','package.json','package-lock.json','site.config.json','wrangler.example.jsonc','.gitignore'];
const proof=['browser-report.json','release-report.json','home-desktop.png','home-mobile.png','studio-customized.png','studio-mobile.png','projection-release.png'];
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Unexpected release version');
await build({local:false,siteUrl:'',apiBase:'',turnstileSiteKey:''});
execFileSync(process.execPath,['scripts/check.mjs'],{cwd:root,stdio:'inherit',windowsHide:true});
const entries=[];
async function add(path,name=path){
  const full=join(root,path),info=await lstat(full);
  if(info.isSymbolicLink())throw new Error('Do not package symbolic links: '+path);
  if(info.isDirectory()){
    for(const child of (await readdir(full)).sort())await add(path+'/'+child,name+'/'+child);
  }else if(info.isFile())entries.push({name:'LiveVoteBoard/'+name,data:await readFile(full)});
}
for(const folder of folders)await add(folder);
for(const file of singles)await add(file);
for(const file of proof)await add('artifacts/'+file,'verification/'+file);
for(const report of ['browser-report.json','release-report.json']){
  const result=JSON.parse(await readFile(join(root,'artifacts',report),'utf8'));
  if(result.status!=='PASS')throw new Error('Cannot package a failing verification report: '+report);
}
const forbidden=/(^|\/)(node_modules|\.wrangler|\.env[^/]*|\.dev\.vars|site\.local\.json|wrangler\.jsonc|delivery)(\/|$)/;
if(entries.some(e=>forbidden.test(e.name)))throw new Error('Unexpected private/runtime file in release');
const manifest={version,algorithm:'SHA-256',files:entries.map(e=>({path:e.name.slice('LiveVoteBoard/'.length),bytes:e.data.length,sha256:createHash('sha256').update(e.data).digest('hex')}))};
entries.push({name:'LiveVoteBoard/manifest.json',data:Buffer.from(JSON.stringify(manifest,null,2)+'\n')});
entries.sort((a,b)=>a.name.localeCompare(b.name));

// Standard ZIP with DEFLATE, UTF-8 names and CRC32, without platform-specific tools.
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(buffer){let c=0xffffffff;for(const byte of buffer)c=table[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
const local=[],central=[];let offset=0;
for(const entry of entries){
  const name=Buffer.from(entry.name),data=deflateRawSync(entry.data,{level:9}),crc=crc32(entry.data);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(entry.data.length,22);header.writeUInt16LE(name.length,26);
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(33,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(entry.data.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);
  local.push(header,name,data);central.push(directory,name);offset+=header.length+name.length+data.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...local,directory,end]),dir=join(root,'delivery');
await mkdir(dir,{recursive:true});
const filename='LiveVoteBoard-'+version+'.zip';
await writeFile(join(dir,filename),archive);
await writeFile(join(dir,filename+'.sha256'),createHash('sha256').update(archive).digest('hex')+'  '+filename+'\n');
console.log(JSON.stringify({archive:join(dir,filename),files:entries.length,bytes:archive.length,sha256:createHash('sha256').update(archive).digest('hex')},null,2));
