const DEFAULTS = {
  enabled: true,
  blur: 73.1,
  spread: 89.8,
  fadeDuration: 0,
  brightness: 100,
  saturation: 115,
  vibrance: 115,
  fps: 30,
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
  edgeShadowSuppression: 78,
  headerAmbient: 68,
  dmAmbient: 68,
  performanceMode: true
};

const PRESETS = {
  light: { blur:54, spread:68, edgeSize:9, spreadFadeStart:20, spreadFadeCurve:46, brightness:95, saturation:108, vibrance:108, headerAmbient:38, dmAmbient:38, edgeShadowSuppression:55, fps:24, renderQuality:20, alphaProjector:true, performanceMode:true },
  standard: { blur:73.1, spread:89.8, fadeDuration:0, viewMode:'all', trueBlack:true, enabled:true, edgeSize:12, spreadFadeStart:15, spreadFadeCurve:35, brightness:100, saturation:115, vibrance:115, headerAmbient:68, dmAmbient:68, edgeShadowSuppression:78, fps:30, renderQuality:24, alphaProjector:true, performanceMode:true },
  heavy: { blur:86, spread:98, edgeSize:15, spreadFadeStart:9, spreadFadeCurve:26, brightness:108, saturation:138, vibrance:132, headerAmbient:88, dmAmbient:88, edgeShadowSuppression:94, fps:30, renderQuality:26, alphaProjector:true, performanceMode:true }
};

const boolIds = ['enabled','headerOnTop','trueBlack','darkTextAdaptation','removeHorizontalBars','removeVerticalBars','detectColoredBars','fillVideoToCrop','alphaProjector','separateDmBar','suppressPlayerEdgeShadow','performanceMode'];
const rangeIds = ['headerAmbient','dmAmbient','edgeShadowSuppression','renderQuality','fps','brightness','vibrance','saturation','blur','spread','edgeSize','spreadFadeStart','spreadFadeCurve','fadeDuration','barDetectionSensitivity','barFramesAverage','barDetectionOffset','manualHorizontalClip','manualVerticalClip'];
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
  const data = await chrome.storage.sync.get(DEFAULTS);
  boolIds.forEach(id => { $(id).checked = !!data[id]; });
  rangeIds.forEach(id => { $(id).value = data[id]; showValue(id); });
  $('viewMode').value = data.viewMode || 'all';
}

boolIds.forEach(id => {
  $(id).addEventListener('change', () => chrome.storage.sync.set({ [id]: $(id).checked }));
});
rangeIds.forEach(id => {
  $(id).addEventListener('input', () => {
    const value = Number($(id).value);
    showValue(id);
    chrome.storage.sync.set({ [id]: value });
  });
});
$('viewMode').addEventListener('change', () => chrome.storage.sync.set({ viewMode: $('viewMode').value }));

document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', async () => {
    await chrome.storage.sync.set(PRESETS[btn.dataset.preset]);
    await load();
  });
});

load();
