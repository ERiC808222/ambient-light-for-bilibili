const DEFAULTS = {
  enabled: true,
  blur: 55,
  spread: 85,
  fadeDuration: 0,
  brightness: 100,
  saturation: 105,
  vibrance: 100,
  ambientIntensity: 100,
  blackCrush: false,
  fps: 60,
  renderQuality: 26,
  headerOnTop: true,
  trueBlack: true,
  darkTextAdaptation: true,
  viewMode: 'all',
  removeHorizontalBars: true,
  removeVerticalBars: true,
  detectColoredBars: false,
  barDetectionSensitivity: 20,
  barFramesAverage: 5,
  barDetectionOffset: 0,
  manualHorizontalClip: 0,
  manualVerticalClip: 0,
  fillVideoToCrop: false,
  alphaProjector: true,
  edgeSize: 12,
  spreadFadeStart: 15,
  spreadFadeCurve: 35,
  separateDmBar: true,
  suppressPlayerEdgeShadow: true,
  edgeShadowSuppression:100,
  headerAmbient: 68,
  dmAmbient: 68,
  performanceMode: true,
  settingsRevision: 4
};

const PRESETS = {
  light: { blur:35, spread:70, ambientIntensity:70, edgeSize:9, spreadFadeStart:20, spreadFadeCurve:46, brightness:95, saturation:100, vibrance:100, blackCrush:false, headerAmbient:32, dmAmbient:32, edgeShadowSuppression:100, suppressPlayerEdgeShadow:true, separateDmBar:true, fps:30, renderQuality:20, alphaProjector:true, performanceMode:true },
  standard: { blur:55, spread:85, ambientIntensity:100, fadeDuration:0, viewMode:'all', trueBlack:true, enabled:true, edgeSize:12, spreadFadeStart:15, spreadFadeCurve:35, brightness:100, saturation:105, vibrance:100, blackCrush:false, headerAmbient:58, dmAmbient:58, edgeShadowSuppression:100, suppressPlayerEdgeShadow:true, separateDmBar:true, fps:60, renderQuality:24, alphaProjector:true, performanceMode:true },
  heavy: { blur:75, spread:95, ambientIntensity:120, edgeSize:15, spreadFadeStart:9, spreadFadeCurve:26, brightness:105, saturation:115, vibrance:108, blackCrush:false, headerAmbient:78, dmAmbient:78, edgeShadowSuppression:100, suppressPlayerEdgeShadow:true, separateDmBar:true, fps:60, renderQuality:26, alphaProjector:true, performanceMode:true }
};

const boolIds = ['enabled','headerOnTop','trueBlack','darkTextAdaptation','removeHorizontalBars','removeVerticalBars','detectColoredBars','fillVideoToCrop','alphaProjector','separateDmBar','suppressPlayerEdgeShadow','performanceMode','blackCrush'];
const rangeIds = ['headerAmbient','dmAmbient','edgeShadowSuppression','renderQuality','fps','brightness','vibrance','saturation','ambientIntensity','blur','spread','edgeSize','spreadFadeStart','spreadFadeCurve','fadeDuration','barDetectionSensitivity','barFramesAverage','barDetectionOffset','manualHorizontalClip','manualVerticalClip'];
const $ = id => document.getElementById(id);

function suffix(id) {
  if (id === 'fps') return ' fps';
  if (id === 'fadeDuration') return ' ms';
  if (id === 'barFramesAverage') return ' 帧';
  return '%';
}
function showValue(id) {
  const v = Number($(id).value);
  $(`${id}Out`).textContent = `${Math.round(v * 10) / 10}${suffix(id)}`;
}

async function load() {
  const data = { ...DEFAULTS, ...await baliSettingsStore.get() };
  boolIds.forEach(id => { $(id).checked = !!data[id]; });
  rangeIds.forEach(id => { $(id).value = data[id]; showValue(id); });
  $('viewMode').value = data.viewMode || 'all';
}

boolIds.forEach(id => {
  $(id).addEventListener('change', () => baliSettingsStore.set({ [id]: $(id).checked }));
});
rangeIds.forEach(id => {
  $(id).addEventListener('input', () => {
    const value = Number($(id).value);
    showValue(id);
    baliSettingsStore.set({ [id]: value });
  });
});
$('viewMode').addEventListener('change', () => baliSettingsStore.set({ viewMode: $('viewMode').value }));

document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', async () => {
    await baliSettingsStore.set(PRESETS[btn.dataset.preset]);
    await load();
  });
});

$('exportBorderDiagnostics').addEventListener('click', async () => {
  const button=$('exportBorderDiagnostics'),status=$('borderDiagnosticStatus');
  button.disabled=true;status.textContent=' 正在读取当前视频边缘…';
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id) throw new Error('请先打开 Bilibili 视频页。');
    const response=await chrome.tabs.sendMessage(tab.id,{type:'bali-border-diagnostic'});
    if (!response?.ok) throw new Error(response?.error || '未收到页面诊断。');
    const url=URL.createObjectURL(new Blob([JSON.stringify(response.report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='bilibili-ambient-border-diagnostic.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
    status.textContent=' 已导出诊断；画面效果未改动。';
  } catch (error) {
    status.textContent=' 请先重载扩展、刷新视频页后重试。';
    status.title=String(error.message || error);
  } finally { button.disabled=false; }
});

load();
