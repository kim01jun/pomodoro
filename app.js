const MODES = {
  pomodoro: { minutes: 25, label: '집중 시간', name: '집중', color: '#d9604f' },
  break: { minutes: 5, label: '휴식 시간', name: '휴식', color: '#648673' },
};

const $ = (selector) => document.querySelector(selector);

// DOM Elements Cache
const elTime = $('#time');
const elDialProgress = $('#dial-progress');
const elStart = $('#start');
const elStartLabel = $('#start-label');
const elPlay = $('.play');
const elModeLabel = $('#mode-label');
const elSessionList = $('#session-list');
const elToday = $('#today');
const elModeButtons = document.querySelectorAll('.mode');
const elCopyHistory = $('#copy-history');
const elClearHistory = $('#clear-history');
const elEmptyHistory = $('#empty-history');
const elCopyText = $('#copy-text');
const elCopyDialog = $('#copy-dialog');
const elTaskForm = $('#task-form');
const elTaskInput = $('#task-input');
const elTaskDialog = $('#task-dialog');
const elTaskCancel = $('#task-cancel');
const elFocusTotalMin = $('#focus-total-min');
const elFocusTotalSec = $('#focus-total-sec');

const storageKey = 'focusflow-sessions-v2';
const oldStorageKey = 'focusflow-sessions';
if (localStorage.getItem(oldStorageKey)) {
  localStorage.removeItem(oldStorageKey);
}

const DIAL_CIRCUMFERENCE = 829.38; // 2 * PI * r (r = 132)
const maxDurationSeconds = 99 * 60 + 59;

let mode = 'pomodoro';
let total = 25 * 60;
let remaining = total;
let running = false;
let interval;
let sessionTask = '';

const todayKey = new Date().toISOString().slice(0, 10);

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatSessionTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

// Today's session history is kept only in this browser.
const sessions = JSON.parse(localStorage.getItem(storageKey) || '[]')
  .filter((session) => session.timestamp && session.timestamp.slice(0, 10) === todayKey);

function renderTimer() {
  elTime.value = formatDuration(remaining);
  elDialProgress.style.strokeDashoffset = DIAL_CIRCUMFERENCE * (1 - remaining / total);
  elStartLabel.textContent = running ? '완료하기' : '시작하기';
  elPlay.textContent = running ? '✓' : '▶';
  elTime.readOnly = running;
  elStart.classList.toggle('running', running);
  elModeButtons.forEach((button) => {
    button.disabled = running;
  });
}

function renderHistory() {
  const focusSeconds = sessions
    .filter((session) => session.mode === 'pomodoro')
    .reduce((sum, session) => sum + session.seconds, 0);

  const minutes = Math.floor(focusSeconds / 60);
  const seconds = focusSeconds % 60;
  elFocusTotalMin.textContent = minutes;
  elFocusTotalSec.textContent = seconds;

  elSessionList.innerHTML = sessions
    .slice()
    .reverse()
    .map(
      (session) => `
        <li class="session ${session.mode === 'pomodoro' ? '' : 'break'}">
          <span class="session-icon">${session.mode === 'pomodoro' ? '●' : '☕'}</span>
          <span class="session-detail">
            <span class="session-name">${escapeHtml(MODES[session.mode].name)}</span>
            ${session.task ? `<span class="session-task">${escapeHtml(session.task)}</span>` : ''}
          </span>
          <span class="session-time">${formatDuration(session.seconds)} · ${formatSessionTime(session.timestamp)}</span>
        </li>
      `,
    )
    .join('');

  const hasSessions = sessions.length > 0;
  elEmptyHistory.hidden = hasSessions;
  elClearHistory.hidden = !hasSessions;
  elCopyHistory.hidden = !hasSessions;
}

function saveSession() {
  const elapsedSeconds = total - remaining;
  if (elapsedSeconds < 1) return;

  sessions.push({
    mode,
    task: sessionTask,
    seconds: elapsedSeconds,
    timestamp: new Date().toISOString(),
  });

  localStorage.setItem(storageKey, JSON.stringify(sessions));
  renderHistory();
}

