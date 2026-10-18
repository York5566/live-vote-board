import {getStored,setStored} from './storage.mjs';
// One network cycle per session/interval across visible windows in this browser.
// Web Locks serializes the check-and-reserve operation; D1 is the second defense.
export async function coordinatedPoll(token,seconds,task){
  if(!navigator.locks)return task();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const key=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return navigator.locks.request('lvb-poll-'+key,{ifAvailable:true},async lock=>{
    if(!lock)return null;
    const previous=await getStored('cycle-'+key);
    if(previous&&Date.now()<previous.nextAt)return null;
    await setStored('cycle-'+key,{nextAt:Date.now()+Math.max(15,seconds)*1000});
    try{return await task();}
    catch(error){await setStored('cycle-'+key,{nextAt:Date.now()+Math.max(30,error.retryAfter||60)*1000});throw error;}
  });
}
