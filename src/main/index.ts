import { app, BrowserWindow, ipcMain, BrowserView } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc/handlers'
import * as TorrentSearchService from './services/torrent-search.service'
import * as WebTorrentService from './services/webtorrent.service'
import * as FfmpegRemux from './services/ffmpeg-remux.service'
import { TizenTubeService } from './services/tizentube.service'
import { setupCursorHide } from "./utils/cursorUtils"
import { setupRemoteControl } from "./utils/remoteControl"
import * as UpdaterService from './services/updater.service'
import * as fs from 'fs'

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
} else if (gpuVendor === 'intel') {
  const hasIhd = existsSync(`${DRI_PATH}/iHD_drv_video.so`);
  const hasI965 = existsSync(`${DRI_PATH}/i965_drv_video.so`);
  console.log(`[VA-API] Intel GPU detected. iHD: ${hasIhd ? '✓' : '✗'} i965: ${hasI965 ? '✓' : '✗'}${!hasIhd && !hasI965 ? ' — install intel-media-driver or libva-intel-driver' : ''}`);
} else if (gpuVendor === 'amd') {
  const hasRadeonsi = existsSync(`${DRI_PATH}/radeonsi_drv_video.so`);
  console.log(`[VA-API] AMD GPU detected. radeonsi: ${hasRadeonsi ? '✓' : '✗ MISSING — install mesa-va-drivers-freeworld'}`);
} else {
  console.log('[VA-API] GPU vendor unknown — VAAPI may not work');
}

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder,VaapiVideoDecodeLinuxGL');
app.commandLine.appendSwitch('disable-software-rasterizer');

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

app.whenReady().then(async () => {
  await registerIpcHandlers();

  // Initialize TizenTube (downloads scripts if not present)
  TizenTubeService.init().catch((err: any) =>
    console.error('[TizenTube] init failed:', err?.message)
  );

  if (TorrentSearchService.shouldRefreshTrackers()) {
    TorrentSearchService.refreshTrackers().catch(() => {});
  }

  createWindow();
  UpdaterService.setMainWindow(mainWindow);
  UpdaterService.init();
  UpdaterService.checkForUpdates();

  // IPTV M3U: fetch on startup (async, non-blocking), cache for 24h
  import('./services/iptv-m3u.service').then(({ getAllSources, scheduleAutoImport }) => {
    // Daily 01:00 auto-import scheduler (Xtream portals from JSON URL, when enabled)
    scheduleAutoImport();
    getAllSources().then(sources => {
      const total = sources.reduce((sum, s) => sum + s.channels.length, 0);
      console.log(`[IPTV-M3U] Startup cache ready: ${sources.length} sources, ${total} channels`);
    }).catch(err => {
      console.error(`[IPTV-M3U] Startup fetch failed: ${err.message}`);
    });
  });

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