function setMode(nextMode) {
  if (running) return;

  mode = nextMode;
  total = MODES[mode].minutes * 60;
  remaining = total;
  sessionTask = '';
  running = false;
  clearInterval(interval);

  elModeLabel.textContent = MODES[mode].label;
  document.body.className = 'theme-' + mode;
  elModeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });

  renderTimer();
}

function finish() {
  running = false;
  clearInterval(interval);
  saveSession();

  remaining = total;
  sessionTask = '';
  document.title = 'focusflow — 세션 완료';
  renderTimer();
}

function beginTimer() {
  running = true;
  interval = setInterval(() => {
    if (remaining <= 1) {
      remaining = 0;
      finish();
      return;
    }

    remaining -= 1;
    renderTimer();
  }, 1000);

  renderTimer();
}

function startOrFinish() {
  if (running) {
    finish();
    return;
  }

  if (mode === 'pomodoro' && !sessionTask) {
    elTaskInput.value = '';
    elTaskDialog.showModal();
    setTimeout(() => elTaskInput.focus(), 0);
    return;
  }

  beginTimer();
}

function formatDurationFriendly(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  let result = [];
  if (hours > 0) result.push(`${hours}시간`);
  if (minutes > 0 || (hours === 0 && remainder === 0)) result.push(`${minutes}분`);
  if (remainder > 0) result.push(`${remainder}초`);

  return result.join(' ');
}

function copyHistory() {
  const focusSeconds = sessions
    .filter((session) => session.mode === 'pomodoro')
    .reduce((sum, session) => sum + session.seconds, 0);

  const text = [
    `${todayKey} 집중 기록`,
    `총 집중 시간: ${formatDurationFriendly(focusSeconds)}`,
    '',
    ...sessions.map((session) => {
      const defaultName = MODES[session.mode].name;
      const name = session.mode === 'pomodoro' ? (session.task || defaultName) : defaultName;
      return `${formatSessionTime(session.timestamp)} - ${name} ${formatDurationFriendly(session.seconds)}`;
    }),
  ].join('\n');

  const copyButton = elCopyHistory;
  const showCopied = () => {
    const originalLabel = copyButton.textContent;
    copyButton.textContent = '복사됨';
    setTimeout(() => {
      copyButton.textContent = originalLabel;
    }, 1500);
  };

  const showCopyDialog = () => {
    elCopyText.value = text;
    elCopyDialog.showModal();
    setTimeout(() => elCopyText.select(), 0);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(showCopied).catch(showCopyDialog);
  } else {
    showCopyDialog();
  }
}

function applyTimeInput() {
  if (running) return;

  const input = elTime;
  const match = input.value.trim().match(/^(\d+)(?::(\d+))?$/);

  if (!match) {
    renderTimer();
    return;
  }

  const inputSeconds = Number(match[1]) * 60 + Number(match[2] || 0);
  const duration = Math.min(maxDurationSeconds, inputSeconds);

  if (duration < 1) {
    renderTimer();
    return;
  }

  running = false;
  clearInterval(interval);
  total = duration;
  remaining = duration;
  sessionTask = '';
  renderTimer();
}

function init() {
  elStart.onclick = startOrFinish;

  elModeButtons.forEach((button) => {
    button.onclick = () => setMode(button.dataset.mode);
  });

  elTime.addEventListener('change', applyTimeInput);
  elTime.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyTimeInput();
      elTime.blur();
    }
  });

  elTaskForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sessionTask = elTaskInput.value.trim() || '집중 시간';
    elTaskDialog.close();
    beginTimer();
  });

  elTaskCancel.onclick = () => elTaskDialog.close();
  elClearHistory.onclick = () => {
    sessions.length = 0;
    localStorage.removeItem(storageKey);
    renderHistory();
  };
  elCopyHistory.onclick = copyHistory;

  elToday.textContent = todayKey;
  document.body.className = 'theme-' + mode;
  renderTimer();
  renderHistory();
}

init();
