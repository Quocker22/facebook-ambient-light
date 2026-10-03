// Performance overlay (Settings > General > Performance overlay).
// Measures on the user's own machine while really scrolling, and keeps
// separate totals for "extension ON" and "extension OFF" so the two can be
// compared directly (toggle with Alt+Shift+A while the overlay stays up).
//
// Sources:
// - FPS: requestAnimationFrame of this tab.
// - Long frames (>50 ms): the Long Animation Frames API. It reports style &
//   layout time and the page's own scripts (Facebook); extension code runs
//   in an isolated world and is not attributed there, so...
// - Extension time: content.js's own timers (window.__fbAmbientPerf).
(() => {
  const NS = (globalThis.FBAmbient ??= {});
  if (NS.hud) return;
  const { settings } = NS;
  const S = settings.values;

  let host = null;
  let box = null;
  let running = false;
  let rafId = 0;
  let timer = 0;
  let observer = null;

  // Highest FPS seen = the display's refresh rate (60, 120, 144 Hz...).
  let refreshRate = 60;
  // Current 1 s window.
  let frames = 0;
  let worstFrame = 0;
  let lastFrameAt = 0;
  let loafs = [];
  // Running totals per extension state, for the ON/OFF comparison.
  const totals = { on: newTotals(), off: newTotals() };
  function newTotals() {
    return { seconds: 0, frames: 0, slowFrames: 0, longFrames: 0, blockingMs: 0, styleLayoutMs: 0, fbScriptMs: 0, extMs: 0 };
  }

  const onFrame = (t) => {
    if (lastFrameAt) {
      const d = t - lastFrameAt;
      if (d > worstFrame) worstFrame = d;
      if (d > 33.4) window.__fbAmbientSlowFrames = (window.__fbAmbientSlowFrames ?? 0) + 1;
    }
    lastFrameAt = t;
    frames++;
    rafId = requestAnimationFrame(onFrame);
  };

  // Extension main-thread ms since the last call. Only top-level entry
  // points are summed (drawX/layout run inside tick or rescan); buildInner
  // runs on its own from idle callbacks.
  let prevExt = 0;
  const extMsSince = () => {
    const perf = window.__fbAmbientPerf ?? {};
    const roots = ['tick', 'rescan', 'buildInner'].reduce((a, k) => a + (perf[k]?.ms ?? 0), 0);
    const d = roots - prevExt;
    prevExt = roots;
    return Math.max(0, d);
  };

  const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : '–');

  const render = (cur) => {
    const col = (t) =>
      t.seconds
        ? {
            fps: t.frames / t.seconds,
            slow: (t.slowFrames / Math.max(1, t.frames)) * 100,
            long: t.longFrames / t.seconds,
            block: t.blockingMs / t.seconds,
            sl: t.styleLayoutMs / t.seconds,
            fb: t.fbScriptMs / t.seconds,
            ext: t.extMs / t.seconds,
            n: t.seconds,
          }
        : null;
    const on = col(totals.on);
    const off = col(totals.off);
    const row = (label, key, d = 0, unit = '') =>
      `<tr><td>${label}</td><td>${on ? fmt(on[key], d) + unit : '–'}</td><td>${off ? fmt(off[key], d) + unit : '–'}</td></tr>`;
    const perf = window.__fbAmbientPerf ?? {};
    const top = Object.entries(perf)
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, 4)
      .map(([k, v]) => `${k} ${fmt(v.ms / Math.max(1, totals.on.seconds), 1)}ms/s (max ${fmt(v.max, 1)})`)
      .join('<br>');
    // Diagnosis for the last second.
    let hint = '';
    if (cur.fps < refreshRate * 0.75) {
      const mainBusy = cur.sl + cur.fb + cur.ext;
      hint =
        mainBusy < 150
          ? 'FPS low while the main thread is mostly idle → GPU/compositor bound (blur, large layers).'
          : 'FPS low and the main thread is busy → JavaScript / style & layout bound.';
    }
    box.innerHTML = `
      <div class="h">Performance · now: <b>${fmt(cur.fps)}</b>/${refreshRate} fps, worst frame ${fmt(cur.worst)} ms · extension ${S.enabled ? '<b class="on">ON</b>' : '<b class="off">OFF</b>'}</div>
      <table>
        <tr><th></th><th>ON (${on ? fmt(on.n) : 0}s)</th><th>OFF (${off ? fmt(off.n) : 0}s)</th></tr>
        ${row('FPS', 'fps', 1)}
        ${row('Frames > 33 ms', 'slow', 1, '%')}
        ${row('Long frames > 50 ms /s', 'long', 2)}
        ${row('Blocking ms/s', 'block')}
        ${row('Style+layout ms/s', 'sl')}
        ${row('Facebook script ms/s', 'fb')}
        ${row('Extension ms/s', 'ext', 1)}
      </table>
      <div class="sub">Extension, by function (while ON):<br>${top || '–'}</div>
      ${hint ? `<div class="hint">${hint}</div>` : ''}
      <div class="sub">Scroll for ~20 s, press Alt+Shift+A, scroll again. <a href="#" data-reset>Reset</a></div>`;
  };

  const second = () => {
    const bucket = S.enabled ? totals.on : totals.off;
    const slow = window.__fbAmbientSlowFrames ?? 0;
    window.__fbAmbientSlowFrames = 0;
    let block = 0;
    let sl = 0;
    let fb = 0;
    for (const e of loafs) {
      block += e.blockingDuration ?? 0;
      if (e.styleAndLayoutStart) sl += e.startTime + e.duration - e.styleAndLayoutStart;
      for (const s of e.scripts ?? []) fb += s.duration;
    }
    const ext = extMsSince();
    const cur = { fps: frames, worst: worstFrame, sl, fb, ext };
    if (frames > refreshRate) refreshRate = frames;
    // Only count seconds where something is happening (scrolling, video):
    // an idle tab would dilute the averages.
    if (frames > 5) {
      bucket.seconds++;
      bucket.frames += frames;
      bucket.slowFrames += slow;
      bucket.longFrames += loafs.length;
      bucket.blockingMs += block;
      bucket.styleLayoutMs += sl;
      bucket.fbScriptMs += fb;
      bucket.extMs += ext;
    }
    frames = 0;
    worstFrame = 0;
    loafs = [];
    render(cur);
  };

  const start = () => {
    if (running) return;
    running = true;
    window.__fbAmbientPerf = {};
    host = document.createElement('div');
    host.id = 'fb-ambient-hud';
    const shadow = host.attachShadow({ mode: 'open' });
    box = document.createElement('div');
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      div.root { position: fixed; top: 64px; right: 12px; z-index: 2147483002; width: 360px;
        font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; color: #e8e8e8;
        background: rgba(20, 20, 22, .88); border-radius: 10px; padding: 10px 12px;
        box-shadow: 0 6px 24px rgba(0,0,0,.4); pointer-events: auto; }
      .h { margin-bottom: 6px; } .on { color: #5bd16a; } .off { color: #ff8a65; }
      table { width: 100%; border-collapse: collapse; margin: 4px 0; }
      th, td { text-align: right; padding: 1px 4px; } th:first-child, td:first-child { text-align: left; color: #aaa; }
      .sub { color: #aaa; margin-top: 6px; } .hint { color: #ffd54f; margin-top: 6px; }
      a { color: #64b5f6; }`;
    box.className = 'root';
    shadow.append(style, box);
    box.addEventListener('click', (e) => {
      if (!e.target.closest('[data-reset]')) return;
      e.preventDefault();
      totals.on = newTotals();
      totals.off = newTotals();
      window.__fbAmbientPerf = {};
      prevExt = 0;
    });
    document.body.append(host);
    try {
      observer = new PerformanceObserver((list) => loafs.push(...list.getEntries()));
      observer.observe({ type: 'long-animation-frame', buffered: false });
    } catch {
      observer = null; // Chrome < 123: long frame columns stay at 0
    }
    rafId = requestAnimationFrame(onFrame);
    timer = setInterval(second, 1000);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    clearInterval(timer);
    observer?.disconnect();
    host?.remove();
    host = null;
    box = null;
    delete window.__fbAmbientPerf;
  };

  settings.ready.then(() => (S.perfHud ? start() : stop()));
  settings.onChange(() => (S.perfHud ? start() : stop()));
  settings.onDead(stop);
  NS.hud = { start, stop };
})();
