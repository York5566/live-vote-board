const clamp=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
const color=(v,fallback)=>/^#[0-9a-f]{6}$/i.test(v||'')?v:fallback;
export const DEMO_SHEET='https://docs.google.com/spreadsheets/d/11nxtR0wVKYqUe8mvrr3rbyBB4apm6pIGmfzGUTLEen8/edit?usp=sharing';
export const extraCardDefaults=()=>({barX:0,barY:0,barWidth:100,barHeight:6,rankX:0,rankY:0,caption:'目前票數',unit:'票',shareTemplate:'占總票數 {percent}%',rankTemplate:'第 {rank} 名',credit:{size:10,color:'#ffffff',background:'#253447',opacity:85,x:0,y:0}});
export function normalizeCardExtras(c={}){
  const d=extraCardDefaults(),credit=c.credit||{};
  return {...Object.fromEntries(['barX','barY','rankX','rankY'].map(k=>[k,clamp(c[k],-500,500,0)])),barWidth:clamp(c.barWidth,10,200,100),barHeight:clamp(c.barHeight,1,40,6),
    caption:typeof c.caption==='string'?c.caption.slice(0,100):d.caption,unit:typeof c.unit==='string'?c.unit.slice(0,20):d.unit,
    shareTemplate:typeof c.shareTemplate==='string'&&c.shareTemplate.includes('{percent}')?c.shareTemplate.slice(0,100):d.shareTemplate,
    rankTemplate:typeof c.rankTemplate==='string'&&c.rankTemplate.includes('{rank}')?c.rankTemplate.slice(0,80):d.rankTemplate,
    credit:{size:clamp(credit.size,6,50,10),color:color(credit.color,d.credit.color),background:color(credit.background,d.credit.background),opacity:clamp(credit.opacity,0,100,85),x:clamp(credit.x,-500,500,0),y:clamp(credit.y,-500,500,0)}};
}
const numericRules={opacity:[0,100],size:[1,120],x:[-500,500],y:[-500,500],radius:[0,40],imageRatio:[.5,3],barTrackOpacity:[0,100],rankSize:[6,40],rankPaddingX:[0,30],rankPaddingY:[0,20],barWidth:[10,200],barHeight:[1,40],barX:[-500,500],barY:[-500,500],rankX:[-500,500],rankY:[-500,500]};
export function normalizeDesign(raw={},template={}){
  const result={};
  for(const [k,v]of Object.entries(raw||{})){
    if(!Object.hasOwn(template,k))continue;
    if(template[k]&&typeof template[k]==='object'){const child=normalizeDesign(v,template[k]);if(Object.keys(child).length)result[k]=child;}
    else if(typeof template[k]==='number'&&Number.isFinite(Number(v))){const [min,max]=numericRules[k]||[-500,500];result[k]=clamp(v,min,max,template[k]);}
    else if(typeof template[k]==='string'&&typeof v==='string'){
      if(template[k].startsWith('#')){if(/^#[0-9a-f]{6}$/i.test(v))result[k]=v;}
      else if((k!=='rankTemplate'||v.includes('{rank}'))&&(k!=='shareTemplate'||v.includes('{percent}')))result[k]=v.slice(0,100);
    }
  }
  return result;
}
export function mergedDesign(base,overrides={}){
  const result={...base};
  for(const [k,v]of Object.entries(overrides))result[k]=v&&typeof v==='object'?mergedDesign(base[k]||{},v):v;
  return result;
}
export function candidateLayout(raw={}){return {x:clamp(raw.x,-1600,1600,0),y:clamp(raw.y,-900,900,0),scale:clamp(raw.scale,.2,3,1)};}
export function layoutCards(count,{width=1548,height=620,dual=false,columns=5,manual=false}={}){
  if(!count)return [];
  let cols=manual?Math.min(count,Math.max(1,Math.round(columns))):dual?Math.min(5,count):count<=3?count:count<=6?3:count<=8?4:5;
  const rows=Math.ceil(count/cols),gap=14,rowMax=(height-gap*(rows-1))/rows;
  const cardW=Math.min((width-gap*(cols-1))/cols,dual?620:count===1?950:count===2?680:520);
  const cardH=Math.min(rowMax,cardW*1.04),yStart=Math.max(0,(height-(rows*cardH+gap*(rows-1)))/2);
  return Array.from({length:count},(_,i)=>{const row=Math.floor(i/cols),inRow=Math.min(cols,count-row*cols),rowWidth=inRow*cardW+(inRow-1)*gap;return {x:(width-rowWidth)/2+(i%cols)*(cardW+gap),y:yStart+row*(cardH+gap),width:cardW,height:cardH};});
}
export function reconcileCandidates(candidates,state,source){
  const first=state?.firstRowAnswers||[],counts=state?.counts||{};
  return candidates.filter(c=>!(source.header&&(c.isSourceHeader||first.includes(c.answer))&&!Object.hasOwn(counts,c.answer)))
    .map(c=>({...c,isSourceHeader:!source.header&&first.includes(c.answer)&&counts[c.answer]===1}));
}
