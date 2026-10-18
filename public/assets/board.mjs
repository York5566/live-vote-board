import {activeGroups,rankCandidates} from '../shared/model.mjs';
const artBase=new URL('./',import.meta.url);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const rgba=(hex,opacity)=>hex+Math.round(opacity/100*255).toString(16).padStart(2,'0');
function applyText(node,v,scale=1){Object.assign(node.style,{fontSize:v.size*scale+'px',color:v.color,opacity:v.opacity/100});}
function place(node,v){Object.assign(node.style,{left:v.x+'%',top:v.y+'%',transform:'translate(-'+v.x+'%,-'+v.y+'%)'});}
export function imageSource(candidate){return candidate.image||new URL('demo-art-'+(candidate.demoImage||0)+'.svg',artBase).href;}
export function demoVotes(config){return activeGroups(config).map((g,j)=>({counts:Object.fromEntries(g.candidates.map((c,i)=>[c.answer,Math.max(0,[128,96,82,61,45,34,20,8,5,0][i%10]-(j?13:0))])),status:'demo'}));}
export class Board {
  constructor(container,{editable=false,onEdit=()=>{},onSelect=()=>{}}={}){
    this.container=container;this.editable=editable;this.onEdit=onEdit;this.onSelect=onSelect;this.previous=new Map();this.scale=1;this.selected=null;
    this.node=el('div','vote-board'+(editable?' editable':''));container.classList.add('board-viewport');container.append(this.node);
    this.observer=new ResizeObserver(()=>{this.scale=container.clientWidth/1600;this.node.style.transform='scale('+this.scale+')';});this.observer.observe(container);
    this.node.addEventListener('pointerdown',e=>this.startDrag(e));
  }
  destroy(){this.observer.disconnect();this.node.remove();}
  render(config,states=[],{demo=false}={}){
    this.config=config;this.states=states;this.demo=demo;
    const a=config.appearance,root=this.node;root.replaceChildren();root.style.background=a.background;
    if(a.image){const bg=el('div','board-bg'),img=el('img');img.src=a.image;img.alt='';Object.assign(img.style,{opacity:a.opacity/100,transform:'translate('+a.x+'%,'+a.y+'%) rotate('+a.rotation+'deg) scale('+a.zoom+')'});bg.append(img);root.append(bg);}
    const mask=el('div','board-mask');mask.style.background=rgba(a.maskColor,a.maskOpacity);root.append(mask);
    const header=el('header','board-header');header.style.height=a.headerHeight+'px';
    const title=el('div','board-title',config.title);applyText(title,a.title);place(title,a.title);this.dragData(title,'appearance.title');
    const subtitle=el('div','board-subtitle',config.subtitle);applyText(subtitle,a.subtitle);place(subtitle,a.subtitle);this.dragData(subtitle,'appearance.subtitle');
    header.append(title,subtitle);
    if(a.logo.image){const logo=el('div','board-logo'),img=el('img');img.src=a.logo.image;img.alt='活動標誌';Object.assign(logo.style,{width:a.logo.width+'px',height:a.logo.height+'px',opacity:a.logo.opacity/100,borderRadius:a.logo.roundness+'px'});Object.assign(img.style,{transform:'rotate('+a.logo.rotation+'deg) scale('+a.logo.zoom+')'});place(logo,a.logo);this.dragData(logo,'appearance.logo');logo.append(img);header.append(logo);}
    root.append(header);
    const groups=activeGroups(config),top=25+a.headerHeight+14,remaining=900-top-25,height=(remaining-a.gap*(groups.length-1))/groups.length;
    groups.forEach((g,index)=>{
      const state=states[index]||{},counts=state.counts||{},known=!!state.counts,region=el('section','group-region');region.style.top=top+index*(height+a.gap)+'px';region.style.height=height+'px';region.dataset.group=index;
      const heading=el('div','group-header'),name=el('h2','group-name',g.name);applyText(name,g.heading);place(name,g.heading);this.dragData(name,'groups.'+index+'.heading');
      const total=el('div','group-total');applyText(total,g.total);place(total,g.total);Object.assign(total.style,{background:rgba(g.total.background,g.total.backgroundOpacity),width:g.total.width+'px',height:g.total.height+'px'});
      const caption=el('span','total-caption','目前總票數'),number=el('span','total-number',known?Object.values(counts).reduce((s,v)=>s+v,0).toLocaleString():'—');
      caption.style.fontSize=g.total.captionSize+'px';caption.style.color=g.total.captionColor;total.append(caption,number);this.dragData(total,'groups.'+index+'.total');heading.append(name,total);region.append(heading);
      const candidates=rankCandidates(g.candidates,counts,g.sort);
      if(!candidates.length){region.append(el('div','board-empty','新增候選作品後，就會顯示在這裡。'));root.append(region);return;}
      const grid=el('div','group-cards');grid.style.top='66px';grid.style.bottom='0';
      const cols=Math.min(Math.round(g.columns),candidates.length),rows=Math.ceil(candidates.length/cols);
      grid.style.gridTemplateColumns='repeat('+cols+',minmax(0,1fr))';grid.style.gridTemplateRows='repeat('+rows+',minmax(0,1fr))';
      const cardW=(1548-14*(cols-1))/cols,cardH=(height-66-14*(rows-1))/rows,totalVotes=Object.values(counts).reduce((s,v)=>s+v,0);
      candidates.forEach(c=>{
        const card=el('article','vote-card'+(this.selected===c.id?' selected':''));
        card.dataset.candidate=c.id;card.style.background=rgba(g.card.color,g.card.opacity);card.style.borderRadius=g.card.radius+'px';
        const previous=this.previous.get(c.id);if(previous!==undefined&&c.votes>previous&&!demo)card.classList.add('increased');this.previous.set(c.id,c.votes);
        const photo=el('div','candidate-image'),img=el('img'),imageH=Math.min(cardW/g.card.imageRatio,cardH*.55);
        photo.style.height=imageH+'px';photo.style.borderRadius=g.card.radius+'px';img.src=imageSource(c);img.alt=c.label;img.draggable=false;
        Object.assign(img.style,{objectFit:c.fit,opacity:c.opacity/100,transform:'translate('+c.x+'%,'+c.y+'%) rotate('+c.rotation+'deg) scale('+c.zoom+')'});
        photo.append(img);
        const scale=Math.max(.12,Math.min(cardW/300,(cardH-imageH)/150)),rank=el('span','rank-badge',known?'第 '+c.rank+' 名':'待計票');
        Object.assign(rank.style,{background:c.rank===1?g.card.firstBg:g.card.rankBg,color:c.rank===1?g.card.firstColor:g.card.rankColor,fontSize:g.card.rankSize*Math.min(1,cardW/240)+'px',padding:g.card.rankPaddingY*scale+'px '+g.card.rankPaddingX*scale+'px'});photo.append(rank);
        if(c.author){const author=el('span','candidate-credit','製作人｜'+c.author);author.style.fontSize=10*scale+'px';photo.append(author);}
        const detail=el('div','card-detail');detail.style.height=cardH-imageH+'px';
        const content={name:c.label,caption:'目前票數',number:known?c.votes.toLocaleString():'—',unit:'票',share:known?'占總票數 '+(totalVotes?c.votes/totalVotes*100:0).toFixed(1)+'%':'等待連接票源'};
        const positions={name:[15,12],caption:[15,47],number:[15,62],unit:[15+Math.max(28,content.number.length*25)+9,87],share:[15,134]};
        for(const [key,value]of Object.entries(content)){
          const t=g.card.texts[key],node=el('div','card-text card-'+key,value);applyText(node,t,scale);
          Object.assign(node.style,{left:(positions[key][0]+t.x)*scale+'px',top:(positions[key][1]+t.y)*scale+'px'});detail.append(node);
        }
        const track=el('div','vote-track'),fill=el('div','vote-fill');Object.assign(track.style,{left:15*scale+'px',right:15*scale+'px',top:116*scale+'px',height:6*scale+'px',background:rgba(g.card.barTrack,g.card.barTrackOpacity)});fill.style.width=(totalVotes?c.votes/totalVotes*100:0)+'%';fill.style.background='linear-gradient(90deg,'+g.card.barStart+','+g.card.barEnd+')';track.append(fill);detail.append(track);card.append(photo,detail);
        if(this.editable){card.tabIndex=0;card.title='編輯 '+c.label;const select=()=>this.onSelect(index,c.id);card.addEventListener('click',select);card.addEventListener('keydown',e=>{if(e.key==='Enter')select();});}
        grid.append(card);
      });
      region.append(grid);root.append(region);
    });
    if(demo)root.append(el('span','board-watermark','示範資料 · 非真實投票結果'));
  }
  dragData(node,path){if(this.editable){node.dataset.drag=path;node.tabIndex=0;node.title='拖動調整位置';node.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const axis=e.key.includes('Left')||e.key.includes('Right')?'x':'y',delta=(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1)*(e.shiftKey?5:.1);let v=path.split('.').reduce((o,k)=>o[k],this.config)[axis];this.onEdit(path+'.'+axis,Math.max(0,Math.min(100,v+delta)),true);});}}
  startDrag(e){
    const target=e.target.closest('[data-drag]');if(!target||e.button!==0)return;
    e.preventDefault();const path=target.dataset.drag,obj=path.split('.').reduce((o,k)=>o[k],this.config),start={x:e.clientX,y:e.clientY,vx:obj.x,vy:obj.y},rect=target.getBoundingClientRect(),parent=target.parentElement.getBoundingClientRect();target.setPointerCapture(e.pointerId);target.classList.add('dragging');
    const move=ev=>{
      const x=Math.max(0,Math.min(100,start.vx+(ev.clientX-start.x)/Math.max(1,parent.width-rect.width)*100));
      const y=Math.max(0,Math.min(100,start.vy+(ev.clientY-start.y)/Math.max(1,parent.height-rect.height)*100));
      this.onEdit(path+'.x',Math.round(x*10)/10,false);this.onEdit(path+'.y',Math.round(y*10)/10,false);place(target,{x,y});
    };
    const up=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',up);target.classList.remove('dragging');this.onEdit(path+'.x',obj.x,true);};
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('pointercancel',up);
  }
}
