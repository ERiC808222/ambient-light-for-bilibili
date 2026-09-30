(() => {
  'use strict';

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
    light: {
      blur: 54, spread: 68, brightness: 95, saturation: 108, vibrance: 108,
      edgeSize: 9, spreadFadeStart: 20, spreadFadeCurve: 46,
      headerAmbient: 38, dmAmbient: 38, edgeShadowSuppression: 55,
      renderQuality: 20, fps: 24, performanceMode: true, alphaProjector: true
    },
    standard: {
      blur: 73.1, spread: 89.8, fadeDuration: 0, brightness: 100, saturation: 115, vibrance: 115,
      edgeSize: 12, spreadFadeStart: 15, spreadFadeCurve: 35,
      headerAmbient: 68, dmAmbient: 68, edgeShadowSuppression: 78,
      renderQuality: 24, fps: 30, performanceMode: true, alphaProjector: true
    },
    heavy: {
      blur: 86, spread: 98, brightness: 108, saturation: 138, vibrance: 132,
      edgeSize: 15, spreadFadeStart: 9, spreadFadeCurve: 26,
      headerAmbient: 88, dmAmbient: 88, edgeShadowSuppression: 94,
      renderQuality: 26, fps: 30, performanceMode: true, alphaProjector: true
    }
  };

  const PLAYER_SELECTORS = [
    '.bpx-player-container',
    '#bilibili-player',
    '.bilibili-player'
  ];

  let settings = { ...DEFAULTS };
  let video = null;
  let player = null;
  let root = null;
  let shade = null;
  let nearCanvas = null;
  let farCanvas = null;
  let nearCtx = null;
  let farCtx = null;
  let resizeObserver = null;
  let mutationObserver = null;
  let lastDraw = 0;
  let rvfcId = 0;
  let rafId = 0;
  let disposed = false;
  let geometry = null;
  let lastUrl = location.href;
  let settingsButton = null;
  let settingsPanel = null;
  let detectionCanvas = null;
  let detectionCtx = null;
  let lastBarDetection = 0;
  let barHistory = [];
  let barCrop = { top: 0, bottom: 0, left: 0, right: 0 };
  let barDetectionFailed = false;
  let barStatusElem = null;
  let sampleCanvas = null;
  let sampleCtx = null;
  let geometryDirty = true;
  let lastGeometryUpdate = 0;
  let frameSerial = 0;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const cssPx = v => `${Math.max(0, Math.round(v))}px`;

  function isVideoPage() {
    return /\/video\/|\/bangumi\/play\//.test(location.pathname);
  }

  function isFullscreenLike() {
    if (document.fullscreenElement) return true;
    return !!document.querySelector(
      '.bpx-state-fullscreen, .bpx-state-webscreen, .bpx-player-container[data-screen="full"], .bpx-player-container[data-screen="web"]'
    );
  }

  function isViewEnabled() {
    if (settings.viewMode === 'all') return true;
    if (settings.viewMode === 'fullscreen') return isFullscreenLike();
    if (settings.viewMode === 'normal') return !isFullscreenLike();
    return true;
  }

  function findVideo() {
    const candidates = [...document.querySelectorAll('video')]
      .filter(v => v.clientWidth >= 240 && v.clientHeight >= 120 && v.readyState >= 1);
    return candidates.sort((a, b) =>
      (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight)
    )[0] || null;
  }

  function findPlayer(v) {
    for (const sel of PLAYER_SELECTORS) {
      const closest = v?.closest(sel);
      if (closest) return closest;
    }
    return v?.parentElement || null;
  }

  function createLayerCanvas(id) {
    const canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100vw',
      height: '100vh',
      display: 'block',
      pointerEvents: 'none',
      transform: 'translateZ(0)',
      transformOrigin: 'center center',
      willChange: 'filter, opacity',
      mixBlendMode: 'normal'
    });
    return canvas;
  }

  function ensureRoot() {
    if (root?.isConnected) return;

    root = document.createElement('div');
    root.id = 'bili-ambient-v32-root';
    root.setAttribute('aria-hidden', 'true');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
      contain: 'strict',
      background: '#000'
    });

    shade = document.createElement('div');
    shade.id = 'bili-ambient-v32-shade';
    Object.assign(shade.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '0',
      background: '#000',
      pointerEvents: 'none'
    });

    farCanvas = createLayerCanvas('bili-ambient-v32-far');
    nearCanvas = createLayerCanvas('bili-ambient-v32-near');
    farCanvas.style.zIndex = '1';
    nearCanvas.style.zIndex = '2';

    root.append(shade, farCanvas, nearCanvas);
    document.documentElement.insertBefore(root, document.body || null);

    farCtx = farCanvas.getContext('2d', { alpha: true, desynchronized: true });
    nearCtx = nearCanvas.getContext('2d', { alpha: true, desynchronized: true });
  }

  function active() {
    return !!settings.enabled && isVideoPage() && isViewEnabled();
  }

  function applyPageTheme() {
    const on = active();
    if (on) {
      document.documentElement.setAttribute('data-bili-ambient-dark', '1');
      document.documentElement.setAttribute('data-bili-ambient-header-top', settings.headerOnTop ? '1' : '0');
      document.documentElement.setAttribute('data-bili-ambient-text-adapt', settings.darkTextAdaptation ? '1' : '0');
      document.documentElement.setAttribute('data-bili-ambient-dm-separated', settings.separateDmBar ? '1' : '0');
      document.documentElement.setAttribute('data-bili-ambient-no-edge-shadow', settings.suppressPlayerEdgeShadow ? '1' : '0');
      document.documentElement.setAttribute('data-bili-ambient-alpha-projector', settings.alphaProjector ? '1' : '0');
      const headerAmbient = clamp(Number(settings.headerAmbient) || 0, 0, 100) / 100;
      const dmAmbient = clamp(Number(settings.dmAmbient) || 0, 0, 100) / 100;
      const edgeSuppression = clamp(Number(settings.edgeShadowSuppression) || 0, 0, 100) / 100;
      document.documentElement.style.setProperty('--bali-header-bg-alpha', String(0.93 - headerAmbient * 0.52));
      document.documentElement.style.setProperty('--bali-header-blur', `${Math.round(2 + headerAmbient * 30)}px`);
      document.documentElement.style.setProperty('--bali-header-sat', String(1.02 + headerAmbient * 0.40));
      document.documentElement.style.setProperty('--bali-dm-bg-alpha', String(0.97 - dmAmbient * 0.50));
      document.documentElement.style.setProperty('--bali-dm-blur', `${Math.round(1 + dmAmbient * 27)}px`);
      document.documentElement.style.setProperty('--bali-dm-sat', String(1.02 + dmAmbient * 0.36));
      document.documentElement.style.setProperty('--bali-player-back-alpha', String(0.96 - edgeSuppression * 0.88));
    } else {
      document.documentElement.removeAttribute('data-bili-ambient-dark');
      document.documentElement.removeAttribute('data-bili-ambient-header-top');
      document.documentElement.removeAttribute('data-bili-ambient-text-adapt');
      document.documentElement.removeAttribute('data-bili-ambient-dm-separated');
      document.documentElement.removeAttribute('data-bili-ambient-no-edge-shadow');
      document.documentElement.removeAttribute('data-bili-ambient-alpha-projector');
      ['--bali-header-bg-alpha','--bali-header-blur','--bali-header-sat','--bali-dm-bg-alpha','--bali-dm-blur','--bali-dm-sat','--bali-player-back-alpha'].forEach(name => document.documentElement.style.removeProperty(name));
    if (video) { video.removeAttribute('data-bali-fill-video'); video.style.removeProperty('--bali-fill-scale'); }
    }
  }

  function derivedAmbient() {
    const blur = clamp(Number(settings.blur) || 0, 0, 100);
    const spread = clamp(Number(settings.spread) || 0, 0, 100);

    if (settings.alphaProjector) {
      // Edge projector: spread is produced geometrically from the video edges,
      // while blur only softens the projected light. This avoids the "giant blurry video" look.
      return {
        nearSpread: 1.08 + (spread / 100) * 0.24,
        farSpread: 1.18 + (spread / 100) * 0.52,
        nearDistance: 70 + spread * 2.65,
        farDistance: 180 + spread * 5.4,
        nearBlur: 20 + blur * 0.82,
        farBlur: 44 + blur * 1.28,
        nearOpacity: 0.98,
        farOpacity: 0.78
      };
    }

    // Stable v3.3.1 fallback renderer.
    return {
      nearSpread: 1.15 + (spread / 100) * 0.15,
      farSpread: 1.55 + (spread / 100) * 0.67,
      nearDistance: 0,
      farDistance: 0,
      nearBlur: 60 + blur * 1.65,
      farBlur: 135 + blur * 2.55,
      nearOpacity: 0.96,
      farOpacity: 0.82
    };
  }

  function applyStyles() {
    if (!root || !shade || !nearCanvas || !farCanvas) return;

    const on = active();
    root.style.display = on ? 'block' : 'none';
    shade.style.opacity = settings.trueBlack ? '1' : '.88';
    applyPageTheme();

    const a = derivedAmbient();
    const sat = clamp((Number(settings.saturation) || 100) / 100, 0.2, 2.5);
    const vib = clamp((Number(settings.vibrance) || 100) / 100, 0.2, 2.5);
    const bri = clamp((Number(settings.brightness) || 100) / 100, 0.2, 2);
    const fade = clamp(Number(settings.fadeDuration) || 0, 0, 1500);

    nearCanvas.style.opacity = String(a.nearOpacity);
    farCanvas.style.opacity = String(a.farOpacity);
    // Screen blending makes black source pixels contribute no "black glow".
    nearCanvas.style.mixBlendMode = settings.alphaProjector ? 'screen' : 'normal';
    farCanvas.style.mixBlendMode = settings.alphaProjector ? 'screen' : 'normal';
    nearCanvas.style.transition = `filter ${fade}ms ease, opacity ${fade}ms ease`;
    farCanvas.style.transition = `filter ${fade}ms ease, opacity ${fade}ms ease`;

    nearCanvas.style.setProperty('filter', `blur(${a.nearBlur}px) saturate(${sat * vib}) brightness(${bri})`, 'important');
    farCanvas.style.setProperty('filter', `blur(${a.farBlur}px) saturate(${sat * vib * 1.04}) brightness(${bri * 0.96})`, 'important');
  }

  function resizeCanvasToViewport(canvas, ctx, far = false) {
    if (!canvas || !ctx) return;
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    let q = clamp(Number(settings.renderQuality) || 32, 16, 100) / 100;
    // The far projector is heavily blurred, so extra source pixels are visually wasted.
    // Lowering its backing resolution saves a large amount of GPU compositing work.
    if (settings.performanceMode) q *= far ? 0.68 : 0.90;
    const minW = far && settings.performanceMode ? 192 : 256;
    const minH = far && settings.performanceMode ? 108 : 144;
    const w = Math.max(minW, Math.round(vw * q));
    const h = Math.max(minH, Math.round(vh * q));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function updateGeometry(force = false) {
    if (!video) return;
    const now = performance.now();
    if (!force && !geometryDirty && now - lastGeometryUpdate < 900) return;
    const r = video.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    geometry = {
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2
    };
    geometryDirty = false;
    lastGeometryUpdate = now;
    updateMasks();
  }

  function updateMasks() {
    if (!geometry || !nearCanvas || !farCanvas) return;
    if (settings.alphaProjector) {
      nearCanvas.style.webkitMaskImage = 'none';
      nearCanvas.style.maskImage = 'none';
      farCanvas.style.webkitMaskImage = 'none';
      farCanvas.style.maskImage = 'none';
      return;
    }
    const { cx, cy, w, h } = geometry;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Fade masks remove the rectangular projector edge. The spread itself is controlled
    // separately, so increasing Blur no longer enlarges the glow footprint.
    const nearRadiusX = Math.max(w * 0.98, 340);
    const nearRadiusY = Math.max(h * 1.08, 240);
    const farRadiusX = Math.max(w * 1.90, vw * 0.80);
    const farRadiusY = Math.max(h * 1.95, vh * 0.84);

    const nearMask = `radial-gradient(ellipse ${cssPx(nearRadiusX)} ${cssPx(nearRadiusY)} at ${cssPx(cx)} ${cssPx(cy)}, rgba(0,0,0,1) 0%, rgba(0,0,0,.98) 34%, rgba(0,0,0,.78) 60%, rgba(0,0,0,0) 100%)`;
    const farMask = `radial-gradient(ellipse ${cssPx(farRadiusX)} ${cssPx(farRadiusY)} at ${cssPx(cx)} ${cssPx(cy)}, rgba(0,0,0,1) 0%, rgba(0,0,0,.90) 40%, rgba(0,0,0,.54) 70%, rgba(0,0,0,0) 100%)`;

    nearCanvas.style.webkitMaskImage = nearMask;
    nearCanvas.style.maskImage = nearMask;
    farCanvas.style.webkitMaskImage = farMask;
    farCanvas.style.maskImage = farMask;
  }

  function ensureDetectionCanvas() {
    if (detectionCanvas) return;
    detectionCanvas = document.createElement('canvas');
    detectionCanvas.width = 192;
    detectionCanvas.height = 108;
    detectionCtx = detectionCanvas.getContext('2d', {
      alpha: false,
      willReadFrequently: true,
      desynchronized: true
    });
  }

  function resetBarDetection() {
    barHistory = [];
    barCrop = { top: 0, bottom: 0, left: 0, right: 0 };
    lastBarDetection = 0;
    barDetectionFailed = false;
    updateBarStatus();
    applyVideoFill();
  }

  function lineStats(data, width, height, horizontal, index) {
    let count = 0;
    let dark = 0;
    let sum = 0;
    let sum2 = 0;
    let sumR = 0, sumG = 0, sumB = 0;
    const sensitivity = clamp(Number(settings.barDetectionSensitivity) || 20, 10, 90);
    const darkThreshold = 10 + sensitivity * 0.36;

    // Ignore the outer 4% at the corners: encoded logos/noise there should not
    // destabilize an otherwise solid bar.
    if (horizontal) {
      const x0 = Math.floor(width * 0.04);
      const x1 = Math.ceil(width * 0.96);
      for (let x = x0; x < x1; x++) {
        const p = (index * width + x) * 4;
        const r = data[p], g = data[p + 1], b = data[p + 2];
        const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
        count++; sum += lum; sum2 += lum * lum;
        sumR += r; sumG += g; sumB += b;
        if (lum <= darkThreshold) dark++;
      }
    } else {
      const y0 = Math.floor(height * 0.04);
      const y1 = Math.ceil(height * 0.96);
      for (let y = y0; y < y1; y++) {
        const p = (y * width + index) * 4;
        const r = data[p], g = data[p + 1], b = data[p + 2];
        const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
        count++; sum += lum; sum2 += lum * lum;
        sumR += r; sumG += g; sumB += b;
        if (lum <= darkThreshold) dark++;
      }
    }

    const mean = count ? sum / count : 255;
    const variance = count ? Math.max(0, sum2 / count - mean * mean) : 999;
    return {
      mean,
      std: Math.sqrt(variance),
      darkRatio: count ? dark / count : 0,
      r: count ? sumR / count : 255,
      g: count ? sumG / count : 255,
      b: count ? sumB / count : 255
    };
  }

  function lineLooksLikeBar(stats) {
    const sensitivity = clamp(Number(settings.barDetectionSensitivity) || 20, 10, 90);
    const darkThreshold = 10 + sensitivity * 0.36;
    const requiredDarkRatio = 0.985 - sensitivity * 0.0012;
    const isBlack = stats.darkRatio >= requiredDarkRatio && stats.mean <= darkThreshold + 5;
    if (isBlack) return true;

    if (!settings.detectColoredBars) return false;
    // Colored-bar detection is intentionally conservative. Solid/near-solid colored
    // mattes qualify, but ordinary flat areas in animation usually have more variance.
    const maxChannel = Math.max(stats.r, stats.g, stats.b);
    const minChannel = Math.min(stats.r, stats.g, stats.b);
    return stats.std <= 2.8 && (maxChannel - minChannel) <= 18 && stats.mean <= 210;
  }

  function scanEdge(data, width, height, edge) {
    const horizontal = edge === 'top' || edge === 'bottom';
    const size = horizontal ? height : width;
    const max = Math.floor(size * 0.38);
    let run = 0;
    let misses = 0;

    for (let i = 0; i < max; i++) {
      const index = (edge === 'top' || edge === 'left') ? i : size - 1 - i;
      const stats = lineStats(data, width, height, horizontal, index);
      if (lineLooksLikeBar(stats)) {
        run = i + 1;
        misses = 0;
      } else {
        misses++;
        // Tolerate a single noisy line at the border, but stop on a real content edge.
        if (misses >= 2) break;
      }
    }
    return run / size;
  }

  function centerLuminance(data, width, height) {
    const x0 = Math.floor(width * 0.30), x1 = Math.ceil(width * 0.70);
    const y0 = Math.floor(height * 0.30), y1 = Math.ceil(height * 0.70);
    let sum = 0, count = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const p = (y * width + x) * 4;
        sum += data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722;
        count++;
      }
    }
    return count ? sum / count : 0;
  }

  function median(values) {
    const a = values.slice().sort((x, y) => x - y);
    if (!a.length) return 0;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function updateStableBarCrop() {
    const wanted = clamp(Math.round(Number(settings.barFramesAverage) || 5), 1, 30);
    if (!barHistory.length) return;
    const samples = barHistory.slice(-wanted);
    const minSamples = Math.min(wanted, 3);
    if (samples.length < minSamples) return;

    const next = {
      top: median(samples.map(v => v.top)),
      bottom: median(samples.map(v => v.bottom)),
      left: median(samples.map(v => v.left)),
      right: median(samples.map(v => v.right))
    };

    // Ignore sub-1.2% noise: real encoded bars are normally wider than this.
    for (const key of Object.keys(next)) {
      if (next[key] < 0.012) next[key] = 0;
      next[key] = clamp(next[key], 0, 0.40);
    }

    barCrop = next;
    updateBarStatus();
    applyVideoFill();
  }

  function detectBars(ts = performance.now(), force = false) {
    if (!video || !video.videoWidth || !video.videoHeight) return;
    if (!settings.removeHorizontalBars && !settings.removeVerticalBars && !settings.detectColoredBars) {
      if (barCrop.top || barCrop.bottom || barCrop.left || barCrop.right) resetBarDetection();
      return;
    }
    const detectionInterval = settings.performanceMode ? 700 : 320;
    if (!force && ts - lastBarDetection < detectionInterval) return;
    lastBarDetection = ts;

    ensureDetectionCanvas();
    try {
      detectionCtx.drawImage(video, 0, 0, detectionCanvas.width, detectionCanvas.height);
      const image = detectionCtx.getImageData(0, 0, detectionCanvas.width, detectionCanvas.height);
      const data = image.data;
      const w = detectionCanvas.width, h = detectionCanvas.height;

      // During a near-black scene there is not enough information to distinguish a
      // cinematic bar from image content. Keep the previous stable result instead.
      if (!settings.detectColoredBars && centerLuminance(data, w, h) < 15) return;

      const detected = {
        top: settings.removeHorizontalBars ? scanEdge(data, w, h, 'top') : 0,
        bottom: settings.removeHorizontalBars ? scanEdge(data, w, h, 'bottom') : 0,
        left: settings.removeVerticalBars ? scanEdge(data, w, h, 'left') : 0,
        right: settings.removeVerticalBars ? scanEdge(data, w, h, 'right') : 0
      };

      // A result that consumes most of the frame is a dark scene, not a letterbox.
      if (detected.top + detected.bottom > 0.62 || detected.left + detected.right > 0.62) return;

      barDetectionFailed = false;
      barHistory.push(detected);
      const wanted = clamp(Math.round(Number(settings.barFramesAverage) || 5), 1, 30);
      if (barHistory.length > Math.max(30, wanted * 2)) barHistory.splice(0, barHistory.length - Math.max(30, wanted * 2));
      updateStableBarCrop();
    } catch (_) {
      barDetectionFailed = true;
      updateBarStatus();
    }
  }

  function effectiveBarCrop() {
    const offset = clamp(Number(settings.barDetectionOffset) || 0, -5, 5) / 100;
    const manualH = clamp(Number(settings.manualHorizontalClip) || 0, 0, 40) / 100;
    const manualV = clamp(Number(settings.manualVerticalClip) || 0, 0, 40) / 100;
    const auto = {
      top: settings.removeHorizontalBars ? barCrop.top : 0,
      bottom: settings.removeHorizontalBars ? barCrop.bottom : 0,
      left: settings.removeVerticalBars ? barCrop.left : 0,
      right: settings.removeVerticalBars ? barCrop.right : 0
    };
    return {
      top: clamp(Math.max(manualH, auto.top + (auto.top ? offset : 0)), 0, 0.40),
      bottom: clamp(Math.max(manualH, auto.bottom + (auto.bottom ? offset : 0)), 0, 0.40),
      left: clamp(Math.max(manualV, auto.left + (auto.left ? offset : 0)), 0, 0.40),
      right: clamp(Math.max(manualV, auto.right + (auto.right ? offset : 0)), 0, 0.40)
    };
  }

  function applyVideoFill() {
    if (!video) return;
    const c = effectiveBarCrop();
    const totalX = clamp(c.left + c.right, 0, 0.78);
    const totalY = clamp(c.top + c.bottom, 0, 0.78);
    if (!settings.fillVideoToCrop || (!totalX && !totalY)) {
      video.removeAttribute('data-bali-fill-video');
      video.style.removeProperty('--bali-fill-scale');
      return;
    }
    const scale = Math.max(1 / Math.max(0.22, 1 - totalX), 1 / Math.max(0.22, 1 - totalY));
    video.setAttribute('data-bali-fill-video', '1');
    video.style.setProperty('--bali-fill-scale', String(Math.min(scale, 1.8)));
  }

  function updateBarStatus() {
    if (!barStatusElem) return;
    if (barDetectionFailed) {
      barStatusElem.textContent = '像素读取受限 · 可用手动裁切';
      return;
    }
    const c = effectiveBarCrop();
    const pct = v => `${(v * 100).toFixed(1)}%`;
    if (!(c.top || c.bottom || c.left || c.right)) {
      barStatusElem.textContent = '未检测到黑边';
      return;
    }
    barStatusElem.textContent = `上 ${pct(c.top)} · 下 ${pct(c.bottom)} · 左 ${pct(c.left)} · 右 ${pct(c.right)}`;
  }

  function getAmbientSourceCrop() {
    const crop = effectiveBarCrop();
    let srcX = video.videoWidth * crop.left;
    let srcY = video.videoHeight * crop.top;
    let srcW = video.videoWidth * Math.max(0.05, 1 - crop.left - crop.right);
    let srcH = video.videoHeight * Math.max(0.05, 1 - crop.top - crop.bottom);

    // Sample a tiny amount inside the detected picture. This intentionally affects only
    // the ambient source and removes 1px encoded borders / player-edge dark lines.
    const inset = 0.008;
    srcX += srcW * inset;
    srcY += srcH * inset;
    srcW *= 1 - inset * 2;
    srcH *= 1 - inset * 2;
    return { crop, srcX, srcY, srcW, srcH };
  }

  function getAmbientContentRect(crop) {
    const g = geometry;
    return {
      x: g.x + g.w * crop.left,
      y: g.y + g.h * crop.top,
      w: g.w * Math.max(0.05, 1 - crop.left - crop.right),
      h: g.h * Math.max(0.05, 1 - crop.top - crop.bottom)
    };
  }

  function drawLegacyFrameTo(ctx, canvas, spread) {
    if (!ctx || !canvas || !video || !geometry || !video.videoWidth || !video.videoHeight) return;

    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const scaleX = canvas.width / vw;
    const scaleY = canvas.height / vh;
    const g = geometry;
    const expand = clamp(Number(spread) || 1, 1, 3.2);
    const dw = g.w * expand;
    const dh = g.h * expand;
    const dx = g.cx - dw / 2;
    const dy = g.cy - dh / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let { srcX, srcY, srcW, srcH } = getAmbientSourceCrop();
    const srcRatio = srcW / srcH;
    const dstRatio = dw / dh;
    if (srcRatio > dstRatio) {
      const fittedW = srcH * dstRatio;
      srcX += (srcW - fittedW) / 2;
      srcW = fittedW;
    } else {
      const fittedH = srcW / dstRatio;
      srcY += (srcH - fittedH) / 2;
      srcH = fittedH;
    }

    try {
      ctx.drawImage(video, srcX, srcY, srcW, srcH,
        dx * scaleX, dy * scaleY, dw * scaleX, dh * scaleY);
    } catch (_) {}
  }

  function fadeAlphaAt(t) {
    const start = clamp((Number(settings.spreadFadeStart) || 0) / 100, -0.5, 0.95);
    if (t <= Math.max(0, start)) return 1;
    const u = clamp((t - Math.max(0, start)) / Math.max(0.001, 1 - Math.max(0, start)), 0, 1);
    const curve = clamp(Number(settings.spreadFadeCurve) || 35, 1, 100);
    const exponent = clamp(25 / curve, 0.25, 4);
    return Math.pow(1 - u, exponent);
  }

  function ensureSampleCanvas() {
    if (sampleCanvas) return;
    sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 192;
    sampleCanvas.height = 108;
    sampleCtx = sampleCanvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });
  }

  function updateAmbientSample() {
    if (!settings.performanceMode || !video || !video.videoWidth || !video.videoHeight) return null;
    ensureSampleCanvas();
    if (!sampleCtx) return null;
    const { crop, srcX, srcY, srcW, srcH } = getAmbientSourceCrop();
    try {
      sampleCtx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, sampleCanvas.width, sampleCanvas.height);
      return { crop, source: sampleCanvas, srcX: 0, srcY: 0, srcW: sampleCanvas.width, srcH: sampleCanvas.height };
    } catch (_) {
      return null;
    }
  }

  function drawEdgeProjector(ctx, canvas, distanceCssPx, far = false, sampled = null) {
    if (!ctx || !canvas || !video || !geometry || !video.videoWidth || !video.videoHeight) return;
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const sx = canvas.width / vw;
    const sy = canvas.height / vh;
    const raw = getAmbientSourceCrop();
    const crop = sampled?.crop || raw.crop;
    const source = sampled?.source || video;
    const srcX = sampled?.srcX ?? raw.srcX;
    const srcY = sampled?.srcY ?? raw.srcY;
    const srcW = sampled?.srcW ?? raw.srcW;
    const srcH = sampled?.srcH ?? raw.srcH;
    const r = getAmbientContentRect(crop);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = settings.performanceMode ? 'medium' : 'high';

    const edgeRatio = clamp((Number(settings.edgeSize) || 12) / 100, 0.02, 0.32);
    const srcBandX = Math.max(2, srcW * edgeRatio);
    const srcBandY = Math.max(2, srcH * edgeRatio);
    const displayBandX = Math.max(8, r.w * edgeRatio);
    const displayBandY = Math.max(8, r.h * edgeRatio);
    // Original v1.0 used 9 + 12 layers (168 video drawImage calls per ambient frame).
    // Performance mode uses fewer projections and lets CSS blur interpolate the gaps.
    const layers = settings.performanceMode ? (far ? 5 : 4) : (far ? 12 : 9);
    const alphaScale = far ? 0.20 : 0.27;

    const draw = (sX, sY, sW, sH, dX, dY, dW, dH, alpha) => {
      ctx.globalAlpha = clamp(alpha, 0, 1);
      try {
        ctx.drawImage(source, sX, sY, sW, sH,
          dX * sx, dY * sy, dW * sx, dH * sy);
      } catch (_) {}
    };

    for (let i = layers; i >= 1; i--) {
      const t = i / layers;
      const dist = distanceCssPx * t;
      const alpha = fadeAlphaAt(t) * alphaScale;
      const sideGrow = dist * 0.42;

      draw(srcX, srcY, srcW, srcBandY,
        r.x - sideGrow, r.y - dist, r.w + sideGrow * 2, dist + displayBandY, alpha);
      draw(srcX, srcY + srcH - srcBandY, srcW, srcBandY,
        r.x - sideGrow, r.y + r.h - displayBandY, r.w + sideGrow * 2, dist + displayBandY, alpha);
      draw(srcX, srcY, srcBandX, srcH,
        r.x - dist, r.y - sideGrow, dist + displayBandX, r.h + sideGrow * 2, alpha);
      draw(srcX + srcW - srcBandX, srcY, srcBandX, srcH,
        r.x + r.w - displayBandX, r.y - sideGrow, dist + displayBandX, r.h + sideGrow * 2, alpha);

      // In performance mode corners only need two anchor projections per layer stack.
      const drawCorners = !settings.performanceMode || i === layers || i === 1;
      if (drawCorners) {
        const cornerW = Math.max(srcBandX, srcW * 0.10);
        const cornerH = Math.max(srcBandY, srcH * 0.10);
        const cornerD = dist * 0.74;
        const ca = alpha * 0.72;
        draw(srcX, srcY, cornerW, cornerH,
          r.x - cornerD, r.y - cornerD, cornerD + displayBandX * 1.5, cornerD + displayBandY * 1.5, ca);
        draw(srcX + srcW - cornerW, srcY, cornerW, cornerH,
          r.x + r.w - displayBandX * 1.5, r.y - cornerD, cornerD + displayBandX * 1.5, cornerD + displayBandY * 1.5, ca);
        draw(srcX, srcY + srcH - cornerH, cornerW, cornerH,
          r.x - cornerD, r.y + r.h - displayBandY * 1.5, cornerD + displayBandX * 1.5, cornerD + displayBandY * 1.5, ca);
        draw(srcX + srcW - cornerW, srcY + srcH - cornerH, cornerW, cornerH,
          r.x + r.w - displayBandX * 1.5, r.y + r.h - displayBandY * 1.5, cornerD + displayBandX * 1.5, cornerD + displayBandY * 1.5, ca);
      }
    }
    ctx.restore();
  }

  function draw(ts = performance.now()) {
    if (!active() || !video || !root || document.hidden) return;
    let fps = clamp(Number(settings.fps) || 30, 5, 60);
    // Ambient light does not need to refresh as fast as the video. Keeping it below the
    // video's cadence gives the decoder/compositor headroom and prevents playback drops.
    if (settings.performanceMode) fps = Math.min(fps, 24);
    const minInterval = 1000 / fps;
    if (ts - lastDraw < minInterval) return;
    lastDraw = ts;
    frameSerial++;

    resizeCanvasToViewport(nearCanvas, nearCtx, false);
    resizeCanvasToViewport(farCanvas, farCtx, true);
    updateGeometry(false);
    detectBars(ts);
    const a = derivedAmbient();
    if (settings.alphaProjector) {
      const sampled = updateAmbientSample();
      // The far field is heavily blurred and changes slowly. Updating it every second
      // ambient frame almost halves its render cost without visible judder.
      if (!settings.performanceMode || frameSerial % 2 === 0) {
        drawEdgeProjector(farCtx, farCanvas, a.farDistance, true, sampled);
      }
      drawEdgeProjector(nearCtx, nearCanvas, a.nearDistance, false, sampled);
    } else {
      if (!settings.performanceMode || frameSerial % 2 === 0) {
        drawLegacyFrameTo(farCtx, farCanvas, a.farSpread);
      }
      drawLegacyFrameTo(nearCtx, nearCanvas, a.nearSpread);
    }
  }

  function stopFrameLoop() {
    if (video && rvfcId && video.cancelVideoFrameCallback) {
      try { video.cancelVideoFrameCallback(rvfcId); } catch (_) {}
    }
    rvfcId = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function startFrameLoop() {
    stopFrameLoop();
    if (!video || !active()) return;

    if (video.requestVideoFrameCallback) {
      const onFrame = now => {
        if (disposed || !video || !active()) return;
        draw(now);
        rvfcId = video.requestVideoFrameCallback(onFrame);
      };
      rvfcId = video.requestVideoFrameCallback(onFrame);
      return;
    }

    const loop = now => {
      if (disposed || !video || !active()) return;
      draw(now);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  function addVideoListeners(v) {
    ['loadeddata', 'seeked', 'play', 'pause', 'resize', 'timeupdate'].forEach(type => {
      v.addEventListener(type, () => {
        geometryDirty = true;
        updateGeometry(true);
        if (type === 'loadeddata' || type === 'seeked' || type === 'resize') detectBars(performance.now(), true);
        draw(performance.now() + 1000);
      }, { passive: true });
    });
  }

  function sliderRow(label, key, min, max, step, suffix = '%') {
    const row = document.createElement('label');
    row.className = 'bali-menu-row bali-menu-slider-row';
    row.innerHTML = `<span class="bali-menu-label">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" data-key="${key}"><span class="bali-menu-value"></span>`;
    const input = row.querySelector('input');
    const value = row.querySelector('.bali-menu-value');
    input.value = settings[key];
    const sync = () => {
      const n = Number(input.value);
      value.textContent = `${Math.round(n * 10) / 10}${suffix}`;
    };
    sync();
    input.addEventListener('input', () => {
      const next = Number(input.value);
      settings[key] = next;
      sync();
      chrome.storage.sync.set({ [key]: next });
    });
    return row;
  }

  function selectRow(label, key, options) {
    const row = document.createElement('label');
    row.className = 'bali-menu-row';
    const select = document.createElement('select');
    for (const [value, text] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.dataset.key = key;
    select.value = String(settings[key]);
    select.addEventListener('change', () => {
      settings[key] = select.value;
      chrome.storage.sync.set({ [key]: select.value });
      applyStyles();
      startFrameLoop();
    });
    const labelSpan = document.createElement('span');
    labelSpan.className = 'bali-menu-label';
    labelSpan.textContent = label;
    row.append(labelSpan, select);
    return row;
  }

  function toggleRow(label, key) {
    const row = document.createElement('label');
    row.className = 'bali-menu-row bali-menu-toggle-row';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'bali-menu-label';
    labelSpan.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.key = key;
    input.checked = !!settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      chrome.storage.sync.set({ [key]: input.checked });
      applyStyles();
    });
    row.append(labelSpan, input);
    return row;
  }

  function section(title, open = false) {
    const details = document.createElement('details');
    details.className = 'bali-menu-section';
    details.open = open;
    const summary = document.createElement('summary');
    summary.textContent = title;
    const body = document.createElement('div');
    body.className = 'bali-menu-section-body';
    details.append(summary, body);
    return { details, body };
  }

  function updateMiniPlayerLayer() {
    if (!player) return;
    try {
      const rect = player.getBoundingClientRect();
      const cs = getComputedStyle(player);
      const classText = String(player.className || '');
      const attrs = `${player.getAttribute('data-screen') || ''} ${player.getAttribute('data-mode') || ''}`;
      const namedMini = /mini|float|small/i.test(`${classText} ${attrs}`);
      const fixedMini = (cs.position === 'fixed' || cs.position === 'sticky') &&
        rect.width > 180 && rect.height > 100 &&
        rect.width < innerWidth * 0.78 && rect.height < innerHeight * 0.82;
      player.toggleAttribute('data-bali-mini-player', namedMini || fixedMini);
    } catch (_) {}
  }

  async function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    Object.assign(settings, preset);
    await chrome.storage.sync.set(preset);
    applyStyles();
    updateMiniPlayerLayer();
    updateMasks();
    draw(performance.now() + 1000);
    startFrameLoop();
    if (settingsPanel?.isConnected) {
      settingsPanel.querySelectorAll('[data-key]').forEach(control => {
        const key = control.dataset.key;
        if (!(key in settings)) return;
        if (control.type === 'checkbox') control.checked = !!settings[key];
        else control.value = settings[key];
        const value = control.closest('.bali-menu-row')?.querySelector('.bali-menu-value');
        if (value && control.type === 'range') {
          const suffix = key === 'fps' ? ' fps' : key === 'fadeDuration' ? ' ms' : key === 'barFramesAverage' ? ' 帧' : '%';
          value.textContent = `${Math.round(Number(control.value) * 10) / 10}${suffix}`;
        }
      });
    }
  }

  function presetBar() {
    const wrap = document.createElement('div');
    wrap.className = 'bali-menu-presets';
    const title = document.createElement('div');
    title.className = 'bali-menu-preset-title';
    title.textContent = '快速预设';
    const buttons = document.createElement('div');
    buttons.className = 'bali-menu-preset-buttons';
    [['light','轻度'],['standard','标准（YT）'],['heavy','重度']].forEach(([key,label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', e => { e.stopPropagation(); applyPreset(key); });
      buttons.append(btn);
    });
    wrap.append(title, buttons);
    return wrap;
  }

  function createSettingsPanel() {
    if (!player || settingsPanel?.isConnected) return;

    settingsPanel = document.createElement('div');
    settingsPanel.className = 'bali-player-settings-panel';
    settingsPanel.hidden = true;

    const top = document.createElement('div');
    top.className = 'bali-menu-top';
    top.innerHTML = `<strong>Bilibili 环境光</strong><button type="button" class="bali-menu-close" aria-label="关闭">×</button>`;
    top.querySelector('.bali-menu-close').addEventListener('click', () => { settingsPanel.hidden = true; });
    settingsPanel.append(top);

    const general = section('设置');
    general.body.append(toggleRow('启用环境光', 'enabled'));
    settingsPanel.append(general.details);

    const quality = section('质量');
    quality.body.append(
      sliderRow('渲染分辨率', 'renderQuality', 16, 100, 1, '%'),
      sliderRow('帧率上限', 'fps', 10, 60, 5, ' fps')
    );
    settingsPanel.append(quality.details);

    const header = section('页面顶部');
    header.body.append(
      toggleRow('顶部栏始终置顶', 'headerOnTop'),
      sliderRow('顶部栏环境光影响', 'headerAmbient', 0, 100, 1, '%')
    );
    settingsPanel.append(header.details);

    const content = section('页面内容');
    content.body.append(
      toggleRow('纯黑背景', 'trueBlack'),
      toggleRow('深色页面文字适配', 'darkTextAdaptation')
    );
    settingsPanel.append(content.details);

    const videoSection = section('视频');
    const sample = document.createElement('div');
    sample.className = 'bali-menu-static-row';
    sample.innerHTML = '<span>采样来源</span><b>仅视频画面</b>';
    videoSection.body.append(
      sample,
      toggleRow('弹幕输入栏独立分层', 'separateDmBar'),
      sliderRow('弹幕栏环境光影响', 'dmAmbient', 0, 100, 1, '%'),
      toggleRow('移除播放器边缘黑晕', 'suppressPlayerEdgeShadow'),
      sliderRow('边缘黑晕抑制', 'edgeShadowSuppression', 0, 100, 1, '%')
    );
    settingsPanel.append(videoSection.details);

    const bars = section('移除黑边与彩色边');
    bars.body.append(
      toggleRow('自动移除上下黑边', 'removeHorizontalBars'),
      toggleRow('自动移除左右黑边', 'removeVerticalBars'),
      toggleRow('检测彩色边', 'detectColoredBars'),
      sliderRow('检测灵敏度', 'barDetectionSensitivity', 10, 90, 1, '%'),
      sliderRow('平均帧数', 'barFramesAverage', 1, 30, 1, ' 帧'),
      sliderRow('检测偏移', 'barDetectionOffset', -5, 5, 0.1, '%'),
      sliderRow('手动上下裁切', 'manualHorizontalClip', 0, 40, 0.1, '%'),
      sliderRow('手动左右裁切', 'manualVerticalClip', 0, 40, 0.1, '%'),
      toggleRow('填充视频到裁切区域', 'fillVideoToCrop')
    );
    const statusRow = document.createElement('div');
    statusRow.className = 'bali-menu-static-row';
    statusRow.innerHTML = '<span>当前检测</span><b></b>';
    barStatusElem = statusRow.querySelector('b');
    bars.body.append(statusRow);
    updateBarStatus();
    settingsPanel.append(bars.details);

    const filters = section('滤镜');
    filters.body.append(
      sliderRow('亮度', 'brightness', 50, 150, 1, '%'),
      sliderRow('色彩', 'vibrance', 50, 200, 1, '%'),
      sliderRow('饱和度', 'saturation', 50, 200, 1, '%')
    );
    settingsPanel.append(filters.details);

    const ambient = section('环境光', true);
    ambient.body.append(
      toggleRow('边缘投影器', 'alphaProjector'),
      sliderRow('模糊', 'blur', 0, 100, 0.1, '%'),
      sliderRow('扩散范围', 'spread', 0, 100, 0.1, '%'),
      sliderRow('边缘采样宽度', 'edgeSize', 2, 32, 0.1, '%'),
      sliderRow('扩散衰减起点', 'spreadFadeStart', 0, 60, 0.1, '%'),
      sliderRow('扩散衰减曲线', 'spreadFadeCurve', 1, 100, 1, '%'),
      sliderRow('淡入时间', 'fadeDuration', 0, 1500, 50, ' ms')
    );
    const viewHeading = document.createElement('div');
    viewHeading.className = 'bali-menu-subheading';
    viewHeading.textContent = '视图模式';
    ambient.body.append(viewHeading);
    ambient.body.append(selectRow('启用布局', 'viewMode', [
      ['all', '全部'],
      ['normal', '普通模式'],
      ['fullscreen', '全屏 / 网页全屏']
    ]));
    settingsPanel.append(ambient.details);
    settingsPanel.append(presetBar());

    player.append(settingsPanel);
  }

  function ensurePlayerSettingsButton() {
    if (!player?.isConnected) return;
    if (settingsButton?.isConnected && settingsPanel?.isConnected) return;

    settingsButton?.remove();
    settingsPanel?.remove();
    settingsButton = null;
    settingsPanel = null;

    const nativeSettings = player.querySelector('.bpx-player-ctrl-setting');
    const controls = nativeSettings?.parentElement || player.querySelector('.bpx-player-control-bottom-right');
    if (!controls) return;

    settingsButton = document.createElement('div');
    settingsButton.className = 'bpx-player-ctrl-btn bali-ambient-player-btn';
    settingsButton.title = '环境光设置';
    settingsButton.setAttribute('role', 'button');
    settingsButton.setAttribute('tabindex', '0');
    settingsButton.innerHTML = '<span>AL</span>';

    if (nativeSettings && nativeSettings.parentElement === controls) controls.insertBefore(settingsButton, nativeSettings);
    else controls.append(settingsButton);

    createSettingsPanel();

    const toggle = e => {
      e?.stopPropagation();
      if (!settingsPanel) return;
      settingsPanel.hidden = !settingsPanel.hidden;
    };
    settingsButton.addEventListener('click', toggle);
    settingsButton.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') toggle(e);
    });
  }

  function attach(force = false) {
    if (!isVideoPage()) {
      if (root) root.style.display = 'none';
      applyPageTheme();
      return;
    }

    const nextVideo = findVideo();
    if (!nextVideo) {
      ensureRoot();
      applyStyles();
      return;
    }

    const changed = nextVideo !== video;
    if (changed || force) {
      stopFrameLoop();
      video = nextVideo;
      player = findPlayer(video);
      resetBarDetection();
      addVideoListeners(video);
      settingsButton?.remove();
      settingsPanel?.remove();
      settingsButton = null;
      settingsPanel = null;
    }

    ensureRoot();
    applyStyles();
    geometryDirty = true;
    updateGeometry(true);
    ensurePlayerSettingsButton();
    draw(performance.now() + 1000);
    if (changed || force) startFrameLoop();

    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      geometryDirty = true;
      updateGeometry(true);
      draw(performance.now() + 1000);
    });
    resizeObserver.observe(video);
    if (player) resizeObserver.observe(player);
  }

  async function loadSettings() {
    try {
      const saved = await chrome.storage.sync.get(DEFAULTS);
      settings = { ...DEFAULTS, ...saved };
    } catch (_) {
      settings = { ...DEFAULTS };
    }
  }

  function watchPage() {
    mutationObserver?.disconnect();
    mutationObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => attach(true), 180);
      } else if (!video?.isConnected || !root?.isConnected || !settingsButton?.isConnected) {
        attach(true);
      }
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('resize', () => {
      geometryDirty = true;
      updateGeometry(true);
      draw(performance.now() + 1000);
    }, { passive: true });
    window.addEventListener('scroll', () => { geometryDirty = true; }, { passive: true });
    document.addEventListener('fullscreenchange', () => { geometryDirty = true; setTimeout(() => attach(true), 100); });
    document.addEventListener('click', e => {
      if (!settingsPanel || settingsPanel.hidden) return;
      if (settingsPanel.contains(e.target) || settingsButton?.contains(e.target)) return;
      settingsPanel.hidden = true;
    }, true);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        attach(true);
        draw(performance.now() + 1000);
      }
    });

    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        attach(true);
      } else {
        attach(false);
      }
    }, 1600);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, change] of Object.entries(changes)) settings[key] = change.newValue;
    applyStyles();
    updateMasks();
    if (changes.removeHorizontalBars || changes.removeVerticalBars || changes.detectColoredBars ||
        changes.barDetectionSensitivity || changes.barFramesAverage || changes.barDetectionOffset ||
        changes.manualHorizontalClip || changes.manualVerticalClip || changes.fillVideoToCrop) {
      if (changes.removeHorizontalBars || changes.removeVerticalBars || changes.detectColoredBars ||
          changes.barDetectionSensitivity || changes.barFramesAverage) {
        resetBarDetection();
        detectBars(performance.now(), true);
      } else {
        updateBarStatus();
        applyVideoFill();
      }
    }
    draw(performance.now() + 1000);
    if (changes.enabled || changes.fps || changes.viewMode || changes.performanceMode || changes.renderQuality) startFrameLoop();
    if (settingsPanel?.isConnected) {
      settingsPanel.querySelectorAll('[data-key]').forEach(control => {
        const key = control.dataset.key;
        if (!(key in settings)) return;
        if (control === document.activeElement) return;
        if (control.type === 'checkbox') control.checked = !!settings[key];
        else control.value = settings[key];
        const row = control.closest('.bali-menu-row');
        const value = row?.querySelector('.bali-menu-value');
        if (value && control.type === 'range') {
          const suffix = key === 'fps' ? ' fps' : key === 'fadeDuration' ? ' ms' : key === 'barFramesAverage' ? ' 帧' : '%';
          value.textContent = `${Math.round(Number(control.value) * 10) / 10}${suffix}`;
        }
      });
    }
  });

  setInterval(() => { if (player) updateMiniPlayerLayer(); }, 700);

  loadSettings().then(() => {
    attach(true);
    watchPage();
  });

  window.addEventListener('beforeunload', () => {
    disposed = true;
    stopFrameLoop();
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    document.documentElement.removeAttribute('data-bili-ambient-dark');
    document.documentElement.removeAttribute('data-bili-ambient-header-top');
    document.documentElement.removeAttribute('data-bili-ambient-text-adapt');
    document.documentElement.removeAttribute('data-bili-ambient-dm-separated');
    document.documentElement.removeAttribute('data-bili-ambient-no-edge-shadow');
    document.documentElement.removeAttribute('data-bili-ambient-alpha-projector');
    ['--bali-header-bg-alpha','--bali-header-blur','--bali-header-sat','--bali-dm-bg-alpha','--bali-dm-blur','--bali-dm-sat','--bali-player-back-alpha'].forEach(name => document.documentElement.style.removeProperty(name));
    if (video) { video.removeAttribute('data-bali-fill-video'); video.style.removeProperty('--bali-fill-scale'); }
  });
})();
