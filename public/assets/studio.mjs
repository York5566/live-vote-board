import {defaults,normalizeConfig,activeGroups,candidate,mergeCandidates,copy,setPath,getPath,TEXT_PARTS,LIMITS,snapshotSize} from '../shared/model.mjs';
import {Board,demoVotes,imageSource} from './board.mjs';
import {getStored,setStored,compressImage} from './storage.mjs';
import {CloudClient,renderChallenge} from './api.mjs';
import {Poller} from './polling.mjs';
import {coordinatedPoll} from './live.mjs';
import {locale as L} from './locales/zh-Hant.mjs';
const $=s=>document.querySelector(s),node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
let config=defaults(),groupIndex=0,selectedId=config.groups[0].candidates[0]?.id,tab='source',states=[],demo=true,session='',dirty=false,saveTimer,toastTimer,lastManual=0,cleanupChallenge=()=>{},broadcastTimer;
try{const stored=await getStored('draft');if(stored)config=normalizeConfig(stored);}catch{}
selectedId=config.groups[0].candidates[0]?.id;
const room=sessionStorage.getItem('lvb-room')||crypto.randomUUID();sessionStorage.setItem('lvb-room',room);
const cloud=new CloudClient(),channel=new BroadcastChannel('live-vote-board-'+room),board=new Board($('#preview'),{editable:true,onEdit:(path,value,final)=>{setPath(config,path,value);syncInputs(path);changed(false);if(final)renderBoard();},onSelect:(i,id)=>{groupIndex=i;selectedId=id;tab='candidates';renderPanels();renderBoard();}});
function notify(message,error=false){const target=$('#toast');clearTimeout(toastTimer);target.textContent=message;target.classList.toggle('error',error);target.hidden=false;toastTimer=setTimeout(()=>target.hidden=true,6000);}
function shownStates(){return demo?demoVotes(config):states;}
function renderBoard(){board.selected=tab==='candidates'?selectedId:null;board.render(config,shownStates(),{demo});$('#demo-badge').hidden=!demo;$('#mode-single').classList.toggle('active',config.mode==='single');$('#mode-dual').classList.toggle('active',config.mode==='dual');$('#mode-single').setAttribute('aria-pressed',config.mode==='single');$('#mode-dual').setAttribute('aria-pressed',config.mode==='dual');scheduleBroadcast();}
function scheduleBroadcast(){clearTimeout(broadcastTimer);broadcastTimer=setTimeout(()=>channel.postMessage({type:'state',config,states:shownStates(),demo,session,running:poller.running}),60);}
async function persist(){
  try{const normalized=normalizeConfig(config);await setStored('draft',normalized);dirty=false;$('#save-state').textContent=L.messages.localSaved;}catch(e){$('#save-state').textContent=e.name==='QuotaExceededError'?L.messages.localFailure:'請完成目前設定：'+e.message;}
}
function changed(render=true){dirty=true;$('#save-state').textContent='儲存中…';clearTimeout(saveTimer);saveTimer=setTimeout(persist,450);if(render)renderBoard();else scheduleBroadcast();}
function invalidate(){session='';poller.stop();$('#connection-detail').textContent='票源設定已改變，請按「連接並讀取」重新連線。';$('#connection-status').textContent='等待重新連接';}
function update(path,value,{rebuild=false}={}){
  setPath(config,path,value);
  if(path.includes('.source.')||path==='mode')invalidate();
  if(path==='refresh')poller.seconds=Math.max(15,value);
  changed();if(rebuild)renderPanels();
}
const displayNumber=value=>Number.isFinite(Number(value))?Number(Number(value).toFixed(4)):value;
function syncInputs(path){for(const input of document.querySelectorAll('[data-path]'))if(input.dataset.path===path){const value=getPath(config,path);if(input.type==='checkbox')input.checked=value;else input.value=input.type==='number'?displayNumber(value):value;}}
function field(label,path,{type='text',min,max,step=.1,options,hint,unit,rebuild=false}={}){
  const row=node('div',type==='text'||options?'field':'field-row'),id='f-'+path.replaceAll('.','-'),lab=node('label','',label);lab.htmlFor=id;
  let input;
  if(options){input=node('select');for(const [value,title]of options){const opt=node('option','',title);opt.value=value;input.append(opt);}}
  else {input=node('input');input.type=type;}
  input.id=id;input.dataset.path=path;
  if(type==='number'){input.min=min;input.max=max;input.step=step;input.inputMode='decimal';}
  if(type==='checkbox')input.checked=!!getPath(config,path);else input.value=type==='number'?displayNumber(getPath(config,path)):getPath(config,path)??'';
  input.addEventListener(type==='checkbox'||type==='color'||options?'change':'input',()=>{
    let value=input.value;
    if(type==='checkbox')value=input.checked;
    if(type==='number'){if(value===''||!Number.isFinite(Number(value)))return;value=Math.max(min,Math.min(max,Number(value)));}
    update(path,value,{rebuild});
  });
  if(type==='color')input.addEventListener('input',()=>update(path,input.value));
  if(type==='number')input.addEventListener('blur',()=>{input.value=displayNumber(getPath(config,path));});
  row.append(lab);
  if(unit){const box=node('div','input-unit'),suffix=node('span','',unit);box.append(input,suffix);row.append(box);}else row.append(input);
  if(hint)row.append(node('small','hint',hint));
  return row;
}
function numeric(label,path,min,max,unit='',step=.1){return field(label,path,{type:'number',min,max,unit,step});}
function button(label,handler,cls=''){const b=node('button',cls,label);b.type='button';b.addEventListener('click',handler);return b;}
function details(title,children,{open=false}={}){const box=node('details');box.open=open;box.append(node('summary','',title));const content=node('div','detail-content');content.append(...children);box.append(content);return box;}
function textControls(path,{position=true}={}){
  const minSize=path.includes('.texts.')?1:path.includes('subtitle')?6:8,maxSize=path.includes('subtitle')?70:/\.(heading|total)$/.test(path)?100:120;
  const rows=[field(L.controls.color,path+'.color',{type:'color'}),numeric('文字大小',path+'.size',minSize,maxSize,'px'),numeric('不透明度',path+'.opacity',0,100,'%')];
  if(position)rows.push(numeric('水平位置',path+'.x',path.includes('.texts.')?-200:0,path.includes('.texts.')?200:100,path.includes('.texts.')?'px':'%'),numeric('垂直位置',path+'.y',path.includes('.texts.')?-200:0,path.includes('.texts.')?200:100,path.includes('.texts.')?'px':'%'));
  return rows;
}
function upload(label,path){
  const box=node('div'),zone=node('label','upload-zone'),input=node('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.setAttribute('aria-label',label);zone.append(node('span','',label),node('small','','JPG、PNG、WebP · 自動縮圖與壓縮'),input);box.append(zone);
  if(getPath(config,path)){const thumb=node('img','upload-thumb');thumb.src=getPath(config,path);thumb.alt=label;box.append(thumb,button('移除圖片',()=>{update(path,'');renderPanels();},'small subtle'));}
  input.addEventListener('change',async()=>{if(!input.files[0])return;notify(L.messages.uploading);try{const data=await compressImage(input.files[0]);const old=getPath(config,path);setPath(config,path,data);if(snapshotSize(config)>LIMITS.snapshotBytes){setPath(config,path,old);throw new Error('所有圖片與設定合計超過 4 MB，請減少圖片。');}changed();renderPanels();notify(L.messages.uploaded);}catch(e){notify(e.message,true);}});
  return box;
}
function groupChooser(){
  const chooser=node('div','segmented group-select');for(let i=0;i<(config.mode==='single'?1:2);i++){const b=button(i?'B 組':'A 組',()=>{groupIndex=i;selectedId=config.groups[i].candidates[0]?.id;renderPanels();renderBoard();},i===groupIndex?'active':'');b.setAttribute('aria-pressed',i===groupIndex);chooser.append(b);}return chooser;
}
function sourcePanel(panel){
  panel.append(node('p','panel-intro','先讓 Google 表單連結試算表，再貼上含票數的工作表網址。A、B 組可以使用不同試算表，也可使用同一份的不同欄位。'),groupChooser());
  const p='groups.'+groupIndex+'.source',g=config.groups[groupIndex];
  panel.append(field('Google 試算表網址',p+'.url',{hint:'請貼試算表網址，不是 forms.gle 填答連結。'}),
    field('工作表名稱（選填）',p+'.sheetName',{hint:'例如 TOTAL。不填會使用網址的 gid；網址沒有 gid 時使用第一張工作表。'}),
    field('票源內容',p+'.mode',{options:[['summary','彙總票數：作品名稱＋票數'],['responses','表單回應：每列是一筆投票']],rebuild:true}),
    field(g.source.mode==='summary'?'作品名稱在哪一欄？':'投票答案在哪一欄？',p+'.nameColumn',{hint:'輸入試算表上方的英文字母，例如 A 或 C。'}));
  if(g.source.mode==='summary')panel.append(field('票數在哪一欄？',p+'.countColumn',{hint:'填入顯示票數的欄位，例如 B。'}));
  else{panel.append(field('這題允許複選',p+'.multiple',{type:'checkbox',rebuild:true}));if(g.source.multiple)panel.append(field('複選選項之間的分隔符號',p+'.separator',{hint:'Google 表單通常使用「逗號＋空格」。選項名稱本身請避免包含此符號。'}));}
  panel.append(field('第一列是欄位名稱',p+'.header',{type:'checkbox'}),node('div','info-box warning','只公開作品名稱與票數。若原始回應含姓名、Email 或其他個資，請另外建立彙總工作表並只發布該工作表；隱藏欄位並不能保護個資。'));
  const a=node('a','button small subtle','查看 Google 表單串接教學 ↗');a.href='../guide/';a.target='_blank';a.rel='noopener';panel.append(a);
  panel.append(numeric('自動更新間隔','refresh',15,300,'秒',1),node('p','hint','最低 15 秒、預設 30 秒。頁面在背景時暫停更新；Google 發布資料本身可能有延遲。'),button('連接並讀取候選作品',connect,'primary'),button('暫停自動更新',()=>{poller.stop();$('#connection-status').textContent=L.messages.paused;notify('已暫停。按「更新票數」可繼續。');},'subtle small'));
}
function commonPanel(panel){
  panel.append(node('p','panel-intro','標題、Logo 和背景在整個看板共用。你也可以直接拖動預覽中的文字、組名與總票數。'),
    field('看板主標題','title'),field('副標題','subtitle'));
  panel.append(details('標題外觀與位置',textControls('appearance.title'),{open:true}),details('副標外觀與位置',textControls('appearance.subtitle')),
    details('活動 Logo',[upload('上傳 Logo','appearance.logo.image'),numeric('水平位置','appearance.logo.x',0,100,'%'),numeric('垂直位置','appearance.logo.y',0,100,'%'),numeric('寬度','appearance.logo.width',20,500,'px'),numeric('高度','appearance.logo.height',20,240,'px'),numeric('縮放','appearance.logo.zoom',.1,5,'倍'),numeric('旋轉','appearance.logo.rotation',-180,180,'°'),numeric('不透明度','appearance.logo.opacity',0,100,'%'),numeric('圓角','appearance.logo.roundness',0,100,'px')]),
    details('背景與遮罩',[field('背景顏色','appearance.background',{type:'color'}),upload('上傳背景圖片','appearance.image'),numeric('背景縮放','appearance.zoom',.1,5,'倍'),numeric('水平位移','appearance.x',-100,100,'%'),numeric('垂直位移','appearance.y',-100,100,'%'),numeric('旋轉','appearance.rotation',-180,180,'°'),numeric('圖片不透明度','appearance.opacity',0,100,'%'),field('遮罩顏色','appearance.maskColor',{type:'color'}),numeric('遮罩不透明度','appearance.maskOpacity',0,100,'%'),node('p','hint','遮罩設為 0% 就會呈現原本圖片的顏色。')]),
    details('版面與提示音',[numeric('標題區高度','appearance.headerHeight',60,260,'px'),numeric('上下兩組間距','appearance.gap',4,60,'px'),field('票數增加時播放提示音','sound',{type:'checkbox'}),node('p','hint','提示音由操作頁播放，避免投影視窗重複發聲。')]));
  const preset=button('將目前所有設定儲存為我的預設',async()=>{try{await setStored('defaults',normalizeConfig(config));notify('已設為此瀏覽器的預設。若要換電腦，請另存雲端代碼。');}catch(e){notify(e.message,true);}},'small');
  panel.append(node('div','info-box','本機預設保存在目前瀏覽器。雲端代碼會包含完整設定與圖片，可以在另一台電腦載入。'),preset);
}
function groupPanel(panel){
  panel.append(groupChooser());const p='groups.'+groupIndex;
  panel.append(field('組別名稱',p+'.name'),numeric('每列卡片數量',p+'.columns',1,10,'張',1),field('依票數由高到低排序',p+'.sort',{type:'checkbox'}),
    details('組別名稱外觀',textControls(p+'.heading'),{open:true}),
    details('總票數區',[...textControls(p+'.total'),field('說明文字顏色',p+'.total.captionColor',{type:'color'}),numeric('說明文字大小',p+'.total.captionSize',6,40,'px'),field('底色',p+'.total.background',{type:'color'}),numeric('底色不透明度',p+'.total.backgroundOpacity',0,100,'%'),numeric('區塊寬度',p+'.total.width',60,400,'px'),numeric('區塊高度',p+'.total.height',30,150,'px')]),
    details('卡片底圖',[field('卡片底色',p+'.card.color',{type:'color'}),numeric('底色不透明度',p+'.card.opacity',0,100,'%'),numeric('圓角大小',p+'.card.radius',0,40,'px'),numeric('候選圖片寬高比',p+'.card.imageRatio',.5,3,'比值'),node('p','hint','16:9 的比值是 1.78。投影版面會依卡片數量自動縮放，建議圖片至少 1280 × 720。')]));
  for(const [part,label]of Object.entries(L.textParts))panel.append(details(label+'外觀',textControls(p+'.card.texts.'+part)));
  panel.append(details('票數長條',[field('長條起始顏色',p+'.card.barStart',{type:'color'}),field('長條結束顏色',p+'.card.barEnd',{type:'color'}),field('長條底色',p+'.card.barTrack',{type:'color'}),numeric('長條底色不透明度',p+'.card.barTrackOpacity',0,100,'%')]),
    details('第幾名標籤',[field('一般名次文字',p+'.card.rankColor',{type:'color'}),field('一般名次底色',p+'.card.rankBg',{type:'color'}),field('第一名文字',p+'.card.firstColor',{type:'color'}),field('第一名底色',p+'.card.firstBg',{type:'color'}),numeric('名次文字大小',p+'.card.rankSize',6,40,'px'),numeric('標籤左右留白',p+'.card.rankPaddingX',0,30,'px'),numeric('標籤上下留白',p+'.card.rankPaddingY',0,20,'px')]));
  if(config.mode==='dual')panel.append(button('複製這組的外觀到'+(groupIndex?' A':' B')+' 組',()=>{const other=1-groupIndex,g=config.groups[groupIndex];for(const key of ['heading','total','card','columns','sort'])config.groups[other][key]=copy(g[key]);changed();notify('外觀已套用，票源、作品和圖片各自保留。');},'small'));
}
function candidatesPanel(panel){
  panel.append(groupChooser(),node('p','panel-intro','「投票選項」必須與試算表一致；「顯示名稱」可自由修改。點選右側卡片也能快速編輯。'));
  const g=config.groups[groupIndex],list=node('div','candidate-list');
  if(!g.candidates.some(c=>c.id===selectedId))selectedId=g.candidates[0]?.id;
  g.candidates.forEach((c,i)=>{const b=button('',()=>{selectedId=c.id;renderPanels();renderBoard();},'candidate-item'+(c.id===selectedId?' active':'')),img=node('img');img.src=imageSource(c);img.alt='';b.append(img,node('span','candidate-item-name',c.label),node('small','',String(i+1).padStart(2,'0')));list.append(b);});
  panel.append(list,button('＋ 新增候選作品',()=>{if(g.candidates.length>=LIMITS.candidates){notify('每組最多 20 個作品。',true);return;}let n=g.candidates.length+1;while(g.candidates.some(c=>c.answer==='作品 '+n))n++;const c=candidate('作品 '+n,n);g.candidates.push(c);selectedId=c.id;changed();renderPanels();},'small'));
  const index=g.candidates.findIndex(c=>c.id===selectedId);if(index<0)return;
  const p='groups.'+groupIndex+'.candidates.'+index,editor=node('div','candidate-editor');
  editor.append(field('投票選項（與試算表完全一致）',p+'.answer'),field('看板顯示名稱',p+'.label'),field('製作人／作者（選填）',p+'.author'),upload('上傳候選作品圖片',p+'.image'),
    field('圖片顯示方式',p+'.fit',{options:[['contain','完整顯示'],['cover','填滿圖片區']] }),
    numeric('圖片縮放',p+'.zoom',.1,5,'倍'),numeric('水平位移',p+'.x',-100,100,'%'),numeric('垂直位移',p+'.y',-100,100,'%'),numeric('旋轉角度',p+'.rotation',-180,180,'°'),numeric('圖片不透明度',p+'.opacity',0,100,'%'),
    button('移除此候選作品',()=>{if(!confirm('移除「'+g.candidates[index].label+'」？票源的原始資料不會被修改。'))return;g.candidates.splice(index,1);selectedId=g.candidates[0]?.id;changed();renderPanels();},'small danger'));
  panel.append(editor);
}
function renderPanels(){
  if(config.mode==='single')groupIndex=0;
  const tabs=$('#settings-tabs');tabs.replaceChildren();
  for(const [id,label]of L.tabs){const b=button(label,()=>{tab=id;renderPanels();renderBoard();},tab===id?'active':'');b.setAttribute('role','tab');b.setAttribute('aria-selected',tab===id);b.id='tab-'+id;b.setAttribute('aria-controls','settings-panel');tabs.append(b);}
  const panel=$('#settings-panel');panel.replaceChildren();panel.setAttribute('aria-labelledby','tab-'+tab);
  ({source:sourcePanel,common:commonPanel,group:groupPanel,candidates:candidatesPanel})[tab](panel);
  const footer=node('div','settings-footer');footer.append(button('載入我的預設',async()=>{const stored=await getStored('defaults');if(!stored){notify('尚未儲存個人預設。');return;}if(!confirm('以個人預設取代目前版面？'))return;config=normalizeConfig(stored);invalidate();demo=true;changed();renderPanels();},'small subtle'),button('全新看板',()=>{if(!confirm('建立全新看板？目前草稿會被取代，請先儲存需要的設定代碼。'))return;config=defaults();selectedId=config.groups[0].candidates[0].id;states=[];demo=true;invalidate();changed();renderPanels();},'small subtle'));panel.append(footer);
}
function updateStatus(groups){
  const errors=groups.filter(g=>g.status==='error'||g.status==='stale'||g.status==='waiting');
  $('#connection-status').textContent=errors.length?'票源暫時延遲，保留上次資料':L.messages.connected;
  const updated=groups.filter(g=>g.updatedAt).map(g=>g.updatedAt);
  $('#connection-detail').textContent=errors.length?errors.map(g=>g.message||'正在更新').join('；'):'最後更新 '+(updated.length?new Date(Math.max(...updated)).toLocaleTimeString('zh-TW'):'—')+' · 每 '+config.refresh+' 秒讀取';
}
function acceptVotes(groups){
  const oldTotal=states.reduce((s,g)=>s+Object.values(g.counts||{}).reduce((a,b)=>a+b,0),0);
  states=groups.map((g,i)=>g.counts?g:{...g,counts:states[i]?.counts||null});
  const total=states.reduce((s,g)=>s+Object.values(g.counts||{}).reduce((a,b)=>a+b,0),0);
  if(config.sound&&oldTotal>0&&total>oldTotal){try{const audio=new (window.AudioContext||window.webkitAudioContext)(),osc=audio.createOscillator(),gain=audio.createGain();osc.frequency.value=660;gain.gain.setValueAtTime(.07,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.25);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+.25);osc.onended=()=>audio.close();}catch{}}
  demo=false;updateStatus(groups);renderBoard();
}
const poller=new Poller(async signal=>{
  if(!session)return;const result=await coordinatedPoll(session,config.refresh,()=>cloud.request('/api/votes',{}, {token:session,signal}));if(!result)return;acceptVotes(result.groups);
  if(result.groups.some(g=>['error','stale','waiting'].includes(g.status))){const error=new Error('票源暫時延遲，保留上次資料。');error.retryAfter=60;throw error;}
},{seconds:config.refresh,onState:state=>{scheduleBroadcast();if(state.error){if(state.error.status===401)poller.stop();$('#connection-status').textContent='更新暫停，保留上次票數';$('#connection-detail').textContent=state.error.message+(state.nextIn?' · '+state.nextIn+' 秒後重試':'');}}});
function modal(title){
  const dialog=$('#cloud-dialog');cleanupChallenge();cleanupChallenge=()=>{};dialog.replaceChildren();
  const top=node('div','dialog-top');top.append(node('h2','',title),button('×',()=>dialog.close(),'close-dialog'));top.lastChild.setAttribute('aria-label','關閉');dialog.append(top);dialog.showModal();return dialog;
}
async function cloudAction(action,title,setup,execute){
  if(!cloud.ready){notify('此預覽尚未接上正式雲端。部署 Workers 與 D1 後，就能使用票源與設定代碼。',true);return;}
  const dialog=modal(title),content=node('div'),error=node('p','code-error'),widget=node('div','turnstile-box');dialog.append(content);const collect=setup(content);
  const go=button(action==='save'?'儲存並取得代碼':action==='load'?'載入設定':action==='delete'?'刪除雲端設定':'連接並讀取',async()=>{
    go.disabled=true;error.textContent='';
    try{await execute(collect(),token,dialog);if(action!=='save')dialog.close();}
    catch(e){error.textContent=e.message;token='';cleanupChallenge();widget.replaceChildren();await mount();}
  },'primary');let token='';
  go.disabled=true;dialog.append(widget,error,go);
  const mount=async()=>{try{cleanupChallenge=await renderChallenge(widget,action,t=>{token=t;go.disabled=!t;},m=>error.textContent=m);}catch(e){error.textContent=e.message;}};
  await mount();
}
async function connect(){
  try{normalizeConfig(config);}catch(e){notify(e.message,true);return;}
  await cloudAction('session','連接 Google 試算表',box=>{box.append(node('p','','我們只會讀取所選票源並計算票數，不會修改你的 Google 表單或試算表。首次連接會自動加入新發現的候選選項。'));return ()=>null;},async(_,turnstile)=>{
    const result=await cloud.request('/api/session',{sources:activeGroups(config).map(g=>g.source),turnstile});
    session=result.token;states=[];
    result.groups.forEach((state,i)=>{
      if(!state.counts)return;
      const original=config.groups[i].candidates;
      const untouched=original.every(c=>!c.image&&!c.author)&&original.length===5&&original.every((c,j)=>c.answer===defaults().groups[i].candidates[j].answer);
      config.groups[i].candidates=mergeCandidates(untouched?[]:original,state.counts);
    });
    acceptVotes(result.groups);changed();renderPanels();poller.seconds=config.refresh;poller.start();
    if(result.groups.some(g=>g.status==='error'))notify('部分票源尚未讀取成功，請查看預覽下方訊息。',true);else notify('票源已連接，候選作品已同步。');
  });
}
$('#save-code').addEventListener('click',async()=>{
  try{normalizeConfig(config);}catch(e){notify(e.message,true);return;}
  cloudAction('save','帶著你的看板，換台電腦上場',box=>{box.append(node('p','','完整版面、票源與圖片會一起儲存。每次儲存都會產生新代碼，舊代碼仍保留原本版本。'),node('div','info-box','代碼等同取用鑰匙，請私下保存。持有代碼的人能載入或刪除這份設定。'),node('p','hint','目前設定約 '+(snapshotSize(config)/1024/1024).toFixed(2)+' MB／上限 4 MB。'));return ()=>null;},async(_,turnstile,dialog)=>{
    const result=await cloud.request('/api/snapshots/save',{config:normalizeConfig(config),turnstile});
    cleanupChallenge();dialog.querySelector('.turnstile-box')?.remove();dialog.querySelector('button.primary')?.remove();
    const box=node('div','code-result'),code=node('div','code-value',result.code),expires=node('p','hint','保存至 '+new Date(result.expiresAt).toLocaleDateString('zh-TW')+'。到期前重新儲存可取得新代碼。');
    box.append(code,expires,button('複製設定代碼',async()=>{try{await navigator.clipboard.writeText(result.code);notify('已複製代碼。');}catch{notify('請選取上方代碼後複製。');}},'small'));dialog.append(box);
  });
});
function codeInput(box){const label=node('label','','設定代碼'),input=node('textarea');input.id='cloud-code';label.htmlFor=input.id;input.placeholder='LVB-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX';input.autocomplete='off';input.spellcheck=false;box.append(label,input,node('p','hint','請貼上完整代碼。代碼不會放進網址或搜尋引擎。'));return ()=>input.value;}
$('#load-code').addEventListener('click',()=>cloudAction('load','輸入代碼，接回你的看板',codeInput,async(code,turnstile)=>{
  const result=await cloud.request('/api/snapshots/load',{code,turnstile});
  if(!confirm('以這份雲端設定取代目前草稿？'))return;
  config=normalizeConfig(result.config);states=[];demo=false;groupIndex=0;selectedId=config.groups[0].candidates[0]?.id;invalidate();changed();renderPanels();notify('設定與圖片已載入。按「連接並讀取」即可開始更新票數。');
}));
$('#delete-code').addEventListener('click',()=>cloudAction('delete','刪除一份雲端設定',box=>{const collect=codeInput(box);box.append(node('div','info-box warning','刪除後，這組代碼立即失效。已下載至其他電腦的副本不會一起刪除。'));return collect;},async(code,turnstile)=>{
  if(!confirm('確定刪除這組代碼的雲端設定？此操作無法復原。'))return;
  await cloud.request('/api/snapshots/delete',{code,turnstile});notify('雲端設定已刪除。');
}));
$('#cloud-dialog').addEventListener('close',()=>{cleanupChallenge();cleanupChallenge=()=>{};});
$('#mode-single').addEventListener('click',()=>{update('mode','single',{rebuild:true});});
$('#mode-dual').addEventListener('click',()=>{update('mode','dual',{rebuild:true});});
$('#refresh-now').addEventListener('click',()=>{
  if(!session){connect();return;}const elapsed=(Date.now()-lastManual)/1000;if(elapsed<15){notify('為保護免費額度，手動更新需間隔 15 秒。');return;}lastManual=Date.now();poller.start();poller.refresh();
});
$('#open-display').addEventListener('click',async()=>{
  const win=window.open('../display/?room='+room,'live-vote-projection-'+room);
  try{await setStored('projection-'+room,{config,states:shownStates(),demo,session,running:poller.running});scheduleBroadcast();}catch{}
  if(!win)notify('投影視窗被瀏覽器阻擋，請允許此網站開啟新視窗。',true);
});
channel.addEventListener('message',e=>{if(e.data?.type==='ready')scheduleBroadcast();if(e.data?.type==='votes'&&e.data.session===session)acceptVotes(e.data.groups);});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
document.addEventListener('wheel',e=>{
  const input=e.target;if(!(input instanceof HTMLInputElement)||input.type!=='number'||e.ctrlKey)return;
  // Only the rendered number responds, never the surrounding row or padding.
  const style=getComputedStyle(input),rect=input.getBoundingClientRect(),canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font=style.font;
  const x=rect.left+parseFloat(style.paddingLeft)+parseFloat(style.borderLeftWidth),width=context.measureText(input.value).width;
  const y=rect.top+rect.height/2,line=parseFloat(style.fontSize)*1.4;
  const textRight=Math.min(x+width+2,rect.right-parseFloat(style.paddingRight)-18);
  if(e.clientX<x-1||e.clientX>textRight||Math.abs(e.clientY-y)>line/2){if(document.activeElement===input)input.blur();return;}
  e.preventDefault();const step=Number(input.step)||.1,sign=e.deltaY<0?1:-1,min=Number(input.min),max=Number(input.max);input.value=Math.max(min,Math.min(max,Math.round((Number(input.value)+step*sign)*10000)/10000));input.dispatchEvent(new Event('input',{bubbles:true}));
},{passive:false});
renderPanels();renderBoard();$('#save-state').textContent=L.messages.localSaved;
if(!cloud.ready)$('#connection-detail').textContent='目前可先設計版面；正式部署後即可連接票源與儲存代碼。';
