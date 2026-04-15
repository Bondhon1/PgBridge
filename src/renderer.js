const sourceUrlInput = document.getElementById('sourceUrl');
const targetUrlInput = document.getElementById('targetUrl');
const migrateButton = document.getElementById('migrateButton');
const statusText = document.getElementById('statusText');
const statusLog = document.getElementById('statusLog');
const progressBadge = document.getElementById('progressBadge');
const warningModal = document.getElementById('warningModal');
const confirmButton = document.getElementById('confirmButton');
const cancelButton = document.getElementById('cancelButton');

let pendingPayload = null;
let isRunning = false;

function setRunningState(running) {
  isRunning = running;
  migrateButton.disabled = running;
  sourceUrlInput.disabled = running;
  targetUrlInput.disabled = running;

  progressBadge.textContent = running ? 'Running' : 'Idle';
  progressBadge.classList.toggle('progress-active', running);
}

function appendStatus(status) {
  const row = document.createElement('div');
  row.className = `log-row log-${status.level || 'info'}`;

  const timestamp = new Date(status.timestamp || Date.now()).toLocaleTimeString();
  row.textContent = `[${timestamp}] ${status.message}`;

  statusLog.appendChild(row);
  statusLog.scrollTop = statusLog.scrollHeight;
}

function setStatusText(text, level = 'info') {
  statusText.textContent = text;
  statusText.className = `status-text status-${level}`;
}

function openWarningModal() {
  warningModal.classList.add('visible');
}

function closeWarningModal() {
  warningModal.classList.remove('visible');
}

async function runMigration(force = false) {
  const payload = {
    sourceUrl: sourceUrlInput.value,
    targetUrl: targetUrlInput.value,
    force
  };

  pendingPayload = payload;
  setRunningState(true);
  setStatusText('Working...', 'info');

  try {
    const result = await window.pgBridge.startMigration(payload);

    if (result.needsConfirmation) {
      setRunningState(false);
      setStatusText('Target has existing data. Confirmation required.', 'warn');
      openWarningModal();
      return;
    }

    if (result.ok) {
      setStatusText(result.message || 'Migration completed.', 'success');
      return;
    }

    setStatusText(result.message || 'Migration failed.', 'error');
  } catch (error) {
    setStatusText(`Unexpected error: ${error.message}`, 'error');
  } finally {
    if (!warningModal.classList.contains('visible')) {
      setRunningState(false);
    }
  }
}

migrateButton.addEventListener('click', () => {
  runMigration(false);
});

confirmButton.addEventListener('click', async () => {
  closeWarningModal();

  if (!pendingPayload) {
    return;
  }

  await runMigration(true);
});

cancelButton.addEventListener('click', () => {
  closeWarningModal();
  setStatusText('Migration cancelled.', 'warn');
  setRunningState(false);
});

window.pgBridge.onStatus((status) => {
  appendStatus(status);
});
