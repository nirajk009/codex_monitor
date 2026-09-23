const { app, BrowserWindow, ipcMain, session, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readLimits } = require('./usage');

const SESSION_URL = 'https://chatgpt.com/api/auth/session';
const REFRESH_MS = 5_000;
const ACCOUNT_FILES = ['hi.json', 'hi2.json'];
const MODES = ['normal', 'small', 'super'];
const MODE_SIZES = {
  normal: { width: 460, oneHeight: 215, twoHeight: 345, minWidth: 360, minHeight: 190 },
  small: { width: 335, oneHeight: 155, twoHeight: 245, minWidth: 300, minHeight: 120 },
  super: { width: 250, oneHeight: 90, twoHeight: 135, minWidth: 230, minHeight: 75 }
};
const accounts = ACCOUNT_FILES.map((file, index) => ({ file, index, browser: null, fingerprint: null, lastGood: null }));
let widget;
let refreshing = false;
let refreshTimer;
let saveBoundsTimer;
let lastRefreshStarted = 0;
let mode = 'normal';
let modeSizes = {};
let secondFileExists = false;

function cookieDirectory() {
  if (app.isPackaged) return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  return app.getAppPath();
}

function statePath() {
  return path.join(app.getPath('userData'), 'window.json');
}

function savedWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    const bounds = saved.bounds || saved;
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) ||
        !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return {};
    const visible = screen.getAllDisplays().some(display => {
      const area = display.workArea;
      return bounds.x < area.x + area.width && bounds.x + bounds.width > area.x &&
        bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;
    });
    return {
      bounds: visible ? bounds : null,
      mode: saved.mode || (saved.compact ? 'small' : 'normal'),
      modeSizes: saved.modeSizes || (saved.expandedSize ? { normal: saved.expandedSize } : {})
    };
  } catch (_) {
    return {};
  }
}

function saveBounds() {
  if (!widget || widget.isDestroyed() || widget.isMinimized()) return;
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify({ bounds: widget.getBounds(), mode, modeSizes }));
}

function scheduleSaveBounds() {
  clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(saveBounds, 500);
}

