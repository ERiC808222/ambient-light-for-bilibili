const vm=require('node:vm');
function extract(source,name){const start=source.indexOf('  function '+name+'(');if(start<0)return '';const end=source.indexOf('\n  function ',start+1);return source.slice(start,end<0?undefined:end);}
function createHarness(source,{fps=60,performanceMode=true}={}){
 const state={now:0,paints:[],events:[],listeners:new Map(),callbacks:new Map(),nextId:1,tasks:[]};
 const v={paused:false,seeking:false,currentTime:0,requestVideoFrameCallback:fn=>{const id=state.nextId++;state.callbacks.set(id,fn);state.events.push('request');return id;},cancelVideoFrameCallback:id=>state.callbacks.delete(id),addEventListener:(type,fn)=>{if(!state.listeners.has(type))state.listeners.set(type,[]);state.listeners.get(type).push(fn);}};
 const context=vm.createContext({videoMock:v,state,performance:{now:()=>state.now},document:{hidden:false},window:{requestIdleCallback:true},requestIdleCallback:fn=>{state.tasks.push(fn);return state.tasks.length;},cancelIdleCallback:()=>{},setTimeout:fn=>{state.tasks.push(fn);return state.tasks.length;},clearTimeout:()=>{},requestAnimationFrame:fn=>{const id=state.nextId++;state.callbacks.set(id,fn);return id;},cancelAnimationFrame:id=>state.callbacks.delete(id)});
 const definitions=['frameDue','draw','stopFrameLoop','startFrameLoop','addVideoListeners'].map(n=>extract(source,n)).join('\n');
 vm.runInContext(`
 const settings={fps:${fps},performanceMode:${performanceMode},ambientIntensity:100,alphaProjector:true};
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
 let video=videoMock,root={},lastDraw=0,nextDrawAt=0,frameLoopToken=0,rvfcId=0,rafId=0,disposed=false,barDetectionTask=null,lastBarDetection=0,frameSerial=0,geometryDirty=false;
 const listenedVideos=new WeakSet();
 const active=()=>true,updateGeometry=()=>{},detectBars=()=>state.events.push('detect');
 const scheduleBarDetection=()=>state.events.push('schedule-detect');
 const derivedAmbient=()=>({blur:55,spread:85});
 const nearCanvas={},farCanvas={},nearCtx={},farCtx={};
 const resizeCanvasToViewport=()=>{},updateAmbientSample=()=>({});
 const paint=()=>{state.paints.push({now:state.now,mediaTime:video.currentTime});state.events.push('paint');};
 const drawScaledProjector=paint,drawEdgeProjector=paint,drawLegacyFrameTo=paint;
 ${definitions}
 this.api={start:startFrameLoop,stop:stopFrameLoop,listen:()=>addVideoListeners(video),draw,deadline:()=>nextDrawAt};
 `,context);
 return {state,v,api:context.api,tick(ms){state.now=ms;v.currentTime=ms/1000;const callbacks=[...state.callbacks.values()];state.callbacks.clear();for(const fn of callbacks)fn(ms,{mediaTime:v.currentTime,expectedDisplayTime:ms+16.67});},event(type){for(const fn of state.listeners.get(type)||[])fn();}};
}
function simulate(source,{sourceFps=60,fps=60,timeupdates=true}={}){
 const h=createHarness(source,{fps});h.api.listen();h.api.start();
 for(let frame=0;frame<sourceFps*2;frame++){
  h.tick(frame*1000/sourceFps);
  if(timeupdates&&frame%Math.round(sourceFps/4)===0)h.event('timeupdate');
 }
 const times=[...new Set(h.state.paints.map(p=>p.now))];
 const gaps=times.slice(1).map((t,i)=>t-times[i]);
 return {sourceFps,limit:fps,timeupdates,updates:times.length,effectiveFps:times.length/2,maxGapMs:Math.max(...gaps),firstPaintMs:times[0]};
}
module.exports={createHarness,simulate};
