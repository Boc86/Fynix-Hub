import { app, BrowserWindow, ipcMain, BrowserView, shell } from 'electron'
import path from 'path'
import { spawn } from 'child_process'
import { registerIpcHandlers } from './ipc/handlers'
import * as ChannelMergeService from './services/channel-merge.service'
import * as TorrentSearchService from './services/torrent-search.service'
import * as WebTorrentService from './services/webtorrent.service'
import * as FfmpegRemux from './services/ffmpeg-remux.service'
import { TizenTubeService } from './services/tizentube.service'
import { setupCursorHide } from "./utils/cursorUtils"
import { setupRemoteControl } from "./utils/remoteControl"
import * as UpdaterService from './services/updater.service'
import * as fs from 'fs'
import { startVyla, stopVyla, getVylaBaseUrl } from './services/vyla-service'
import * as CacheService from './services/cache.service'

const AD_DOMAINS = [
  '*://*.doubleclick.net/*',
  '*://*.googlesyndication.com/*',
  '*://*.googleadservices.com/*',
  '*://*.google-analytics.com/*',
  '*://*.googletagmanager.com/*',
  '*://*.googletagservices.com/*',
  '*://*.anchor.fm/*',
  '*://*.adservice.google.com/*',
  '*://*.pagead2.googlesyndication.com/*',
  '*://*.adsafeprotected.com/*',
  '*://*.serving-sys.com/*',
  '*://*.adnxs.com/*',
  '*://*.rubiconproject.com/*',
  '*://*.pubmatic.com/*',
  '*://*.openx.net/*',
  '*://*.casalmedia.com/*',
  '*://*.moatads.com/*',
  '*://*.scorecardresearch.com/*',
  '*://*.popads.net/*',
  '*://*.popcash.net/*',
  '*://*.propellerads.com/*',
  '*://*.adsterra.com/*',
]

function setupAdBlock(webContents: any) {
  webContents.session.webRequest.onBeforeRequest(
    { urls: AD_DOMAINS },
    (_details: any, callback: any) => {
      callback({ cancel: true });
    }
  );

  webContents.on('did-finish-load', () => {
    const blockCss = `
      div[class*="popup"], div[id*="popup"],
      div[class*="overlay"], div[id*="overlay"],
      div[class*="modal"], div[id*="modal"],
      .ad-container, .ad-banner, .popup-ad {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      body { overflow: auto !important; }
    `;
    webContents.insertCSS(blockCss);
  });
}

// ─── VA-API / Hardware HEVC Decoding ─────────────────────────────────────────
// Electron 42+ has built-in HEVC HW decoding via VAAPI on Linux.
// Auto-detect GPU vendor and point libva at the right driver backend.
// - NVIDIA: requires `libva-nvidia-driver` (LIBVA_DRIVER_NAME=nvidia)
// - Intel:  `libva-intel-driver` (i965) or `intel-media-driver` (iHD)
// - AMD:    `mesa-va-drivers-freeworld` (radeonsi)
// Intel/AMD drivers register themselves in /usr/lib64/dri/ and libva
// auto-detects them — no LIBVA_DRIVER_NAME override needed.
import { execSync } from 'child_process';
import { existsSync } from 'fs';

