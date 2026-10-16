const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {createHarness,simulate}=require('./helpers/frame-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8');
test('30fps and 60fps video stay on their frame cadence with timeupdate events',()=>{
 for(const sourceFps of [24,25,30,60]){const r=simulate(source,{sourceFps,fps:60});assert.equal(r.updates,sourceFps*2);assert.ok(r.maxGapMs<=1000/sourceFps+.01);}
});
test('explicit 24fps limit keeps its phase instead of collapsing to 20fps',()=>{
 const r=simulate(source,{sourceFps:60,fps:24});assert.equal(r.updates,48);assert.ok(r.maxGapMs<=50.01);
});
test('force redraw uses real time and never delays the next video frame',()=>{
 const h=createHarness(source,{fps:60});h.api.listen();h.api.start();h.tick(0);h.state.now=5;h.api.draw(5,true);h.tick(1000/60);assert.equal(h.state.paints.length,3);assert.ok(h.api.deadline()<50);
 assert.doesNotMatch(source,/performance\.now\(\)\s*\+\s*1000/);
});
test('repeated attach does not install duplicate video event listeners',()=>{
 const h=createHarness(source);h.api.listen();h.api.listen();h.api.listen();for(const handlers of h.state.listeners.values())assert.equal(handlers.length,1);
});
test('next callback is registered before painting and analysis is deferred',()=>{
 const h=createHarness(source);h.api.start();h.state.events.length=0;h.tick(0);assert.ok(h.state.events.indexOf('request')<h.state.events.indexOf('paint'));assert.ok(h.state.events.indexOf('paint')<h.state.events.indexOf('schedule-detect'));assert.ok(!h.state.events.includes('detect'));
});
test('stale callback cannot restart a stopped frame loop',()=>{
 const h=createHarness(source);h.api.start();const stale=[...h.state.callbacks.values()][0];h.api.stop();stale(16);assert.equal(h.state.callbacks.size,0);assert.equal(h.state.paints.length,0);
});
test('a long interruption resumes with the latest frame without a catch-up queue',()=>{
 const h=createHarness(source);h.api.start();h.tick(0);h.tick(5000);h.tick(5017);assert.equal(h.state.paints.length,3);assert.equal(h.state.callbacks.size,1);
});
