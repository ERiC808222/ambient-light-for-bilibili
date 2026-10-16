const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const repo=path.resolve(__dirname,'..');
const root=process.env.BILI_ARTIFACT_DIR||path.join(repo,'.test-artifacts');
const dir=path.join(root,'browser-check','video');
fs.mkdirSync(dir,{recursive:true});
let source=fs.readFileSync(process.env.BILI_SOURCE_PATH||path.join(repo,'content.js'),'utf8');
const expectedScriptBuild=source.match(/scriptBuild:'([^']+)'/)[1];
const artifactVersion=process.env.BILI_TEST_LABEL||JSON.parse(fs.readFileSync(path.join(repo,'manifest.json'),'utf8')).version;
const startup=source.indexOf('  loadSettings().then(() => {');
const shutdown=source.indexOf("  window.addEventListener('beforeunload'",startup);
if(startup<0||shutdown<0)throw new Error('Startup boundary missing');
source=source.slice(0,startup)+`
  window.rendererTest = {
    render(patch={}) {
      settings = {...DEFAULTS,...patch};
      video = document.getElementById('source');
      player = document.querySelector('.bpx-player-container');
      const r=video.getBoundingClientRect();
      geometry={x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
      ensureRoot();applyStyles();resizeCanvasToViewport(nearCanvas,nearCtx,false);
      drawScaledProjector(nearCtx,nearCanvas,updateAmbientSample());
      return {canvas:nearCanvas,geometry,layout:projectionLayout(getAmbientContentRect(effectiveBarCrop())),ambient:derivedAmbient(),crop:getAmbientSourceCrop()};
    },
    menu(){ensurePlayerSettingsButton();settingsPanel.hidden=false;return settingsPanel;},
    mini(){updateMiniPlayerLayer();return player.hasAttribute('data-bali-mini-player');},
    saved(){return {...settings};},
    frame:draw,
    bars(){return {...barCrop};},
    resetBars(){resetBarDetection();lastBarDetection=-1000;settings.fillVideoToCrop=false;applyVideoFill();},
    load:loadSettings,
    diagnose:collectBorderDiagnostics,
    fitToolbar:fitToolbarSpacing,
    stopToolbar:stopToolbarFit,
    stop:stopFrameLoop
  };
`+source.slice(shutdown);
const testCode=String.raw`
(async()=>{
 const checks=[];
 const assert=(condition,name)=>{checks.push({name,passed:!!condition});if(!condition)throw new Error(name);};
 const src=document.getElementById('source');
 Object.defineProperties(src,{videoWidth:{value:640},videoHeight:{value:360}});
 const ctx=src.getContext('2d');
 ctx.fillStyle='#3c78bc';ctx.fillRect(0,0,640,360);
 ctx.fillStyle='#fbd45c';ctx.fillRect(0,0,240,360);
 ctx.fillStyle='#56bc89';ctx.fillRect(425,0,215,360);
 ctx.fillStyle='#ec6964';ctx.fillRect(230,140,200,220);
 ctx.lineWidth=4;ctx.strokeStyle='#fff';
 for(let x=0;x<640;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,360);ctx.stroke();}
 for(let y=0;y<360;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(640,y);ctx.stroke();}
 ctx.fillStyle='#18263d';ctx.font='bold 44px sans-serif';ctx.fillText('FRAME  •  AL',80,100);
 const calls=[];
 const originalDraw=CanvasRenderingContext2D.prototype.drawImage;
 CanvasRenderingContext2D.prototype.drawImage=function(...args){calls.push({target:this.canvas.id,source:args[0].id,w:args[7],h:args[8]});return originalDraw.apply(this,args);};
 const base={blur:0,spread:147.1,edgeSize:12,spreadFadeStart:100,performanceMode:true};
 const originalPixels=ctx.getImageData(0,0,640,360);
 calls.length=0;
 let state=rendererTest.render(base);
 assert(getComputedStyle(state.canvas).filter.startsWith('blur(0px)'),'Blur 0% has no CSS blur');
 assert(getComputedStyle(state.canvas).filter.includes('brightness(1)')&&getComputedStyle(state.canvas).filter.includes('saturate(1.05)'),'Default ambient colour has full brightness and restored saturation');
 assert(calls.filter(c=>c.source==='source').length===1,'One source-frame copy per ambient render');
 const frameCalls=calls.filter(c=>c.target==='bili-ambient-v32-near'&&c.w>0);
 assert(new Set(frameCalls.map(c=>c.w.toFixed(2))).size>3,'Several full-frame projection sizes are rendered');
 assert(frameCalls.every(c=>Number.isFinite(c.w)&&Number.isFinite(c.h)&&c.w>0&&c.h>0),'Finite projection dimensions');
 function pixel(x,y){const r=state.canvas.getBoundingClientRect();return state.canvas.getContext('2d').getImageData(Math.floor((x-r.x)*state.canvas.width/r.width),Math.floor((y-r.y)*state.canvas.height/r.height),1,1).data;}
 assert(pixel(state.geometry.x+state.geometry.w+25,state.geometry.y+90)[3]>200,'Clear extended picture exists outside the video');
 let minAlpha=255;
 for(let x=state.geometry.x+state.geometry.w+3;x<innerWidth-3;x++)minAlpha=Math.min(minAlpha,pixel(x,state.geometry.y+90)[3]);
 assert(minAlpha>=254,'Adjacent clear projections have no transparent hairline seams');
 state=rendererTest.render({...base,spread:0});
 assert(pixel(state.geometry.x+state.geometry.w+25,state.geometry.y+90)[3]===0,'Zero spread produces no geometric extension');
 assert(getComputedStyle(state.canvas).opacity==='0','Blur 0 plus Spread 0 hides the projector');
 const widths=[];
 for(const spread of [85,147.1,400]){state=rendererTest.render({...base,spread});widths.push(state.layout.extent);}
 assert(widths[0]<widths[1]&&widths[1]<widths[2],'Spread above 100% increases the projection extent');
 for(const blur of [0,55,100])for(const spreadFadeStart of [-50,15,100]){
   state=rendererTest.render({...base,blur,spread:400,edgeSize:2,spreadFadeStart});
   assert(Number.isFinite(state.layout.extent),'Extreme settings render: blur '+blur+', fade '+spreadFadeStart);
 }
 state=rendererTest.render({...base,blur:100});
 assert(getComputedStyle(state.canvas).filter.startsWith('blur(90px)'),'Blur 100% follows displayed video height');
 state=rendererTest.render({...base,alphaProjector:false});
 assert(getComputedStyle(state.canvas).filter.startsWith('blur(0px)'),'Single-projection fallback also honors zero blur');
 state=rendererTest.render({...base,ambientIntensity:0});
 assert(getComputedStyle(state.canvas).opacity==='0','Color intensity 0% really turns off the light');
 state=rendererTest.render(base);
 let panel=rendererTest.menu();
 assert(panel.querySelector('[data-key="blur"]').max==='100','In-player Blur range is 0–100');
 assert(panel.querySelector('[data-key="spread"]').max==='400','In-player Spread range is 0–400');
 const alButton=document.querySelector('.bali-ambient-player-btn');
 assert(alButton.closest('.bpx-player-control-bottom-right')&&getComputedStyle(alButton).position==='relative','AL entry is restored to the native playback toolbar');
 const nativeSetting=document.querySelector('.bpx-player-ctrl-setting');
 assert(alButton.nextElementSibling===nativeSetting,'AL entry sits beside native settings');
 assert(alButton.parentElement.hasAttribute('data-bali-toolbar-fit'),'Narrow toolbar reclaims spacing to fit the added entry');
 const originalNativeWidth=nativeSetting.getBoundingClientRect().width;
 for(const width of [640,668,960]) {
   const frame=document.querySelector('.bpx-player-container');frame.style.width=width+'px';
   rendererTest.fitToolbar();
   assert(nativeSetting.getBoundingClientRect().right<=frame.getBoundingClientRect().right+1,'All native right controls stay inside the '+width+'px player');
   assert(alButton.getBoundingClientRect().left>=frame.getBoundingClientRect().left&&alButton.getBoundingClientRect().right<=frame.getBoundingClientRect().right,'AL stays inside the '+width+'px player');
 }
 assert(parseFloat(getComputedStyle(nativeSetting).marginLeft)===8,'Wide toolbar restores native spacing');
 assert(nativeSetting.getBoundingClientRect().width===originalNativeWidth,'Spacing adjustment retains native button width');
 document.querySelector('.bpx-player-container').style.width='640px';
 rendererTest.fitToolbar();rendererTest.stopToolbar();
 assert(nativeSetting.style.marginLeft==='8px'&&nativeSetting.style.marginRight==='8px','Cleanup restores the original inline toolbar spacing');
 rendererTest.fitToolbar();
 const toolbar=alButton.parentElement, frame=document.querySelector('.bpx-player-container');
 const nativeFlow=document.createElement('style');
 nativeFlow.textContent='.bpx-player-ctrl-btn{float:left;height:22px;line-height:22px;padding:0}.native-control,.bpx-player-ctrl-setting{width:24px}';
 document.head.append(nativeFlow);
 const originalToolbarStyle=toolbar.getAttribute('style');
 const filler=toolbar.firstElementChild, originalFillerStyle=filler.getAttribute('style');
 const peers=[...toolbar.querySelectorAll('.native-control,.bpx-player-ctrl-setting')];
 const originalClasses=peers.map(node=>node.className);
 for(const node of peers)node.classList.add('bpx-player-ctrl-btn');
 toolbar.style.cssText+=';display:block;flex:0 0 auto;width:max-content;height:35px';
 filler.style.cssText+=';float:left;width:270px;height:22px';
 for(const width of [960,668,640]) {
   frame.style.width=width+'px';rendererTest.fitToolbar();
   const badge=alButton.firstElementChild.getBoundingClientRect(), native=nativeSetting.getBoundingClientRect();
   assert(Math.abs((badge.top+badge.bottom-native.top-native.bottom)/2)<.75,'AL badge aligns vertically with native floated controls at '+width+'px');
   assert(alButton.getBoundingClientRect().right<=native.left+.75,'AL follows native float ordering without overlapping the gear at '+width+'px');
   assert(native.right<=frame.getBoundingClientRect().right+1,'Floated native controls fit inside the '+width+'px player');
 }
 const badgeRect=alButton.firstElementChild.getBoundingClientRect();
 assert(badgeRect.height<=22&&badgeRect.width<=alButton.getBoundingClientRect().width,'Compact AL badge stays inside its control hit area');
 rendererTest.stopToolbar();
 toolbar.setAttribute('style',originalToolbarStyle);filler.setAttribute('style',originalFillerStyle);
 peers.forEach((node,index)=>node.className=originalClasses[index]);nativeFlow.remove();rendererTest.fitToolbar();
 alButton.focus();assert(getComputedStyle(alButton).opacity==='1','Toolbar AL entry is visible for keyboard focus');alButton.blur();
 assert(getComputedStyle(document.getElementById('headerReference')).backgroundColor==='rgba(0, 0, 0, 0)','Header popover references have no dark tiles');
 assert(getComputedStyle(document.getElementById('shareReference')).backgroundColor==='rgba(0, 0, 0, 0)','Share reference has no black rectangle');
 assert(getComputedStyle(document.getElementById('actualPopover')).backgroundColor==='rgba(17, 19, 25, 0.88)','Actual popover content retains a readable background');
 const author=document.querySelector('.up-panel-container');
 assert(getComputedStyle(author).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(author).backgroundImage==='none','UP author panel is fully transparent');
 assert(getComputedStyle(author.querySelector('.up-info-container')).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(author,'::before').backgroundImage==='none','Nested author background and decorative gradient are transparent');
 assert(getComputedStyle(author.querySelector('button')).backgroundColor==='rgb(0, 174, 236)','Follow button retains its blue background');
 window.syncBlocked=true;
 for(const [index,blur] of [[0,35],[1,55],[2,75]]) {
   panel.querySelectorAll('.bali-menu-preset-buttons button')[index].click();
   rendererTest.stop();
   assert(getComputedStyle(state.canvas).filter.startsWith('blur('+(360*.0025*blur)+'px)'),'Preset '+index+' applies the real filter before sync completes');
   const blurControl=panel.querySelector('[data-key="blur"]');
   blurControl.value='0';blurControl.dispatchEvent(new Event('input',{bubbles:true}));
   assert(getComputedStyle(state.canvas).filter.startsWith('blur(0px)'),'Blur zero works immediately after preset '+index);
   blurControl.value='100';blurControl.dispatchEvent(new Event('input',{bubbles:true}));
   assert(getComputedStyle(state.canvas).filter.startsWith('blur(90px)'),'Blur maximum works immediately after preset '+index);
 }
 window.syncBlocked=false;for(const resolve of window.blockedWrites.splice(0))resolve();
 const spreadControl=panel.querySelector('[data-key="spread"]');
 spreadControl.value='147.1';spreadControl.dispatchEvent(new Event('input',{bubbles:true}));
 await Promise.resolve();
 assert(window.savedValues.spread===147.1,'In-player slider persists decimal spread above 100%');
 document.querySelector('.bali-menu-close').click();assert(panel.hidden,'Existing close button works');
 document.querySelector('.bali-ambient-player-btn').click();assert(!panel.hidden,'Existing AL button reopens its menu');
 const player=document.querySelector('.bpx-player-container');
 player.style.position='fixed';player.style.width='320px';player.style.height='220px';
 assert(rendererTest.mini(),'Existing floating player detection remains active');
 assert(Number(getComputedStyle(player).zIndex)>1000,'Floating player stays above the page');
 player.style.position='absolute';player.style.width='640px';player.style.height='444px';rendererTest.mini();
 assert(!player.hasAttribute('data-bali-mini-player'),'Normal player restores its existing layer');
 const header=document.querySelector('.bili-header');
 assert(Number(getComputedStyle(header).zIndex)>100000,'Existing header layering is preserved');
 assert(getComputedStyle(document.getElementById('bili-ambient-v32-root')).pointerEvents==='none','Ambient layer does not intercept player input');
 assert(getComputedStyle(player).boxShadow==='none'&&getComputedStyle(player).filter==='none','Native player shadow and drop-shadow are removed');
 const outer=document.getElementById('playerWrap');
 assert(getComputedStyle(outer).boxShadow==='none','Outer player wrapper inline-important shadow is removed');
 assert(getComputedStyle(outer).filter==='brightness(1)','Outer drop-shadow removal preserves unrelated colour filters');
 assert(getComputedStyle(outer).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(outer).backgroundImage==='none','Outer wrapper black matte and gradient are transparent');
 assert(getComputedStyle(outer,'::before').boxShadow==='none'&&getComputedStyle(outer,'::before').backgroundImage==='none','Outer decorative pseudo-element adds no dark frame');
 assert(!document.body.hasAttribute('data-bali-player-shell')&&!document.getElementById('app').hasAttribute('data-bali-player-shell'),'Shadow cleanup stays within the player ancestors');
 const outerRect=outer.getBoundingClientRect();
 assert(outerRect.x===260&&outerRect.y===170&&outerRect.width===640&&outerRect.height===444,'Shadow cleanup leaves wrapper geometry unchanged');
 outer.style.setProperty('box-shadow','0 0 20px black','important');
 await Promise.resolve();
 assert(getComputedStyle(outer).boxShadow==='none','A later site inline shadow is removed again');
 rendererTest.render({...base,enabled:false});
 assert(outer.style.getPropertyValue('box-shadow').includes('20px')&&!outer.hasAttribute('data-bali-player-shell'),'Disabling ambient restores the site style and removes the marker');
 assert(outer.style.getPropertyValue('filter').includes('drop-shadow('),'Disabling ambient restores the original outer drop-shadow filter');
 rendererTest.render(base);
 assert(getComputedStyle(outer).boxShadow==='none','Re-enabling reapplies border removal');
 assert(getComputedStyle(src).boxShadow==='none'&&getComputedStyle(src).borderColor==='rgba(0, 0, 0, 0)','Picture element inline shadow and border are cleared');
 assert(getComputedStyle(document.getElementById('unnamedPictureWrap')).boxShadow==='none','Unnamed inner picture wrapper shadow is cleared');
 const controlMask=document.querySelector('.bpx-player-control-mask');
 assert(getComputedStyle(controlMask).backgroundImage==='none'&&getComputedStyle(controlMask).boxShadow==='none','Native control mask no longer paints a dark gradient rim');
 assert(getComputedStyle(controlMask).position==='absolute'&&getComputedStyle(controlMask).pointerEvents==='none','Control mask geometry and hit behavior stay native');
 rendererTest.render({...base,suppressPlayerEdgeShadow:false,separateDmBar:false});
 panel.querySelectorAll('.bali-menu-preset-buttons button')[1].click();rendererTest.stop();
 assert(getComputedStyle(src).boxShadow==='none'&&rendererTest.saved().separateDmBar,'Preset restores complete edge cleanup and transparent danmaku');
 const placeholder=document.getElementById('bilibili-player-placeholder');
 assert(!placeholder.contains(src)&&getComputedStyle(placeholder).boxShadow==='none','Real Bilibili sibling placeholder 8px shadow is removed');
 assert(getComputedStyle(document.getElementById('bilibili-player-placeholder-top')).backgroundColor==='rgba(0, 0, 0, 0)','Sibling loading skeleton black backing is transparent');
 const placeholderRect=placeholder.getBoundingClientRect();
 assert(placeholderRect.x===260&&placeholderRect.y===170&&placeholderRect.width===640&&placeholderRect.height===444,'Sibling placeholder geometry remains unchanged');
 placeholder.style.setProperty('box-shadow','0 0 8px rgba(20,22,28,.74)','important');await Promise.resolve();
 assert(getComputedStyle(placeholder).boxShadow==='none','Later inline-important placeholder shadow is cleared');
 rendererTest.render({...base,enabled:false});
 assert(getComputedStyle(placeholder).boxShadow.includes('8px'),'Disabling ambient restores the placeholder site shadow');
 rendererTest.render(base);assert(getComputedStyle(placeholder).boxShadow==='none','Placeholder shadow clears again when ambient is enabled');
 window.chrome.runtime={getManifest:()=>({version:'1.2.4'}),id:'fixture'};
 const evidenceStyle=document.createElement('style');evidenceStyle.id='bali-diagnostic-fixture';
 evidenceStyle.textContent='#bali-diagnostic-evidence{position:fixed;left:260px;top:170px;width:640px;height:444px;pointer-events:none;box-shadow:0 0 9px black!important}';document.head.append(evidenceStyle);
 const evidence=document.createElement('div');evidence.id='bali-diagnostic-evidence';evidence.textContent='DO_NOT_EXPORT_PRIVATE_PAGE_TEXT';document.body.append(evidence);
 const filterBeforeDiagnostic=getComputedStyle(state.canvas).filter,diagnostic=rendererTest.diagnose();
 assert(diagnostic.scriptBuild===window.expectedScriptBuild,'Diagnostic identifies the running content script build');
 assert(diagnostic.shadowCandidates.some(entry=>entry.element.includes('#bali-diagnostic-evidence')),'Diagnostic detects a non-interactive shadow overlay outside the player ancestors');
 assert(diagnostic.matchedPaintRules.some(rule=>rule.selector==='#bali-diagnostic-evidence'),'Diagnostic links the shadow to its actual matching CSS rule');
 assert(diagnostic.state.shadowRemoval==='1'&&diagnostic.state.markedShells>0,'Diagnostic records the effective cleanup state');
 assert(!JSON.stringify(diagnostic).includes('DO_NOT_EXPORT_PRIVATE_PAGE_TEXT'),'Diagnostic omits private page text');
 assert(getComputedStyle(state.canvas).filter===filterBeforeDiagnostic&&evidence.isConnected,'Diagnostic leaves the page and ambient filter unchanged');
 evidence.remove();evidenceStyle.remove();
 const dm=document.querySelector('.bpx-player-sending-bar');
 assert(getComputedStyle(dm).backgroundColor==='rgba(0, 0, 0, 0)','Danmaku bar background is transparent');
 assert(getComputedStyle(dm.querySelector('input')).backgroundColor==='rgba(0, 0, 0, 0)','Danmaku input background is transparent');
 assert(getComputedStyle(dm.querySelector('button')).backgroundColor==='rgb(0, 174, 236)','Send button keeps its readable accent background');
 const popupFrame=document.createElement('iframe');popupFrame.style.display='none';
 const popupReady=new Promise(resolve=>popupFrame.onload=resolve);
 popupFrame.srcdoc=window.popupFixture;
 document.body.append(popupFrame);await popupReady;
 const popupDoc=popupFrame.contentDocument;
 assert(popupDoc.getElementById('blur').min==='0'&&popupDoc.getElementById('blur').max==='100','Popup Blur range is 0–100');
 assert(popupDoc.getElementById('spread').max==='400','Popup Spread range is 0–400');
 const popupWindow=popupFrame.contentWindow;let diagnosticDownload=null;
 popupWindow.chrome.tabs={query:async()=>[{id:42}],sendMessage:async()=>({ok:true,report:rendererTest.diagnose()})};
 popupWindow.URL.createObjectURL=blob=>{diagnosticDownload={blob};return 'blob:diagnostic-fixture';};
 popupWindow.URL.revokeObjectURL=()=>{};
 popupWindow.HTMLAnchorElement.prototype.click=function(){diagnosticDownload.filename=this.download;};
 popupDoc.getElementById('exportBorderDiagnostics').click();await new Promise(resolve=>setTimeout(resolve,0));
 assert(diagnosticDownload.filename==='bilibili-ambient-border-diagnostic.json'&&popupDoc.getElementById('borderDiagnosticStatus').textContent.includes('已导出'),'Popup diagnostic action exports the current-page report');
 popupWindow.chrome.tabs.sendMessage=async()=>{throw Error('Receiving end does not exist');};
 popupDoc.getElementById('exportBorderDiagnostics').click();await new Promise(resolve=>setTimeout(resolve,0));
 assert(popupDoc.getElementById('borderDiagnosticStatus').textContent.includes('先重载')&&!popupDoc.getElementById('exportBorderDiagnostics').disabled,'An outdated page receives a clear refresh prompt');
 const popupSpread=popupDoc.getElementById('spread');popupSpread.value='147.1';popupSpread.dispatchEvent(new Event('input',{bubbles:true}));
 await Promise.resolve();assert(window.savedValues.spread===147.1,'Popup persists decimal spread above 100%');
 const popupBlur=popupDoc.getElementById('blur');popupBlur.value='0';popupBlur.dispatchEvent(new Event('input',{bubbles:true}));
 await Promise.resolve();assert(window.savedValues.blur===0,'Popup persists zero blur');
 ctx.fillStyle='#000';ctx.fillRect(0,0,640,24);ctx.fillRect(0,336,640,24);ctx.fillRect(0,0,32,360);ctx.fillRect(608,0,32,360);
 rendererTest.resetBars();rendererTest.render({...base,spread:0,barFramesAverage:1});rendererTest.frame(performance.now(),true);
 await new Promise(resolve=>setTimeout(resolve,200));
 assert(rendererTest.bars().top>.04&&rendererTest.bars().left>.02,'Black-bar detection continues when Blur and Spread are zero');
 rendererTest.resetBars();rendererTest.render({...base,ambientIntensity:0,barFramesAverage:1});rendererTest.frame(performance.now(),true);
 await new Promise(resolve=>setTimeout(resolve,200));
 assert(rendererTest.bars().bottom>.04,'Black-bar detection continues when light intensity is zero');
 ctx.putImageData(originalPixels,0,0);rendererTest.resetBars();
 // Fresh settings and the old migration are exercised in the real browser.
 window.localValues={};window.savedValues={blur:73.1,spread:89.8,brightness:100,saturation:115,vibrance:115};
 await rendererTest.load();
 assert(rendererTest.saved().blur===55&&rendererTest.saved().settingsRevision===4,'Legacy standard settings still migrate');
 window.localValues={};window.savedValues={blur:0,spread:147.1,brightness:80,saturation:70,vibrance:100,ambientIntensity:100,blackCrush:true,fps:30,settingsRevision:2};
 await rendererTest.load();assert(rendererTest.saved().brightness===100&&rendererTest.saved().saturation===105&&rendererTest.saved().fps===60&&rendererTest.saved().blur===0,'Old stock filter tuple upgrades without resetting custom projection');
 window.localValues={};window.savedValues={brightness:80,saturation:70,vibrance:100,ambientIntensity:100,blackCrush:true,fps:24,settingsRevision:2};
 await rendererTest.load();assert(rendererTest.saved().fps===24,'Explicit non-stock framerate limit is retained');
 window.localValues={};window.savedValues={blur:0,spread:147.1,brightness:87,saturation:64,vibrance:110,settingsRevision:2};
 await rendererTest.load();
 assert(rendererTest.saved().blur===0&&rendererTest.saved().spread===147.1,'Existing custom settings are retained');
 assert(rendererTest.saved().suppressPlayerEdgeShadow===true&&rendererTest.saved().edgeShadowSuppression===100,'Upgrade enables complete border removal');
 await new Promise(resolve=>setTimeout(resolve,750));
 const quality=[];
 for(const options of [{...base,spreadFadeStart:15},{...base,blur:55,spread:85,spreadFadeStart:15},{...base,spread:400,edgeSize:2,spreadFadeStart:-50}]) {
  const q=rendererTest.render(options);const data=q.canvas.getContext('2d').getImageData(0,0,q.canvas.width,q.canvas.height).data;
  let hash=2166136261;for(const byte of data)hash=Math.imul(hash^byte,16777619)>>>0;
  quality.push({blur:options.blur,spread:options.spread,edge:options.edgeSize,width:q.canvas.width,height:q.canvas.height,hash:hash.toString(16),filter:getComputedStyle(q.canvas).filter});
 }
 const timings=[];
 for(const options of [{...base,spreadFadeStart:15},{...base,blur:55,spread:85,spreadFadeStart:15},{...base,spread:400,edgeSize:2,spreadFadeStart:-50}]) {
  for(let i=0;i<6;i++){rendererTest.render(options);calls.length=0;}
  const samples=[];
  for(let i=0;i<30;i++){const t=performance.now();const frame=rendererTest.render(options);frame.canvas.getContext('2d').getImageData(0,0,1,1);samples.push(performance.now()-t);calls.length=0;}
  samples.sort((a,b)=>a-b);timings.push({blur:options.blur,spread:options.spread,edge:options.edgeSize,medianMs:samples[15],p95Ms:samples[28]});
 }
 state=rendererTest.render(${process.argv.includes('--standard') ? '{...base,blur:55,spread:85,spreadFadeStart:15}' : '{...base,spreadFadeStart:15}'});
 rendererTest.stop();
 panel=rendererTest.menu();
 panel.scrollTop=panel.querySelector('[data-key="blur"]').closest('.bali-menu-row').offsetTop-34;
 for(const control of panel.querySelectorAll('[data-key]')){
  if(control.type==='checkbox')control.checked=rendererTest.saved()[control.dataset.key];else control.value=rendererTest.saved()[control.dataset.key];
  if(control.type==='range')control.closest('.bali-menu-row').querySelector('.bali-menu-value').textContent=control.value+(control.dataset.key==='fadeDuration'?' ms':control.dataset.key==='fps'?' fps':'%');
 }
 document.getElementById('result').textContent=JSON.stringify({passed:checks.every(c=>c.passed),checks,quality,timings,projection:state.layout,filter:getComputedStyle(state.canvas).filter,viewport:{width:innerWidth,height:innerHeight}});
 document.title='PASS: '+checks.length+' renderer checks';
})().catch(error=>{document.getElementById('result').textContent=JSON.stringify({passed:false,error:error.stack});document.title='FAIL';});
`;
const css=fs.readFileSync(process.env.BILI_CSS_PATH||path.join(repo,'content.css'),'utf8');
const popupJS=fs.readFileSync(path.join(repo,'popup.js'),'utf8');
const storeJS=fs.readFileSync(path.join(repo,'settings-store.js'),'utf8');
const popupHTML=fs.readFileSync(path.join(repo,'popup.html'),'utf8').replace('<script src="settings-store.js"></script>','<script>window.chrome=parent.chrome;'+storeJS+'</script>').replace('<script src="popup.js"></script>','<script>'+popupJS+'</script>');
const benchmarkOnly=process.argv.includes('--benchmark');
const benchmarkCode=testCode.slice(0,testCode.indexOf(' calls.length=0;'))+String.raw`
 const timings=[];
 for(const options of [{...base,spreadFadeStart:15},{...base,blur:55,spread:85,spreadFadeStart:15},{...base,spread:400,edgeSize:2,spreadFadeStart:-50}]) {
  for(let i=0;i<8;i++){rendererTest.render(options);calls.length=0;}
  const samples=[];
  for(let i=0;i<40;i++){const t=performance.now();const frame=rendererTest.render(options);frame.canvas.getContext('2d').getImageData(0,0,1,1);samples.push(performance.now()-t);calls.length=0;}
  samples.sort((a,b)=>a-b);timings.push({blur:options.blur,spread:options.spread,edge:options.edgeSize,medianMs:samples[20],p95Ms:samples[38]});
 }
 document.getElementById('result').textContent=JSON.stringify({passed:timings.every(t=>t.medianMs>0),checks:[],timings,clock:'real browser performance.now; virtual time disabled'});
})().catch(error=>{document.getElementById('result').textContent=JSON.stringify({passed:false,error:error.stack});});
`;
let html=`<!doctype html><meta charset="utf-8"><title>Renderer check</title><style>
body{margin:0;font:14px Arial;color:white}#app{min-height:900px}.bili-header{height:56px;padding:0 36px;display:flex;align-items:center;box-sizing:border-box}.bpx-player-container{position:absolute;left:260px;top:170px;width:640px;height:444px;box-shadow:0 0 24px #000;filter:drop-shadow(0 0 12px #000)}.bpx-player-sending-bar{display:flex;align-items:center;gap:12px;height:44px;background:#202124}.bpx-player-sending-bar input{flex:1;background:#151719;color:white;border:0;padding:8px}.bpx-player-sending-bar button{background:#00aeec;border:0;color:white;padding:8px 18px}.bpx-player-control-bottom-right{height:40px;display:flex;justify-content:flex-end;align-items:center;background:#17191d}.bpx-player-ctrl-setting{padding:8px}#source{width:640px;height:360px;display:block}h1{position:absolute;left:260px;top:90px;font-size:24px}.caption{position:absolute;left:260px;top:650px;font-size:16px}#result{position:absolute;top:830px;left:20px;display:none}.bpx-player-container[data-bali-mini-player]{left:20px!important;top:600px!important}
</style><style>${css}</style><div class="bili-header">Bilibili　　Ambient Light · renderer validation</div><div id="app"><h1>Blur 0% · Spread 147.1%</h1><div class="bpx-player-container"><canvas id="source" width="640" height="360"></canvas><div class="bpx-player-sending-bar"><span>203人正在看</span><input placeholder="发个友善的弹幕见证当下"><button>发送</button></div><div class="bpx-player-control-bottom-right"><span class="bpx-player-ctrl-setting">⚙</span></div></div><div class="caption">Frame timing repaired · full colour · transparent danmaku bar</div></div><pre id="result">PENDING</pre><script>
window.savedValues={};window.localValues={};window.blockedWrites=[];const changed=[];window.chrome={storage:{sync:{get:async defaults=>defaults?{...defaults,...savedValues}:{...savedValues},set:async patch=>{if(window.syncBlocked)await new Promise(resolve=>blockedWrites.push(resolve));Object.assign(savedValues,patch);}},local:{get:async()=>({...localValues}),set:async patch=>{const changes={};for(const [key,value]of Object.entries(patch)){changes[key]={oldValue:localValues[key],newValue:value};localValues[key]=value;if(key.startsWith('bali-draft:'))savedValues[key.slice(11)]=value.value;}for(const fn of changed)fn(changes,'local');}},onChanged:{addListener:fn=>changed.push(fn)}}};window.popupFixture=${JSON.stringify(popupHTML).replaceAll('</script>','<\\/script>')};
</script><script>window.expectedScriptBuild=${JSON.stringify(expectedScriptBuild)};</script><script>${storeJS}</script><script>${source}</script><script>${benchmarkOnly?benchmarkCode:testCode}</script>`;
html=html.replace('<div class="bpx-player-container">','<div id="playerWrap" class="player-wrap" data-shadow-test style="box-shadow:inset 0 0 0 1px black, 0 0 14px 5px rgba(0,0,0,.8)!important;filter:brightness(1) drop-shadow(0 0 9px black)!important"><div id="bilibili-player-wrap"><div class="bpx-player-container">')
 .replace('<div class="caption">','</div></div><div class="caption">')
 .replace('<div class="bili-header">','<style>#playerWrap{position:absolute;left:260px;top:170px;width:640px;height:444px;background:linear-gradient(#111,#000)!important}#playerWrap .bpx-player-container{position:relative;left:0;top:0}#playerWrap[data-shadow-test]::before{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:0 0 12px #000!important;background:linear-gradient(to right,rgba(0,0,0,.8),transparent)!important}</style><div class="bili-header">');