function detectGpuVendor(): string | null {
  // First, try to detect which GPU drives the active display via DRM.
  // On Wayland (no xrandr), we check /sys/class/drm/card*/card*-*/status
  // for a "connected" output — that card is the display GPU.
  // This is critical for hybrid GPU systems where lspci lists NVIDIA first
  // but the display is actually connected to AMD/Intel.
  try {
    const drmPattern = '/sys/class/drm';
    const entries = fs.readdirSync(drmPattern);
    // Look for card directories
    const cards = entries.filter(e => /^card\d+$/.test(e));
    for (const card of cards) {
      const drmPath = path.join(drmPattern, card);
      const cardEntries = fs.readdirSync(drmPath);
      // Check connector status dirs (e.g., card0-HDMI-A-1)
      for (const entry of cardEntries) {
        const statusPath = path.join(drmPath, entry, 'status');
        if (fs.existsSync(statusPath)) {
          try {
            const status = fs.readFileSync(statusPath, 'utf-8').trim();
            if (status === 'connected') {
              // Read the PCI ID from the card's device uevent
              const ueventPath = path.join(drmPath, 'device', 'uevent');
              if (fs.existsSync(ueventPath)) {
                const uevent = fs.readFileSync(ueventPath, 'utf-8');
                const pciMatch = uevent.match(/PCI_ID=([0-9A-Fa-f]+):/i);
                if (pciMatch) {
                  const pciId = pciMatch[1];
                  if (pciId === '10de') return 'nvidia';  // NVIDIA
                  if (pciId === '1002' || pciId === '1002') return 'amd';  // AMD
                  if (pciId === '8086') return 'intel';   // Intel
                }
                // Also check DRIVER field as fallback
                const driverMatch = uevent.match(/DRIVER=(\w+)/);
                if (driverMatch) {
                  const driver = driverMatch[1].toLowerCase();
                  if (driver.includes('nvidia')) return 'nvidia';
                  if (driver.includes('amdgpu') || driver.includes('radeon')) return 'amd';
                  if (driver.includes('i915') || driver.includes('xe')) return 'intel';
                }
              }
            }
          } catch { /* ignore individual card read errors */ }
        }
      }
    }
  } catch { /* /sys/class/drm unavailable */ }

  // Fallback: use lspci (first match wins)
  try {
    const lspci = execSync('lspci -nn 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
    if (/vga.*nvidia|3d.*nvidia|display.*nvidia/i.test(lspci)) return 'nvidia';
    if (/vga.*intel|3d.*intel/i.test(lspci)) return 'intel';
    if (/vga.*amd|vga.*ati|display.*amd|display.*ati/i.test(lspci)) return 'amd';
  } catch { /* lspci unavailable */ }
  return null;
}

const gpuVendor = detectGpuVendor();
const DRI_PATH = '/usr/lib64/dri';

if (gpuVendor === 'nvidia') {
  // NVIDIA needs explicit driver name — libva can't auto-detect it.
  if (!process.env.LIBVA_DRIVER_NAME) process.env.LIBVA_DRIVER_NAME = 'nvidia';
  const hasDriver = existsSync(`${DRI_PATH}/nvidia_drv_video.so`);
  console.log(`[VA-API] NVIDIA GPU detected. Driver: ${hasDriver ? '✓' : '✗ MISSING — install libva-nvidia-driver'}`);
  // NVIDIA VA-API often has EGL issues on Wayland — prefer software fallback.
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
} else if (gpuVendor === 'intel') {
  const hasIhd = existsSync(`${DRI_PATH}/iHD_drv_video.so`);
  const hasI965 = existsSync(`${DRI_PATH}/i965_drv_video.so`);
  console.log(`[VA-API] Intel GPU detected. iHD: ${hasIhd ? '✓' : '✗'} i965: ${hasI965 ? '✓' : '✗'}${!hasIhd && !hasI965 ? ' — install intel-media-driver or libva-intel-driver' : ''}`);
  // Intel VA-API works well — enable hardware decoding.
  if (hasIhd || hasI965) {
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
    app.commandLine.appendSwitch('disable-software-rasterizer');
  }
} else if (gpuVendor === 'amd') {
  const hasRadeonsi = existsSync(`${DRI_PATH}/radeonsi_drv_video.so`);
  console.log(`[VA-API] AMD GPU detected. radeonsi: ${hasRadeonsi ? '✓' : '✗ MISSING — install mesa-va-drivers-freeworld'}`);
  // AMD VA-API (VAAPI + EGL) is unreliable on Wayland — causes video
  // frames to not render (audio plays but video stays black/preparing).
  // Use software decoding instead: --disable-gpu-rasterization + allow
  // --ignore-gpu-blocklist for canvas/webgl compositing to still work.
  // Software video decode is fast enough for 720p/1080p HLS streams.
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('disable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
  // Don't disable software rasterizer — allows CPU decoding fallback.
} else {
  console.log('[VA-API] GPU vendor unknown — VAAPI may not work');
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let youtubeView: BrowserView | null = null;
let embedView: BrowserView | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    fullscreen: true,
    backgroundColor: '#141414',
    show: false,
    icon: path.join(__dirname, '../../assets/FLB-512.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: path.resolve(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.resolve(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Show the window only when the renderer has finished loading.
  // The splash screen renders as part of the initial HTML, so the user
  // sees the splash immediately with no black/blank gap.
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.show();
  });
  setupRemoteControl(mainWindow.webContents, mainWindow);
  setupCursorHide(mainWindow);

  // Inject Referer header for CDNLive requests — browsers block this via XHR
  // but Electron main process can intercept and add it. Matches old MPV --referrer behavior.
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['*://cdnlivetv.tv/*', '*://cdnlivetv.is/*', '*://api.cdnlivetv.is/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://cdnlivetv.is/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  // Strip frame-ancestors from DLHD CSP headers so the embed iframe can load in our player view
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: ['*://dlhd.st/*', '*://hamis.romponalis.st/*', '*://okcdn.ru/*', '*://vkuser.net/*', '*://vk.com/*', '*://vkvideo.ru/*'] },
    (details, callback) => {
      const csp = details.responseHeaders?.['content-security-policy'] ?? details.responseHeaders?.['Content-Security-Policy']
      if (csp) {
        const filtered = Array.isArray(csp) ? csp : [csp]
        details.responseHeaders!['Content-Security-Policy'] = filtered.map(v => v.replace(/;\s*frame-ancestors[^;]*/gi, ''))
      }
      callback({ responseHeaders: details.responseHeaders })
    }
  );

  mainWindow.maximize();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('resize', () => {
    if (!mainWindow) return;
    const { width, height } = mainWindow.getContentBounds();
    if (youtubeView) youtubeView.setBounds({ x: 0, y: 0, width, height });
    if (embedView) embedView.setBounds({ x: 0, y: 0, width, height });
  });
}

