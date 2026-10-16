(() => {
  'use strict';

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
    edgeShadowSuppression: 100,
    headerAmbient: 68,
    dmAmbient: 68,
    performanceMode: true,
    settingsRevision: 4
  };

  const PRESETS = {
    light: {
      blur: 35, spread: 70, brightness: 95, saturation: 100, vibrance: 100, ambientIntensity: 70, blackCrush: false,
      edgeSize: 9, spreadFadeStart: 20, spreadFadeCurve: 46,
      headerAmbient: 32, dmAmbient: 32, edgeShadowSuppression: 100, suppressPlayerEdgeShadow: true, separateDmBar: true,
      renderQuality: 20, fps: 30, performanceMode: true, alphaProjector: true
    },
    standard: {
      blur: 55, spread: 85, fadeDuration: 0, brightness: 100, saturation: 105, vibrance: 100, ambientIntensity: 100, blackCrush: false,
      edgeSize: 12, spreadFadeStart: 15, spreadFadeCurve: 35,
      headerAmbient: 58, dmAmbient: 58, edgeShadowSuppression: 100, suppressPlayerEdgeShadow: true, separateDmBar: true,
      renderQuality: 24, fps: 60, performanceMode: true, alphaProjector: true
    },
    heavy: {
      blur: 75, spread: 95, brightness: 105, saturation: 115, vibrance: 108, ambientIntensity: 120, blackCrush: false,
      edgeSize: 15, spreadFadeStart: 9, spreadFadeCurve: 26,
      headerAmbient: 78, dmAmbient: 78, edgeShadowSuppression: 100, suppressPlayerEdgeShadow: true, separateDmBar: true,
      renderQuality: 26, fps: 60, performanceMode: true, alphaProjector: true
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
  let nextDrawAt = 0;
  let frameLoopToken = 0;
  let barDetectionTask = null;
  const listenedVideos = new WeakSet();
  let projectionPathsKey = '';
  let projectionPaths = [];
  const playerShells = new Map();
  let playerShellObserver = null;
  let rvfcId = 0;
  let rafId = 0;
  let disposed = false;
  let geometry = null;
  let lastUrl = location.href;
  let settingsButton = null;
  let settingsPanel = null;
  let toolbarObserver = null;
  let toolbarFitRaf = 0;
  let fittedToolbar = null;
  const toolbarSpacing = new Map();
  let detectionCanvas = null;
  let detectionCtx = null;
  let lastBarDetection = 0;
  let barHistory = [];
  let barCrop = { top: 0, bottom: 0, left: 0, right: 0 };
  let barDetectionFailed = false;
  let barStatusElem = null;
  let sampleCanvas = null;
  let sampleCtx = null;
  let projectorMask = null;
  let projectorMaskCtx = null;
  let projectorMaskKey = '';
  let geometryDirty = true;
  let lastGeometryUpdate = 0;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

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

  function stripDropShadows(filter) {
    let result = '', position = 0;
    while (position < filter.length) {
      const start = filter.indexOf('drop-shadow(', position);
      if (start < 0) { result += filter.slice(position); break; }
      result += filter.slice(position, start);
      let depth = 1, end = start + 12;
      while (end < filter.length && depth) {
        if (filter[end] === '(') depth++;
        if (filter[end] === ')') depth--;
        end++;
      }
      position = end;
    }
    return result.trim() || 'none';
  }

  function restorePlayerShell(element, saved) {
    for (const [property, original] of saved.original) {
      const applied = saved.applied.get(property);
      // A later site/user change belongs to the site; only undo our own value.
      if (element.style.getPropertyValue(property) !== applied) continue;
      if (original.value) element.style.setProperty(property, original.value, original.priority);
      else element.style.removeProperty(property);
    }
    element.removeAttribute('data-bali-player-shell');
  }

  function restorePlayerShells() {
    playerShellObserver?.disconnect();
    for (const [element, saved] of playerShells) restorePlayerShell(element, saved);
    playerShells.clear();
  }

  function updatePlayerShells() {
    if (!active() || !settings.suppressPlayerEdgeShadow || !player?.isConnected) {
      restorePlayerShells();
      return;
    }
    const reference = player.getBoundingClientRect();
    const picture = video?.getBoundingClientRect() || reference;
    if (reference.width < 10 || reference.height < 10) return;
    const shells = new Set([player]);
    // Site shadows can live outside #bilibili-player and include the sending bar.
    // Inspect only the actual player's ancestor chain, never all page elements.
    // Include the picture itself and unnamed wrappers inside the native player.
    // A box-shadow on video or an intermediate wrapper bypasses container CSS.
    let element = video || player.parentElement;
    for (let depth = 0; element && element !== document.body && element !== document.documentElement && depth < 10; depth++, element = element.parentElement) {
      if (element.id === 'app' || element.id === '__next') break;
      const rect = element.getBoundingClientRect();
      const known = /^(?:playerWrap|bilibili-player-wrap|bilibili-player)$/.test(element.id);
      const matches = bounds => Math.abs(rect.width - bounds.width) <= 16 &&
        Math.abs(rect.left - bounds.left) <= 16 && Math.abs(rect.top - bounds.top) <= 16 &&
        rect.height >= bounds.height - 8 && rect.height <= bounds.height + 160;
      const fits = matches(reference) || matches(picture);
      if (element === video || known || fits) shells.add(element);
    }
    // Limit decorative-mask cleanup to this player's own controls. Inline
    // important gradients need the same reversible treatment as wrapper shadows.
    for (const mask of player.querySelectorAll('.bpx-player-top-mask, .bpx-player-control-mask, .bpx-player-control-top, .bpx-player-control-bottom')) shells.add(mask);
    // Live diagnostics found a 0 0 8px shadow on the skeleton alongside the
    // mounted player. That sibling is outside the video's ancestor chain.
    const host = player.closest('#bilibili-player, #playerWrap') || player.parentElement;
    for (const placeholder of host?.querySelectorAll('#bilibili-player-placeholder, [id^="bilibili-player-placeholder-"]') || []) shells.add(placeholder);
    // Disconnect around our writes so observer notifications cannot feed back.
    playerShellObserver?.disconnect();
    for (const [old, saved] of playerShells) {
      if (!shells.has(old)) { restorePlayerShell(old, saved); playerShells.delete(old); }
    }
    for (const shell of shells) {
      let saved = playerShells.get(shell);
      if (!saved) { saved = { original: new Map(), applied: new Map() }; playerShells.set(shell, saved); }
      const properties = {
        'box-shadow': 'none', 'outline-color': 'transparent', 'border-color': 'transparent',
        'background-color': 'transparent', 'background-image': 'none'
      };
      const filter = getComputedStyle(shell).filter;
      if (filter.includes('drop-shadow(')) properties.filter = stripDropShadows(filter);
      for (const [property, value] of Object.entries(properties)) {
        const current = shell.style.getPropertyValue(property);
        const priority = shell.style.getPropertyPriority(property);
        if (!saved.original.has(property) || (saved.applied.has(property) && current !== saved.applied.get(property))) {
          saved.original.set(property, { value: current, priority });
        }
        if (current !== value || priority !== 'important') shell.style.setProperty(property, value, 'important');
        // CSSOM normalises transparent colours; save its canonical representation.
        saved.applied.set(property, shell.style.getPropertyValue(property));
      }
      if (!shell.hasAttribute('data-bali-player-shell')) shell.setAttribute('data-bali-player-shell', '');
    }
    if (!playerShellObserver) playerShellObserver = new MutationObserver(() => updatePlayerShells());
    for (const shell of shells) playerShellObserver.observe(shell, { attributes: true, attributeFilter: ['style', 'class'] });
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
      document.documentElement.style.setProperty('--bali-player-back-alpha', String(1 - edgeSuppression));
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
    updatePlayerShells();
  }

  function derivedAmbient() {
    const blur = clamp(Number(settings.blur) || 0, 0, 100);
    const spread = clamp(Number(settings.spread) || 0, 0, 400);
    // The upstream 2D renderer expresses blur relative to the displayed video height.
    // In particular, 0% must remain 0px, independent of the projection's spread.
    const height = geometry?.h || video?.clientHeight || 540;
    return {
      blur,
      spread,
      blurPx: height * 0.0025 * blur
    };
  }

  function collectBorderDiagnostics() {
    const started = performance.now();
    const picture = video?.isConnected ? video : findVideo();
    const frame = picture ? findPlayer(picture) : player;
    const nodes = new Set(), points = [];
    const label = node => node ? node.localName + (node.id ? '#' + node.id : '') +
      [...(node.classList || [])].slice(0, 7).map(name => '.' + name).join('') : null;
    const rect = node => {
      const r = node.getBoundingClientRect();
      return Object.fromEntries(['x','y','width','height','top','right','bottom','left'].map(key => [key, Math.round(r[key] * 10) / 10]));
    };
    const clean = value => String(value || '').replace(/url\([\s\S]*?\)/g, 'url([omitted])').slice(0, 600);
    const properties = ['box-shadow','filter','backdrop-filter','background-color','background-image',
      'border-top','border-right','border-bottom','border-left','outline','opacity','position','z-index',
      'mask-image','clip-path','overflow','transform','isolation','mix-blend-mode'];
    const paint = (node, pseudo = null) => {
      const cs = getComputedStyle(node, pseudo);
      return { content: pseudo ? clean(cs.content) : undefined,
        ...Object.fromEntries(properties.map(property => [property, clean(cs.getPropertyValue(property))])) };
    };
    for (const start of [picture, frame, root, nearCanvas, farCanvas]) {
      for (let node = start; node && nodes.size < 180; node = node.parentElement) nodes.add(node);
    }
    for (const node of document.querySelectorAll('.up-panel-container, .up-info-container, .up-info, .up-info--right, .up-info__right, .video-toolbar-container .video-share, .bili-header .v-popover, .bili-header .v-popover__reference, .bili-header .van-popover__reference, .bpx-player-control-bottom, .bpx-player-control-bottom-left, .bpx-player-control-bottom-right')) {
      if (nodes.size < 180) nodes.add(node);
    }
    for (const start of [picture, frame]) {
      if (!start) continue;
      const r = start.getBoundingClientRect();
      for (const fraction of [.05,.25,.5,.75,.95]) for (const offset of [-20,-5,2,8,20]) {
        for (const [x,y] of [[r.left-offset,r.top+r.height*fraction],[r.right+offset,r.top+r.height*fraction],
          [r.left+r.width*fraction,r.top-offset],[r.left+r.width*fraction,r.bottom+offset]]) {
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const stack = document.elementsFromPoint(x,y).slice(0,10);
          for (const node of stack) if (nodes.size < 120) nodes.add(node);
          points.push({x:Math.round(x),y:Math.round(y),stack:stack.map(label)});
        }
      }
    }
    // Hit testing omits pointer-events:none overlays, which can still paint shadows.
    // Scan paint only near the frame, once on explicit diagnostic export.
    const boundary = (frame || picture)?.getBoundingClientRect();
    if (boundary) for (const node of document.querySelectorAll('*')) {
      if (nodes.has(node) || nodes.size >= 240) continue;
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height || r.right < boundary.left-64 || r.left > boundary.right+64 ||
          r.bottom < boundary.top-64 || r.top > boundary.bottom+64) continue;
      if (!['left','right','top','bottom'].some(key => Math.abs(r[key]-boundary[key]) < 64)) continue;
      const styles = [getComputedStyle(node),getComputedStyle(node,'::before'),getComputedStyle(node,'::after')];
      if (styles.some((cs,index) => (!index || !['none','normal'].includes(cs.content)) &&
          (cs.boxShadow !== 'none' || cs.filter.includes('drop-shadow(') || cs.backgroundImage.includes('gradient(')))) nodes.add(node);
    }
    const entries = [...nodes].map(node => ({element:label(node),rect:rect(node),
      cleaned:node.hasAttribute('data-bali-player-shell'),style:paint(node),
      before:paint(node,'::before'),after:paint(node,'::after'),
      inline:Object.fromEntries(properties.map(key => [key,{value:clean(node.style?.getPropertyValue(key)),priority:node.style?.getPropertyPriority(key)}])),
      originalCleanup:playerShells.has(node) ? Object.fromEntries(playerShells.get(node).original) : undefined}));
    const sheets = [], rules = [];
    const walk = (list, source, conditions = []) => {
      for (const rule of list) {
        if (!rule.selectorText && rule.cssRules) { walk(rule.cssRules,source,[...conditions,rule.conditionText || rule.name || 'group']); continue; }
        if (!rule.selectorText || !rule.style || rules.length >= 300) continue;
        const declarations = ['box-shadow','filter','background-image','border','outline','mask-image'].filter(key => rule.style.getPropertyValue(key));
        if (!declarations.length) continue;
        const matched = [...nodes].filter(node => { try { return node.matches(rule.selectorText.replace(/::?(?:before|after)\b/g,'')); } catch (_) { return false; } });
        if (matched.length) rules.push({source,selector:rule.selectorText,conditions,elements:matched.map(label),
          declarations:Object.fromEntries(declarations.map(key=>[key,{value:clean(rule.style.getPropertyValue(key)),priority:rule.style.getPropertyPriority(key)}]))});
      }
    };
    for (const sheet of document.styleSheets) {
      let source = sheet.ownerNode?.id ? '#' + sheet.ownerNode.id : 'inline';
      if (sheet.href) { try { const u = new URL(sheet.href); source = u.origin + u.pathname; } catch (_) { source = 'stylesheet'; } }
      try { walk(sheet.cssRules,source); sheets.push({source,readable:true,disabled:sheet.disabled}); }
      catch (_) { sheets.push({source,readable:false,disabled:sheet.disabled}); }
    }
    const shadowCandidates = entries.filter(entry => [entry.style,entry.before,entry.after].some((style,index) =>
      (!index || !['none','normal'].includes(style.content)) && (style['box-shadow'] !== 'none' || style.filter.includes('drop-shadow('))));
    const controlButtons = [...(frame?.querySelectorAll('.bpx-player-control-bottom .bpx-player-ctrl-btn') || [])]
      .filter(node => node.getBoundingClientRect().width > 0).map(node => ({element:label(node),rect:rect(node)}));
    const controlLayout = {alParent:label(settingsButton?.parentElement),alRect:settingsButton?rect(settingsButton):null,
      spacingCompacted:!!fittedToolbar?.hasAttribute('data-bali-toolbar-fit'),
      alInNativeToolbar:!!settingsButton?.closest('.bpx-player-control-bottom'),buttons:controlButtons,
      overflowRight:picture ? Math.max(0,...controlButtons.map(button=>button.rect.right-picture.getBoundingClientRect().right)) : null};
    return {schema:1,scriptBuild:'1.3.0-toolbar-alignment',manifestVersion:chrome.runtime.getManifest().version,
      created:new Date().toISOString(),page:location.origin+location.pathname,viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},
      settings:{...settings},state:{active:active(),video:label(picture),player:label(frame),videoRect:picture?rect(picture):null,playerRect:frame?rect(frame):null,
        rootCount:document.querySelectorAll('#bili-ambient-v32-root').length,shadowRemoval:document.documentElement.getAttribute('data-bili-ambient-no-edge-shadow'),
        markedShells:document.querySelectorAll('[data-bali-player-shell]').length,videoCandidates:document.querySelectorAll('video,bwp-video').length},
      controlLayout,shadowCandidates,entries,edgePointStacks:points,stylesheets:sheets,matchedPaintRules:rules,elapsedMs:Math.round(performance.now()-started)};
  }

  chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'bali-border-diagnostic' || (sender.id && sender.id !== chrome.runtime.id)) return false;
    try { sendResponse({ok:true,report:collectBorderDiagnostics()}); }
    catch (error) { sendResponse({ok:false,error:String(error.message || error)}); }
    return false;
  });

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
    const savedIntensity = Number(settings.ambientIntensity);
    const intensity = clamp(Number.isFinite(savedIntensity) ? savedIntensity : 100, 0, 140) / 100;
    const opacityScale = Math.min(1, intensity);
    const intensityBrightness = intensity > 1 ? 1 + (intensity - 1) * 0.35 : 1;
    const contrast = settings.blackCrush ? 1.10 : 1;
    const fade = clamp(Number(settings.fadeDuration) || 0, 0, 1500);

    nearCanvas.style.opacity = String(a.blur === 0 && a.spread === 0 ? 0 : opacityScale);
    // Keep the existing DOM and stacking order. One composed stack avoids double exposure.
    farCanvas.style.opacity = '0';
    farCtx?.clearRect(0, 0, farCanvas.width, farCanvas.height);
    // Screen blending makes black source pixels contribute no "black glow".
    nearCanvas.style.mixBlendMode = settings.alphaProjector ? 'screen' : 'normal';
    farCanvas.style.mixBlendMode = settings.alphaProjector ? 'screen' : 'normal';
    nearCanvas.style.transition = `filter ${fade}ms ease, opacity ${fade}ms ease`;
    farCanvas.style.transition = `filter ${fade}ms ease, opacity ${fade}ms ease`;

    const filter = `blur(${a.blurPx}px) saturate(${sat * vib}) brightness(${bri * intensityBrightness}) contrast(${contrast})`;
    nearCanvas.style.setProperty('filter', filter, 'important');
    farCanvas.style.setProperty('filter', filter, 'important');
  }

  function resizeCanvasToViewport(canvas, ctx, far = false) {
    if (!canvas || !ctx) return;
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    let q = clamp(Number(settings.renderQuality) || 32, 16, 100) / 100;
    // Clear projections need enough pixels to show the enlarged copies rather than a
    // low-resolution blur baked into the sample. Blurred projections retain the old budget.
    if (settings.performanceMode) q *= far ? 0.68 : 0.90;
    const blur = derivedAmbient().blur;
    if (!far && blur < 20) q = Math.max(q, blur < 5 ? 0.75 : 0.50);
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
    const oldHeight = geometry?.h;
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
    if (oldHeight !== geometry.h) applyStyles();
  }

  function updateMasks() {
    if (!geometry || !nearCanvas || !farCanvas) return;
    // Rectangular spread fading is composed into the canvas, before the blur.
    nearCanvas.style.webkitMaskImage = nearCanvas.style.maskImage = 'none';
    farCanvas.style.webkitMaskImage = farCanvas.style.maskImage = 'none';
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

  // Scale spacing and fade easing follow youtube-ambilight's 2D projector model.
  // Reference: WesselKroos/youtube-ambilight, develop@18d1718 (MIT; see notices).
  function projectionLayout(rect) {
    const { spread } = derivedAmbient();
    const edge = clamp(Number(settings.edgeSize) || 12, 2, 50);
    const levels = Math.max(0, Math.round(spread / edge));
    const step = Math.max(rect.w, rect.h) * edge / 100;
    // As upstream, equal absolute growth on both axes preserves directional extension.
    return { levels, step, extent: levels * step / 2 };
  }

  function fadeAlphaAt(t, start = clamp((Number(settings.spreadFadeStart) || 0) / 100, -0.5, 1)) {
    if (t <= start) return 1;
    if (t >= 1) return 0;
    const u = clamp((t - start) / Math.max(0.0001, 1 - start), 0, 1);
    const curve = clamp(Number(settings.spreadFadeCurve) || 35, 1, 100);
    return 1 - Math.pow(u, 25 / curve);
  }

  function ensureSampleCanvas() {
    if (sampleCanvas) return;
    sampleCanvas = document.createElement('canvas');
    sampleCtx = sampleCanvas.getContext('2d', { alpha: false, desynchronized: true });
  }

  function updateAmbientSample() {
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    ensureSampleCanvas();
    if (!sampleCtx) return null;
    const { crop, srcX, srcY, srcW, srcH } = getAmbientSourceCrop();
    const blur = derivedAmbient().blur;
    const maxSide = blur < 5 ? 1280 : blur < 20 || !settings.performanceMode ? 960 : 512;
    const ratio = Math.min(1, maxSide / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * ratio));
    const h = Math.max(1, Math.round(srcH * ratio));
    if (sampleCanvas.width !== w || sampleCanvas.height !== h) {
      sampleCanvas.width = w;
      sampleCanvas.height = h;
    }
    try {
      // Decode/copy the video only once, regardless of the number of scaled projections.
      sampleCtx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, w, h);
      return { crop, source: sampleCanvas, srcX: 0, srcY: 0, srcW: w, srcH: h };
    } catch (_) {
      return null;
    }
  }

  function spreadMask(canvas, rect, extent) {
    if (extent <= 0) return null;
    if (!projectorMask) {
      projectorMask = document.createElement('canvas');
      projectorMaskCtx = projectorMask.getContext('2d', { alpha: true });
    }
    if (!projectorMaskCtx) return null;
    const key = [canvas.width, canvas.height, innerWidth, innerHeight,
      rect.x, rect.y, rect.w, rect.h, extent, settings.spreadFadeStart, settings.spreadFadeCurve].join(':');
    if (key === projectorMaskKey) return projectorMask;
    if (projectorMask.width !== canvas.width || projectorMask.height !== canvas.height) {
      projectorMask.width = canvas.width;
      projectorMask.height = canvas.height;
    }
    const ctx = projectorMaskCtx;
    const sx = canvas.width / Math.max(1, innerWidth);
    const sy = canvas.height / Math.max(1, innerHeight);
    const requestedStart = clamp((Number(settings.spreadFadeStart) || 0) / 100, -0.5, 1);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in';
    // Two independent rectangular gradients reproduce upstream's spread falloff.
    // A negative start is permitted inside the picture, without reversing the stops.
    const axis = (position, size, scale, horizontal) => {
      const start = Math.max(requestedStart, -size / (2 * extent));
      const length = size + extent * 2;
      const from = (position - extent) * scale;
      const to = (position + size + extent) * scale;
      const gradient = ctx.createLinearGradient(horizontal ? from : 0, horizontal ? 0 : from,
        horizontal ? to : 0, horizontal ? 0 : to);
      for (let i = 0; i <= 32; i++) {
        const t = 1 - (1 - start) * i / 32;
        const offset = clamp(extent * (1 - t) / length, 0, 0.5);
        gradient.addColorStop(offset, 'rgba(255,255,255,' + fadeAlphaAt(t, start) + ')');
      }
      for (let i = 32; i >= 0; i--) {
        const t = 1 - (1 - start) * i / 32;
        const offset = clamp(1 - extent * (1 - t) / length, 0.5, 1);
        gradient.addColorStop(offset, 'rgba(255,255,255,' + fadeAlphaAt(t, start) + ')');
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    axis(rect.x, rect.w, sx, true);
    axis(rect.y, rect.h, sy, false);
    ctx.globalCompositeOperation = 'source-over';
    projectorMaskKey = key;
    return projectorMask;
  }

  function getProjectionPaths(canvas, rect, layout) {
    const key = [canvas.width, canvas.height, innerWidth, innerHeight, rect.x, rect.y,
      rect.w, rect.h, layout.levels, layout.step, settings.alphaProjector].join(':');
    if (key === projectionPathsKey) return projectionPaths;
    const sx = canvas.width / Math.max(1, innerWidth), sy = canvas.height / Math.max(1, innerHeight);
    const paths = [];
    const first = settings.alphaProjector ? 0 : layout.levels;
    for (let level = layout.levels; level >= first; level--) {
      const growth = layout.step * level;
      const x = (rect.x - growth / 2) * sx, y = (rect.y - growth / 2) * sy;
      const w = (rect.w + growth) * sx, h = (rect.h + growth) * sy;
      let clip = null;
      if (settings.alphaProjector && level > 0) {
        const innerX = x + layout.step * sx / 2, innerY = y + layout.step * sy / 2;
        const innerW = w - layout.step * sx, innerH = h - layout.step * sy;
        if (innerX <= 0 && innerY <= 0 && innerX + innerW >= canvas.width && innerY + innerH >= canvas.height) continue;
        clip = new Path2D();
        clip.rect(x, y, w, h);
        // Preserve the one-pixel overlap and exactly the same raster geometry.
        clip.rect(innerX + 1, innerY + 1, Math.max(0, innerW - 2), Math.max(0, innerH - 2));
      }
      paths.push({x, y, w, h, clip});
    }
    projectionPathsKey = key;
    projectionPaths = paths;
    return paths;
  }

  function drawScaledProjector(ctx, canvas, sampled = null) {
    if (!ctx || !canvas || !video || !geometry || !video.videoWidth || !video.videoHeight) return;
    const raw = sampled || { ...getAmbientSourceCrop(), source: video };
    const rect = getAmbientContentRect(raw.crop);
    const layout = projectionLayout(rect);
    const sx = canvas.width / Math.max(1, innerWidth);
    const sy = canvas.height / Math.max(1, innerHeight);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = derivedAmbient().blur < 20 ? 'high' : 'medium';
    for (const projection of getProjectionPaths(canvas, rect, layout)) {
      ctx.save();
      if (projection.clip) ctx.clip(projection.clip, 'evenodd');
      try {
        ctx.drawImage(raw.source, raw.srcX, raw.srcY, raw.srcW, raw.srcH,
          projection.x, projection.y, projection.w, projection.h);
      } catch (_) {}
      ctx.restore();
    }
    const mask = spreadMask(canvas, rect, layout.extent);
    if (mask) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
    }
    ctx.restore();
  }

  function frameDue(ts, force = false) {
    if (force) return true;
    const fps = clamp(Number(settings.fps) || 30, 5, 60);
    const interval = 1000 / fps;
    // Preserve the deadline's phase; resetting it to each actual callback can turn a
    // 30fps input into 15fps after tiny clock jitter or a mismatched limit.
    if (ts + Math.min(2, interval * 0.05) < nextDrawAt) return false;
    if (nextDrawAt === 0 || ts - nextDrawAt > interval * 2) nextDrawAt = ts + interval;
    else nextDrawAt += Math.max(1, Math.floor((ts - nextDrawAt) / interval) + 1) * interval;
    return true;
  }

  function scheduleBarDetection(ts) {
    const interval = settings.performanceMode ? 700 : 320;
    if (barDetectionTask !== null || ts - lastBarDetection < interval) return;
    const target = video;
    const run = () => {
      barDetectionTask = null;
      if (video === target && active() && !document.hidden) detectBars(performance.now());
    };
    // Pixel readback can stall the GPU. Run it outside the video-frame paint path.
    if (window.requestIdleCallback) barDetectionTask = { idle: true, id: requestIdleCallback(run, { timeout: 150 }) };
    else barDetectionTask = { idle: false, id: setTimeout(run, 0) };
  }

  function draw(ts = performance.now(), force = false) {
    if (!active() || !video || !root || document.hidden || !frameDue(ts, force)) return;
    updateGeometry(false);
    const a = derivedAmbient();
    if ((a.blur !== 0 || a.spread !== 0) && Number(settings.ambientIntensity) !== 0) {
      resizeCanvasToViewport(nearCanvas, nearCtx, false);
      drawScaledProjector(nearCtx, nearCanvas, updateAmbientSample());
    }
    scheduleBarDetection(ts);
  }

  function stopFrameLoop() {
    frameLoopToken++;
    if (video && rvfcId && video.cancelVideoFrameCallback) {
      try { video.cancelVideoFrameCallback(rvfcId); } catch (_) {}
    }
    rvfcId = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (barDetectionTask !== null) {
      if (barDetectionTask.idle) cancelIdleCallback(barDetectionTask.id);
      else clearTimeout(barDetectionTask.id);
      barDetectionTask = null;
    }
    nextDrawAt = 0;
  }

  function startFrameLoop() {
    stopFrameLoop();
    if (!video || !active() || document.hidden) return;
    const target = video;
    const token = frameLoopToken;
    const valid = () => !disposed && video === target && token === frameLoopToken && active();
    if (target.requestVideoFrameCallback) {
      const onFrame = now => {
        if (!valid()) return;
        // Register first: a heavy render must not postpone registration for the next frame.
        rvfcId = target.requestVideoFrameCallback(onFrame);
        draw(now);
      };
      rvfcId = target.requestVideoFrameCallback(onFrame);
    } else {
      const loop = now => {
        if (!valid()) return;
        rafId = requestAnimationFrame(loop);
        if (!target.paused) draw(now);
      };
      rafId = requestAnimationFrame(loop);
    }
  }

  function addVideoListeners(v) {
    if (listenedVideos.has(v)) return;
    listenedVideos.add(v);
    ['loadeddata', 'seeked', 'play', 'pause', 'resize', 'timeupdate'].forEach(type => {
      v.addEventListener(type, () => {
        if (v !== video) return;
        // Playback uses frame callbacks. A 4Hz timeupdate event must never replace
        // that clock or hold it behind a fabricated future timestamp.
        if (type === 'timeupdate') {
          if (v.paused && !v.seeking) draw(performance.now(), true);
          return;
        }
        geometryDirty = true;
        updateGeometry(true);
        if (type === 'loadeddata' || type === 'seeked' || type === 'resize') detectBars(performance.now(), true);
        draw(performance.now(), true);
        if (type === 'play' || type === 'loadeddata') startFrameLoop();
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
      applyStyles();
      draw(performance.now(), true);
      if (key === 'fps' || key === 'renderQuality') startFrameLoop();
      baliSettingsStore.set({ [key]: next });
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
      baliSettingsStore.set({ [key]: select.value });
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
      baliSettingsStore.set({ [key]: input.checked });
      applyStyles();
      draw(performance.now(), true);
      startFrameLoop();
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

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    Object.assign(settings, preset);
    applyStyles();
    updateMiniPlayerLayer();
    updateMasks();
    draw(performance.now(), true);
    startFrameLoop();
    baliSettingsStore.set(preset);
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
      sliderRow('饱和度', 'saturation', 40, 160, 1, '%'),
      toggleRow('暗部压制', 'blackCrush')
    );
    settingsPanel.append(filters.details);

    const ambient = section('环境光', true);
    ambient.body.append(
      toggleRow('边缘投影器', 'alphaProjector'),
      sliderRow('模糊', 'blur', 0, 100, 0.1, '%'),
      sliderRow('扩散范围', 'spread', 0, 400, 0.1, '%'),
      sliderRow('颜色强度', 'ambientIntensity', 0, 140, 1, '%'),
      sliderRow('投影层间距', 'edgeSize', 2, 50, 0.1, '%'),
      sliderRow('扩散衰减起点', 'spreadFadeStart', -50, 100, 0.1, '%'),
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

  function restoreToolbarSpacing() {
    for (const [element, properties] of toolbarSpacing) for (const [property, saved] of properties) {
      if (element.style.getPropertyValue(property) !== saved.applied) continue;
      if (saved.value) element.style.setProperty(property,saved.value,saved.priority);
      else element.style.removeProperty(property);
    }
    toolbarSpacing.clear();
    fittedToolbar?.removeAttribute('data-bali-toolbar-fit');
  }

  function stopToolbarFit() {
    toolbarObserver?.disconnect();
    if (toolbarFitRaf) cancelAnimationFrame(toolbarFitRaf);
    toolbarFitRaf = 0;
    restoreToolbarSpacing();
    fittedToolbar = null;
  }

  function fitToolbarSpacing() {
    toolbarFitRaf = 0;
    restoreToolbarSpacing();
    const controls = settingsButton?.parentElement;
    if (!settingsButton?.isConnected || !controls || !player?.isConnected) return;
    const row = controls.closest('.bpx-player-control-bottom') || controls.parentElement;
    const bounds = row.getBoundingClientRect(), playerBounds = player.getBoundingClientRect();
    if (bounds.width < 10) return;
    const edge = Math.min(bounds.right,playerBounds.right) - (parseFloat(getComputedStyle(row).paddingRight)||0);
    const children = [...controls.children].filter(node => node.getBoundingClientRect().width > 0 &&
      !['absolute','fixed'].includes(getComputedStyle(node).position));
    const overflow = () => Math.max(controls.getBoundingClientRect().right,...children.map(node=>node.getBoundingClientRect().right)) - edge;
    const missing = overflow();
    if (missing <= .75) return;
    const gap = parseFloat(getComputedStyle(controls).columnGap)||0;
    const slots = Math.max(0,children.length-1), margins = [];
    for (const node of children) {
      if (node === settingsButton) continue;
      const cs = getComputedStyle(node);
      for (const property of ['margin-left','margin-right']) {
        const value = parseFloat(cs.getPropertyValue(property))||0;
        if (value > 0) margins.push({node,property,value});
      }
    }
    const capacity = gap*slots + margins.reduce((total,item)=>total+item.value,0);
    if (capacity <= 0) return;
    const apply = (element,property,value) => {
      if (!toolbarSpacing.has(element)) toolbarSpacing.set(element,new Map());
      const saved = toolbarSpacing.get(element);
      if (!saved.has(property)) saved.set(property,{value:element.style.getPropertyValue(property),priority:element.style.getPropertyPriority(property)});
      element.style.setProperty(property,value+'px','important');
      saved.get(property).applied = element.style.getPropertyValue(property);
    };
    let ratio = Math.min(1,(missing+.75)/capacity);
    for (let attempt=0;attempt<2;attempt++) {
      if (gap > 0 && slots) apply(controls,'column-gap',gap*(1-ratio));
      for (const item of margins) apply(item.node,item.property,item.value*(1-ratio));
      const remaining = overflow();
      if (remaining <= .75 || ratio === 1) break;
      ratio = Math.min(1,ratio+(remaining+.75)/capacity);
    }
    controls.setAttribute('data-bali-toolbar-fit','');
    fittedToolbar = controls;
  }

  function queueToolbarFit() {
    if (!toolbarFitRaf) toolbarFitRaf = requestAnimationFrame(fitToolbarSpacing);
  }

  function ensurePlayerSettingsButton() {
    if (!player?.isConnected) return;
    if (settingsButton?.isConnected && settingsPanel?.isConnected) return;

    stopToolbarFit();
    settingsButton?.remove();
    settingsPanel?.remove();
    settingsButton = null;
    settingsPanel = null;

    const nativeSettings = player.querySelector('.bpx-player-ctrl-setting');
    const buttonHost = nativeSettings?.parentElement || player.querySelector('.bpx-player-control-bottom-right');
    if (!buttonHost) return;

    settingsButton = document.createElement('div');
    // Keep native float/ordering rules; the custom CSS resets only this entry's size and spacing.
    settingsButton.className = 'bpx-player-ctrl-btn bali-ambient-player-btn';
    settingsButton.title = '环境光设置';
    settingsButton.setAttribute('role', 'button');
    settingsButton.setAttribute('tabindex', '0');
    settingsButton.innerHTML = '<span>AL</span>';

    if (nativeSettings?.parentElement === buttonHost) buttonHost.insertBefore(settingsButton,nativeSettings);
    else buttonHost.append(settingsButton);
    fitToolbarSpacing();
    toolbarObserver = new ResizeObserver(queueToolbarFit);
    toolbarObserver.observe(buttonHost);
    for (const child of buttonHost.children) toolbarObserver.observe(child);
    if (buttonHost.parentElement) toolbarObserver.observe(buttonHost.parentElement);
    if (buttonHost.previousElementSibling) toolbarObserver.observe(buttonHost.previousElementSibling);

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
    if (!changed && !force && root?.isConnected && settingsButton?.isConnected && settingsPanel?.isConnected) {
      updateMiniPlayerLayer();
      updatePlayerShells();
      return;
    }
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
    draw(performance.now(), true);
    if (changed || force) startFrameLoop();

    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      geometryDirty = true;
      updateGeometry(true);
      draw(performance.now(), true);
    });
    resizeObserver.observe(video);
    if (player) resizeObserver.observe(player);
  }

  async function loadSettings() {
    try {
      const rawSaved = await baliSettingsStore.get();
      // v1.1.2 migration: only replace the previous stock Standard preset.
      // Custom user tuning is preserved.
      if ((Number(rawSaved.settingsRevision) || 0) < 2) {
        const looksLikeOldStandard =
          Number(rawSaved.blur) === 73.1 && Number(rawSaved.spread) === 89.8 &&
          Number(rawSaved.brightness) === 100 && Number(rawSaved.saturation) === 115 &&
          Number(rawSaved.vibrance) === 115;
        if (looksLikeOldStandard) {
          Object.assign(rawSaved, PRESETS.standard);
        }
        rawSaved.settingsRevision = 2;
      }
      if ((Number(rawSaved.settingsRevision) || 0) < 3) {
        // Replace the old stock dim/desaturated filter tuple, retaining custom geometry,
        // colour tuning and deliberate non-default framerate limits.
        if (Number(rawSaved.brightness) === 80 && Number(rawSaved.saturation) === 70 &&
            Number(rawSaved.vibrance) === 100 && Number(rawSaved.ambientIntensity) === 100 &&
            rawSaved.blackCrush === true) {
          Object.assign(rawSaved, { brightness: 100, saturation: 105, blackCrush: false });
          if (Number(rawSaved.fps) === 30) rawSaved.fps = 60;
        }
        rawSaved.settingsRevision = 3;
      }
      if ((Number(rawSaved.settingsRevision) || 0) < 4) {
        // The requested border-free default supersedes the previous shadow setting.
        rawSaved.suppressPlayerEdgeShadow = true;
        rawSaved.edgeShadowSuppression = 100;
        rawSaved.settingsRevision = 4;
        await baliSettingsStore.set(rawSaved);
      }
      settings = { ...DEFAULTS, ...rawSaved };
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
      draw(performance.now(), true);
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
        draw(performance.now(), true);
      } else {
        stopFrameLoop();
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

  baliSettingsStore.subscribe(changes => {
    const barKeys = ['removeHorizontalBars', 'removeVerticalBars', 'detectColoredBars',
      'barDetectionSensitivity', 'barFramesAverage', 'barDetectionOffset',
      'manualHorizontalClip', 'manualVerticalClip', 'fillVideoToCrop'];
    // Local controls already rendered; bar-analysis side effects still need to run.
    if (!Object.entries(changes).some(([key, change]) => settings[key] !== change.newValue || barKeys.includes(key))) return;
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
    draw(performance.now(), true);
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
    stopToolbarFit();
    restorePlayerShells();
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
