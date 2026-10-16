const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','settings-store.js'),'utf8');
function fixture({local={},cloud={}}={}) {
 const listeners=[],timers=new Map(),calls=[];let next=0,fail=false,hold=null;
 const emit=(changes,area)=>{for(const listener of listeners)listener(changes,area);};
 const area=(data,name)=>({get:async()=>({...data}),set:async patch=>{if(name==='sync'){calls.push({...patch});if(fail)throw Error('sync quota');if(hold)await hold;}const changes={};for(const [key,value]of Object.entries(patch)){changes[key]={oldValue:data[key],newValue:value};data[key]=value;}emit(changes,name);}});
 const context=vm.createContext({chrome:{storage:{local:area(local,'local'),sync:area(cloud,'sync'),onChanged:{addListener:fn=>listeners.push(fn)}}},setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),Date,Math});
 vm.runInContext(source,context);
 return{api:context.baliSettingsStore,local,cloud,calls,emit,fail(value){fail=value;},hold(promise){hold=promise;},async flush(){const tasks=[...timers.values()];timers.clear();for(const fn of tasks)await fn();}};
}
test('rapid slider writes are combined into one cloud write',async()=>{
 const f=fixture();for(let value=0;value<100;value++)await f.api.set({blur:value});
 assert.equal(f.calls.length,0);assert.equal(f.local['bali-draft:blur'].value,99);
 await f.flush();assert.equal(f.calls.length,1);assert.equal(f.cloud.blur,99);
});
test('a sync failure retains the local setting across reload and later retries',async()=>{
 const f=fixture();f.fail(true);await f.api.set({blur:0,spread:147.1});await f.flush();
 const reloaded=fixture({local:f.local,cloud:{blur:55}});assert.equal((await reloaded.api.get()).blur,0);
 f.fail(false);await f.flush();assert.equal(f.cloud.blur,0);assert.equal(f.cloud.spread,147.1);
});
test('an acknowledged local draft does not override newer cloud settings at startup',async()=>{
 const f=fixture();await f.api.set({blur:35});await f.flush();
 const reload=fixture({local:f.local,cloud:{blur:75}});assert.equal((await reload.api.get()).blur,75);
});
test('a newer input survives completion of an older sync operation',async()=>{
 const f=fixture();let release;f.hold(new Promise(resolve=>release=resolve));
 await f.api.set({blur:35});const flushing=f.flush();await Promise.resolve();
 await f.api.set({blur:100});release();await flushing;f.hold(null);await f.flush();
 assert.equal(f.cloud.blur,100);assert.equal((await f.api.get()).blur,100);
});
test('another settings entrypoint replaces an older queued value',async()=>{
 const f=fixture();await f.api.set({blur:35});const stamp=f.local['bali-draft:blur'].stamp+10;
 f.emit({'bali-draft:blur':{newValue:{value:0,stamp}}},'local');await f.flush();
 assert.equal(f.cloud.blur,0);
});
test('unacknowledged local input ignores stale cloud events',async()=>{
 const f=fixture();const seen=[];f.api.subscribe(changes=>seen.push(changes));
 await f.api.set({blur:100});seen.length=0;f.emit({blur:{newValue:35}},'sync');assert.equal(seen.length,0);
});
