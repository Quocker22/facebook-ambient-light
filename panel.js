// Settings panel, styled after the original YouTube extension's menu:
// collapsible sections, sliders with the value on the right, stepped
// sliders for option lists, and switches. Lives in a shadow root so
// Facebook's CSS cannot reach it. Changes apply live.
(() => {
  const NS = (globalThis.FBAmbient ??= {});
  if (NS.panel) return;
  const { settings } = NS;
  const S = settings.values;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root {
      --bg: rgba(28, 28, 30, .82);
      --bg-solid: #1c1e21;
      --section: rgba(255, 255, 255, .06);
      --line: rgba(255, 255, 255, .1);
      --text: #f1f1f1;
      --muted: rgba(255, 255, 255, .45);
      --track: rgba(255, 255, 255, .25);
      --fill: rgba(255, 255, 255, .7);
      --thumb: #d9d9d9;
      --accent: #3a7bd5;
      font: 15px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: var(--text);
    }
    .root.light {
      --bg: rgba(250, 250, 252, .9);
      --bg-solid: #ffffff;
      --section: rgba(0, 0, 0, .04);
      --line: rgba(0, 0, 0, .08);
      --text: #1c1e21;
      --muted: rgba(0, 0, 0, .4);
      --track: rgba(0, 0, 0, .18);
      --fill: rgba(0, 0, 0, .55);
      --thumb: #fff;
    }
    .fab {
      position: fixed; left: 16px; bottom: 16px; z-index: 2147483000;
      width: 40px; height: 40px; border-radius: 50%; border: 0; cursor: pointer;
      display: grid; place-items: center;
      background: var(--bg); color: var(--text);
      box-shadow: 0 4px 14px rgba(0, 0, 0, .3);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    }
    .fab.off { opacity: .45; }
    .fab[hidden] { display: none; }
    .panel {
      position: fixed; left: 16px; bottom: 66px; z-index: 2147483001;
      width: 340px; max-height: calc(100vh - 140px);
      display: flex; flex-direction: column;
      background: var(--bg); border-radius: 18px; overflow: hidden;
      box-shadow: 0 12px 40px rgba(0, 0, 0, .45);
      backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
    }
    .panel[hidden] { display: none; }
    .top { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
    .top h1 { flex: 1; margin: 0; font-size: 15px; font-weight: 600; }
    .icon-btn { background: none; border: 0; color: var(--text); cursor: pointer; padding: 4px; opacity: .8; display: grid; place-items: center; }
    .icon-btn:hover { opacity: 1; }
    .scroll { overflow-y: auto; overscroll-behavior: contain; }
    .section-title {
      display: flex; align-items: center; width: 100%;
      padding: 10px 16px; border: 0; border-bottom: 1px solid var(--line);
      background: var(--section); color: var(--muted);
      font: inherit; font-size: 14px; font-weight: 600; text-align: left; cursor: pointer;
    }
    .section.open > .section-title { color: var(--text); }
    .section-title::after { content: '▸'; margin-left: auto; transition: transform .15s; }
    .section.open > .section-title::after { transform: rotate(90deg); }
    .section-body { display: none; padding: 4px 0 8px; border-bottom: 1px solid var(--line); }
    .section.open > .section-body { display: block; }
    .row { padding: 8px 16px 4px; }
    .row-head { display: flex; align-items: baseline; gap: 6px; }
    .label { flex: 1; font-size: 15px; }
    .value { color: var(--text); opacity: .85; font-variant-numeric: tabular-nums; }
    .help {
      position: relative; display: inline-grid; place-items: center;
      width: 18px; height: 18px; border-radius: 50%;
      color: var(--muted); font-size: 12px; cursor: help; user-select: none;
    }
    .help:hover, .help.show { color: var(--text); background: var(--section); }
    .tip {
      display: none; position: absolute; right: -8px; top: calc(100% + 6px); z-index: 2;
      width: 240px; padding: 8px 10px; border-radius: 8px;
      background: var(--text); color: var(--bg-solid, #1c1e21);
      font-size: 13px; line-height: 1.35; font-weight: 400; text-align: left; white-space: normal;
      box-shadow: 0 4px 16px rgba(0, 0, 0, .35); pointer-events: none;
    }
    .help:hover .tip, .help.show .tip { display: block; }
    input[type=range] {
      -webkit-appearance: none; appearance: none; width: 100%; height: 22px; margin: 4px 0 0;
      background: transparent; cursor: pointer;
    }
    input[type=range]::-webkit-slider-runnable-track {
      height: 3px; border-radius: 2px;
      background: linear-gradient(to right, var(--fill) var(--p, 0%), var(--track) var(--p, 0%));
    }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none; width: 18px; height: 18px; margin-top: -7.5px;
      border-radius: 50%; background: var(--thumb); box-shadow: 0 1px 3px rgba(0, 0, 0, .4);
    }
    input[type=range]::-moz-range-track { height: 3px; border-radius: 2px; background: var(--track); }
    input[type=range]::-moz-range-progress { height: 3px; border-radius: 2px; background: var(--fill); }
    input[type=range]::-moz-range-thumb { width: 18px; height: 18px; border: 0; border-radius: 50%; background: var(--thumb); }
    .ticks { position: relative; height: 18px; margin: 0 9px; font-size: 12px; color: var(--muted); }
    .ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
    .ticks span:first-child { transform: none; left: -9px !important; }
    .ticks span:last-child { transform: translateX(-100%); left: calc(100% + 9px) !important; }
    .toggle-row { display: flex; align-items: center; padding: 10px 16px; gap: 6px; }
    .switch { position: relative; width: 46px; height: 28px; flex: none; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .switch span {
      position: absolute; inset: 0; border-radius: 14px; cursor: pointer;
      background: var(--track); transition: background .15s;
    }
    .switch span::before {
      content: ''; position: absolute; left: 3px; top: 3px; width: 22px; height: 22px;
      border-radius: 50%; background: #fff; transition: transform .15s;
    }
    .switch input:checked + span { background: var(--accent); }
    .switch input:checked + span::before { transform: translateX(18px); }
    .disabled { opacity: .4; pointer-events: none; }
  `;

  const SUN = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const RESET = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
  const CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  // "?" with a tooltip on hover, toggled by click/tap. It sits inside the
  // switch rows' <label>, so a click must not reach the label (that would
  // flip the switch).
  const helpIcon = (text) => {
    const icon = el('span', { className: 'help', textContent: '?' }, [el('span', { className: 'tip', textContent: text })]);
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = !icon.classList.contains('show');
      for (const other of shadow.querySelectorAll('.help.show')) other.classList.remove('show');
      icon.classList.toggle('show', open);
    });
    return icon;
  };

  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  };

  // Settings that only matter when another one is on.
  const DEPENDS = {
    fillBlur: 'fillBars',
    topBarOpacity: 'topBarLit',
    cardOpacity: 'cardsLit',
    smoothStrength: 'smoothMotion',
    innerTolerance: 'innerBars',
    focusBlur: 'focusMode',
    focusDim: 'focusMode',
    focusTopBar: 'focusMode',
    focusHover: 'focusMode',
  };

  const host = el('div', { id: 'fb-ambient-settings' });
  const shadow = host.attachShadow({ mode: 'open' });
  const root = el('div', { className: 'root' });
  shadow.append(el('style', { textContent: CSS }), root);

  const fab = el('button', { className: 'fab', title: 'Ambient light settings (Alt+Shift+S)', innerHTML: SUN });
  const panel = el('div', { className: 'panel', hidden: true });
  root.append(fab, panel);

  const rows = {}; // key -> { row, sync() }

  const setFill = (input) => {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--p', `${p}%`);
  };

  const rangeRow = (def) => {
    const isList = def.type === 'list';
    const input = el('input', {
      type: 'range',
      min: 0,
      max: isList ? def.options.length - 1 : def.max,
      step: isList ? 1 : def.step,
    });
    if (!isList) input.min = def.min;
    const value = el('span', { className: 'value' });
    const head = el('div', { className: 'row-head' }, [el('span', { className: 'label', textContent: def.label })]);
    if (def.help) head.append(helpIcon(def.help));
    head.append(value);
    const row = el('div', { className: 'row' }, [head, input]);
    if (isList) {
      const ticks = el('div', { className: 'ticks' });
      def.options.forEach((opt, i) => {
        const t = el('span', { textContent: def.format(opt) });
        t.style.left = `${(i / (def.options.length - 1)) * 100}%`;
        ticks.append(t);
      });
      row.append(ticks);
    }
    const toValue = () => (isList ? def.options[+input.value] : +input.value);
    input.addEventListener('input', () => {
      setFill(input);
      value.textContent = def.format(toValue());
      settings.set(def.key, toValue());
    });
    const sync = () => {
      const v = S[def.key];
      input.value = isList ? Math.max(0, def.options.indexOf(v)) : v;
      setFill(input);
      value.textContent = def.format(v);
    };
    return { row, sync };
  };

  const toggleRow = (def) => {
    const input = el('input', { type: 'checkbox' });
    const label = el('span', { className: 'label', textContent: def.label });
    const row = el('label', { className: 'toggle-row' }, [label]);
    if (def.help) row.append(helpIcon(def.help));
    row.append(el('span', { className: 'switch' }, [input, el('span')]));
    input.addEventListener('change', () => settings.set(def.key, input.checked));
    return { row, sync: () => (input.checked = !!S[def.key]) };
  };

  const top = el('div', { className: 'top' }, [
    el('h1', { textContent: 'Ambient light for Facebook' }),
    el('button', { className: 'icon-btn', title: 'Reset all settings', innerHTML: RESET, onclick: () => settings.reset() }),
    el('button', { className: 'icon-btn', title: 'Close', innerHTML: CLOSE, onclick: () => togglePanel(false) }),
  ]);
  const scroll = el('div', { className: 'scroll' });
  panel.append(top, scroll);

  for (const section of settings.SECTIONS) {
    const wrap = el('div', { className: `section${section.open ? ' open' : ''}` });
    const title = el('button', { className: 'section-title', textContent: section.title });
    title.addEventListener('click', () => wrap.classList.toggle('open'));
    const body = el('div', { className: 'section-body' });
    for (const def of section.items) {
      const r = def.type === 'toggle' ? toggleRow(def) : rangeRow(def);
      rows[def.key] = r;
      body.append(r.row);
    }
    wrap.append(title, body);
    scroll.append(wrap);
  }

  const applyTheme = () => {
    const fbDark = document.documentElement.classList.contains('__fb-dark-mode');
    const dark = S.theme === 'dark' || (S.theme === 'default' && fbDark);
    root.classList.toggle('light', !dark);
  };

  const syncAll = () => {
    for (const [key, r] of Object.entries(rows)) {
      r.sync();
      const dep = DEPENDS[key];
      r.row.classList.toggle('disabled', !!dep && !S[dep]);
    }
    fab.hidden = !S.showButton;
    fab.classList.toggle('off', !S.enabled);
    applyTheme();
  };

  const togglePanel = (open = panel.hidden) => {
    panel.hidden = !open;
  };
  fab.addEventListener('click', () => togglePanel());
  // A click anywhere else in the panel closes an open tooltip.
  panel.addEventListener('click', () => {
    for (const open of shadow.querySelectorAll('.help.show')) open.classList.remove('show');
  });

  // Alt+Shift+S: settings, Alt+Shift+A: on/off. e.code, because Alt changes
  // e.key on macOS.
  const onKeyDown = (e) => {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'KeyS') togglePanel();
    else if (e.code === 'KeyA') settings.set('enabled', !S.enabled);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('keydown', onKeyDown, true);

  // Toolbar icon click (background.js).
  const onMessage = (msg) => {
    if (msg?.type === 'fb-ambient-open-panel') togglePanel(true);
  };
  try {
    globalThis.chrome?.runtime?.onMessage?.addListener(onMessage);
  } catch {
    // Extension context already gone; settings.onDead cleans up.
  }

  settings.onChange(syncAll);
  settings.onDead(() => {
    window.removeEventListener('keydown', onKeyDown, true);
    host.remove();
  });
  // Follow Facebook's own theme switch while "default" is selected.
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  settings.ready.then(() => {
    syncAll();
    document.body.append(host);
  });

  NS.panel = { open: () => togglePanel(true), close: () => togglePanel(false) };
})();
