const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, exec } = require('child_process');
const { promisify } = require('util');
const { Client } = require('pg');

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

let mainWindow = null;
let migrationInProgress = false;
let activeMigrationController = null;

function getAppIconPath() {
  return path.join(__dirname, '..', 'assets', 'icon.ico');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#0a1017',
    icon: getAppIconPath(),
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

function sendProgress(webContents, value, label) {
  webContents.send('migration:progress', {
    value,
    label,
    timestamp: new Date().toISOString()
  });
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
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

function buildPgToolArgs(urlObject) {
  const dbName = urlObject.pathname.replace(/^\//, '');
  return ['--dbname', dbName];
}

function buildPgEnv(urlObject) {
  const env = { ...process.env };

  if (urlObject.hostname) {
    env.PGHOST = urlObject.hostname;
  } else {
    delete env.PGHOST;
  }

  if (urlObject.port) {
    env.PGPORT = urlObject.port;
  } else {
    delete env.PGPORT;
  }

  if (urlObject.username) {
    env.PGUSER = urlObject.username;
  } else {
    delete env.PGUSER;
  }

  if (urlObject.password) {
    env.PGPASSWORD = urlObject.password;
  } else {
    delete env.PGPASSWORD;
  }

  const searchParams = urlObject.searchParams;
  if (searchParams.has('sslmode')) {
    env.PGSSLMODE = searchParams.get('sslmode');
  }
  if (searchParams.has('channel_binding')) {
    env.PGCHANNELBINDING = searchParams.get('channel_binding');
  }

  return env;
}

async function execPgBinary(binaryPath, args, env, signal) {
  const isCmdFile = binaryPath.endsWith('.cmd');
  
  if (isCmdFile) {
    const cmdLine = `"${binaryPath}" ${args.map(arg => `"${arg}"`).join(' ')}`;
    return execAsync(cmdLine, { env, windowsHide: true, maxBuffer: 1024 * 1024 * 20, signal });
  } else {
    return execFileAsync(binaryPath, args, {
      env,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 20,
      signal
    });
  }
}

function resolvePgBinary(binaryBaseName) {
  let binaryName;
  let possiblePaths = [];

  if (process.platform === 'win32') {
    // On Windows, try .cmd wrapper first, then .exe
    const cmdName = `${binaryBaseName}.exe.cmd`;
    const exeName = `${binaryBaseName}.exe`;
    
    const localCmdPath = path.join(__dirname, '..', 'resources', 'postgres', cmdName);
    const packagedCmdPath = path.join(process.resourcesPath, 'postgres', cmdName);
    const localExePath = path.join(__dirname, '..', 'resources', 'postgres', exeName);
    const packagedExePath = path.join(process.resourcesPath, 'postgres', exeName);

    possiblePaths = [packagedCmdPath, localCmdPath, packagedExePath, localExePath];
  } else {
    // On macOS/Linux, look for unextended binary
    const localPath = path.join(__dirname, '..', 'resources', 'postgres', binaryBaseName);
    const packagedPath = path.join(process.resourcesPath, 'postgres', binaryBaseName);
    
    possiblePaths = [packagedPath, localPath];
  }

  for (const tryPath of possiblePaths) {
    if (fs.existsSync(tryPath)) {
      return tryPath;
    }
  }

  throw new Error(
    `Missing PostgreSQL binary: ${binaryBaseName}. Place it in resources/postgres before running.`
  );
}

async function validateBinaries(signal) {
  const binaries = ['pg_dump', 'pg_restore'];
  const errors = [];

  for (const binary of binaries) {
    try {
      const binaryPath = resolvePgBinary(binary);
      if (!fs.existsSync(binaryPath)) {
        errors.push(`${binary}: file not found at ${binaryPath}`);
        continue;
      }

      const stat = fs.statSync(binaryPath);
      if (!stat.isFile()) {
        errors.push(`${binary}: path is not a file`);
        continue;
      }

      await execPgBinary(binaryPath, ['--version'], { ...process.env }, signal);
    } catch (error) {
      errors.push(`${binary}: ${error.message || String(error)}`);
    }
  }

  return errors;
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
    '--no-privileges',
    '--file',
    dumpFilePath,
    ...buildPgToolArgs(parsedSource)
  ];

  sendStatus(webContents, 'info', 'Exporting source database with pg_dump...');
  sendProgress(webContents, 35, 'Dumping source database');
  const pgEnv = buildPgEnv(parsedSource);
  
  sendStatus(webContents, 'info', `Command: ${pgDumpPath} ${dumpArgs.join(' ')}`);
  sendStatus(webContents, 'info', `Host: ${pgEnv.PGHOST || 'default'}`);
  sendStatus(webContents, 'info', `Port: ${pgEnv.PGPORT || '5432'}`);
  sendStatus(webContents, 'info', `User: ${pgEnv.PGUSER || 'default'}`);
  sendStatus(webContents, 'info', `SSL Mode: ${pgEnv.PGSSLMODE || 'default'}`);

  try {
    const result = await execPgBinary(pgDumpPath, dumpArgs, pgEnv, activeMigrationController?.signal);

    if (result.stderr && result.stderr.trim()) {
      sendStatus(webContents, 'info', `pg_dump: ${result.stderr.trim()}`);
    }

    sendProgress(webContents, 55, 'Source dump completed');

    return dumpFilePath;
  } catch (error) {
    const details = [];
    if (error.stdout) details.push(`stdout: ${error.stdout}`);
    if (error.stderr) details.push(`stderr: ${error.stderr}`);
    if (error.message) details.push(`message: ${error.message}`);
    if (error.code) details.push(`code: ${error.code}`);
    
    const fullMsg = details.length > 0 ? details.join(' | ') : String(error);
    sendStatus(webContents, 'error', `pg_dump diagnostic: ${fullMsg}`);
    throw new Error(`pg_dump failed: ${fullMsg}`);
  }
}

async function restoreDatabase(targetUrl, dumpFilePath, webContents) {
  const parsedTarget = parseConnectionUrl(targetUrl);
  const pgRestorePath = resolvePgBinary('pg_restore');

  const restoreArgs = [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    ...buildPgToolArgs(parsedTarget),
    dumpFilePath
  ];

  sendStatus(webContents, 'info', 'Restoring dump into target database with pg_restore...');
  sendProgress(webContents, 75, 'Restoring target database');
  const pgEnv = buildPgEnv(parsedTarget);
  
  sendStatus(webContents, 'info', `Command: ${pgRestorePath} ${restoreArgs.join(' ')}`);
  sendStatus(webContents, 'info', `Host: ${pgEnv.PGHOST || 'default'}`);
  sendStatus(webContents, 'info', `Port: ${pgEnv.PGPORT || '5432'}`);
  sendStatus(webContents, 'info', `User: ${pgEnv.PGUSER || 'default'}`);
  sendStatus(webContents, 'info', `SSL Mode: ${pgEnv.PGSSLMODE || 'default'}`);

  try {
    const result = await execPgBinary(pgRestorePath, restoreArgs, pgEnv, activeMigrationController?.signal);

    if (result.stderr && result.stderr.trim()) {
      sendStatus(webContents, 'info', `pg_restore: ${result.stderr.trim()}`);
    }

    sendProgress(webContents, 90, 'Restore completed');
  } catch (error) {
    const messageBlob = `${error.stderr || ''}\n${error.stdout || ''}\n${error.message || ''}`;
    if (messageBlob.includes('permission denied to change default privileges')) {
      sendStatus(webContents, 'warn', 'Restore completed with non-fatal privilege warnings from the source dump.');
      return;
    }

    const details = [];
    if (error.stdout) details.push(`stdout: ${error.stdout}`);
    if (error.stderr) details.push(`stderr: ${error.stderr}`);
    if (error.message) details.push(`message: ${error.message}`);
    if (error.code) details.push(`code: ${error.code}`);
    
    const fullMsg = details.length > 0 ? details.join(' | ') : String(error);
    sendStatus(webContents, 'error', `pg_restore diagnostic: ${fullMsg}`);
    throw new Error(`pg_restore failed: ${fullMsg}`);
  }
}

async function migrate(sourceUrl, targetUrl, webContents) {
  let dumpFilePath;

  sendStatus(webContents, 'info', `Source: ${redactConnectionString(sourceUrl)}`);
  sendStatus(webContents, 'info', `Target: ${redactConnectionString(targetUrl)}`);

  try {
    sendProgress(webContents, 5, 'Validating PostgreSQL binaries');
    dumpFilePath = await dumpDatabase(sourceUrl, webContents);
    await restoreDatabase(targetUrl, dumpFilePath, webContents);
    sendProgress(webContents, 95, 'Finalizing migration');

    sendStatus(webContents, 'success', 'Migration completed successfully.');
    sendProgress(webContents, 100, 'Migration completed');
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

  activeMigrationController = new AbortController();

  try {
    sendStatus(event.sender, 'info', 'Validating PostgreSQL binaries...');
    sendProgress(event.sender, 5, 'Validating PostgreSQL binaries');
    const binaryErrors = await validateBinaries(activeMigrationController.signal);
    if (binaryErrors.length > 0) {
      const errorList = binaryErrors.join(' | ');
      sendStatus(event.sender, 'error', `Binary validation failed: ${errorList}`);
      return {
        ok: false,
        needsConfirmation: false,
        message: `PostgreSQL binaries are not working: ${errorList}. Check that pg_dump.exe and pg_restore.exe are valid Windows executables in resources/postgres.`
      };
    }
    sendStatus(event.sender, 'info', 'PostgreSQL binaries OK.');
  } catch (error) {
    sendStatus(event.sender, 'error', `Binary validation error: ${error.message}`);
    return {
      ok: false,
      needsConfirmation: false,
      message: `Could not validate binaries: ${error.message}`
    };
  }

  try {
    sendStatus(event.sender, 'info', 'Checking target database for existing tables...');
    sendProgress(event.sender, 15, 'Checking target database');
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
    sendProgress(event.sender, 25, 'Preparing migration');
    await migrate(sourceUrl, targetUrl, event.sender);
    return {
      ok: true,
      needsConfirmation: false,
      message: 'Migration completed successfully.'
    };
  } catch (error) {
    if (isAbortError(error)) {
      sendStatus(event.sender, 'warn', 'Migration cancelled by user.');
      sendProgress(event.sender, 0, 'Migration cancelled');
      return {
        ok: false,
        needsConfirmation: false,
        cancelled: true,
        message: 'Migration cancelled.'
      };
    }

    sendStatus(event.sender, 'error', `Migration failed: ${error.message}`);

    return {
      ok: false,
      needsConfirmation: false,
      message: error.message
    };
  } finally {
    migrationInProgress = false;
    activeMigrationController = null;
  }
});

ipcMain.handle('migration:cancel', async () => {
  if (activeMigrationController) {
    activeMigrationController.abort();
    return { ok: true };
  }

  return { ok: false };
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