html=html.replace('<canvas id="source"','<div id="unnamedPictureWrap" style="width:640px;height:360px;box-shadow:0 0 14px 5px black!important"><canvas style="box-shadow:0 0 10px 4px black!important;border-color:black!important" id="source"').replace('</canvas><div class="bpx-player-sending-bar">','</canvas></div><div class="bpx-player-sending-bar">');
html=html.replace('<div class="bpx-player-sending-bar">','<div class="bpx-player-control-mask" style="position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(black,transparent,black)!important;box-shadow:inset 0 0 15px black!important"></div><div class="bpx-player-sending-bar">');
html=html.replace('<div id="bilibili-player-wrap">',`<div id="bilibili-player-wrap"><div id="bilibili-player" style="position:relative;width:640px;height:444px"><div id="bilibili-player-placeholder" style="position:absolute;inset:0;z-index:0;box-shadow:0 0 8px rgba(20,22,28,.74)"><div id="bilibili-player-placeholder-top" style="height:360px;background:black"></div><div id="bilibili-player-placeholder-bottom" style="height:84px;background:rgba(0,0,0,.04)"></div></div><div class="bpx-docker" style="position:relative;z-index:1">`).replace('<div class="caption">','</div></div><div class="caption">');
html=html.replace('<span class="bpx-player-ctrl-setting">⚙</span>','<span style="flex:0 0 270px"></span><span class="native-control" style="flex:0 0 24px;margin:0 8px">▸</span><span class="native-control" style="flex:0 0 24px;margin:0 8px">▸</span><span class="native-control" style="flex:0 0 24px;margin:0 8px">▸</span><span class="bpx-player-ctrl-setting" style="flex-shrink:0;margin:0 8px">⚙</span>')
 .replace('<div class="bpx-player-control-bottom-right">','<div class="bpx-player-control-bottom" style="display:flex;width:100%;height:40px"><div class="bpx-player-control-bottom-left" style="flex:0 0 200px"></div><div class="bpx-player-control-bottom-right" style="flex:0 0 440px;justify-content:flex-start">')
 .replace('⚙</span></div></div>','⚙</span></div></div></div>')
 .replace('Bilibili　　Ambient Light · renderer validation','Bilibili　　<span id="headerReference" class="v-popover v-popover__reference">首页</span><div id="actualPopover" class="v-popover-content" style="display:none">菜单</div>')
 .replace('<pre id="result">','<div class="up-panel-container" style="position:absolute;left:930px;top:170px;width:260px;height:150px"><div class="up-info-container">UP主<button style="background:#00aeec">关注</button></div></div><div class="video-toolbar-container" style="position:absolute;left:260px;top:710px"><span id="shareReference" class="video-share van-popover__reference">分享 2845</span></div><pre id="result">')
 .replace('<div class="bili-header">','<style>.up-panel-container{background:linear-gradient(blue,black)}.up-info-container{background:#17191d}.up-panel-container::before{content:"";background:linear-gradient(black,transparent)}</style><div class="bili-header">');
