export function sourceLabel(config,index){
  if(config.mode==='single')return '票源';
  const prefix=(index?'B':'A')+' 組',name=config.groups[index]?.name?.trim()||'';
  return !name||name===prefix?prefix:name.startsWith(prefix)?name:prefix+'｜'+name;
}
export function sourceIssues(config,groups=[]){
  return groups.flatMap((state,index)=>{
    if(!state||!['error','stale','waiting','unconfigured'].includes(state.status))return [];
    const pending=state.status==='waiting',missing=state.status==='unconfigured';
    const reason=state.message||(pending?'正在取得票數，稍後自動重試。':missing?'尚未填寫 Google 試算表網址。':'票源讀取失敗，請檢查網址與欄位設定。');
    const retained=!!state.counts;
    const message=sourceLabel(config,index)+'：'+reason+(retained?'（目前保留上次成功票數）':'');
    return [{index,status:state.status,reason,message,retained}];
  });
}
