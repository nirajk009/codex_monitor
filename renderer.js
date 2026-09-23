const accountStates = [null, null];
let mode = 'normal';

function resetLabel(resetAt) {
  if (!resetAt) return 'Reset time unavailable';
  const options = mode !== 'normal'
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
  const time = new Intl.DateTimeFormat(undefined, options).format(new Date(resetAt * 1000));
  return mode === 'normal' ? 'Resets ' + time : time;
}

function updatedLabel(updatedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (seconds < 2) return mode === 'normal' ? 'Updated just now' : 'Live · now';
  if (seconds < 60) return mode === 'normal' ? `Updated ${seconds}s ago` : `Live · ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return mode === 'normal' ? `Updated ${minutes}m ago` : `Live · ${minutes}m`;
}

function updateStatus(element, update) {
  const status = element.querySelector('.status');
  status.textContent = update.status === 'ok' ? updatedLabel(update.data.updatedAt) : update.message;
  status.title = update.status === 'ok'
    ? new Date(update.data.updatedAt).toLocaleString()
    : status.textContent;
  status.className = 'status ' + (update.status === 'ok' ? 'ok' : update.status === 'error' ? 'error' : '');
}

function renderLimit(element, window) {
  const percentage = element.querySelector('.percentage');
  const reset = element.querySelector('.reset');
  const fill = element.querySelector('.fill');
  if (!window) {
    percentage.textContent = '—';
    reset.textContent = 'Not available';
    reset.title = '';
    element.title = 'Not available';
    fill.style.width = '0%';
    fill.className = 'fill';
    return;
  }

  percentage.textContent = Math.round(window.remaining) + '%';
  reset.textContent = resetLabel(window.resetAt);
  reset.title = window.resetAt ? new Date(window.resetAt * 1000).toLocaleString() : '';
  element.title = reset.title ? 'Resets ' + reset.title : 'Reset time unavailable';
  fill.style.width = window.remaining + '%';
  fill.className = 'fill' + (window.remaining <= 5 ? ' critical' : window.remaining <= 20 ? ' low' : '');
}

function renderAccount(update) {
  accountStates[update.index] = update;
  const element = document.getElementById(`account-${update.index}`);
  if (update.index === 1) element.hidden = update.status === 'missing';
  const email = element.querySelector('.email');
  updateStatus(element, update);
  element.title = update.status === 'ok' ? updatedLabel(update.data.updatedAt) : update.message;

  if (update.data) {
    email.textContent = update.data.email || '';
    renderLimit(element.querySelectorAll('.limit')[0], update.data.fiveHour);
    renderLimit(element.querySelectorAll('.limit')[1], update.data.weekly);
  } else if (update.status !== 'loading') {
    renderLimit(element.querySelectorAll('.limit')[0], null);
    renderLimit(element.querySelectorAll('.limit')[1], null);
  }
}

document.getElementById('refresh').addEventListener('click', () => window.widget.refresh());
document.getElementById('mode').addEventListener('click', () => window.widget.cycleMode());
document.getElementById('minimize').addEventListener('click', () => window.widget.minimize());
document.getElementById('close').addEventListener('click', () => window.widget.close());
document.getElementById('pin').addEventListener('click', event => {
  const pinned = event.currentTarget.classList.toggle('active');
  window.widget.setAlwaysOnTop(pinned);
  event.currentTarget.title = pinned ? 'Unpin window' : 'Pin above other windows';
  event.currentTarget.setAttribute('aria-pressed', String(pinned));
});
window.widget.onUpdate(renderAccount);
window.widget.onMode(value => {
  mode = value;
  document.body.classList.toggle('small', mode === 'small');
  document.body.classList.toggle('super', mode === 'super');
  document.querySelector('.title-text').textContent = mode === 'super' ? 'Codex' : 'Codex Limits';
  const button = document.getElementById('mode');
  button.classList.toggle('active', mode !== 'normal');
  button.textContent = mode === 'normal' ? '▣' : mode === 'small' ? 'S' : 'XS';
  button.title = mode === 'normal' ? 'Small view' : mode === 'small' ? 'Super small view' : 'Normal view';
  for (const update of accountStates) if (update) renderAccount(update);
});
setInterval(() => {
  for (const update of accountStates) {
    if (update?.status === 'ok') {
      updateStatus(document.getElementById(`account-${update.index}`), update);
    }
  }
  const current = accountStates.filter(update => update?.status === 'ok');
  const heartbeat = document.getElementById('heartbeat');
  if (current.length) {
    const oldest = Math.min(...current.map(update => update.data.updatedAt));
    const seconds = Math.max(0, Math.floor((Date.now() - oldest) / 1000));
    heartbeat.textContent = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
    heartbeat.title = 'Age of latest usage reading';
  } else {
    heartbeat.textContent = '…';
  }
}, 1000);