const htmlPath=path.join(dir,'index.html');fs.writeFileSync(htmlPath,process.argv.includes('--standard')?html.replace('Blur 0% · Spread 147.1%','Blur 55% · Spread 85%'):html);
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const shot=path.resolve(root,'Ambient-v'+artifactVersion+(process.argv.includes('--standard')?'-standard.png':'-blur0-spread147.png'));
const result=cp.spawnSync(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--hide-scrollbars','--window-size=1280,900','--force-device-scale-factor=1','--user-data-dir='+path.join(root,'browser-check','profile'),...(benchmarkOnly?[]:['--virtual-time-budget=3000']),'--screenshot='+shot,'--dump-dom','file:///'+htmlPath.replaceAll('\\','/')],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(root,'browser-check','edge-stderr.log'),result.stderr||'');
fs.writeFileSync(path.join(root,'browser-check','result.html'),result.stdout||'');
if(result.error)throw result.error;
const match=result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
if(!match)throw new Error('No result from browser: exit '+result.status+'; '+(result.stderr||'').slice(-1000));
const report=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&gt;','>').replaceAll('&lt;','<'));
fs.writeFileSync(path.join(root,'browser-check','results.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(root,'browser-check','results-v'+artifactVersion+'.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checks:report.checks?.length,error:report.error,quality:report.quality,timings:report.timings},null,2));
if(!report.passed)process.exitCode=1;
