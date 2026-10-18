import {site} from './config.mjs';
export class CloudClient {
  constructor(){this.base=site.apiBase?.replace(/\/$/,'')||'';}
  get ready(){return !!this.base;}
  async request(path,data,{token,signal}={}){
    if(!this.ready)throw new Error('網站尚未連接雲端服務。你仍可先設計看板，所有調整會保存在這台電腦。');
    const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
    const response=await fetch(this.base+path,{method:'POST',headers,body:JSON.stringify(data||{}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),credentials:'omit',referrerPolicy:'no-referrer'});
    let payload;try{payload=await response.json();}catch{throw new Error('服務暫時無法回應，請稍後再試。');}
    if(!response.ok){const error=new Error(payload.error||'操作失敗，請稍後再試。');error.status=response.status;error.retryAfter=Number(response.headers.get('Retry-After')||payload.retryAfter)||0;throw error;}
    return payload;
  }
}
let scriptPromise;
export async function renderChallenge(container,action,onToken,onError){
  if(site.localDevelopment){container.textContent='本機開發環境 · 正式部署會啟用安全驗證';onToken('local');return ()=>{};}
  if(!site.turnstileSiteKey){container.textContent='網站尚未設定安全驗證。';onError?.('請先完成部署設定。');return ()=>{};}
  if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=()=>reject(new Error('安全驗證載入失敗，請確認網路連線。'));document.head.append(script);});
  await scriptPromise;
  const id=window.turnstile.render(container,{sitekey:site.turnstileSiteKey,action,theme:'light',language:'zh-tw',callback:onToken,'expired-callback':()=>onToken(''),'error-callback':()=>{onToken('');onError?.('安全驗證暫時失敗，請關閉後重試。');}});
  return ()=>window.turnstile.remove(id);
}
