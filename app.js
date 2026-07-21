const MODES = {
  pomodoro: { minutes: 25, label: '집중 시간', name: '집중', color: '#d9604f' },
  break: { minutes: 5, label: '휴식 시간', name: '휴식', color: '#648673' },
};

const $ = (selector) => document.querySelector(selector);

// DOM Elements Cache
const elTime = $('#time');
const elOvertime = $('#overtime');
const elOvertimeTime = $('#overtime-time');
const elDialProgress = $('#dial-progress');
const elStart = $('#start');
const elStartLabel = $('#start-label');
const elPlay = $('.play');
const elModeLabel = $('#mode-label');
const elCurrentGoal = $('#current-goal');
const elCurrentGoalName = $('#current-goal-name');
const elSessionList = $('#session-list');
const elToday = $('#today');
const elModeButtons = document.querySelectorAll('.mode');
const elCopyHistory = $('#copy-history');
const elClearHistory = $('#clear-history');
const elEmptyHistory = $('#empty-history');
const elCopyText = $('#copy-text');
const elCopyDialog = $('#copy-dialog');
const elCopyToast = $('#copy-toast');
const elGoalForm = $('#goal-form');
const elGoalInput = $('#goal-input');
const elGoalDialog = $('#goal-dialog');
const elGoalCancel = $('#goal-cancel');
const elCompletionDialog = $('#completion-dialog');
const elCompletionForm = $('#completion-form');
const elCompletionInput = $('#completion-input');
const elCompletionGoalName = $('#completion-goal-name');
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
let copyToastTimeout;
let sessionGoal = '';
let startedAt = null;
let completedAt = null;
let overtime = false;

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
  const overtimeSeconds = getOvertimeSeconds();
  elTime.value = formatDuration(remaining);
  elTime.hidden = overtime;
  elOvertime.hidden = !overtime;
  elOvertimeTime.textContent = `+${formatDuration(overtimeSeconds)}`;
  elDialProgress.style.strokeDashoffset = overtime
    ? 0
    : DIAL_CIRCUMFERENCE * (1 - remaining / total);
  elStartLabel.textContent = running ? '완료하기' : '시작하기';
  elPlay.textContent = running ? '✓' : '▶';
  elTime.readOnly = running;
  elStart.classList.toggle('running', running);
  elModeButtons.forEach((button) => {
    button.disabled = running;
  });

  const showCurrentGoal = mode === 'pomodoro' && running && Boolean(sessionGoal);
  elCurrentGoal.hidden = !showCurrentGoal;
  elCurrentGoalName.textContent = showCurrentGoal ? sessionGoal : '';

  // 집중 모드가 동작(running) 중일 때만 주변 요소 딤 처리 클래스 토글
  document.body.classList.toggle('focus-active', mode === 'pomodoro' && running);
  document.body.classList.toggle('focus-overtime', overtime);
}

function getElapsedSeconds(at = completedAt || Date.now()) {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((at - startedAt) / 1000));
}

