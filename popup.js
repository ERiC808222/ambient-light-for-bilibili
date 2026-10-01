const DEFAULTS = {
  enabled: true,
  blur: 55,
  spread: 85,
  fadeDuration: 0,
  brightness: 80,
  saturation: 70,
  vibrance: 100,
  ambientIntensity: 100,
  blackCrush: true,
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
  performanceMode: true,
  settingsRevision: 2
};

const PRESETS = {
  light: { blur:35, spread:70, ambientIntensity:70, edgeSize:9, spreadFadeStart:20, spreadFadeCurve:46, brightness:78, saturation:65, vibrance:95, blackCrush:true, headerAmbient:32, dmAmbient:32, edgeShadowSuppression:55, fps:24, renderQuality:20, alphaProjector:true, performanceMode:true },
  standard: { blur:55, spread:85, ambientIntensity:100, fadeDuration:0, viewMode:'all', trueBlack:true, enabled:true, edgeSize:12, spreadFadeStart:15, spreadFadeCurve:35, brightness:80, saturation:70, vibrance:100, blackCrush:true, headerAmbient:58, dmAmbient:58, edgeShadowSuppression:78, fps:30, renderQuality:24, alphaProjector:true, performanceMode:true },
  heavy: { blur:75, spread:95, ambientIntensity:120, edgeSize:15, spreadFadeStart:9, spreadFadeCurve:26, brightness:88, saturation:90, vibrance:108, blackCrush:true, headerAmbient:78, dmAmbient:78, edgeShadowSuppression:94, fps:30, renderQuality:26, alphaProjector:true, performanceMode:true }
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
