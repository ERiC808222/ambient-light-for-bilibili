const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8');
function fn(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n  function ',start+1);
  return source.slice(start,end < 0 ? undefined : end);
}
function renderer(overrides={}) {
  return vm.runInNewContext(`
    const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
    const settings = ${JSON.stringify({blur:0,spread:147.1,edgeSize:12,spreadFadeStart:15,spreadFadeCurve:35,...overrides})};
    const geometry = {h:540};
    const video = null;
    ${fn('derivedAmbient')}
    ${fn('projectionLayout')}
    ${fn('fadeAlphaAt')}
    ({ambient:derivedAmbient(),layout:projectionLayout({w:960,h:540}),fade:fadeAlphaAt})
  `,{}, {timeout:500});
}
test('0% blur is exactly 0px in both projector modes',()=>{
  for(const alphaProjector of [true,false]) assert.equal(renderer({alphaProjector}).ambient.blurPx,0);
  assert.equal(renderer({blur:100}).ambient.blurPx,135);
  assert.equal(renderer({blur:55}).ambient.blurPx,74.25);
});
test('spread and edge spacing follow concentric full-frame scales',()=>{
  const r=renderer();
  assert.equal(r.layout.levels,12);
  assert.equal(r.layout.step,115.2);
  assert.ok(Math.abs(r.layout.extent-691.2)<1e-8);
  assert.equal(renderer({spread:0}).layout.extent,0);
  assert.equal(renderer({spread:400,edgeSize:2}).layout.levels,200);
  assert.ok(renderer({spread:400}).layout.extent > renderer({spread:100}).layout.extent);
});
test('blur changes softness without changing scale geometry',()=>{
  const a=renderer({blur:0}),b=renderer({blur:100});
  assert.equal(a.layout.extent,b.layout.extent);
  assert.equal(a.layout.levels,b.layout.levels);
});
test('falloff supports negative starts and never creates invalid alpha',()=>{
  for(const spreadFadeStart of [-50,0,15,100]) for(const spreadFadeCurve of [1,35,100]) {
    const {fade}=renderer({spreadFadeStart,spreadFadeCurve});
    let previous=1;
    for(let t=-.5;t<=1.01;t+=.01) {
      const alpha=fade(t);
      assert.ok(Number.isFinite(alpha)&&alpha>=0&&alpha<=1);
      assert.ok(alpha <= previous+1e-10);
      previous=alpha;
    }
  }
});
test('both existing menus expose the full ranges',()=>{
  const popup=fs.readFileSync(path.join(__dirname,'..','popup.html'),'utf8');
  for(const [id,min,max] of [['blur',0,100],['spread',0,400],['edgeSize',2,50],['spreadFadeStart',-50,100]]) {
    assert.match(popup,new RegExp('id="'+id+'"[^>]*min="'+min+'"[^>]*max="'+max+'"'));
    assert.match(source,new RegExp("sliderRow\\('[^']+', '"+id+"', "+min+", "+max+","));
  }
});
test('source syntax and popup syntax parse',()=>{
  new vm.Script(source);
  new vm.Script(fs.readFileSync(path.join(__dirname,'..','popup.js'),'utf8'));
});
test('default colour and framerate values agree in both settings entrypoints',()=>{
  const popup=fs.readFileSync(path.join(__dirname,'..','popup.js'),'utf8');
  const parse=text=>vm.runInNewContext('('+text.match(/const DEFAULTS = (\{[\s\S]*?\n\s*\});/)[1]+')');
  const contentDefaults=parse(source),popupDefaults=parse(popup);
  for(const [key,value] of Object.entries({brightness:100,saturation:105,blackCrush:false,fps:60,edgeShadowSuppression:100,settingsRevision:4})){
    assert.equal(contentDefaults[key],value);assert.equal(popupDefaults[key],value);
  }
});
test('removing drop-shadows preserves other colour filter functions',()=>{
  const strip=vm.runInNewContext(fn('stripDropShadows')+'; stripDropShadows');
  assert.equal(strip('drop-shadow(0 0 12px rgba(0, 0, 0, .8))'),'none');
  assert.equal(strip('brightness(.9) drop-shadow(0 0 2px black) saturate(1.2)').replace(/\s+/g,' '),'brightness(.9) saturate(1.2)');
  assert.equal(strip('drop-shadow(0 0 2px rgb(0,0,0)) drop-shadow(1px 1px 3px black)'),'none');
});
