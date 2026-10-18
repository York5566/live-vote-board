export function pollDelay(base,failures=0,retryAfter=0){return Math.min(3600,Math.max(15,base,Math.min(300,base*2**failures),retryAfter));}
export class Poller {
  constructor(task,{seconds=30,onState=()=>{},clock=()=>Date.now()}={}){this.task=task;this.seconds=seconds;this.onState=onState;this.clock=clock;this.running=false;this.inflight=false;this.failures=0;this.timer=null;this.nextAt=0;this.visibility=()=>{if(this.running&&!document.hidden)this.schedule(Math.max(0,(this.nextAt-this.clock())/1000));else clearTimeout(this.timer);};document.addEventListener('visibilitychange',this.visibility);}
  start(immediate=false){if(this.running)return;this.running=true;this.schedule(immediate?0:this.seconds);}
  stop(){this.running=false;clearTimeout(this.timer);this.controller?.abort();this.onState({running:false});}
  schedule(seconds){clearTimeout(this.timer);this.nextAt=this.clock()+seconds*1000;if(this.running&&!document.hidden)this.timer=setTimeout(()=>this.tick(),seconds*1000);}
  async tick(){
    if(!this.running||this.inflight||document.hidden)return;
    this.inflight=true;this.controller=new AbortController();let delay=this.seconds;
    try{await this.task(this.controller.signal);this.failures=0;}
    catch(e){if(e.name!=='AbortError'){this.failures=Math.min(6,this.failures+1);delay=pollDelay(this.seconds,this.failures,e.retryAfter||0);this.onState({error:e,nextIn:delay});}}
    finally{this.inflight=false;if(this.running)this.schedule(Math.max(15,delay));}
  }
  refresh(){if(!this.running||this.inflight)return;this.tick();}
  destroy(){this.stop();document.removeEventListener('visibilitychange',this.visibility);}
}
