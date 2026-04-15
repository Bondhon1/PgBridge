const sourceUrlInput = document.getElementById('sourceUrl');
const targetUrlInput = document.getElementById('targetUrl');
const migrateButton = document.getElementById('migrateButton');
const stopButton = document.getElementById('stopButton');
const clearButton = document.getElementById('clearButton');
const statusText = document.getElementById('statusText');
const statusLog = document.getElementById('statusLog');
const progressBadge = document.getElementById('progressBadge');
const progressLabel = document.getElementById('progressLabel');
const progressFill = document.getElementById('progressFill');
const confirmModal = document.getElementById('confirmModal');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMessage = document.getElementById('confirmMessage');
const confirmButton = document.getElementById('confirmButton');
const cancelButton = document.getElementById('cancelButton');

let pendingPayload = null;
let pendingAction = null;
let isRunning = false;

function setRunningState(running) {
  isRunning = running;
  migrateButton.disabled = running;
  stopButton.disabled = !running;
  clearButton.disabled = running;
  sourceUrlInput.disabled = running;
  targetUrlInput.disabled = running;

  progressBadge.textContent = running ? 'Running' : 'Idle';
}

function setStatusText(text, level = 'info') {
  statusText.textContent = text;
  statusText.className = `status-text status-${level}`;
}

function setProgress(value, label) {
  progressFill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  progressLabel.textContent = label;
}

function appendStatus(status) {
  const row = document.createElement('div');
  row.className = `log-row log-${status.level || 'info'}`;

  const timestamp = new Date(status.timestamp || Date.now()).toLocaleTimeString();
  row.textContent = `[${timestamp}] ${status.message}`;

  statusLog.appendChild(row);
  statusLog.scrollTop = statusLog.scrollHeight;
}

function openConfirmModal(action) {
  pendingAction = action;

  if (action === 'target-warning') {
    confirmTitle.textContent = 'Target Database Is Not Empty';
    confirmMessage.textContent = 'This will delete existing data on the target database. Continue?';
    confirmButton.textContent = 'Continue';
  } else if (action === 'stop') {
    confirmTitle.textContent = 'Stop Migration';
    confirmMessage.textContent = 'This will cancel the running migration. Any partial restore may remain. Continue?';
    confirmButton.textContent = 'Stop now';
  }

  confirmModal.classList.add('visible');
}

function closeConfirmModal() {
  confirmModal.classList.remove('visible');
  pendingAction = null;
}

function clearFields() {
  sourceUrlInput.value = '';
  targetUrlInput.value = '';
  setStatusText('Fields cleared.', 'info');
}

async function runMigration(force = false) {
  const payload = {
    sourceUrl: sourceUrlInput.value,
    targetUrl: targetUrlInput.value,
    force
  };

  pendingPayload = payload;
  setRunningState(true);
  setStatusText('Preparing migration...', 'info');
  setProgress(1, 'Preparing migration');

  try {
    const result = await window.pgBridge.startMigration(payload);

    if (result.cancelled) {
      setStatusText(result.message || 'Migration cancelled.', 'warn');
      setProgress(0, 'Cancelled');
      return;
    }

    if (result.needsConfirmation) {
      setRunningState(false);
      setStatusText('Target has existing data. Confirmation required.', 'warn');
      setProgress(15, 'Target check complete');
      openConfirmModal('target-warning');
      return;
    }

    if (result.ok) {
      setStatusText(result.message || 'Migration completed.', 'success');
      setProgress(100, 'Completed');
      return;
    }

    setStatusText(result.message || 'Migration failed.', 'error');
  } catch (error) {
    setStatusText(`Unexpected error: ${error.message}`, 'error');
  } finally {
    if (!confirmModal.classList.contains('visible')) {
      setRunningState(false);
    }
  }
}

migrateButton.addEventListener('click', () => {
  runMigration(false);
});

stopButton.addEventListener('click', () => {
  if (!isRunning) {
    return;
  }

  openConfirmModal('stop');
});

clearButton.addEventListener('click', () => {
  clearFields();
  setProgress(0, 'Ready');
});

confirmButton.addEventListener('click', async () => {
  const action = pendingAction;
  closeConfirmModal();

  if (action === 'target-warning' && pendingPayload) {
    await runMigration(true);
    return;
  }

  if (action === 'stop') {
    await window.pgBridge.cancelMigration();
    setStatusText('Cancellation requested...', 'warn');
  }
});

cancelButton.addEventListener('click', () => {
  closeConfirmModal();
  if (isRunning) {
    setStatusText('Migration continues.', 'info');
  }
});

window.pgBridge.onStatus((status) => {
  appendStatus(status);
});

window.pgBridge.onProgress((progress) => {
  setProgress(progress.value, progress.label);
});