function createWidget() {
  const saved = savedWindowState();
  mode = MODE_SIZES[saved.mode] ? saved.mode : 'normal';
  modeSizes = saved.modeSizes || {};
  secondFileExists = fs.existsSync(path.join(cookieDirectory(), ACCOUNT_FILES[1]));
  const dimensions = MODE_SIZES[mode];
  widget = new BrowserWindow({
    width: dimensions.width,
    height: secondFileExists ? dimensions.twoHeight : dimensions.oneHeight,
    minWidth: dimensions.minWidth,
    minHeight: dimensions.minHeight,
    ...saved.bounds,
    frame: false,
    thickFrame: true,
    resizable: true,
    alwaysOnTop: true,
    backgroundColor: '#101114',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  widget.setMenuBarVisibility(false);
  widget.loadFile('index.html');
  widget.once('ready-to-show', () => widget.show());
  widget.on('resize', scheduleSaveBounds);
  widget.on('move', scheduleSaveBounds);
  widget.on('focus', () => {
    if (Date.now() - lastRefreshStarted > 2500) refreshAll();
  });
  widget.on('closed', () => app.quit());
  widget.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function adjustHeight(secondFileExists) {
  if (!widget || widget.isDestroyed()) return;
  const [width, height] = widget.getSize();
  const { oneHeight, twoHeight } = MODE_SIZES[mode];
  const target = secondFileExists ? twoHeight : oneHeight;
  if (height !== target && (height === oneHeight || height === twoHeight)) {
    widget.setSize(width, target);
  }
}

function cycleMode() {
  modeSizes[mode] = widget.getSize();
  mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  const dimensions = MODE_SIZES[mode];
  const savedSize = modeSizes[mode];
  const width = Array.isArray(savedSize) && Number.isFinite(savedSize[0])
    ? savedSize[0] : dimensions.width;
  const height = Array.isArray(savedSize) && Number.isFinite(savedSize[1])
    ? savedSize[1] : (secondFileExists ? dimensions.twoHeight : dimensions.oneHeight);
  widget.setMinimumSize(dimensions.minWidth, dimensions.minHeight);
  widget.setSize(Math.max(dimensions.minWidth, width), Math.max(dimensions.minHeight, height));
  widget.webContents.send('view-mode', mode);
  saveBounds();
}

function sendUpdate(account, status, message, data = null) {
  if (!widget || widget.isDestroyed()) return;
  if (account.index === 1) {
    secondFileExists = status !== 'missing';
    adjustHeight(secondFileExists);
  }
  widget.webContents.send('usage-update', {
    index: account.index,
    file: account.file,
    status,
    message,
    data: data || account.lastGood
  });
}

async function importCookies(account, cookieText) {
  let cookies;
  try {
    cookies = JSON.parse(cookieText);
  } catch (_) {
    throw new Error('Cookie file is not valid JSON');
  }
  if (!Array.isArray(cookies)) throw new Error('Cookie file must contain a cookie array');

  const browserSession = session.fromPartition(`account-${account.index}`);
  await browserSession.clearStorageData({ storages: ['cookies'] });
  let imported = 0;

  for (const cookie of cookies) {
    if (!cookie || typeof cookie !== 'object') continue;
    const domain = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
    if (domain !== 'chatgpt.com' || !cookie.name || !cookie.value) continue;
    if (cookie.expirationDate && cookie.expirationDate < Date.now() / 1000) continue;

    const options = {
      url: 'https://chatgpt.com' + (cookie.path || '/'),
      name: cookie.name,
      value: cookie.value,
      path: cookie.path || '/',
      secure: !!cookie.secure,
      httpOnly: !!cookie.httpOnly
    };
    if (!cookie.hostOnly && !cookie.name.startsWith('__Host-')) options.domain = cookie.domain;
    if (cookie.expirationDate) options.expirationDate = cookie.expirationDate;

    try {
      await browserSession.cookies.set(options);
      imported++;
    } catch (_) {
      // Some exported cookies cannot be restored; the session cookies can still work.
    }
  }

  if (!imported) throw new Error('No usable chatgpt.com cookies found');
  if (account.browser && !account.browser.isDestroyed()) account.browser.destroy();

  account.browser = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: `account-${account.index}`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  account.browser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await account.browser.loadURL(SESSION_URL);
}

const FETCH_USAGE = `(async () => {
  const sessionResponse = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
  if (!sessionResponse.ok) return { error: 'Session request failed (HTTP ' + sessionResponse.status + ')' };
  const login = await sessionResponse.json();
  if (!login.accessToken) return { error: 'Session expired. Replace the cookies.' };

  const headers = { Authorization: 'Bearer ' + login.accessToken };
  if (login.account?.id) headers['ChatGPT-Account-Id'] = login.account.id;
  const response = await fetch('/backend-api/wham/usage', {
    credentials: 'include', cache: 'no-store', headers
  });
  if (!response.ok) return { error: 'Usage request failed (HTTP ' + response.status + ')' };
  const usage = await response.json();
  return { email: usage.email || login.user?.email || null, rateLimit: usage.rate_limit || null };
})()`;

async function refreshAccount(account) {
  const filePath = path.join(cookieDirectory(), account.file);
  let cookieText;
  try {
    cookieText = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    sendUpdate(account, error.code === 'ENOENT' ? 'missing' : 'error',
      error.code === 'ENOENT' ? `Put ${account.file} next to the EXE` : 'Cannot read cookie file');
    return;
  }

  try {
    const fingerprint = crypto.createHash('sha256').update(cookieText).digest('hex');
    if (fingerprint !== account.fingerprint || !account.browser || account.browser.isDestroyed()) {
      account.lastGood = null;
      sendUpdate(account, 'loading', 'Connecting…');
      await importCookies(account, cookieText);
      account.fingerprint = fingerprint;
    }
    const result = await account.browser.webContents.executeJavaScript(FETCH_USAGE);
    if (result.error) throw new Error(result.error);
    const limits = readLimits(result.rateLimit);
    if (!limits.fiveHour && !limits.weekly) throw new Error('No usage limits returned');
    account.lastGood = { email: result.email, ...limits, updatedAt: Date.now() };
    sendUpdate(account, 'ok', null, account.lastGood);
  } catch (error) {
    sendUpdate(account, 'error', error.message || 'Could not update usage');
  }
}

async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  lastRefreshStarted = Date.now();
  try {
    await Promise.all(accounts.map(refreshAccount));
  } finally {
    refreshing = false;
  }
}

app.whenReady().then(() => {
  createWidget();
  ipcMain.on('refresh', refreshAll);
  ipcMain.on('minimize', () => widget.minimize());
  ipcMain.on('close', () => widget.close());
  ipcMain.on('always-on-top', (_event, value) => widget.setAlwaysOnTop(!!value, 'floating'));
  ipcMain.on('cycle-mode', cycleMode);
  widget.webContents.once('did-finish-load', () => {
    widget.webContents.send('view-mode', mode);
    refreshAll();
  });
  refreshTimer = setInterval(refreshAll, REFRESH_MS);
});

app.on('window-all-closed', () => {
  clearInterval(refreshTimer);
  clearTimeout(saveBoundsTimer);
  app.quit();
});
