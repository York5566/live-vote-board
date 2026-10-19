import {Board,demoVotes} from './board.mjs';
import {defaults} from '../shared/model.mjs';
import {getStored} from './storage.mjs';
import {CloudClient} from './api.mjs';
import {Poller} from './polling.mjs';
import {coordinatedPoll} from './live.mjs';
import {createScreenPicker} from './screen-picker.mjs';
import {sourceIssues} from '../shared/source-status.mjs';
const params=new URLSearchParams(location.search),room=params.get('room')||'demo';
const channel=new BroadcastChannel('live-vote-board-'+room),board=new Board(document.querySelector('#projection')),status=document.querySelector('#display-status'),cloud=new CloudClient();
let hasState=false,lastSeen=Date.now(),current=null;
const poller=new Poller(async signal=>{
  if(!current?.session)return;
  const result=await coordinatedPoll(current.session,current.config.refresh,()=>cloud.request('/api/votes',{}, {token:current.session,signal}));
  if(!result)return;
  current.states=result.groups.map((g,i)=>g.counts?g:{...g,counts:current.states[i]?.counts||null});current.demo=false;
  channel.postMessage({type:'votes',session:current.session,groups:result.groups});render(current);
  if(result.groups.some(g=>['error','stale','waiting'].includes(g.status))){const e=new Error(sourceIssues(current.config,current.states).map(x=>x.message).join('\n'));e.retryAfter=60;throw e;}
},{onState:state=>{if(state.error){status.textContent=state.error.message;if(state.error.status===401)poller.stop();}}});
function render(state){current=state;hasState=true;lastSeen=Date.now();board.render(state.config,state.states,{demo:state.demo});document.querySelector('#display-empty').hidden=true;status.textContent=state.demo?'示範畫面':sourceIssues(state.config,state.states).map(x=>x.message).join('\n')||(state.running?'自動更新中 · 同一瀏覽器共用更新節奏':'自動更新已暫停');poller.seconds=state.config.refresh;if(state.session&&state.running)poller.start();else poller.stop();}
channel.addEventListener('message',e=>{if(e.data?.type==='state')render(e.data);});
channel.postMessage({type:'ready'});
if(params.get('demo')==='1'){const config=defaults();render({config,states:demoVotes(config),demo:true});}
else{try{const stored=await getStored('projection-'+room);if(stored&&!hasState)render(stored);}catch{}}
const screenPicker=createScreenPicker({onMessage:message=>{status.textContent=message;document.querySelector('.display-controls').classList.remove('quiet');}});
document.querySelector('#fullscreen').addEventListener('click',()=>screenPicker.open());
document.querySelector('#back-studio').addEventListener('click',()=>window.open('../studio/','_blank','noopener'));
const controls=document.querySelector('.display-controls');let hideTimer;
function reveal(){controls.classList.remove('quiet');clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!controls.contains(document.activeElement))controls.classList.add('quiet');},4000);}
document.addEventListener('pointermove',reveal);document.addEventListener('keydown',reveal);reveal();
setInterval(()=>{if(hasState&&!current?.session&&params.get('demo')!=='1'&&Date.now()-lastSeen>90000)status.textContent='保留最後畫面，請從操作頁重新連接票源。';},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)channel.postMessage({type:'ready'});});
