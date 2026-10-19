import {getPath} from '../shared/model.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rounded=v=>Math.round(v*100)/100;
export class CanvasEditor {
  constructor(board,{onChange,onBegin=()=>{},onSelection=()=>{},onMessage=()=>{}}){
    Object.assign(this,{board,onChange,onBegin,onSelection,onMessage,targets:new Map(),selectedKey:null,gesture:null,editing:null});
    this.overlay=document.createElement('div');this.overlay.className='canvas-selection';this.overlay.hidden=true;
    this.overlay.innerHTML='<span class="canvas-selection-label" data-handle="move" aria-label="拖動此標籤可移動整個選取元素"></span><button data-handle="nw" aria-label="左上角縮放"></button><button data-handle="ne" aria-label="右上角縮放"></button><button data-handle="sw" aria-label="左下角縮放"></button><button data-handle="se" aria-label="右下角縮放"></button><button data-handle="rotate" aria-label="旋轉" class="rotation-handle">↻</button>';
    board.container.append(this.overlay);
    board.container.addEventListener('pointerdown',e=>this.start(e));
    board.container.addEventListener('dblclick',e=>{const t=this.targets.get(e.target.closest('[data-canvas]')?.dataset.canvas);if(t){e.preventDefault();this.select(t.key);this.editText();}});
    board.container.addEventListener('keydown',e=>this.key(e));
    this.resizeObserver=new ResizeObserver(()=>this.position());this.resizeObserver.observe(board.container);
  }
  register(node,descriptor){
    node.dataset.canvas=descriptor.key;node.tabIndex=0;node.setAttribute('aria-label',descriptor.label+'；拖動或使用方向鍵調整'+(descriptor.textPath?'，雙擊編輯文字':''));
    this.targets.set(descriptor.key,{...descriptor,node});
  }
  beginRender(){this.targets.clear();}
  endRender(){this.position();this.onSelection(this.current(),[...this.targets.values()],{intent:'render'});}
  current(){return this.targets.get(this.selectedKey);}
  select(key,{scroll=true}={}){this.selectedKey=key;this.position();this.onSelection(this.current(),[...this.targets.values()],{intent:'select',scroll});}
  position(){
    const t=this.current();this.overlay.hidden=!t;
    this.board.node.querySelectorAll('.canvas-picked').forEach(n=>n.classList.remove('canvas-picked'));
    this.board.node.querySelectorAll('.vote-card').forEach(n=>n.classList.toggle('selected',n.dataset.candidate===t?.candidateId));
    if(!t)return;
    t.node.classList.add('canvas-picked');
    const r=t.node.getBoundingClientRect(),p=this.board.container.getBoundingClientRect();
    Object.assign(this.overlay.style,{left:r.left-p.left+'px',top:r.top-p.top+'px',width:Math.max(2,r.width)+'px',height:Math.max(2,r.height)+'px'});
    this.overlay.querySelector('span').textContent=t.label;
    this.overlay.querySelectorAll('button[data-handle]').forEach(n=>n.hidden=n.dataset.handle==='rotate'?!t.rotatePath:!t.resize);
  }
  change(patches,final=false){if(Object.keys(patches).length)this.onChange(patches,final);}
  currentValue(path,fallback){return getPath(this.board.config,path)??fallback;}
  movement(t,dx,dy){
    const result={},r=t.bounds?.r||t.node.getBoundingClientRect(),p=t.bounds?.p||t.node.parentElement.getBoundingClientRect(),scale=this.board.scale;
    for(const [axis,delta]of [['x',dx],['y',dy]]){
      const spec=t.move?.[axis];if(!spec)continue;
      const size=axis==='x'?'width':'height';
      const unit=spec.unit==='anchor'?100/Math.max(1,(p[size]-r[size])/scale):spec.unit==='percent'?100/Math.max(1,(spec.extent||r[size]/scale)):1/(spec.unit||1);
      result[spec.path]=rounded(clamp(spec.value+delta*unit,spec.min??-500,spec.max??500));
    }
    return result;
  }
  start(e){
    if(e.button!==0||this.editing)return;
    const handle=e.target.closest('[data-handle]')?.dataset.handle;
    const key=e.target.closest('[data-canvas]')?.dataset.canvas;
    if(!handle&&!key){this.select(null);return;}
    if(key)this.select(key,{scroll:false});
    const t=this.current();if(!t)return;
    e.preventDefault();
    t.node.focus({preventScroll:true});
    const startX=e.clientX,startY=e.clientY,r=t.node.getBoundingClientRect(),pointer=e.pointerId;
    t.bounds={r,p:t.node.parentElement.getBoundingClientRect()};
    let started=false,last={},frame=0;
    // Hold the starting descriptor throughout the gesture, even as preview nodes re-render.
    const move=ev=>{
      if(ev.pointerId!==pointer)return;
      const dx=ev.clientX-startX,dy=ev.clientY-startY;
      if(!started&&Math.hypot(dx,dy)<3)return;
      if(!started){this.onBegin();started=true;this.gesture={};}
      if(handle==='rotate'){
        const cx=r.left+r.width/2,cy=r.top+r.height/2;
        const angle=(Math.atan2(ev.clientY-cy,ev.clientX-cx)-Math.atan2(startY-cy,startX-cx))*180/Math.PI;
        last={[t.rotatePath]:rounded(clamp(t.rotation+angle,-180,180))};
      }else if(handle&&handle!=='move'&&t.resize){
        let fx=Math.max(.05,1+dx*(handle.includes('w')?-1:1)/Math.max(1,r.width)),fy=Math.max(.05,1+dy*(handle.includes('n')?-1:1)/Math.max(1,r.height));
        if(t.uniform||ev.shiftKey){const f=Math.abs(fx-1)>Math.abs(fy-1)?fx:fy;fx=fy=f;}
        last={};for(const [axis,spec]of Object.entries(t.resize)){last[spec.path]=rounded(clamp(spec.value*(axis==='y'?fy:fx),spec.min,spec.max));}
      }else last=this.movement(t,dx/this.board.scale,dy/this.board.scale);
      if(!frame)frame=requestAnimationFrame(()=>{frame=0;this.change(last);});
    };
    const end=ev=>{
      if(ev.pointerId!==pointer)return;
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);
      if(frame)cancelAnimationFrame(frame);
      this.gesture=null;
      if(started){this.change(last,true);this.suppressClickUntil=Date.now()+100;}
      this.onSelection(this.current(),[...this.targets.values()],{intent:'reveal',scroll:true});
    };
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
  }
  key(e){
    if(this.editing)return;
    const t=this.current();if(!t)return;
    if(e.key==='Escape'){this.select(null);return;}
    if(e.key==='Enter'){e.preventDefault();this.editText();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();const n=e.shiftKey?10:1;
    this.onBegin();this.change(this.movement(t,e.key==='ArrowLeft'?-n:e.key==='ArrowRight'?n:0,e.key==='ArrowUp'?-n:e.key==='ArrowDown'?n:0),true);
    this.current()?.node.focus({preventScroll:true});
  }
  editText(){
    const t=this.current();if(!t)return;
    if(!t.textPath){this.onMessage(t.liveValue?'票數由 Google 試算表計算，可調整外觀，但不能改寫票數。':'此元素可拖動或縮放；圖片請從左側上傳。');return;}
    if(this.editing)return;
    const input=document.createElement('textarea'),r=t.node.getBoundingClientRect();
    input.className='canvas-inline-text';input.setAttribute('aria-label','直接編輯 '+t.label);input.maxLength=t.maxLength||120;input.value=this.currentValue(t.textPath,t.textFallback||'');
    Object.assign(input.style,{left:clamp(r.left,8,innerWidth-240)+'px',top:clamp(r.top,8,innerHeight-110)+'px',width:clamp(r.width+30,230,Math.min(650,innerWidth-16))+'px',height:'86px'});
    document.body.append(input);this.editing=input;input.focus();input.select();
    if(t.requiredToken)this.onMessage('只改文字即可；請保留 '+t.requiredToken+'，這部分會自動顯示即時數值。');
    let done=false;
    const finish=commit=>{
      if(done)return;const value=input.value.replace(/\r?\n/g,' ');
      if(commit&&t.requiredToken&&!value.includes(t.requiredToken)){this.onMessage('請保留 '+t.requiredToken+'；本次文字未套用。');commit=false;}
      done=true;this.editing=null;input.remove();
      if(commit&&value!==this.currentValue(t.textPath,'')){this.onBegin();this.change({[t.textPath]:value},true);}
    };
    input.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();finish(false);}else if(e.key==='Enter'){e.preventDefault();finish(true);}});
    input.addEventListener('blur',()=>finish(true),{once:true});
  }
  destroy(){this.resizeObserver.disconnect();this.overlay.remove();this.editing?.remove();}
}
