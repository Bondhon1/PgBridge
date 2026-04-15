const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { Client } = require('pg');

const execFileAsync = promisify(execFile);

let mainWindow = null;
let migrationInProgress = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#0a1017',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));
}

function sendStatus(webContents, level, message) {
  webContents.send('migration:status', {
    level,
    message,
    timestamp: new Date().toISOString()
  });
}

function parseConnectionUrl(connectionString) {
  let parsed;

  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('Invalid PostgreSQL URL format.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('URL must use postgres:// or postgresql:// protocol.');
  }

  if (!parsed.hostname) {
    throw new Error('URL is missing hostname.');
  }

  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('URL is missing database name.');
  }

  return parsed;
}

function redactConnectionString(connectionString) {
  try {
    const parsed = new URL(connectionString);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[invalid connection string]';
  }
}

function buildPgToolConnection(urlObject) {
  const cleanUrl = new URL(urlObject.toString());
  cleanUrl.password = '';

  // Prevent a trailing colon when no password is present.
  cleanUrl.username = cleanUrl.username || '';

  return cleanUrl.toString();
}

function buildPgEnv(urlObject) {
  const env = { ...process.env };
  if (urlObject.password) {
    env.PGPASSWORD = urlObject.password;
  } else {
    delete env.PGPASSWORD;
  }
  return env;
}

function resolvePgBinary(binaryBaseName) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binaryName = `${binaryBaseName}${ext}`;

  const localPath = path.join(__dirname, '..', 'resources', 'postgres', binaryName);
  const packagedPath = path.join(process.resourcesPath, 'postgres', binaryName);

  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  throw new Error(
    `Missing PostgreSQL binary: ${binaryName}. Place it in resources/postgres before running.`
  );
}

async function checkTargetDB(connectionString) {
  const client = new Client({ connectionString });

  await client.connect();
  try {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ) AS has_tables;
    `);

    return result.rows[0]?.has_tables === true;
  } finally {
    await client.end();
  }
}

async function dumpDatabase(sourceUrl, webContents) {
  const parsedSource = parseConnectionUrl(sourceUrl);
  const pgDumpPath = resolvePgBinary('pg_dump');

  const dumpFilePath = path.join(os.tmpdir(), `pgbridge_${Date.now()}.dump`);
  const dumpArgs = [
    '--format=custom',
    '--no-owner',
    '--file',
    dumpFilePath,
    '--dbname',
    buildPgToolConnection(parsedSource)
  ];

  sendStatus(webContents, 'info', 'Exporting source database with pg_dump...');

  const { stderr } = await execFileAsync(pgDumpPath, dumpArgs, {
    env: buildPgEnv(parsedSource),
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 20
  });

  if (stderr && stderr.trim()) {
    sendStatus(webContents, 'info', `pg_dump: ${stderr.trim()}`);
  }

  return dumpFilePath;
}

async function restoreDatabase(targetUrl, dumpFilePath, webContents) {
  const parsedTarget = parseConnectionUrl(targetUrl);
  const pgRestorePath = resolvePgBinary('pg_restore');

  const restoreArgs = [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--dbname',
    buildPgToolConnection(parsedTarget),
    dumpFilePath
  ];

  sendStatus(webContents, 'info', 'Restoring dump into target database with pg_restore...');

  const { stderr } = await execFileAsync(pgRestorePath, restoreArgs, {
    env: buildPgEnv(parsedTarget),
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 20
  });

  if (stderr && stderr.trim()) {
    sendStatus(webContents, 'info', `pg_restore: ${stderr.trim()}`);
  }
}

async function migrate(sourceUrl, targetUrl, webContents) {
  let dumpFilePath;

  sendStatus(webContents, 'info', `Source: ${redactConnectionString(sourceUrl)}`);
  sendStatus(webContents, 'info', `Target: ${redactConnectionString(targetUrl)}`);

  try {
    dumpFilePath = await dumpDatabase(sourceUrl, webContents);
    await restoreDatabase(targetUrl, dumpFilePath, webContents);

    sendStatus(webContents, 'success', 'Migration completed successfully.');
  } finally {
    if (dumpFilePath && fs.existsSync(dumpFilePath)) {
      await fs.promises.unlink(dumpFilePath).catch(() => {});
    }
  }
}

ipcMain.handle('migration:start', async (event, payload) => {
  const sourceUrl = payload?.sourceUrl?.trim();
  const targetUrl = payload?.targetUrl?.trim();
  const force = payload?.force === true;

  if (!sourceUrl || !targetUrl) {
    return {
      ok: false,
      needsConfirmation: false,
      message: 'Both source and target URLs are required.'
    };
  }

  try {
    parseConnectionUrl(sourceUrl);
    parseConnectionUrl(targetUrl);
  } catch (error) {
    return {
      ok: false,
      needsConfirmation: false,
      message: error.message
    };
  }

  if (migrationInProgress) {
    return {
      ok: false,
      needsConfirmation: false,
      message: 'A migration is already in progress.'
    };
  }

  try {
    sendStatus(event.sender, 'info', 'Checking target database for existing tables...');
    const hasTables = await checkTargetDB(targetUrl);

    if (hasTables && !force) {
      sendStatus(event.sender, 'warn', 'Target database is not empty. Confirmation required.');
      return {
        ok: false,
        needsConfirmation: true,
        message: 'Target database contains existing data.'
      };
    }
  } catch (error) {
    return {
      ok: false,
      needsConfirmation: false,
      message: `Unable to inspect target database: ${error.message}`
    };
  }

  migrationInProgress = true;

  try {
    await migrate(sourceUrl, targetUrl, event.sender);
    return {
      ok: true,
      needsConfirmation: false,
      message: 'Migration completed successfully.'
    };
  } catch (error) {
    sendStatus(event.sender, 'error', `Migration failed: ${error.message}`);

    return {
      ok: false,
      needsConfirmation: false,
      message: error.message
    };
  } finally {
    migrationInProgress = false;
  }
});

app.whenReady().then(() => {
  createWindow();

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
