import {DEMO_SHEET,extraCardDefaults,normalizeCardExtras,normalizeDesign,candidateLayout} from './design.mjs';
export const LIMITS = Object.freeze({ candidates: 20, imageBytes: 150 * 1024, snapshotBytes: 4 * 1024 * 1024, sourceBytes: 1024 * 1024, minRefresh: 15, maxRows: 10000 });
export const TEXT_PARTS = {
  name: ['作品名稱', 24, '#ffffff'], caption: ['目前票數', 11, '#b6cdd4'],
  number: ['票數數字', 42, '#ffffff'], unit: ['「票」字', 13, '#b6cdd4'],
  share: ['占總票數百分比', 11, '#b6cdd4'],
};
const text = (size, color, x=0, y=0) => ({ size, color, x, y, opacity:100 });
export function candidate(answer='新作品', i=0) {
  return { id:crypto.randomUUID(), answer, label:answer, author:'', image:'', demoImage:i % 5, zoom:1, x:0, y:0, rotation:0, opacity:100, fit:'contain',design:{},layout:candidateLayout(),isSourceHeader:false };
}
export function group(name='A 組', i=0) {
  return {
    name, columns:5, layout:'auto',sort:true, source:{ url:DEMO_SHEET, sheetName:'', mode:'responses', nameColumn:i?'D':'C', countColumn:'B', header:true, multiple:false, separator:', ' },
    heading:{...text(25,'#f3fbfa',0,50)}, total:{...text(28,'#ffffff',100,50), caption:'目前總票數',captionX:0,captionY:0,numberX:0,numberY:0,captionColor:'#d0e5e7', captionSize:10, background:'#ffffff', backgroundOpacity:9, width:110, height:52},
    card:{ ...extraCardDefaults(),color:'#193f50', opacity:100, radius:15, imageRatio:16/9, texts:Object.fromEntries(Object.entries(TEXT_PARTS).map(([k,v])=>[k,text(v[1],v[2])])), barStart:i?'#3ab8aa':'#ed6ea4', barEnd:i?'#8ddbc5':'#ffbb83', barTrack:'#ffffff', barTrackOpacity:12, rankColor:'#193f50', rankBg:'#ffffff', firstColor:'#413613', firstBg:'#f9d876', rankSize:11, rankPaddingX:10, rankPaddingY:5 },
    candidates:Array.from({length:5},(_,j)=>({...candidate((i?'B':'A')+'組作品'+(j+1),j),label:'作品 '+(j+1)})),
  };
}
export function defaults() {
  return { version:1, mode:'dual', title:'每一票，都值得被看見。', subtitle:'現場人氣投票 · 為你喜歡的作品加油', refresh:30, sound:false,
    appearance:{ background:'#276773', image:'', zoom:1, x:0, y:0, rotation:0, opacity:100, maskColor:'#000000', maskOpacity:0, headerHeight:125, gap:20,
      title:{...text(46,'#ffffff',0,10)}, subtitle:{...text(19,'#c3dfe0',0,83)},
      logo:{image:'',x:0,y:0,width:180,height:90,zoom:1,rotation:0,opacity:100,roundness:0} },
    groups:[group('A 組｜創意作品',0),group('B 組｜人氣提案',1)] };
}
export const copy = value => structuredClone(value);
export const activeGroups = config => config.groups.slice(0,config.mode==='single'?1:2);
export const num = (v,min,max,fallback) => Number.isFinite(Number(v)) ? Math.max(min,Math.min(max,Number(v))) : fallback;
export const color = (v, fallback) => /^#[0-9a-f]{6}$/i.test(v||'') ? v : fallback;
const str=(v,n=200)=>typeof v==='string'?v.slice(0,n):'';
function visual(v={}, fallback, minSize=1, maxSize=120, positions=[-200,200]) {
  return {color:color(v.color,fallback.color),size:num(v.size,minSize,maxSize,fallback.size),x:num(v.x,...positions,fallback.x),y:num(v.y,...positions,fallback.y),opacity:num(v.opacity,0,100,100)};
}
export function cleanImage(v) {
  if (!v) return '';
  if (typeof v!=='string' || !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(v)) throw new Error('圖片格式不支援，請重新上傳 JPG、PNG 或 WebP。');
  if(v.length>Math.ceil(LIMITS.imageBytes*4/3)+80) throw new Error('壓縮後的圖片超過 150 KB，請降低圖片尺寸。');
  return v;
}
export function normalizeConfig(raw) {
  if(!raw || typeof raw!=='object' || raw.version!==1) throw new Error('設定版本不相容，請更新網頁後再試。');
  const base=defaults(), a=raw.appearance||{}, b=base.appearance;
  const result={version:1,mode:raw.mode==='single'?'single':'dual',title:str(raw.title,120),subtitle:str(raw.subtitle,240),refresh:num(raw.refresh,15,300,30),sound:raw.sound===true,
    appearance:{ background:color(a.background,b.background), image:cleanImage(a.image), zoom:num(a.zoom,.1,5,1),x:num(a.x,-100,100,0),y:num(a.y,-100,100,0),rotation:num(a.rotation,-180,180,0),opacity:num(a.opacity,0,100,100), maskColor:color(a.maskColor,'#000000'),maskOpacity:num(a.maskOpacity,0,100,0),headerHeight:num(a.headerHeight,60,260,125),gap:num(a.gap,4,60,20),title:visual(a.title,b.title,8,120,[0,100]),subtitle:visual(a.subtitle,b.subtitle,6,70,[0,100]),logo:{image:cleanImage(a.logo?.image),x:num(a.logo?.x,0,100,0),y:num(a.logo?.y,0,100,0),width:num(a.logo?.width,20,500,180),height:num(a.logo?.height,20,240,90),zoom:num(a.logo?.zoom,.1,5,1),rotation:num(a.logo?.rotation,-180,180,0),opacity:num(a.logo?.opacity,0,100,100),roundness:num(a.logo?.roundness,0,100,0)}},
    groups:[0,1].map((i)=>{
      const g=raw.groups?.[i]||base.groups[i], d=base.groups[i], c=g.card||{}, s=g.source||{};
      if(!Array.isArray(g.candidates)||g.candidates.length>LIMITS.candidates) throw new Error('每組最多可放 20 個候選作品。');
      const seen=new Set();
      const candidates=g.candidates.map((v,j)=>{
        const answer=str(v.answer,120).trim();
        if(!answer || seen.has(answer)) throw new Error('同一組的投票選項不可空白或重複。');
        seen.add(answer);
        return {...candidate(answer,j),design:normalizeDesign(v.design,{...d.card,...normalizeCardExtras(c)}),layout:candidateLayout(v.layout),isSourceHeader:v.isSourceHeader===true,id:/^[\w-]{1,64}$/.test(v.id||'')?v.id:crypto.randomUUID(),label:str(v.label,120)||answer,author:str(v.author,100),image:cleanImage(v.image),demoImage:num(v.demoImage,0,4,j%5),zoom:num(v.zoom,.1,5,1),x:num(v.x,-100,100,0),y:num(v.y,-100,100,0),rotation:num(v.rotation,-180,180,0),opacity:num(v.opacity,0,100,100),fit:v.fit==='cover'?'cover':'contain'};
      });
      return { name:str(g.name,100),layout:g.layout==='manual'||(!g.layout&&g.columns!=null&&Number(g.columns)!==5)?'manual':'auto',columns:num(g.columns,1,10,5),sort:g.sort!==false, source:{url:str(s.url,1000).trim(),sheetName:str(s.sheetName,100),mode:s.mode==='summary'?'summary':'responses',nameColumn:str(s.nameColumn||'A',3).toUpperCase(),countColumn:str(s.countColumn||'B',3).toUpperCase(),header:s.header!==false,multiple:s.multiple===true,separator:str(s.separator||', ',8)},heading:visual(g.heading,d.heading,8,100,[0,100]),total:{...visual(g.total,d.total,8,100,[0,100]),caption:typeof g.total?.caption==='string'?g.total.caption.slice(0,100):'目前總票數',captionX:num(g.total?.captionX,-200,200,0),captionY:num(g.total?.captionY,-200,200,0),numberX:num(g.total?.numberX,-200,200,0),numberY:num(g.total?.numberY,-200,200,0),captionColor:color(g.total?.captionColor,d.total.captionColor),captionSize:num(g.total?.captionSize,6,40,10),background:color(g.total?.background,'#ffffff'),backgroundOpacity:num(g.total?.backgroundOpacity,0,100,9),width:num(g.total?.width,60,400,110),height:num(g.total?.height,30,150,52)},
        card:{...normalizeCardExtras(c),color:color(c.color,d.card.color),opacity:num(c.opacity,0,100,100),radius:num(c.radius,0,40,15),imageRatio:num(c.imageRatio,.5,3,16/9),texts:Object.fromEntries(Object.entries(d.card.texts).map(([k,v])=>[k,visual(c.texts?.[k],v)])),barStart:color(c.barStart,d.card.barStart),barEnd:color(c.barEnd,d.card.barEnd),barTrack:color(c.barTrack,'#ffffff'),barTrackOpacity:num(c.barTrackOpacity,0,100,12),rankColor:color(c.rankColor,d.card.rankColor),rankBg:color(c.rankBg,d.card.rankBg),firstColor:color(c.firstColor,d.card.firstColor),firstBg:color(c.firstBg,d.card.firstBg),rankSize:num(c.rankSize,6,40,11),rankPaddingX:num(c.rankPaddingX,0,30,10),rankPaddingY:num(c.rankPaddingY,0,20,5)},candidates};
    })};
  return result;
}
export function rankCandidates(candidates,counts={},sort=true) {
  const rows=candidates.map((v,i)=>({...v,votes:Math.max(0,Number(counts[v.answer])||0),original:i}));
  const ordered=[...rows].sort((a,b)=>b.votes-a.votes||a.original-b.original);
  let prior=null,rank=0;
  const ranks=new Map(ordered.map((v,i)=>{if(v.votes!==prior)rank=i+1;prior=v.votes;return[v.id,rank];}));
  return (sort?ordered:rows).map(v=>({...v,rank:ranks.get(v.id)}));
}
export function mergeCandidates(current, counts) {
  const known=new Set(current.map(v=>v.answer));
  const additions=Object.keys(counts).filter(x=>!known.has(x));
  if(current.length+additions.length>LIMITS.candidates) throw new Error('讀取到超過 20 個選項，請確認選項欄位或移除不用的候選作品。');
  return [...current,...additions.map((name,i)=>candidate(name,i))];
}
export function snapshotSize(config) { return new TextEncoder().encode(JSON.stringify(config)).length; }
export function setPath(obj,path,value) { const keys=path.split('.');const last=keys.pop();let target=obj;for(const k of keys){if(!target[k]||typeof target[k]!=='object')target[k]={};target=target[k];}target[last]=value; }
export function getPath(obj,path) { return path.split('.').reduce((o,k)=>o?.[k],obj); }
