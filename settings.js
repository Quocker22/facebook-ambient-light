// Settings definitions and storage, shared by panel.js and content.js
// through the content-script global `FBAmbient`.
(() => {
  const NS = (globalThis.FBAmbient ??= {});
  if (NS.settings) return;

  const pct = (v) => `${Math.round(v)}%`;
  const px = (v) => `${Math.round(v)}px`;
  const seconds = (v) => `${(v / 1000).toFixed(1)} seconds`;
  const screens = (v) => `${v} ${v === 1 ? 'screen' : 'screens'}`;

  // type: 'range' (min/max/step), 'list' (options, a stepped slider like the
  // original's "Enable in layouts"), 'toggle'.
  const SECTIONS = [
    {
      title: 'Ambient light',
      open: true,
      items: [
        { key: 'blur', label: 'Blur', type: 'range', min: 0, max: 150, step: 1, default: 60, format: px, help: 'Feed. The photo viewer and Reels have their own blur below.' },
        { key: 'spread', label: 'Spread', type: 'range', min: 100, max: 250, step: 1, default: 130, format: pct, help: 'How far the light reaches beside the photo or video (feed).' },
        { key: 'reach', label: 'Vertical reach', type: 'range', min: 0, max: 600, step: 10, default: 250, format: px, help: 'How far the light reaches above and below the photo or video (feed). Lights the post header, like bar and top bar.' },
        { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 100, step: 1, default: 90, format: pct },
        { key: 'fadeIn', label: 'Fade in duration', type: 'range', min: 0, max: 3000, step: 100, default: 400, format: seconds, help: 'How long a new light takes to appear.' },
        { key: 'smoothMotion', label: 'Smooth motion', type: 'toggle', default: true, help: 'Videos: blends each frame into the previous one so the light changes smoothly instead of flickering.' },
        { key: 'smoothStrength', label: 'Smooth motion strength', type: 'range', min: 0, max: 95, step: 1, default: 60, format: pct },
        { key: 'debanding', label: 'Debanding (noise)', type: 'range', min: 0, max: 30, step: 1, default: 0, format: pct, help: 'Adds fine noise over the light to hide color steps (banding) in dark gradients.' },
      ],
    },
    {
      title: 'Image adjustment',
      items: [
        { key: 'brightness', label: 'Brightness', type: 'range', min: 30, max: 200, step: 1, default: 110, format: pct },
        { key: 'contrast', label: 'Contrast', type: 'range', min: 30, max: 200, step: 1, default: 100, format: pct },
        { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 300, step: 1, default: 170, format: pct },
      ],
    },
    {
      title: 'Photo viewer & Reels',
      items: [
        { key: 'photoViewer', label: 'Photo viewer', type: 'toggle', default: true },
        { key: 'videoViewer', label: 'Reels & video viewer', type: 'toggle', default: true },
        { key: 'stageBlur', label: 'Blur', type: 'range', min: 0, max: 200, step: 1, default: 70, format: px },
        { key: 'stageOpacity', label: 'Opacity', type: 'range', min: 0, max: 100, step: 1, default: 100, format: pct },
      ],
    },
    {
      title: 'Feed',
      items: [
        { key: 'feedPhotos', label: 'Photos in feed', type: 'toggle', default: true },
        { key: 'feedVideos', label: 'Videos in feed', type: 'toggle', default: true },
        { key: 'minSize', label: 'Minimum media size', type: 'range', min: 100, max: 500, step: 10, default: 200, format: px, help: 'Smaller photos/videos (avatars, thumbnails) get no light.' },
      ],
    },
    {
      title: 'Remove black & colored bars',
      items: [
        { key: 'fillBars', label: 'Light up bars around media', type: 'toggle', default: true, help: 'Replaces the black/white bars beside photos and videos in the feed with light.' },
        { key: 'innerBars', label: 'Light up bars inside photos', type: 'toggle', default: true, help: 'Black, white or colored background baked into the photo itself (collages, padded photos) becomes light. Screenshots and text on a flat background are left alone.' },
        { key: 'innerTolerance', label: 'Bar color tolerance', type: 'range', min: 5, max: 80, step: 1, default: 20, format: (v) => String(v), help: 'How close a pixel must be to the bar color. Higher catches noisy bars but may eat into dark photo edges.' },
      ],
    },
    {
      title: 'Page header',
      items: [
        { key: 'topBarLit', label: 'Light up top bar', type: 'toggle', default: true },
        { key: 'topBarOpacity', label: 'Top bar opacity', type: 'range', min: 0, max: 100, step: 1, default: 90, format: pct, help: 'Lower lets more light through, but feed content shows through too.' },
      ],
    },
    {
      title: 'Page content',
      items: [
        { key: 'cardsLit', label: 'Light up posts', type: 'toggle', default: true, help: 'Post header (author, caption) and like bar are lit like the sides.' },
        { key: 'cardOpacity', label: 'Post background opacity', type: 'range', min: 0, max: 100, step: 1, default: 10, format: pct },
        { key: 'readability', label: 'Keep text readable', type: 'toggle', default: true, help: 'Dims light that is too bright behind white text (dark theme), or brightens light that is too dark behind black text (light theme).' },
        { key: 'readabilityStrength', label: 'Readability strength', type: 'range', min: 0, max: 100, step: 1, default: 50, format: pct, help: 'Higher keeps text easier to read; lower keeps the light more vivid.' },
        { key: 'textShadow', label: 'Text shadow', type: 'range', min: 0, max: 100, step: 1, default: 40, format: pct, help: 'Shadow behind feed text so it stays readable on bright light.' },
      ],
    },
    {
      title: 'Focus mode',
      items: [
        { key: 'focusMode', label: 'Blur sides in feed', type: 'toggle', default: true, help: 'Blurs the left menu, right column and both ends of the top bar so only the feed in the middle stands out.' },
        { key: 'focusBlur', label: 'Sides blur', type: 'range', min: 0, max: 20, step: 1, default: 6, format: px },
        { key: 'focusDim', label: 'Sides dim', type: 'range', min: 0, max: 80, step: 1, default: 30, format: pct },
        { key: 'focusTopBar', label: 'Include top bar ends', type: 'toggle', default: true, help: 'Logo/search on the left and the icons on the right.' },
        { key: 'focusHover', label: 'Sharp on hover', type: 'toggle', default: true, help: 'A side becomes sharp while the mouse is over it, or while typing in it (search box).' },
      ],
    },
    {
      title: 'Quality',
      items: [
        { key: 'resolution', label: 'Resolution', type: 'list', options: [16, 32, 48, 96, 160], default: 48, format: (v) => `${v}px`, help: 'Size of the sampled frame. Higher is sharper light, more GPU.' },
        { key: 'videoFps', label: 'Limit framerate', type: 'list', options: [10, 15, 24, 30, 60, 0], default: 0, format: (v) => (v ? `${v} fps` : 'Max') },
      ],
    },
    {
      title: 'Performance',
      items: [
        { key: 'preload', label: 'Light up before visible', type: 'range', min: 0, max: 3, step: 0.5, default: 1, format: screens, help: 'Lazy-load: light is prepared this far before media scrolls into view.' },
        { key: 'unload', label: 'Switch off when away', type: 'range', min: 1, max: 6, step: 0.5, default: 2, format: screens },
        { key: 'maxMedia', label: 'Max lit media in feed', type: 'range', min: 1, max: 30, step: 1, default: 12, format: (v) => String(v) },
      ],
    },
    {
      title: 'General',
      open: true,
      items: [
        { key: 'theme', label: 'Appearance (theme)', type: 'list', options: ['light', 'default', 'dark'], default: 'default', format: (v) => v[0].toUpperCase() + v.slice(1), help: 'Theme of this settings panel. Default follows Facebook.' },
        { key: 'showButton', label: 'Show settings button', type: 'toggle', default: true, help: 'Alt+Shift+S opens the settings too.' },
        { key: 'enabled', label: 'Enabled [Alt+Shift+A]', type: 'toggle', default: true },
        { key: 'perfHud', label: 'Performance overlay', type: 'toggle', default: false, help: 'Shows FPS, slow frames and where the time goes, measured on this computer, with separate columns for extension ON and OFF. Scroll, press Alt+Shift+A, scroll again, compare.' },
      ],
    },
  ];

  const DEFS = Object.fromEntries(SECTIONS.flatMap((s) => s.items).map((d) => [d.key, d]));
  const defaults = () => Object.fromEntries(Object.values(DEFS).map((d) => [d.key, d.default]));

  const values = defaults();
  const listeners = new Set();
  const STORAGE_KEY = 'fbAmbientSettings';
  const storage = globalThis.chrome?.storage?.local;

  const emit = (changed) => listeners.forEach((fn) => fn(changed, values));

  // After the extension is reloaded or updated, the scripts still running
  // in open tabs lose their connection and every chrome.* call throws
  // "Extension context invalidated". Such a stale copy must stop and clean
  // up, so it neither throws nor keeps drawing next to the new copy.
  const deadListeners = new Set();
  let dead = false;
  const isAlive = () => {
    if (!storage) return true; // not running as an extension (tests)
    try {
      return !!globalThis.chrome?.runtime?.id;
    } catch {
      return false;
    }
  };
  const die = () => {
    if (dead) return;
    dead = true;
    deadListeners.forEach((fn) => fn());
  };
  const save = () => {
    if (!storage) return; // not running as an extension (tests)
    if (!isAlive()) return die();
    try {
      storage.set({ [STORAGE_KEY]: { ...values } });
    } catch {
      die();
    }
  };
  if (storage) {
    const watch = setInterval(() => {
      if (isAlive()) return;
      clearInterval(watch);
      die();
    }, 2000);
  }

  const settings = {
    SECTIONS,
    DEFS,
    values,
    get: (key) => values[key],
    set(key, value) {
      if (values[key] === value) return;
      values[key] = value;
      save();
      emit([key]);
    },
    reset() {
      Object.assign(values, defaults());
      save();
      emit(Object.keys(values));
    },
    onChange: (fn) => listeners.add(fn),
    // Called once if this copy was cut off by an extension reload.
    onDead: (fn) => (dead ? fn() : deadListeners.add(fn)),
    // Resolves once stored values are loaded (immediately without storage).
    ready: new Promise((resolve) => {
      if (!storage) return resolve();
      try {
        storage.get(STORAGE_KEY, (res) => {
          const saved = res?.[STORAGE_KEY] ?? {};
          for (const [k, v] of Object.entries(saved)) if (k in DEFS) values[k] = v;
          resolve();
        });
      } catch {
        resolve();
        die();
      }
    }),
  };

  // Keep every open Facebook tab in sync.
  globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue ?? {};
    const changed = Object.keys(next).filter((k) => k in DEFS && values[k] !== next[k]);
    if (!changed.length) return;
    for (const k of changed) values[k] = next[k];
    emit(changed);
  });

  NS.settings = settings;
})();
