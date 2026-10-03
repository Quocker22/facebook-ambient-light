# Ambient light for Facebook™

<img src="images/icon-128.png" width="96" align="right" alt="">

A browser extension that adds a soft, colorful glow around photos and videos on Facebook, picked from the media's own colors.

## Features

- **News Feed**: light spreads around each photo and video, behind the post header and like bar.
- **Photo viewer and Reels**: the whole dark background takes the media's colors.
- **Black and colored bars** beside photos and videos turn into light, including solid backgrounds baked into collages (screenshots and text are left alone).
- **Focus mode**: blurs and dims the side columns so only the feed stands out; sharp again on hover or while typing in search.
- **Detailed settings**: blur, spread, opacity, brightness, contrast, saturation, fade-in, smooth motion, debanding, quality and performance limits, per-place on/off switches.
- **Performance overlay**: shows FPS, slow frames and where the time goes on your own computer, with separate columns for the extension on and off.

Shortcuts: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> turns it on/off, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> opens the settings. Clicking the toolbar icon opens them too.

## Install

**From source (Chrome, Edge, Brave, other Chromium browsers, version 123+):**

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Reload facebook.com.

## Privacy

No data is collected or sent anywhere. Settings are stored in your browser with `chrome.storage.local`. See [PRIVACY.md](PRIVACY.md).

## How it works

Facebook's class names are obfuscated, so the extension finds media by size, visibility and background color instead of CSS classes. A glow is a small canvas holding a downscaled copy of the photo or video frame, enlarged and blurred with CSS. Depending on where the media is, the glow is placed:

- behind the media inside the dark viewer/Reels background (`stage`),
- in a layer under the whole page, so light spills out around feed posts (`page`),
- right under the media, above Facebook's black bar layers (`fill`),
- over the bars that are part of a photo's own pixels (`inner`).

| File | Role |
|---|---|
| `settings.js` | Setting definitions and storage |
| `panel.js` | Settings panel |
| `hud.js` | Performance overlay |
| `content.js` | Finding media and drawing the glows |
| `background.js` | Toolbar icon opens the settings |

There is no build step: the files are loaded as they are.

## Contributing

Issues and pull requests are welcome. When reporting a performance problem, please include a screenshot of the performance overlay (Settings → General → Performance overlay) with the extension on and off.

## License

[MIT](LICENSE). The icon uses a Material Symbols glyph (Apache 2.0); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Facebook is a trademark of Meta Platforms, Inc. This project is not affiliated with, endorsed by or sponsored by Meta.