function createYouTubeView() {
  if (youtubeView || !mainWindow) return;

  youtubeView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Spoof User-Agent to PS4/Cobalt for youtube.com/tv with 4K support
  const tvUserAgent = 'Mozilla/5.0 (Linux; Android 12) Cobalt/22.2.3-gold (PS4)';
  youtubeView.webContents.setUserAgent(tvUserAgent);

  // Also spoof User-Agent at session level for all requests
  youtubeView.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*'] },
    (details, callback) => {
      details.requestHeaders['User-Agent'] = tvUserAgent;
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  // Block ads
  setupAdBlock(youtubeView.webContents);

  mainWindow.addBrowserView(youtubeView);
  setupRemoteControl(youtubeView.webContents, mainWindow);

  const { width, height } = mainWindow.getContentBounds();
  youtubeView.setBounds({ x: 0, y: 0, width, height });

  // Focus the BrowserView so it receives keyboard input
  youtubeView.webContents.focus();

  // Inject TizenTube scripts on did-finish-load
  let tizentubeInjected = false;
  youtubeView.webContents.on('did-finish-load', () => {
    youtubeView?.webContents.focus();

    if (tizentubeInjected) return;
    tizentubeInjected = true;

    const scripts = TizenTubeService.getScripts();
    if (scripts.length === 0) {
      console.warn('[YouTubeView] No TizenTube scripts found — injection skipped');
      return;
    }
    for (const script of scripts) {
      const wrapped = `try{\n${script}\n}catch(e){console.error('[TizenTube]',e)}`;
      youtubeView?.webContents.executeJavaScript(wrapped).catch((e: any) =>
        console.error('[YouTubeView] TizenTube injection failed:', e)
      );
    }
    console.log(`[YouTubeView] Injected ${scripts.length} TizenTube script(s)`);
  });

  // Intercept keyboard events
  youtubeView.webContents.on('before-input-event', (event, input) => {
    // Escape → go back within YouTube, or exit to app if on main screen
    if (input.key === 'Escape' && input.type === 'keyDown') {
      event.preventDefault();
      const url = youtubeView?.webContents.getURL() || '';
      console.log('[YouTubeView] Escape pressed, current URL:', url);
      // Exit to app only when on the root YouTube TV page (no hash fragment beyond #/)
      if (/^https:\/\/www\.youtube\.com\/tv(\/#)?$/.test(url)) {
        console.log('[YouTubeView] On root page, exiting to app');
        mainWindow?.webContents.send('youtube:focus-back');
      } else {
        // YouTube TV SPA: dispatch Escape key directly via JS to exit video player
        console.log('[YouTubeView] Dispatching Escape via JS to exit video player');
        youtubeView?.webContents.executeJavaScript(
          'document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true}));' +
          'document.dispatchEvent(new KeyboardEvent("keyup", {key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true}));'
        ).catch(() => {});
      }
    }
    // Backspace/BrowserBack → go back within YouTube, or exit to app if on main screen
    if ((input.key === 'Backspace' || input.key === 'BrowserBack') && input.type === 'keyDown') {
      event.preventDefault();
      const url = youtubeView?.webContents.getURL() || '';
      console.log('[YouTubeView] Back pressed, current URL:', url);
      // Exit to app only when on the root YouTube TV page (no hash fragment beyond #/)
      if (/^https:\/\/www\.youtube\.com\/tv(\/#)?$/.test(url)) {
        console.log('[YouTubeView] On root page, exiting to app');
        mainWindow?.webContents.send('youtube:focus-back');
      } else {
        // YouTube TV SPA: dispatch Escape key directly via JS to exit video player
        console.log('[YouTubeView] Dispatching Escape via JS to exit video player');
        youtubeView?.webContents.executeJavaScript(
          'document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true}));' +
          'document.dispatchEvent(new KeyboardEvent("keyup", {key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true}));'
        ).catch(() => {});
      }
    }
  });

  youtubeView.webContents.loadURL('https://www.youtube.com/tv');
}

function destroyYouTubeView() {
  if (youtubeView && mainWindow) {
    try {
      mainWindow.removeBrowserView(youtubeView);
    } catch (e) {
      console.error('[YouTubeView] removeBrowserView failed:', e);
    }
    try {
      // @ts-ignore
      if (typeof youtubeView.webContents.close === 'function') {
        // @ts-ignore
        youtubeView.webContents.close();
      }
    } catch (e) {
      console.error('[YouTubeView] close failed:', e);
    }
    youtubeView = null;
    // Focus workaround for Wayland — toggle alwaysOnTop to force window to front
    mainWindow.setAlwaysOnTop(true);
    mainWindow.moveTop();
    mainWindow.focus();
    mainWindow.webContents.focus();
    setTimeout(() => mainWindow?.setAlwaysOnTop(false), 100);
  }
}

// Handle --update flag: if the user runs `fynix-hub --update`, spawn the
// bundled install script instead of starting the GUI.
const isUpdateFlag = process.argv.includes('--update')
if (isUpdateFlag) {
  const exeDir = path.dirname(process.execPath)
  const script = path.join(exeDir, 'install-fynix.sh')
  try {
    spawn(script, ['--update'], { stdio: 'inherit', detached: true })
  } catch {
    // Fall back to launching via bash in case the script isn't executable
    spawn('bash', [script, '--update'], { stdio: 'inherit', detached: true })
  }
  app.quit()
  process.exit(0)
}

app.whenReady().then(async () => {
  try {
    createWindow();
  } catch (err: any) {
    // Window creation may fail in headless environments — the network API
    // server and IPC handlers should still start.
    console.error('[App] createWindow failed:', err?.message || err);
  }

  // Send status to renderer after it finishes loading
  mainWindow?.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('app:status', { status: 'Starting services…' });
  });

  await registerIpcHandlers();

  mainWindow?.webContents.send('app:status', { status: 'Loading data…' });

  UpdaterService.setMainWindow(mainWindow);
  UpdaterService.init();
  UpdaterService.checkForUpdates();

  // Initialize TizenTube (downloads scripts if not present)
  TizenTubeService.init().catch((err: any) =>
    console.error('[TizenTube] init failed:', err?.message)
  );

  // Preload the merged CDN+M3U channel list in the background (chunked, so
  // main never blocks): by the time the user opens LiveTV/EPG/Settings the
  // list and EPG channel map are already warm.
  ChannelMergeService.warmMergedChannels();

  if (TorrentSearchService.shouldRefreshTrackers()) {
    TorrentSearchService.refreshTrackers().catch(() => {});
  }

  // IPTV M3U: fetch on startup (async, non-blocking), cache for 24h
  import('./services/iptv-m3u.service').then(async ({ getAllSources, scheduleAutoScrape, runAutoScrapeIfStale }) => {
    // Daily 01:00 auto-scrape scheduler (Reddit Xtream portals)
    scheduleAutoScrape();
    // Catch-up: scrape now if the app wasn't running at 01:00 (stale cache)
    await runAutoScrapeIfStale();
    getAllSources().then(sources => {
      const total = sources.reduce((sum, s) => sum + s.channels.length, 0);
      console.log(`[IPTV-M3U] Startup cache ready: ${sources.length} sources, ${total} channels`);
    }).catch(err => {
      console.error(`[IPTV-M3U] Startup fetch failed: ${err.message}`);
    });
  })

  // Start Vyla streaming API server (auto-provisioned, zero user config)
  try {
    const tmdbApiKey = CacheService.getSetting<string>('tmdbApiKey') || ''
    const vylaStarted = await startVyla(tmdbApiKey)
    if (vylaStarted) {
      console.log(`[Vyla] Streaming API running at ${getVylaBaseUrl()}`)
    } else {
      console.warn('[Vyla] Streaming API failed to start — Vyla sources will be unavailable')
    }
  } catch (err: any) {
    console.error('[Vyla] Startup error:', err?.message || err)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  console.log('[App] before-quit — cleaning up services');
  try { FfmpegRemux.shutdown() } catch (e: any) { console.error('[App] ffmpeg-remux shutdown error:', e?.message) }
  try { await WebTorrentService.removeAllTorrents() } catch (e: any) { console.error('[App] torrent cleanup error:', e?.message) }
  destroyYouTubeView();
  try { stopVyla() } catch (e: any) { console.error('[Vyla] shutdown error:', e?.message) }
  console.log('[App] before-quit cleanup complete');
});

ipcMain.on('youtube:show', () => {
  try {
    createYouTubeView();
    youtubeView?.webContents.focus();
  } catch (err: any) {
    console.error('[IPC Error] youtube:show:', err?.message || String(err));
  }
});

ipcMain.on('youtube:hide', () => {
  try {
    destroyYouTubeView();
  } catch (err: any) {
    console.error('[IPC Error] youtube:hide:', err?.message || String(err));
  }
});

ipcMain.handle('youtube:sign-out', async () => {
  try {
    if (youtubeView) {
      await youtubeView.webContents.session.clearStorageData({
        origin: 'https://www.youtube.com',
        storages: ['cookies', 'localstorage', 'cachestorage'],
      });
      youtubeView.webContents.loadURL('https://www.youtube.com/tv');
    }
    return { success: true };
  } catch (err: any) {
    console.error('[IPC Error] youtube:sign-out:', err?.message || String(err));
    return { success: false, error: err?.message };
  }
});

ipcMain.handle('tizentube:check-updates', async () => {
  try {
    return await TizenTubeService.checkForUpdates();
  } catch (err: any) {
    console.error('[IPC Error] tizentube:check-updates:', err?.message || String(err));
    throw err;
  }
});

ipcMain.handle('tizentube:update', async () => {
  try {
    return await TizenTubeService.updateScripts();
  } catch (err: any) {
    console.error('[IPC Error] tizentube:update:', err?.message || String(err));
    throw err;
  }
});

ipcMain.handle('tizentube:get-version', async () => {
  try {
    return await TizenTubeService.getVersion();
  } catch (err: any) {
    console.error('[IPC Error] tizentube:get-version:', err?.message || String(err));
    throw err;
  }
});