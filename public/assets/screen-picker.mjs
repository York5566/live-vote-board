export function createScreenPicker({onMessage=()=>{}}={}){
  const dialog=document.createElement('dialog');dialog.className='screen-dialog';dialog.setAttribute('aria-label','選擇投影螢幕');document.body.append(dialog);
  let details=null;
  const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(label,action,cls='')=>{const b=element('button',label,cls);b.type='button';b.addEventListener('click',action);return b;};
  const fullscreenMode=matchMedia('(display-mode: fullscreen)');
  const setPresentation=()=>{
    const full=!!document.fullscreenElement||fullscreenMode.matches;
    document.body.classList.toggle('presentation-fullscreen',full);
  };
  document.addEventListener('fullscreenchange',setPresentation);fullscreenMode.addEventListener('change',setPresentation);setPresentation();
  async function enter(target){
    dialog.close();
    try{
      const options={navigationUI:'hide'};if(target)options.screen=target;
      await document.documentElement.requestFullscreen(options);setPresentation();
    }catch{onMessage('無法在指定螢幕進入全螢幕。請重新選擇，或先把投影視窗拖到該螢幕，再按「目前螢幕」。');}
  }
  function render(message=''){
    dialog.replaceChildren();
    const heading=element('div',null,'screen-dialog-heading');heading.append(element('h2','選擇投影螢幕'),button('關閉',()=>dialog.close(),'small subtle'));dialog.append(heading);
    dialog.append(element('p','進入全螢幕後，操作按鈕會完全隱藏。按 Esc 可退出。'));
    if(message){const note=element('p',message,'screen-note');note.setAttribute('role','status');dialog.append(note);}
    const list=element('div',null,'screen-list');
    list.append(button('目前螢幕 · 進入全螢幕',()=>enter(null),'primary'));
    if(details?.screens?.length){
      details.screens.forEach((s,i)=>list.append(button((s.label||'螢幕 '+(i+1))+' · '+s.width+' × '+s.height+(s.isPrimary?' · 主螢幕':''),()=>enter(s))));
      dialog.append(element('p','請選擇觀眾觀看的螢幕或投影機；你的操作頁會留在原來的視窗。','hint'));
    }
    dialog.append(list);
    if('getScreenDetails' in window)dialog.append(button(details?'重新偵測螢幕':'偵測可用螢幕',async()=>{
      try{
        details=await window.getScreenDetails();
        details.addEventListener?.('screenschange',()=>{if(dialog.open)render('螢幕已變更，請重新選擇。');},{once:true});
        render(details.screens.length===1?'目前只偵測到一個螢幕。請先接上投影機或第二個螢幕，再重新偵測。':'');
      }catch{render('尚未取得螢幕存取權限。你仍可將這個投影視窗拖到目標螢幕，再選「目前螢幕」。也可到網址列的網站設定允許螢幕管理。');}
    },'small'));
    else dialog.append(element('p','此瀏覽器無法列出所有螢幕。請先將投影視窗拖到目標螢幕，再選「目前螢幕」。','hint'));
  }
  return {open(){if(document.fullscreenElement){document.exitFullscreen();return;}render();dialog.showModal();},dialog};
}
