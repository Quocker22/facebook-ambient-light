// Ambient light for Facebook.
// Every background area around a photo/video becomes light:
// - "stage": media on a screen-sized dark background (photo viewer, Reels,
//   video dialogs). The glow covers the whole stage behind the media.
// - "fill": the letterbox/pillarbox bars around media inside feed cards.
//   Facebook paints those bars with extra black/gradient layers *behind*
//   the media, so the glow is inserted right under the media element,
//   which puts it above all of those layers.
// - "inner": background baked into a photo's pixels (collages, padded
//   photos). A canvas over the photo paints light only where those
//   background pixels are, colored from the photo parts next to them.
// - "page": the grey page background around feed cards. Glows live in a
//   fixed layer under the whole page, so light spills out around the card.
// Facebook class names are obfuscated, so nothing here depends on them:
// detection is by size, visibility and background color.
// Every tunable value comes from settings.js (edited in panel.js).
(async () => {
  if (window.__fbAmbient) return;
  window.__fbAmbient = true;

  const { settings } = globalThis.FBAmbient;
  const S = settings.values;

  // Opt-in profiling: set window.__fbAmbientPerf = {} (page or devtools)
  // to collect total ms and call counts per function.
  const timed = (name, fn) =>
    function (...args) {
      const perf = window.__fbAmbientPerf;
      if (!perf) return fn.apply(this, args);
      const t = performance.now();
      try {
        return fn.apply(this, args);
      } finally {
        const e = (perf[name] ??= { ms: 0, calls: 0, max: 0 });
        const d = performance.now() - t;
        e.ms += d;
        e.calls++;
        if (d > e.max) e.max = d;
      }
    };

  const glows = new Map(); // key `${mode}` per media -> glow
  let pageLayer = null;

  const keyOf = (media, mode) => {
    if (!media.__fbAmbientId) media.__fbAmbientId = Math.random().toString(36).slice(2);
    return `${media.__fbAmbientId}:${mode}`;
  };

  // Smaller media (avatars, thumbnails) get no light.
  const isBigEnough = (r) => r.width * r.height >= S.minSize * S.minSize;

  const isOnScreen = (r) => r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;

  // Vertical distance from the viewport, in screen heights (0 = on screen).
  const screensAway = (r) => {
    if (r.bottom < 0) return -r.bottom / innerHeight;
    if (r.top > innerHeight) return (r.top - innerHeight) / innerHeight;
    return 0;
  };

  const isMediaReady = (el) =>
    el.tagName === 'VIDEO'
      ? el.videoWidth > 0 && el.readyState >= 2
      : el.complete && el.naturalWidth >= 300;

  const parseRgba = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(',').map((v) => parseFloat(v));
    return { r, g, b, a };
  };

  // Nearest ancestor with an opaque background, if that background is dark
  // and screen-sized. The size check skips the black letterbox inside feed
  // video cards, which is dark but only as big as the card.
  const findDarkStage = (media) => {
    for (let el = media.parentElement; el && el !== document.body; el = el.parentElement) {
      const bg = parseRgba(getComputedStyle(el).backgroundColor);
      if (!bg || bg.a < 0.5) continue;
      const lum = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255;
      if (lum >= 0.25) return null;
      const r = el.getBoundingClientRect();
      return r.height >= innerHeight * 0.75 && r.width >= innerWidth * 0.5 ? el : null;
    }
    return null;
  };

  // The media "frame": the highest ancestor that is still the media's
  // height, i.e. the box including the side bars but not the card's text.
  const findFrame = (media) => {
    const mh = media.getBoundingClientRect().height;
    let frame = media;
    for (let el = media.parentElement; el && el !== document.body; el = el.parentElement) {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.height - mh) > 2) break;
      frame = el;
    }
    return frame;
  };

  // Fixed layer at z-index -1 in the root stacking context: above the body
  // background, below Facebook's content wrappers (which use z-index: 0).
  const getPageLayer = () => {
    if (pageLayer?.isConnected) return pageLayer;
    pageLayer = document.createElement('div');
    pageLayer.id = 'fb-ambient-layer';
    // In document coordinates (not fixed): the browser scrolls it together
    // with the page, so glows never trail the content and need no per-frame
    // repositioning while scrolling.
    Object.assign(pageLayer.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      zIndex: '-1',
      pointerEvents: 'none',
      overflow: 'hidden',
    });
    // Debanding: fine noise over the light hides color steps in dark
    // gradients (as in the original). Above the glows, below the page.
    const noise = document.createElement('div');
    noise.id = 'fb-ambient-noise';
    Object.assign(noise.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '1',
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>'
      )}")`,
    });
    pageLayer.append(noise);
    applyNoise();
    document.body.append(pageLayer);
    return pageLayer;
  };
  const applyNoise = () => {
    const noise = pageLayer?.querySelector('#fb-ambient-noise');
    if (!noise) return;
    noise.style.opacity = String(S.debanding / 100);
    noise.style.display = S.debanding ? '' : 'none'; // no layer at all when off
  };

  // Bar fills look exactly like the feed glow around the post (same blur,
  // opacity, colors and readability dimming), so the light inside the bars
  // and outside the post read as one continuous glow.
  const glowOpacity = (mode) =>
    mode === 'inner' ? 1 : mode === 'stage' ? S.stageOpacity / 100 : S.opacity / 100;

  const GLOW_BLUR = {
    stage: () => S.stageBlur,
    fill: () => S.blur,
    inner: () => 0, // a mask over the photo: must stay sharp
    page: () => S.blur,
  };

  // Keep text readable: white text (dark theme) on a very bright glow, or
  // dark text (light theme) on a very dark one, is hard to read through the
  // see-through posts. Each feed glow's average brightness is measured from
  // its small sample canvas and its CSS brightness is scaled so the light
  // stays under a cap (dark theme) or above a floor (light theme).
  const isLightTheme = () => document.documentElement.classList.contains('__fb-light-mode');
  const readabilityFactor = (glow) => {
    // A bar fill follows its post's feed glow, which holds the measurement.
    const measured = glow.mode === 'fill' ? glows.get(keyOf(glow.media, 'page')) : glow;
    if (!S.readability || (glow.mode !== 'page' && glow.mode !== 'fill') || measured?.lum == null) return 1;
    const strength = S.readabilityStrength / 100;
    const lit = measured.lum * (S.brightness / 100) * (S.opacity / 100);
    if (isLightTheme()) {
      const floor = 0.45 + 0.35 * strength;
      return lit >= floor ? 1 : Math.min(2, floor / Math.max(lit, 0.05));
    }
    const cap = 0.55 - 0.4 * strength;
    return lit <= cap ? 1 : cap / lit;
  };
  let lastLightTheme = null;
  const LUM_EVERY_VIDEO_FRAMES = 15;
  const measureLight = (glow) => {
    if (glow.mode !== 'page' || !S.readability) return;
    if (glow.media.tagName === 'VIDEO' && (glow.lumFrames = (glow.lumFrames ?? 0) + 1) % LUM_EVERY_VIDEO_FRAMES !== 1) return;
    try {
      const { width: w, height: h } = glow.canvas;
      const d = glow.ctx.getImageData(0, 0, w, h).data;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 16) {
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        n++;
      }
      glow.lum = sum / n / 255;
    } catch {
      glow.lum = null; // unreadable (tainted) canvas: leave it as is
    }
    const k = readabilityFactor(glow);
    if (Math.abs(k - (glow.readK ?? 1)) > 0.04) {
      glow.readK = k;
      applyGlowStyle(glow);
      const fill = glows.get(keyOf(glow.media, 'fill'));
      if (fill) applyGlowStyle(fill);
    }
  };

  const applyGlowStyle = (glow) => {
    const { canvas, mode } = glow;
    canvas.style.filter =
      `blur(${GLOW_BLUR[mode]()}px) saturate(${S.saturation / 100}) ` +
      `brightness(${(S.brightness / 100) * readabilityFactor(glow)}) contrast(${S.contrast / 100})`;
    canvas.style.transition = `opacity ${S.fadeIn}ms ease-out`;
    if (glow.shown) canvas.style.opacity = String(glowOpacity(mode));
  };

  const makeCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.className = 'fb-ambient-glow';
    Object.assign(canvas.style, {
      position: 'absolute',
      pointerEvents: 'none',
      opacity: '0', // faded in after the first draw
    });
    return canvas;
  };

  // Remember inline styles we touch so removing a glow restores them.
  const setStyle = (glow, el, prop, value) => {
    glow.restore.push([el, prop, el.style[prop]]);
    el.style[prop] = value;
  };

  const createGlow = (media, mode, extra) => {
    const canvas = makeCanvas();
    const glow = {
      key: keyOf(media, mode),
      media,
      mode,
      canvas,
      root: canvas, // element removed on cleanup
      // Page glows are read back (readability), so keep them on the CPU.
      ctx: canvas.getContext('2d', { willReadFrequently: mode === 'page' }),
      restore: [],
      ...extra,
    };
    applyGlowStyle(glow);
    if (mode === 'stage') {
      const { stage } = glow;
      canvas.style.zIndex = '-1'; // below the stage's content, above its background
      setStyle(glow, stage, 'isolation', 'isolate'); // own stacking context
      if (getComputedStyle(stage).position === 'static') setStyle(glow, stage, 'position', 'relative');
      stage.prepend(canvas);
    } else if (mode === 'fill') {
      const box = document.createElement('div');
      box.className = 'fb-ambient-fill';
      // Same backdrop as the page under the feed glow, so the same opacity
      // gives the same color in the bars as beside the post.
      Object.assign(box.style, {
        position: 'absolute',
        overflow: 'hidden',
        pointerEvents: 'none',
        backgroundColor: getComputedStyle(document.body).backgroundColor,
      });
      box.append(canvas);
      if (media.tagName === 'IMG') {
        // Photo bars are a solid color (the photo's main color) painted on
        // the frame, and the photo's own parent is clipped to the photo, so
        // the box goes into the frame itself: at z-index -1 in an isolated
        // frame it sits above the frame's background and below all content.
        // Solid backgrounds between the photo and the frame are cleared so
        // they cannot cover the light.
        const { frame } = glow;
        setStyle(glow, frame, 'isolation', 'isolate');
        if (getComputedStyle(frame).position === 'static') setStyle(glow, frame, 'position', 'relative');
        for (let el = media.parentElement; el; el = el.parentElement) {
          const bg = parseRgba(getComputedStyle(el).backgroundColor);
          if (bg && bg.a > 0) setStyle(glow, el, 'backgroundColor', 'transparent');
          if (el === frame) break;
        }
        Object.assign(box.style, { zIndex: '-1', left: '0', top: '0', width: '100%', height: '100%' });
        frame.prepend(box);
        glow.inFrame = true;
      } else {
        // Video bars are separate black/gradient layers painted *behind*
        // the video, so the box goes right before the video: it paints
        // under the video but over all of those layers.
        if (getComputedStyle(media).position === 'static') setStyle(glow, media, 'position', 'relative');
        const parent = media.parentElement;
        if (getComputedStyle(parent).position === 'static') setStyle(glow, parent, 'position', 'relative');
        parent.insertBefore(box, media);
      }
      glow.root = box;
      glow.box = box;
    } else if (mode === 'inner') {
      // Directly after the photo, so it paints over the photo's pixels.
      canvas.style.zIndex = 'auto';
      const parent = media.parentElement;
      if (getComputedStyle(parent).position === 'static') setStyle(glow, parent, 'position', 'relative');
      media.after(canvas);
    } else {
      getPageLayer().append(canvas);
    }
    glows.set(glow.key, glow);
    layout(glow);
  };

  // Positions are refreshed on each scan and on resize, not every frame:
  // all glows live in containers that scroll with their media.
  const layoutAll = () => {
    if (pageLayer?.isConnected) {
      // Height of Facebook's own content, not document.scrollHeight: that one
      // includes this layer, so the layer could never shrink again. When the
      // photo viewer or a popup opens, Facebook pins the feed (position:
      // fixed) and the page becomes one screen tall; a stale tall layer kept
      // the page scrollable into empty black space.
      let height = 0;
      if (document.documentElement.dataset.fbAmbient === 'feed') {
        for (const el of document.body.children) {
          if (el === pageLayer || el.id?.startsWith('fb-ambient')) continue;
          const r = el.getBoundingClientRect();
          if (r.height) height = Math.max(height, r.bottom + scrollY);
        }
      }
      const value = `${Math.round(height)}px`;
      if (pageLayer.style.height !== value) pageLayer.style.height = value;
    }
    for (const glow of glows.values()) {
      try {
        layout(glow);
      } catch (ex) {
        console.warn('[fb-ambient]', ex);
        removeGlow(glow);
      }
    }
  };
  addEventListener('resize', () => layoutAll(), { passive: true });

  const removeGlow = (glow) => {
    glow.root.remove();
    glows.delete(glow.key);
    // A frame can be shared (e.g. photo grids): keep its styles while used.
    const inUse = (el) => [...glows.values()].some((g) => g.stage === el || g.frame === el);
    for (const [el, prop, value] of glow.restore.reverse()) if (!inUse(el)) el.style[prop] = value;
  };

  const sizeSample = (glow, w, h) => {
    const { canvas } = glow;
    const sw = S.resolution;
    const sh = Math.max(1, Math.round((sw * h) / w));
    if (canvas.width !== sw || canvas.height !== sh) {
      canvas.width = sw;
      canvas.height = sh;
      glow.drawnSrc = null; // resizing clears the canvas
      glow.drawnTime = null;
    }
  };

  const placeCanvas = (canvas, left, top, w, h) => {
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };

  const layout = timed('layout', (glow) => {
    const { media, mode, canvas } = glow;
    const m = media.getBoundingClientRect();
    if (mode === 'stage') {
      // Cover the whole stage, centered on it, with margin for the blur.
      const s = glow.stage.getBoundingClientRect();
      const w = s.width * 1.2;
      const h = s.height * 1.2;
      placeCanvas(canvas, (s.width - w) / 2 + glow.stage.scrollLeft, (s.height - h) / 2 + glow.stage.scrollTop, w, h);
      sizeSample(glow, m.width, m.height);
    } else if (mode === 'inner') {
      const p = media.parentElement.getBoundingClientRect();
      placeCanvas(canvas, m.left - p.left, m.top - p.top, m.width, m.height);
    } else if (mode === 'fill') {
      sizeSample(glow, m.width, m.height);
      const f = glow.frame.getBoundingClientRect();
      // The very same glow as around the post (same size and position on
      // screen), only clipped to the bars: no seam between inside and outside.
      const gw = (m.width * S.spread) / 100;
      const gh = m.height + 2 * Math.max(S.reach, m.height * 0.25);
      placeCanvas(canvas, m.left - f.left - (gw - m.width) / 2, m.top - f.top - (gh - m.height) / 2, gw, gh);
      if (glow.inFrame) return; // the box fills the frame via CSS
      // Cut a hole where the video picture is (object-fit: contain), so the
      // light only covers the bars: it can be shown before the video plays
      // without hiding Facebook's poster image.
      const vw = media.videoWidth;
      const vh = media.videoHeight;
      if (vw && vh) {
        const scale = Math.min(m.width / vw, m.height / vh);
        const cl = m.left - f.left + (m.width - vw * scale) / 2;
        const ct = m.top - f.top + (m.height - vh * scale) / 2;
        const cr = cl + vw * scale;
        const cb = ct + vh * scale;
        glow.box.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${cl + 1}px ${ct + 1}px, ${cl + 1}px ${cb - 1}px, ${cr - 1}px ${cb - 1}px, ${cr - 1}px ${ct + 1}px, ${cl + 1}px ${ct + 1}px)`;
      }
      const p = media.parentElement.getBoundingClientRect();
      const { box } = glow;
      box.style.left = `${f.left - p.left}px`;
      box.style.top = `${f.top - p.top}px`;
      box.style.width = `${f.width}px`;
      box.style.height = `${f.height}px`;
      sizeSample(glow, m.width, m.height);
    } else {
      // Taller than the media so the light reaches the card's header
      // (author, caption) and footer (like bar), and the top nav bar.
      const w = (m.width * S.spread) / 100;
      const h = m.height + 2 * Math.max(S.reach, m.height * 0.25);
      placeCanvas(canvas, m.left + scrollX - (w - m.width) / 2, m.top + scrollY - (h - m.height) / 2, w, h);
      sizeSample(glow, m.width, m.height);
    }
  });

  // Photos: the viewer reuses the same <img> and only swaps src, so track src.
  // fbcdn allows anonymous CORS, so a crossOrigin copy keeps the canvas clean.
  const imageCache = new Map(); // src -> loaded Image (shared by fill + page)
  const loadImage = (src) => {
    let img = imageCache.get(src);
    if (!img) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;
      imageCache.set(src, img);
      if (imageCache.size > 50) imageCache.delete(imageCache.keys().next().value);
    }
    return img;
  };

  const drawImage = timed('drawImage', (glow) => {
    const { media } = glow;
    const src = media.currentSrc || media.src;
    const img = loadImage(src);
    if (!img.complete || !img.naturalWidth || glow.drawnSrc === src) return; // static: draw once
    glow.ctx.drawImage(img, 0, 0, glow.canvas.width, glow.canvas.height);
    glow.drawnSrc = src;
    measureLight(glow);
    fadeIn(glow);
  });

  // Background baked into a photo: find a uniform color along the photo's
  // edges, flood-fill it inward (so dark parts inside the photos are kept),
  // then paint those pixels with light spread from the remaining photo
  // pixels. Done once per photo at low resolution; CSS scales it up.
  const INNER_RES = 256;
  const innerCache = new Map(); // `${src}|${tolerance}` -> canvas | null
  // Real bars surround a few rectangular pictures. A screenshot or graphic
  // with a flat background has text and icons on it instead: lots of small
  // islands (every letter is one). Lighting those would draw over the text,
  // so they are rejected. Dark areas at a photo's edge can split off a few
  // odd-shaped islands, so the test is that rectangle-like islands make up
  // most of the picture area, not that every island is a rectangle.
  const looksLikeBars = (bg, w, h) => {
    const seen = new Uint8Array(w * h);
    const stack = [];
    let islands = 0;
    let total = 0;
    let rectangular = 0;
    for (let start = 0; start < w * h; start++) {
      if (bg[start] || seen[start]) continue;
      let area = 0;
      let minX = w, maxX = 0, minY = h, maxY = 0;
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const i = stack.pop();
        const x = i % w;
        const y = (i - x) / w;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
          if (j < 0 || j >= w * h || bg[j] || seen[j]) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      total += area;
      if (area < 4) continue; // compression noise inside the bars
      if (++islands > 40) return false;
      if (area / ((maxX - minX + 1) * (maxY - minY + 1)) >= 0.8) rectangular += area;
    }
    return islands > 0 && rectangular >= total * 0.8;
  };

  const buildInner = timed('buildInner', (img) => {
    const w = Math.min(INNER_RES, img.naturalWidth);
    const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
    const work = document.createElement('canvas');
    work.width = w;
    work.height = h;
    const wctx = work.getContext('2d', { willReadFrequently: true });
    wctx.drawImage(img, 0, 0, w, h);
    const px = wctx.getImageData(0, 0, w, h);
    const d = px.data;

    // Dominant edge color, by 4-bit-per-channel buckets.
    const edge = [];
    for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
    for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
    const buckets = new Map();
    for (const i of edge) {
      const key = ((d[i * 4] >> 4) << 8) | ((d[i * 4 + 1] >> 4) << 4) | (d[i * 4 + 2] >> 4);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let topKey = 0;
    let topCount = 0;
    for (const [k, c] of buckets) if (c > topCount) [topKey, topCount] = [k, c];
    if (topCount < edge.length * 0.5) return null; // no uniform border
    let rr = 0, gg = 0, bb = 0, n = 0;
    for (const i of edge) {
      const key = ((d[i * 4] >> 4) << 8) | ((d[i * 4 + 1] >> 4) << 4) | (d[i * 4 + 2] >> 4);
      if (key !== topKey) continue;
      rr += d[i * 4]; gg += d[i * 4 + 1]; bb += d[i * 4 + 2]; n++;
    }
    rr /= n; gg /= n; bb /= n;

    // Flood fill from the edges through pixels close to that color.
    const tol2 = S.innerTolerance * S.innerTolerance;
    const near = (i) => {
      const dr = d[i * 4] - rr, dg = d[i * 4 + 1] - gg, db = d[i * 4 + 2] - bb;
      return dr * dr + dg * dg + db * db <= tol2;
    };
    const bg = new Uint8Array(w * h);

    // 1) Straight bars along the edges (pillarbox / letterbox baked into the
    //    photo), found column by column / row by row like the original's
    //    black-bar detection. Dark parts of the photo touching a bar cannot
    //    leak into it this way, which defeats the flood fill below.
    const BAR_COVERAGE = 0.97;
    const columnIsBar = (x) => {
      let hits = 0;
      for (let y = 0; y < h; y++) if (near(y * w + x)) hits++;
      return hits >= h * BAR_COVERAGE;
    };
    const rowIsBar = (y) => {
      let hits = 0;
      for (let x = 0; x < w; x++) if (near(y * w + x)) hits++;
      return hits >= w * BAR_COVERAGE;
    };
    let left = 0, right = 0, top = 0, bottom = 0;
    while (left < w / 2 && columnIsBar(left)) left++;
    while (right < w / 2 && columnIsBar(w - 1 - right)) right++;
    while (top < h / 2 && rowIsBar(top)) top++;
    while (bottom < h / 2 && rowIsBar(h - 1 - bottom)) bottom++;
    const minW = w * 0.03, minH = h * 0.03;
    const sideBars = left >= minW && right >= minW;
    const topBars = top >= minH && bottom >= minH;
    let count = 0;
    if ((sideBars || topBars) && left + right < w * 0.9 && top + bottom < h * 0.9) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if ((sideBars && (x < left || x >= w - right)) || (topBars && (y < top || y >= h - bottom))) {
            bg[y * w + x] = 1;
            count++;
          }
        }
      }
    }

    // 2) Otherwise, a solid background around several photos (collages):
    //    flood fill from the edges through pixels close to the bar color.
    if (!count) {
      const stack = edge.filter(near);
      for (const i of stack) bg[i] = 1;
      count = stack.length;
      while (stack.length) {
        const i = stack.pop();
        const x = i % w;
        for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
          if (j < 0 || j >= w * h || bg[j] || !near(j)) continue;
          bg[j] = 1;
          count++;
          stack.push(j);
        }
      }
      // Too little to bother. And bars around photos are a minority of the
      // image (collages ~30-45%); when the flat color is most of it, it is a
      // screenshot or graphic whose background is content, not bars.
      if (count < w * h * 0.03 || count > w * h * 0.55) return null;
      if (!looksLikeBars(bg, w, h)) return null;
    }
    // Grow by one pixel: edge pixels mix photo and bar color and would
    // otherwise stay as a dark jagged outline around each photo.
    const grown = bg.slice();
    for (let i = 0; i < w * h; i++) {
      if (bg[i]) continue;
      const x = i % w;
      if ((i >= w && bg[i - w]) || (i < w * (h - 1) && bg[i + w]) || (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1])) grown[i] = 1;
    }

    // Photo pixels only, then blurred so their colors spread into the bars.
    const photo = new ImageData(new Uint8ClampedArray(d), w, h);
    let ar = 0, ag = 0, ab = 0, an = 0;
    for (let i = 0; i < w * h; i++) {
      if (bg[i]) photo.data[i * 4 + 3] = 0;
      else { ar += d[i * 4]; ag += d[i * 4 + 1]; ab += d[i * 4 + 2]; an++; }
    }
    ar /= an; ag /= an; ab /= an;
    wctx.putImageData(photo, 0, 0);
    const spread = document.createElement('canvas');
    spread.width = w;
    spread.height = h;
    const sctx = spread.getContext('2d', { willReadFrequently: true });
    sctx.filter = `blur(${Math.round(w / 8)}px)`;
    sctx.drawImage(work, 0, 0);
    const light = sctx.getImageData(0, 0, w, h);
    // getImageData is un-premultiplied: rgb is already the true color even
    // where the blur left little alpha. Far from any photo, use the average.
    const out = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      if (!grown[i]) continue;
      const a = light.data[i * 4 + 3];
      const t = Math.min(1, a / 40);
      out.data[i * 4] = light.data[i * 4] * t + ar * (1 - t);
      out.data[i * 4 + 1] = light.data[i * 4 + 1] * t + ag * (1 - t);
      out.data[i * 4 + 2] = light.data[i * 4 + 2] * t + ab * (1 - t);
      out.data[i * 4 + 3] = 255;
    }
    const result = document.createElement('canvas');
    result.width = w;
    result.height = h;
    // Soften the mask edge slightly against the photos.
    const sharp = document.createElement('canvas');
    sharp.width = w;
    sharp.height = h;
    sharp.getContext('2d').putImageData(out, 0, 0);
    const rctx = result.getContext('2d');
    rctx.filter = 'blur(0.6px)';
    rctx.drawImage(sharp, 0, 0);
    return result;
  });

  // Analysing a photo takes ~10-40 ms of main thread. Facebook's CSP blocks
  // Web Workers, so it runs on the main thread, one photo per turn, and only
  // once scrolling has paused, so a scroll is never interrupted.
  // Plain timers, not requestIdleCallback: on Facebook (autoplaying videos)
  // and in background tabs idle callbacks may never come (measured: 0 runs
  // in 10 s, photos stayed unanalysed).
  const SCROLL_QUIET_MS = 300;
  let lastScroll = 0;
  addEventListener('scroll', () => (lastScroll = performance.now()), { capture: true, passive: true });
  const innerQueue = new Map(); // key -> src
  let pumpTimer = 0;
  const queueInner = (key, src) => {
    if (innerQueue.has(key)) return;
    innerQueue.set(key, src);
    // Long fast scrolls: only the latest photos still matter.
    if (innerQueue.size > 20) innerQueue.delete(innerQueue.keys().next().value);
    schedulePump(SCROLL_QUIET_MS);
  };
  const schedulePump = (delay) => {
    if (!pumpTimer) pumpTimer = setTimeout(pumpInner, delay);
  };
  const pumpStats = { runs: 0, notQuiet: 0, waitingDownload: 0, built: 0 };
  const pumpInner = () => {
    pumpTimer = 0;
    pumpStats.runs++;
    const quiet = performance.now() - lastScroll;
    if (quiet < SCROLL_QUIET_MS) {
      pumpStats.notQuiet++;
      return schedulePump(SCROLL_QUIET_MS - quiet + 10);
    }
    for (const [key, src] of innerQueue) {
      const img = loadImage(src);
      if (!img.complete) {
        pumpStats.waitingDownload++;
        continue; // still downloading; try the next one
      }
      innerQueue.delete(key);
      innerCache.set(key, img.naturalWidth ? buildInner(img) : null);
      pumpStats.built++;
      if (innerCache.size > 100) innerCache.delete(innerCache.keys().next().value);
      break; // one per turn, so a frame can render in between
    }
    if (innerQueue.size) schedulePump(50);
  };

  // Read-only view of the analysis queue for debugging (devtools / tests).
  globalThis.FBAmbient.debug = {
    innerQueue: () => [...innerQueue.keys()].map((k) => k.slice(0, 60)),
    innerCached: () => innerCache.size,
    innerPumping: () => !!pumpTimer,
    pumpStats: () => ({ ...pumpStats, lastScrollMsAgo: Math.round(performance.now() - lastScroll) }),
  };

  const drawInner = timed('drawInner', (glow) => {
    const { media } = glow;
    const src = media.currentSrc || media.src;
    const key = `${src}|${S.innerTolerance}`;
    if (glow.drawnSrc === key) return;
    const result = innerCache.get(key);
    if (result === undefined) {
      queueInner(key, src); // analysed later, off the scroll path
      return;
    }
    const { canvas, ctx } = glow;
    if (result) {
      canvas.width = result.width;
      canvas.height = result.height;
      ctx.drawImage(result, 0, 0);
    } else {
      canvas.width = 1;
      canvas.height = 1; // cleared: no baked-in bars
    }
    glow.drawnSrc = key;
    fadeIn(glow);
  });

  const fadeIn = (glow) => {
    if (glow.shown) return;
    glow.shown = true;
    glow.canvas.style.opacity = String(glowOpacity(glow.mode));
  };

  const drawVideo = timed('drawVideo', (glow) => {
    const { media, ctx, canvas } = glow;
    if (media.readyState < 2) return;
    // A paused video still gets a few draws so smooth motion settles on
    // the paused frame.
    if (media.paused && glow.drawnTime === media.currentTime) {
      if ((glow.settle = (glow.settle ?? 0) + 1) > 30) return;
    } else glow.settle = 0;
    const now = performance.now();
    if (S.videoFps && now - (glow.drawnAt ?? 0) < 1000 / S.videoFps) return;
    glow.drawnAt = now;
    // Smooth motion (frame blending): mix the new frame into the previous
    // one instead of replacing it, so the light does not flicker.
    // Not right after a resize, which cleared the canvas.
    const blend = S.smoothMotion && glow.drawnTime != null ? 1 - S.smoothStrength / 100 : 1;
    ctx.globalAlpha = blend;
    ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    glow.drawnTime = media.currentTime;
    measureLight(glow);
    fadeIn(glow);
  });

  let stopped = false;
  const tick = timed('tick', () => {
    if (stopped) return;
    for (const glow of [...glows.values()]) {
      // Also our own element: Facebook's re-render can drop it while the
      // media stays, which left a dead glow that was never recreated.
      if (!glow.media.isConnected || !glow.root.isConnected || (glow.stage && !glow.stage.isConnected) || (glow.box && !glow.box.isConnected)) {
        removeGlow(glow);
        continue;
      }
      try {
        if (glow.media.tagName === 'VIDEO') drawVideo(glow);
        else if (glow.mode === 'inner') drawInner(glow);
        else drawImage(glow);
      } catch (ex) {
        console.warn('[fb-ambient]', ex);
        removeGlow(glow);
      }
    }
    requestAnimationFrame(tick);
  });

  // Decide which media get which glows. Cheap enough at 2x per second.
  // A dark stage (viewer/Reels) covers the page, so it wins over feed glows.
  const rescan = timed('rescan', () => {
    if (!S.enabled) {
      if (document.documentElement.dataset.fbAmbient !== 'off') document.documentElement.dataset.fbAmbient = 'off';
      for (const glow of [...glows.values()]) removeGlow(glow);
      return;
    }
    let stagePick = null;
    let stageArea = 0;
    const feedPicks = [];
    for (const el of document.querySelectorAll('video, img')) {
      if (el.closest('.fb-ambient-fill, #fb-ambient-layer')) continue;
      if (!isMediaReady(el)) continue;
      const r = el.getBoundingClientRect();
      if (!isBigEnough(r)) continue;
      const away = screensAway(r);
      const lit = glows.has(keyOf(el, 'page'));
      // Lazy-load style: light up before media scrolls into view, and only
      // switch off once it is far away, so scrolling never toggles glows.
      if (away > (lit ? Math.max(S.unload, S.preload) : S.preload)) continue;
      // Facebook's own blurred backdrop copies of a photo: not real media.
      if (getComputedStyle(el).filter.includes('blur')) continue;
      const area = r.width * r.height;
      const isVideo = el.tagName === 'VIDEO';
      const stage = isOnScreen(r) ? findDarkStage(el) : null;
      if (stage) {
        if (!(isVideo ? S.videoViewer : S.photoViewer)) continue;
        if (area > stageArea) {
          stagePick = { media: el, stage };
          stageArea = area;
        }
      } else if (el.closest('[role=main]') && !el.closest('[role=dialog]')) {
        // Only page content: chat windows and popups float above the page
        // and would hide the light anyway.
        if (!(isVideo ? S.feedVideos : S.feedPhotos)) continue;
        feedPicks.push({ media: el, away });
      }
    }

    const wanted = new Map(); // key -> [media, mode, extra]
    const want = (media, mode, extra = {}) => wanted.set(keyOf(media, mode), [media, mode, extra]);
    // Only on change: the cards/text CSS is keyed on this attribute, so any
    // write (even the same value) re-styles the whole feed.
    const ambientMode = stagePick ? 'stage' : 'feed';
    if (document.documentElement.dataset.fbAmbient !== ambientMode) document.documentElement.dataset.fbAmbient = ambientMode;
    applyCardVar();
    if (S.focusMode) markSides();
    // Facebook theme switched: readability works the other way round.
    const light = isLightTheme();
    if (light !== lastLightTheme) {
      lastLightTheme = light;
      for (const glow of glows.values()) applyGlowStyle(glow);
    }
    if (S.cardsLit && S.textShadow) markBigText();
    if (stagePick) {
      want(stagePick.media, 'stage', { stage: stagePick.stage });
      if (S.innerBars && stagePick.media.tagName === 'IMG') want(stagePick.media, 'inner');
    } else {
      feedPicks
        .sort((a, b) => a.away - b.away) // nearest to the viewport first
        .slice(0, S.maxMedia)
        .forEach(({ media }) => {
          want(media, 'page');
          if (S.innerBars && media.tagName === 'IMG') want(media, 'inner');
          if (!S.fillBars) return;
          const fill = glows.get(keyOf(media, 'fill'));
          if (fill) return want(media, 'fill', { frame: fill.frame });
          const frame = findFrame(media);
          // A photo that fills its frame has no bars to light up.
          if (media.tagName === 'IMG') {
            const f = frame.getBoundingClientRect();
            const r = media.getBoundingClientRect();
            if (f.width - r.width < 8 && f.height - r.height < 8) return;
          }
          want(media, 'fill', { frame });
        });
    }

    for (const glow of [...glows.values()]) {
      const w = wanted.get(glow.key);
      const changed = w && ((w[2].stage && w[2].stage !== glow.stage) || (w[2].frame && w[2].frame !== glow.frame));
      if (!w || changed) removeGlow(glow);
    }
    for (const [key, [media, mode, extra]] of wanted) {
      if (!glows.has(key)) createGlow(media, mode, extra);
    }
    layoutAll();
  });

  // Make Facebook's opaque surfaces (cards, top nav bar) see-through so the
  // glow underneath lights them too. Facebook paints them from CSS variables
  // defined per theme class, so override those variables with the same
  // colors at partial alpha, read from each theme at runtime.
  // Feed cards: their header (author, caption) and footer (like bar) are lit
  // like the page beside the card; a little opacity keeps the outline.
  // Scoped to the feed area ([role=main]) while no viewer/Reels stage is
  // open: Facebook also uses --card-background for the nav bar, menus,
  // popups and chat, which must stay readable.
  // The top nav bar stays mostly opaque because feed content scrolls under
  // it. (backdrop-filter on the banner is not an option: it re-parents
  // Facebook's fixed header and the bar disappears.)
  const THEMES = ['__fb-dark-mode', '__fb-light-mode'];
  const FEED_VARS = ['--card-background'];
  const TOP_BAR_VARS = ['--surface-background', '--nav-bar-background'];
  const translucentCache = new Map();
  const toTranslucent = (color, alpha) => {
    const key = `${color}|${alpha}`;
    if (translucentCache.has(key)) return translucentCache.get(key);
    const probe = document.createElement('div');
    probe.style.color = color;
    document.body.append(probe);
    const rgb = parseRgba(getComputedStyle(probe).color);
    probe.remove();
    const value = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : null;
    translucentCache.set(key, value);
    return value;
  };
  // Original theme colors, read once before our overrides exist.
  const themeColors = {};
  const readThemeColors = () => {
    for (const theme of THEMES) {
      const probe = document.createElement('div');
      probe.className = theme;
      document.body.append(probe);
      const cs = getComputedStyle(probe);
      themeColors[theme] = Object.fromEntries(
        [...FEED_VARS, ...TOP_BAR_VARS].map((v) => [v, cs.getPropertyValue(v).trim()]).filter(([, c]) => c)
      );
      probe.remove();
    }
  };
  // Our own element, not looked up by id: a stale copy left by an
  // extension reload may still have one with the same id.
  let surfaceStyle = null;
  const installSurfaceStyle = () => {
    if (!surfaceStyle?.isConnected) {
      surfaceStyle = document.createElement('style');
      surfaceStyle.id = 'fb-ambient-surfaces';
      document.head.append(surfaceStyle);
    }
    const style = surfaceStyle;
    const css = [];
    if (S.enabled) {
      for (const theme of THEMES) {
        const decls = (vars, alpha) =>
          vars
            .filter((v) => themeColors[theme][v])
            .map((v) => `${v}: ${toTranslucent(themeColors[theme][v], alpha)} !important;`)
            .join(' ');
        if (S.topBarLit) css.push(`.${theme}, :root.${theme} { ${decls(TOP_BAR_VARS, S.topBarOpacity / 100)} }`);
      }
    }
    css.push(focusCss());
    css.push(textShadowCss());
    style.textContent = css.join('\n');
  };

  // Focus mode: blur the columns beside the feed and both ends of the top
  // bar. They are found by role and position (class names are obfuscated)
  // and tagged, so the CSS below can target them.
  const SIDE_ATTR = 'data-fb-ambient-side';
  const markSides = () => {
    const main = document.querySelector('[role=main]');
    if (!main) return;
    const mainLeft = main.getBoundingClientRect().left;
    const tag = (el, kind) => el.getAttribute(SIDE_ATTR) !== kind && el.setAttribute(SIDE_ATTR, kind);
    for (const nav of document.querySelectorAll('[role=navigation]')) {
      const r = nav.getBoundingClientRect();
      if (r.height > innerHeight * 0.5 && r.right <= mainLeft + 5) tag(nav, 'column');
    }
    for (const col of document.querySelectorAll('[role=complementary]')) tag(col, 'column');
    const banner = document.querySelector('[role=banner]');
    for (const part of banner?.children ?? []) {
      const r = part.getBoundingClientRect();
      if (getComputedStyle(part).position === 'fixed' && r.width > 0 && r.width < innerWidth * 0.4) tag(part, 'bar');
    }
  };
  const focusCss = () => {
    if (!S.enabled || !S.focusMode) return '';
    const kinds = S.focusTopBar ? `[${SIDE_ATTR}]` : `[${SIDE_ATTR}=column]`;
    // Sharp while hovered, or while typing in it (search box). Not on any
    // focus: clicking a link in the left menu focuses it, and :focus-within
    // then kept the menu sharp after the mouse had left.
    const typing = ':is(input, textarea, [contenteditable="true"], [role="combobox"]):focus';
    const hover = S.focusHover ? `:not(:hover):not(:has(${typing}))` : '';
    const on = `:root[data-fb-ambient=feed] ${kinds}`;
    return [
      `[${SIDE_ATTR}] { transition: filter .25s ease-out; }`,
      `${on}${hover} { filter: blur(${S.focusBlur}px) brightness(${1 - S.focusDim / 100}); }`,
    ].join('\n');
  };

  // Text shadow behind feed text (from the original's "Page content"
  // shadows), so text stays readable on bright light. Dark theme: dark
  // shadow; light theme: white shadow.
  const textShadowCss = () => {
    if (!S.enabled || !S.cardsLit || !S.textShadow) return '';
    const a = S.textShadow / 100;
    // Keyed on an attribute of the feed element itself (set by applyCardVar),
    // not on <html>, for the same re-styling reason as the card variable.
    const text = (theme) => `[data-fb-ambient-text=${theme}] [dir=auto]`;
    return [
      `${text('dark')} { text-shadow: 0 0 6px rgba(0, 0, 0, ${a}), 0 0 2px rgba(0, 0, 0, ${a}); }`,
      `${text('light')} { text-shadow: 0 0 6px rgba(255, 255, 255, ${a}), 0 0 2px rgba(255, 255, 255, ${a}); }`,
      // Explicit "none": text-shadow is inherited, so excluding the element
      // from the rule above would not be enough.
      `[data-fb-ambient-text] [${BIG_TEXT_ATTR}] { text-shadow: none !important; }`,
    ].join('\n');
  };

  // Large text is the body of text-on-color posts (big text on its own
  // colored background): a shadow there only smears it. Post header, caption
  // and like bar text, which sit on the lit card, are ~15 px. Each text node
  // is checked once, so this costs nothing while scrolling.
  const BIG_TEXT_ATTR = 'data-fb-ambient-big';
  const BIG_TEXT_PX = 20;
  const textChecked = new WeakSet();
  const markBigText = () => {
    const main = document.querySelector('[role=main]');
    if (!main) return;
    for (const t of main.querySelectorAll('[dir=auto]')) {
      if (textChecked.has(t)) continue;
      textChecked.add(t);
      if (parseFloat(getComputedStyle(t).fontSize) >= BIG_TEXT_PX) t.setAttribute(BIG_TEXT_ATTR, '');
    }
  };

  // Feed cards: the variable is set inline on the feed element, not with a
  // `:root[...] [role=main]` rule. Facebook keeps changing classes on
  // <html>, and every such change made a root-keyed rule re-style the whole
  // feed (measured: ~3x style time while scrolling).
  let cardMain = null;
  const applyCardVar = () => {
    const main = document.querySelector('[role=main]');
    if (cardMain && cardMain !== main) {
      cardMain.style.removeProperty('--card-background');
      cardMain.removeAttribute('data-fb-ambient-text');
    }
    cardMain = main;
    if (!main) return;
    const on =
      S.enabled && S.cardsLit && (S.feedPhotos || S.feedVideos) && document.documentElement.dataset.fbAmbient === 'feed';
    const theme = document.documentElement.classList.contains('__fb-light-mode') ? '__fb-light-mode' : '__fb-dark-mode';
    const base = themeColors[theme]?.['--card-background'];
    const value = on && base ? toTranslucent(base, S.cardOpacity / 100) : '';
    const textTheme = on ? (theme === '__fb-light-mode' ? 'light' : 'dark') : null;
    if (main.getAttribute('data-fb-ambient-text') !== textTheme) {
      if (textTheme) main.setAttribute('data-fb-ambient-text', textTheme);
      else main.removeAttribute('data-fb-ambient-text');
    }
    if (main.style.getPropertyValue('--card-background') === value) return;
    if (value) main.style.setProperty('--card-background', value);
    else main.style.removeProperty('--card-background');
  };

  settings.onChange(() => {
    applyNoise();
    applyCardVar();
    for (const glow of glows.values()) applyGlowStyle(glow);
    installSurfaceStyle();
    rescan();
  });

  await settings.ready;
  readThemeColors();
  installSurfaceStyle();

  const scanTimer = setInterval(rescan, 500);

  // Cut off by an extension reload: undo everything, the new copy takes over.
  settings.onDead(() => {
    stopped = true;
    clearInterval(scanTimer);
    for (const glow of [...glows.values()]) removeGlow(glow);
    surfaceStyle?.remove();
    pageLayer?.remove();
    for (const el of document.querySelectorAll(`[${SIDE_ATTR}]`)) el.removeAttribute(SIDE_ATTR);
    for (const el of document.querySelectorAll(`[${BIG_TEXT_ATTR}]`)) el.removeAttribute(BIG_TEXT_ATTR);
    cardMain?.style.removeProperty('--card-background');
    cardMain?.removeAttribute('data-fb-ambient-text');
    delete document.documentElement.dataset.fbAmbient;
  });

  rescan();
  requestAnimationFrame(tick);
  console.info('[fb-ambient] loaded');
})();
