import {activeGroups,rankCandidates} from '../shared/model.mjs';
import {layoutCards,mergedDesign} from '../shared/design.mjs';
import {CanvasEditor} from './canvas-editor.mjs';
const artBase=new URL('./',import.meta.url);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const rgba=(hex,opacity)=>hex+Math.round(opacity/100*255).toString(16).padStart(2,'0');
function applyText(node,v,scale=1){Object.assign(node.style,{fontSize:v.size*scale+'px',color:v.color,opacity:v.opacity/100});}
function place(node,v){Object.assign(node.style,{left:v.x+'%',top:v.y+'%',transform:'translate(-'+v.x+'%,-'+v.y+'%)'});}
const spec=(path,value,min,max,unit)=>({path,value,min,max,unit});
export function imageSource(candidate){return candidate.image||new URL('demo-art-'+(candidate.demoImage||0)+'.svg',artBase).href;}
export function demoVotes(config){return activeGroups(config).map((g,j)=>({counts:Object.fromEntries(g.candidates.map((c,i)=>[c.answer,Math.max(0,[128,96,82,61,45,34,20,8,5,0][i%10]-(j?13:0))])),status:'demo'}));}
export class Board {
  constructor(container,{editable=false,onChange=()=>{},onBegin=()=>{},onSelection=()=>{},onMessage=()=>{}}={}){
    Object.assign(this,{container,editable,previous:new Map(),scale:1,selected:null});
    this.node=el('div','vote-board'+(editable?' editable':''));container.classList.add('board-viewport');container.append(this.node);
    this.observer=new ResizeObserver(()=>{this.scale=container.clientWidth/1600;this.node.style.transform='scale('+this.scale+')';this.editor?.position();});this.observer.observe(container);
    if(editable)this.editor=new CanvasEditor(this,{onChange,onBegin,onSelection,onMessage});
  }
  destroy(){this.observer.disconnect();this.editor?.destroy();this.node.remove();}
  target(node,key,label,props={}){if(props.group!==undefined&&this.config.mode==='dual')label=(props.group?'B':'A')+' 組 · '+label;const settingsKey=props.section==='candidates'?key.split('-').at(-1):props.section==='group'?(key.endsWith('heading')?'heading':'total'):({'background-image':'background'}[key]||key);this.editor?.register(node,{key,label,settingsKey,...props});}
  textTarget(node,key,label,path,v,{anchor=false,unit=1,minSize=1,maxSize=120,...props}={}){
    this.target(node,key,label,{move:{x:spec(path+'.x',v.x,anchor?0:-500,anchor?100:500,anchor?'anchor':unit),y:spec(path+'.y',v.y,anchor?0:-500,anchor?100:500,anchor?'anchor':unit)},resize:{x:spec(path+'.size',v.size,minSize,maxSize)},uniform:true,colorPath:path+'.color',color:v.color,sizePath:path+'.size',size:v.size,...props});
  }
  imageTarget(node,key,label,path,v,{anchor=false,logo=false,extent,...props}={}){
    this.target(node,key,label,{move:{x:{...spec(path+'.x',v.x,anchor?0:-100,100,anchor?'anchor':'percent'),extent:extent?.width},y:{...spec(path+'.y',v.y,anchor?0:-100,100,anchor?'anchor':'percent'),extent:extent?.height}},
      resize:logo?{x:spec(path+'.width',v.width,20,500),y:spec(path+'.height',v.height,20,240)}:{x:spec(path+'.zoom',v.zoom,.1,5)},uniform:!logo,rotatePath:path+'.rotation',rotation:v.rotation,...props});
  }
  render(config,states=[],{demo=false}={}){
    this.config=config;this.states=states;this.demo=demo;this.editor?.beginRender();
    const a=config.appearance,root=this.node;root.replaceChildren();root.style.background=a.background;
    this.target(root,'background','畫布背景',{colorPath:'appearance.background',color:a.background,section:'common'});
    if(a.image){const bg=el('div','board-bg'),img=el('img');img.src=a.image;img.alt='';img.draggable=false;Object.assign(img.style,{opacity:a.opacity/100,transform:'translate('+a.x+'%,'+a.y+'%) rotate('+a.rotation+'deg) scale('+a.zoom+')'});bg.append(img);root.append(bg);this.imageTarget(bg,'background-image','背景圖片','appearance',a,{extent:{width:1600,height:900},section:'common'});}
    const mask=el('div','board-mask');mask.style.background=rgba(a.maskColor,a.maskOpacity);root.append(mask);
    const header=el('header','board-header');header.style.height=a.headerHeight+'px';
    const title=el('div','board-title',config.title||(this.editable?'雙擊輸入標題':''));applyText(title,a.title);place(title,a.title);this.textTarget(title,'title','主標題','appearance.title',a.title,{anchor:true,minSize:8,textPath:'title',section:'common'});
    const subtitle=el('div','board-subtitle',config.subtitle||(this.editable?'雙擊輸入副標題':''));applyText(subtitle,a.subtitle);place(subtitle,a.subtitle);this.textTarget(subtitle,'subtitle','副標題','appearance.subtitle',a.subtitle,{anchor:true,minSize:6,maxSize:70,textPath:'subtitle',maxLength:240,section:'common'});
    header.append(title,subtitle);
    if(a.logo.image){const logo=el('div','board-logo'),img=el('img');img.src=a.logo.image;img.alt='活動標誌';img.draggable=false;Object.assign(logo.style,{width:a.logo.width+'px',height:a.logo.height+'px',opacity:a.logo.opacity/100,borderRadius:a.logo.roundness+'px',overflow:'hidden'});Object.assign(img.style,{transform:'rotate('+a.logo.rotation+'deg) scale('+a.logo.zoom+')'});place(logo,a.logo);this.imageTarget(logo,'logo','活動 Logo','appearance.logo',a.logo,{anchor:true,logo:true,section:'common'});logo.append(img);header.append(logo);}
    root.append(header);
    const groups=activeGroups(config),dual=groups.length===2,top=25+a.headerHeight+14,remaining=900-top-25,height=(remaining-a.gap*(groups.length-1))/groups.length;
    groups.forEach((g,index)=>{
      const state=states[index]||{},counts=state.counts||{},known=!!state.counts,region=el('section','group-region'),gp='groups.'+index;
      region.style.top=top+index*(height+a.gap)+'px';region.style.height=height+'px';region.dataset.group=index;
      const heading=el('div','group-header');
      if(dual){const name=el('h2','group-name',g.name||(this.editable?'雙擊輸入組名':''));applyText(name,g.heading);place(name,g.heading);this.textTarget(name,'g'+index+'-heading','組別名稱',gp+'.heading',g.heading,{anchor:true,minSize:8,maxSize:100,maxLength:100,textPath:gp+'.name',group:index,section:'group'});heading.append(name);}
      const total=el('div','group-total');applyText(total,g.total);place(total,g.total);Object.assign(total.style,{background:rgba(g.total.background,g.total.backgroundOpacity),width:g.total.width+'px',height:g.total.height+'px'});
      const caption=el('span','total-caption',g.total.caption),number=el('span','total-number',known?Object.values(counts).reduce((s,v)=>s+v,0).toLocaleString():'—');
      Object.assign(caption.style,{fontSize:g.total.captionSize+'px',color:g.total.captionColor,transform:'translate('+g.total.captionX+'px,'+g.total.captionY+'px)'});
      number.style.transform='translate('+g.total.numberX+'px,'+g.total.numberY+'px)';
      this.target(total,'g'+index+'-total','總票數區塊',{move:{x:spec(gp+'.total.x',g.total.x,0,100,'anchor'),y:spec(gp+'.total.y',g.total.y,0,100,'anchor')},resize:{x:spec(gp+'.total.width',g.total.width,60,400),y:spec(gp+'.total.height',g.total.height,30,150)},colorPath:gp+'.total.background',color:g.total.background,group:index,section:'group'});
      for(const [node,key,label,isCaption]of [[caption,'caption','總票數說明',true],[number,'number','總票數數字',false]]){
        this.target(node,'g'+index+'-total-'+key,label,{move:{x:spec(gp+'.total.'+key+'X',g.total[key+'X'],-200,200,1),y:spec(gp+'.total.'+key+'Y',g.total[key+'Y'],-200,200,1)},resize:{x:spec(gp+'.total.'+(isCaption?'captionSize':'size'),isCaption?g.total.captionSize:g.total.size,isCaption?6:8,isCaption?40:100)},uniform:true,colorPath:gp+'.total.'+(isCaption?'captionColor':'color'),color:isCaption?g.total.captionColor:g.total.color,sizePath:gp+'.total.'+(isCaption?'captionSize':'size'),size:isCaption?g.total.captionSize:g.total.size,textPath:isCaption?gp+'.total.caption':null,liveValue:!isCaption,group:index,section:'group'});
      }
      total.append(caption,number);if(dual){heading.append(total);region.append(heading);}else header.append(total);
      const candidates=rankCandidates(g.candidates,counts,g.sort);
      if(!candidates.length){region.append(el('div','board-empty','新增候選作品後，就會顯示在這裡。'));root.append(region);return;}
      const grid=el('div','group-cards');const cardTop=dual?66:0;Object.assign(grid.style,{top:cardTop+'px',height:height-cardTop+'px',display:'block'});
      const boxes=layoutCards(candidates.length,{height:height-cardTop,dual,columns:g.columns,manual:g.layout==='manual'}),totalVotes=Object.values(counts).reduce((s,v)=>s+v,0);
      candidates.forEach((c,order)=>{
        const ci=g.candidates.findIndex(item=>item.id===c.id),cp=gp+'.candidates.'+ci,dp=cp+'.design',style=mergedDesign(g.card,c.design),box=boxes[order],cardW=box.width,cardH=box.height;
        const context={group:index,candidateId:c.id,section:'candidates'},key='c-'+c.id;
        const card=el('article','vote-card'+(this.selected===c.id?' selected':''));card.dataset.candidate=c.id;
        Object.assign(card.style,{position:'absolute',left:box.x+'px',top:box.y+'px',width:cardW+'px',height:cardH+'px',background:rgba(style.color,style.opacity),borderRadius:style.radius+'px',transform:'translate('+c.layout.x+'px,'+c.layout.y+'px) scale('+c.layout.scale+')',transformOrigin:'top left'});
        this.target(card,key+'-card',c.label+'｜卡片',{move:{x:spec(cp+'.layout.x',c.layout.x,-1600,1600,1),y:spec(cp+'.layout.y',c.layout.y,-900,900,1)},resize:{x:spec(cp+'.layout.scale',c.layout.scale,.2,3)},uniform:true,colorPath:dp+'.color',color:style.color,...context});
        const previous=this.previous.get(c.id);if(previous!==undefined&&c.votes>previous&&!demo)card.classList.add('increased');this.previous.set(c.id,c.votes);
        const photo=el('div','candidate-image'),img=el('img'),imageH=Math.min(cardW/style.imageRatio,cardH*.55);
        photo.style.height=imageH+'px';photo.style.borderRadius=style.radius+'px';img.src=imageSource(c);img.alt=c.label;img.draggable=false;
        Object.assign(img.style,{objectFit:c.fit,opacity:c.opacity/100,transform:'translate('+c.x+'%,'+c.y+'%) rotate('+c.rotation+'deg) scale('+c.zoom+')'});
        this.imageTarget(photo,key+'-image',c.label+'｜圖片',cp,c,{extent:{width:cardW*c.layout.scale,height:imageH*c.layout.scale},...context});photo.append(img);
        const scale=Math.max(.12,Math.min(1.8,cardW/300,(cardH-imageH)/155)),u=scale*c.layout.scale;
        const rank=el('span','rank-badge',known?style.rankTemplate.replace('{rank}',c.rank):'待計票');
        Object.assign(rank.style,{left:(9+style.rankX)*scale+'px',top:(9+style.rankY)*scale+'px',background:c.rank===1?style.firstBg:style.rankBg,color:c.rank===1?style.firstColor:style.rankColor,fontSize:style.rankSize*scale+'px',padding:style.rankPaddingY*scale+'px '+style.rankPaddingX*scale+'px'});
        this.target(rank,key+'-rank',c.label+'｜名次',{move:{x:spec(dp+'.rankX',style.rankX,-500,500,u),y:spec(dp+'.rankY',style.rankY,-500,500,u)},resize:{x:spec(dp+'.rankSize',style.rankSize,6,40)},uniform:true,colorPath:dp+(c.rank===1?'.firstColor':'.rankColor'),color:c.rank===1?style.firstColor:style.rankColor,sizePath:dp+'.rankSize',size:style.rankSize,textPath:dp+'.rankTemplate',textFallback:style.rankTemplate,requiredToken:'{rank}',...context});photo.append(rank);
        if(c.author||this.editable){
          const author=el('span','candidate-credit',c.author?'製作人｜'+c.author:'雙擊填寫作者');if(!c.author)author.classList.add('canvas-placeholder');
          Object.assign(author.style,{fontSize:style.credit.size*scale+'px',color:style.credit.color,background:rgba(style.credit.background,style.credit.opacity),transform:'translate('+style.credit.x*scale+'px,'+style.credit.y*scale+'px)'});
          this.textTarget(author,key+'-author',c.label+'｜作者',dp+'.credit',style.credit,{unit:u,minSize:6,maxSize:50,maxLength:100,textPath:cp+'.author',...context});photo.append(author);
        }
        const detail=el('div','card-detail');detail.style.height=cardH-imageH+'px';
        const content={name:c.label,caption:style.caption,number:known?c.votes.toLocaleString():'—',unit:style.unit,share:known?style.shareTemplate.replace('{percent}',(totalVotes?c.votes/totalVotes*100:0).toFixed(1)):'等待連接票源'};
        const positions={name:[15,12],caption:[15,47],number:[15,62],unit:[15+Math.max(28,content.number.length*25)+9,87],share:[15,134]};
        for(const [part,value]of Object.entries(content)){
          const t=style.texts[part],node=el('div','card-text card-'+part,value);applyText(node,t,scale);Object.assign(node.style,{left:(positions[part][0]+t.x)*scale+'px',top:(positions[part][1]+t.y)*scale+'px'});
          const label={name:'名稱',caption:'票數說明',number:'票數',unit:'票數單位',share:'百分比'}[part],textPath=part==='name'?cp+'.label':part==='number'?null:dp+'.'+(part==='share'?'shareTemplate':part);
          this.textTarget(node,key+'-'+part,c.label+'｜'+label,dp+'.texts.'+part,t,{unit:u,textPath,textFallback:part==='share'?style.shareTemplate:content[part],requiredToken:part==='share'?'{percent}':null,liveValue:part==='number',...context});detail.append(node);
        }
        const track=el('div','vote-track'),fill=el('div','vote-fill');
        Object.assign(track.style,{left:(15+style.barX)*scale+'px',width:Math.max(1,cardW-30*scale)*style.barWidth/100+'px',top:(116+style.barY)*scale+'px',height:style.barHeight*scale+'px',background:rgba(style.barTrack,style.barTrackOpacity)});
        fill.style.width=(totalVotes?c.votes/totalVotes*100:0)+'%';fill.style.background='linear-gradient(90deg,'+style.barStart+','+style.barEnd+')';track.append(fill);
        this.target(track,key+'-bar',c.label+'｜票數長條',{move:{x:spec(dp+'.barX',style.barX,-500,500,u),y:spec(dp+'.barY',style.barY,-500,500,u)},resize:{x:spec(dp+'.barWidth',style.barWidth,10,200),y:spec(dp+'.barHeight',style.barHeight,1,40)},colorPath:dp+'.barStart',color:style.barStart,colors:[{label:'起始色',path:dp+'.barStart',value:style.barStart},{label:'結束色',path:dp+'.barEnd',value:style.barEnd},{label:'底軌色',path:dp+'.barTrack',value:style.barTrack}],...context});
        detail.append(track);card.append(photo,detail);grid.append(card);
      });
      region.append(grid);root.append(region);
    });
    if(demo)root.append(el('span','board-watermark','示範資料 · 非真實投票結果'));
    this.editor?.endRender();
  }
}
