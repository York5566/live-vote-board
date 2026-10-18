import { LIMITS } from './model.mjs';
export function columnIndex(column) {
  if(!/^[A-Z]{1,2}$/.test(column)) throw new Error('欄位請填 A、B、C 等英文字母（最多 ZZ）。');
  return [...column].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
}
export function normalizeSource(source={}) {
  let url;
  try {url=new URL(source.url);}catch {throw new Error('請貼上完整的 Google 試算表網址。');}
  if(url.hostname==='forms.gle'||url.pathname.includes('/forms/')) throw new Error('這是表單填答網址。請開啟 Google 表單「回應 → 連結至試算表」，貼上試算表網址。');
  if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||url.port||url.username||url.password) throw new Error('只接受 https://docs.google.com 的 Google 試算表網址。');
  const match=url.pathname.match(/^\/spreadsheets\/d\/(e\/)?([A-Za-z0-9_-]{10,200})(?:\/|$)/);
  if(!match) throw new Error('試算表網址格式不正確。');
  const gid=url.searchParams.get('gid')||new URLSearchParams(url.hash.slice(1)).get('gid');
  if(gid&&!/^\d{1,12}$/.test(gid)) throw new Error('工作表 gid 必須是數字。');
  const params=new URLSearchParams({format:'csv'});
  if(gid)params.set('gid',gid);
  let endpoint;
  if(match[1]) {
    params.delete('format');params.set('output','csv');
    endpoint='https://docs.google.com/spreadsheets/d/e/'+match[2]+'/pub?'+params;
  } else if(source.sheetName?.trim()) {
    const q=new URLSearchParams({tqx:'out:csv',sheet:source.sheetName.trim()});
    endpoint='https://docs.google.com/spreadsheets/d/'+match[2]+'/gviz/tq?'+q;
  } else endpoint='https://docs.google.com/spreadsheets/d/'+match[2]+'/export?'+params;
  const nameColumn=(source.nameColumn||'A').toUpperCase(),countColumn=(source.countColumn||'B').toUpperCase();
  columnIndex(nameColumn);columnIndex(countColumn);
  return {url:endpoint,mode:source.mode==='responses'?'responses':'summary',nameColumn,countColumn,header:source.header!==false,multiple:source.multiple===true,separator:String(source.separator||', ').slice(0,8)};
}
export function parseCSV(input) {
  const rows=[];let row=[],field='',quoted=false,closed=false;
  const text=input.replace(/^\uFEFF/,'');
  if(/^\s*</.test(text)) throw new Error('讀到登入或錯誤頁面。請確認已發布指定工作表，或允許知道連結的人檢視。');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
    else if(c==='"'&&!field&&!closed)quoted=true;
    else if(c===','||c==='\r'||c==='\n'){
      row.push(field);field='';closed=false;
      if(row.length>702)throw new Error('試算表欄位過多。請只提供投票所需欄位。');
      if(c!==','){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
    } else {if(closed&&c!==' '&&c!=='\t')throw new Error('CSV 引號格式不正確。');field+=c;}
    if(rows.length>LIMITS.maxRows)throw new Error('回應超過 10,000 列，請改用彙總票數工作表。');
  }
  if(quoted)throw new Error('CSV 引號未關閉，請確認試算表資料。');
  if(field||row.length)rows.push([...row,field]);
  return rows;
}
export function aggregateCSV(csv, source) {
  const rows=parseCSV(csv), name=columnIndex(source.nameColumn), count=columnIndex(source.countColumn), counts=Object.create(null);
  const headers=source.header?(rows[0]||[]).map(v=>v.slice(0,120)):[];
  const data=rows.slice(source.header?1:0);let responseRows=0;
  for(let i=0;i<data.length;i++){
    const row=data[i];if(!row.some(v=>v.trim()))continue;
    if(name>=row.length || (source.mode==='summary'&&count>=row.length))throw new Error('找不到指定欄位，請確認欄位字母。');
    const answer=row[name].trim();if(!answer)continue;
    const names=source.mode==='responses'&&source.multiple ? [...new Set(answer.split(source.separator).map(x=>x.trim()).filter(Boolean))] : [answer];
    let votes=1;
    if(source.mode==='summary'){
      const cell=(row[count]||'').trim().replaceAll(',','');
      if(!/^\d+$/.test(cell||'0') || !Number.isSafeInteger(Number(cell)) || Number(cell)>1e9)throw new Error('票數欄必須是 0 以上的整數（第 '+(i+1+(source.header?1:0))+' 列）。');
      votes=Number(cell||0);
    }
    for(const n of names){
      if(n.length>120)throw new Error('選項名稱超過 120 字，請確認沒有選到其他欄位。');
      counts[n]=(counts[n]||0)+votes;
    }
    if(Object.keys(counts).length>100)throw new Error('選項超過 100 個，請確認選到的是投票選項欄。');
    responseRows++;
  }
  return {counts,total:Object.values(counts).reduce((a,b)=>a+b,0),responseRows,headers};
}
export async function readLimited(response,maxBytes) {
  if(Number(response.headers.get('content-length'))>maxBytes)throw new Error('資料大小超過限制。');
  if(!response.body)return '';
  const reader=response.body.getReader();let length=0;const parts=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes)throw new Error('資料大小超過限制。');parts.push(value);}}catch(e){await reader.cancel();throw e;}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function safeGoogleRedirect(url) {
  return url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&(url.hostname==='docs.google.com'||/^[a-z0-9-]+\.googleusercontent\.com$/.test(url.hostname));
}
export async function fetchVotes(source, fetcher=fetch) {
  let url=new URL(source.url);const timeout=AbortSignal.timeout(8000);
  for(let i=0;i<4;i++){
    if(!safeGoogleRedirect(url))throw new Error('Google 回傳了不允許的重新導向。');
    const response=await fetcher(url.toString(),{redirect:'manual',signal:timeout,headers:{Accept:'text/csv,text/plain;q=0.9'}});
    if(response.status>=300&&response.status<400){const target=response.headers.get('location');await response.body?.cancel();if(!target)throw new Error('試算表重新導向失敗。');url=new URL(target,url);continue;}
    if(!response.ok){await response.body?.cancel();throw new Error(response.status===401||response.status===403?'試算表尚未開放讀取。請發布不含個資的票數工作表。':'Google 暫時無法提供資料，保留上次票數，稍後再試。');}
    return aggregateCSV(await readLimited(response,LIMITS.sourceBytes),source);
  }
  throw new Error('試算表重新導向次數過多。');
}