function getOvertimeSeconds(at = completedAt || Date.now()) {
  return Math.max(0, getElapsedSeconds(at) - total);
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
          <span class="session-icon">${session.mode === 'pomodoro' ? '⏰' : '☕️'}</span>
          <span class="session-detail">
            ${session.mode === 'pomodoro'
              ? `<span class="session-entry"><span class="session-entry-label">목표</span><span class="session-entry-text">${escapeHtml(session.goal || MODES[session.mode].name)}</span></span>
                 ${session.result ? `<span class="session-entry"><span class="session-entry-label result">결과</span><span class="session-entry-text">${escapeHtml(session.result)}</span></span>` : ''}`
              : `<span class="session-name">${escapeHtml(MODES[session.mode].name)}</span>`}
          </span>
          <span class="session-time">
            ${formatDuration(session.seconds)}
            ${session.overtimeSeconds ? `<span class="session-overtime">+${formatDuration(session.overtimeSeconds)}</span>` : ''}
            · ${formatSessionTime(session.timestamp)}
          </span>
        </li>
      `,
    )
    .join('');

  const hasSessions = sessions.length > 0;
  elEmptyHistory.hidden = hasSessions;
  elClearHistory.hidden = !hasSessions;
  elCopyHistory.hidden = !hasSessions;
}

function saveSession(result = '') {
  const elapsedSeconds = getElapsedSeconds();
  if (elapsedSeconds < 1) return;

  sessions.push({
    mode,
    goal: sessionGoal,
    result,
    seconds: elapsedSeconds,
    plannedSeconds: total,
    overtimeSeconds: getOvertimeSeconds(),
    startedAt: new Date(startedAt).toISOString(),
    timestamp: new Date(completedAt || Date.now()).toISOString(),
  });

  localStorage.setItem(storageKey, JSON.stringify(sessions));
  renderHistory();
}

function setMode(nextMode) {
  if (running) return;

  mode = nextMode;
  total = MODES[mode].minutes * 60;
  remaining = total;
  sessionGoal = '';
  startedAt = null;
  completedAt = null;
  overtime = false;
  running = false;
  clearInterval(interval);

  elModeLabel.textContent = MODES[mode].label;
  document.body.className = 'theme-' + mode;
  elModeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });

  renderTimer();
}

function finish(result = '') {
  running = false;
  clearInterval(interval);
  saveSession(result);

  remaining = total;
  sessionGoal = '';
  startedAt = null;
  completedAt = null;
  overtime = false;
  document.title = 'focusflow — 세션 완료';
  renderTimer();
}

function requestFinish() {
  if (mode !== 'pomodoro') {
    finish();
    return;
  }

  completedAt = Date.now();
  running = false;
  clearInterval(interval);
  renderTimer();
  elCompletionGoalName.textContent = sessionGoal;
  elCompletionInput.value = '';
  elCompletionInput.setCustomValidity('');
  elCompletionDialog.showModal();
  setTimeout(() => elCompletionInput.focus(), 0);
}

function beginTimer() {
  startedAt = Date.now();
  completedAt = null;
  overtime = false;
  running = true;
  interval = setInterval(() => {
    const elapsedSeconds = getElapsedSeconds();

    if (elapsedSeconds >= total) {
      remaining = 0;
      if (mode === 'break') {
        completedAt = Date.now();
        finish();
        return;
      }

      overtime = true;
      renderTimer();
      return;
    }

    remaining = total - elapsedSeconds;
    renderTimer();
  }, 1000);

  renderTimer();
}

function startOrFinish() {
  if (running) {
    requestFinish();
    return;
  }

  if (mode === 'pomodoro' && !sessionGoal) {
    elGoalInput.value = '';
    elGoalDialog.showModal();
    setTimeout(() => elGoalInput.focus(), 0);
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

  const sessionBlocks = sessions.map((session) => {
    const endTime = new Date(session.timestamp);
    const startTime = new Date(endTime.getTime() - session.seconds * 1000);
    const timeRange = `${formatSessionTime(startTime)} ~ ${formatSessionTime(endTime)}`;

    if (session.mode === 'break') return `${timeRange}\n휴식`;

    return [
      timeRange,
      `목표: ${session.goal || MODES.pomodoro.name}`,
      `결과: ${session.result || ''}`,
      session.overtimeSeconds ? `추가 집중: ${formatDurationFriendly(session.overtimeSeconds)}` : '',
    ].filter(Boolean).join('\n');
  });

  const text = [
    `${todayKey} 집중 기록`,
    `총 집중 시간: ${formatDurationFriendly(focusSeconds)}`,
    '',
    sessionBlocks.join('\n\n'),
  ].join('\n');

  const showCopied = () => {
    clearTimeout(copyToastTimeout);
    elCopyToast.classList.add('visible');
    copyToastTimeout = setTimeout(() => elCopyToast.classList.remove('visible'), 2200);
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
  sessionGoal = '';
  startedAt = null;
  completedAt = null;
  overtime = false;
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

  elGoalForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sessionGoal = elGoalInput.value.trim() || MODES['pomodoro'].name;
    elGoalDialog.close();
    beginTimer();
  });

  elGoalCancel.onclick = () => elGoalDialog.close();
  elCompletionDialog.addEventListener('cancel', (event) => event.preventDefault());
  elCompletionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = elCompletionInput.value.trim();
    if (!result) {
      elCompletionInput.setCustomValidity('실제로 완료한 일을 입력해 주세요.');
      elCompletionInput.reportValidity();
      return;
    }

    elCompletionInput.setCustomValidity('');
    elCompletionDialog.close();
    finish(result);
  });
  elCompletionInput.addEventListener('input', () => elCompletionInput.setCustomValidity(''));
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
