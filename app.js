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
const elEditSessionDialog = $('#edit-session-dialog');
const elEditSessionForm = $('#edit-session-form');
const elEditGoalInput = $('#edit-goal-input');
const elEditResultInput = $('#edit-result-input');
const elEditSessionCancel = $('#edit-session-cancel');
const elDeleteSessionDialog = $('#delete-session-dialog');
const elDeleteSessionForm = $('#delete-session-form');
const elDeleteSessionName = $('#delete-session-name');
const elDeleteSessionCancel = $('#delete-session-cancel');
const elFocusTotalMin = $('#focus-total-min');
const elFocusTotalSec = $('#focus-total-sec');

const storageKey = 'focusflow-sessions-v3';

const DIAL_CIRCUMFERENCE = 829.38; // 2 * PI * r (r = 132)
const maxDurationSeconds = 99 * 60 + 59;

const timerState = {
  mode: 'pomodoro',
  total: MODES.pomodoro.minutes * 60,
  remaining: MODES.pomodoro.minutes * 60,
  running: false,
  interval: null,
  sessionGoal: '',
  startedAt: null,
  endedAt: null,
  overtime: false,
};

let copyToastTimeout;
let editingSessionIndex = null;
let deletingSessionIndex = null;

const todayKey = new Date().toISOString().slice(0, 10);

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatSessionTime(timestamp, includeSeconds = false) {
  return new Date(timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds && { second: '2-digit' }),
    hour12: false,
  });
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

function getSessionSeconds(session) {
  const startedAt = new Date(session.startedAt).getTime();
  const endedAt = new Date(session.endedAt).getTime();
  return Math.max(0, Math.floor((endedAt - startedAt) / 1000));
}

function getSessionOvertimeSeconds(session) {
  return Math.max(0, getSessionSeconds(session) - session.plannedSeconds);
}

// Today's session history is kept only in this browser.
const sessions = JSON.parse(localStorage.getItem(storageKey) || '[]')
  .filter((session) => session.endedAt)
  .filter((session) => session.endedAt.slice(0, 10) === todayKey);

function renderTimer() {
  const overtimeSeconds = getOvertimeSeconds();
  elTime.value = formatDuration(timerState.remaining);
  elTime.hidden = timerState.overtime;
  elOvertime.hidden = !timerState.overtime;
  elOvertimeTime.textContent = `+${formatDuration(overtimeSeconds)}`;
  elDialProgress.style.strokeDashoffset = timerState.overtime
    ? 0
    : DIAL_CIRCUMFERENCE * (1 - timerState.remaining / timerState.total);
  elStartLabel.textContent = timerState.running ? '완료하기' : '시작하기';
  elPlay.textContent = timerState.running ? '✓' : '▶';
  elTime.readOnly = timerState.running;
  elStart.classList.toggle('running', timerState.running);
  elModeButtons.forEach((button) => {
    button.disabled = timerState.running;
  });

  const showCurrentGoal = timerState.mode === 'pomodoro' && timerState.running && Boolean(timerState.sessionGoal);
  elCurrentGoal.hidden = !showCurrentGoal;
  elCurrentGoalName.textContent = showCurrentGoal ? timerState.sessionGoal : '';

  // 집중 모드가 동작(running) 중일 때만 주변 요소 딤 처리 클래스 토글
  document.body.classList.toggle('focus-active', timerState.mode === 'pomodoro' && timerState.running);
  document.body.classList.toggle('focus-overtime', timerState.overtime);
}

function getElapsedSeconds(at = timerState.endedAt || Date.now()) {
  if (!timerState.startedAt) return 0;
  return Math.max(0, Math.floor((at - timerState.startedAt) / 1000));
}

function getOvertimeSeconds(at = timerState.endedAt || Date.now()) {
  return Math.max(0, getElapsedSeconds(at) - timerState.total);
}

function renderHistory() {
  const focusSeconds = sessions
    .filter((session) => session.mode === 'pomodoro')
    .reduce((sum, session) => sum + getSessionSeconds(session), 0);

  const minutes = Math.floor(focusSeconds / 60);
  const seconds = focusSeconds % 60;
  elFocusTotalMin.textContent = minutes;
  elFocusTotalSec.textContent = seconds;

  elSessionList.innerHTML = sessions
    .slice()
    .reverse()
    .map((session, reversedIndex) => {
      const overtimeSeconds = getSessionOvertimeSeconds(session);
      const sessionIndex = sessions.length - 1 - reversedIndex;

      return `
        <li class="session ${session.mode === 'pomodoro' ? '' : 'break'}">
          <span class="session-icon">${session.mode === 'pomodoro' ? '⏰' : '☕️'}</span>
          <span class="session-detail">
            ${session.mode === 'pomodoro'
              ? `<span class="session-entry"><span class="session-entry-label">목표</span><span class="session-entry-text">${escapeHtml(session.goal || MODES[session.mode].name)}</span></span>
                 ${session.result ? `<span class="session-entry"><span class="session-entry-label result">결과</span><span class="session-entry-text">${escapeHtml(session.result)}</span></span>` : ''}`
              : `<span class="session-name">${escapeHtml(MODES[session.mode].name)}</span>`}
          </span>
          <span class="session-time">
            ${formatDuration(session.plannedSeconds)}
            ${overtimeSeconds ? `<span class="session-overtime">+${formatDuration(overtimeSeconds)}</span>` : ''}
            · ${formatSessionTime(session.endedAt)}
          </span>
          <span class="session-actions">
            ${session.mode === 'pomodoro' ? `<button class="session-action session-edit" type="button" data-session-index="${sessionIndex}" aria-label="${escapeHtml(session.goal || MODES.pomodoro.name)} 기록 수정">수정</button>` : ''}
            <button class="session-action session-delete" type="button" data-session-index="${sessionIndex}" aria-label="${escapeHtml(session.goal || MODES[session.mode].name)} 기록 삭제">삭제</button>
          </span>
        </li>
      `;
    })
    .join('');

  const hasSessions = sessions.length > 0;
  elEmptyHistory.hidden = hasSessions;
  elClearHistory.hidden = !hasSessions;
  elCopyHistory.hidden = !hasSessions;
}

function openSessionEditor(sessionIndex) {
  const session = sessions[sessionIndex];
  if (!session || session.mode !== 'pomodoro') return;

  editingSessionIndex = sessionIndex;
  elEditGoalInput.value = session.goal || MODES.pomodoro.name;
  elEditResultInput.value = session.result || '';
  elEditSessionDialog.showModal();
  setTimeout(() => {
    elEditGoalInput.focus();
    elEditGoalInput.select();
  }, 0);
}

function closeSessionEditor() {
  editingSessionIndex = null;
  elEditSessionForm.reset();
  elEditSessionDialog.close();
}

function deleteSession(sessionIndex) {
  const session = sessions[sessionIndex];
  if (!session) return;

  deletingSessionIndex = sessionIndex;
  elDeleteSessionName.textContent = session.goal || MODES[session.mode].name;
  elDeleteSessionDialog.showModal();
  setTimeout(() => elDeleteSessionCancel.focus(), 0);
}

function closeDeleteSessionDialog() {
  deletingSessionIndex = null;
  elDeleteSessionDialog.close();
}

function confirmDeleteSession() {
  if (!sessions[deletingSessionIndex]) {
    closeDeleteSessionDialog();
    return;
  }

  sessions.splice(deletingSessionIndex, 1);
  if (sessions.length > 0) {
    localStorage.setItem(storageKey, JSON.stringify(sessions));
  } else {
    localStorage.removeItem(storageKey);
  }
  closeDeleteSessionDialog();
  renderHistory();
}

function saveSession(result = '') {
  const elapsedSeconds = getElapsedSeconds();
  if (elapsedSeconds < 1) return;

  sessions.push({
    mode: timerState.mode,
    goal: timerState.sessionGoal,
    result,
    plannedSeconds: timerState.total,
    startedAt: new Date(timerState.startedAt).toISOString(),
    endedAt: new Date(timerState.endedAt || Date.now()).toISOString(),
  });

  localStorage.setItem(storageKey, JSON.stringify(sessions));
  renderHistory();
}

function setMode(nextMode) {
  if (timerState.running) return;

  timerState.mode = nextMode;
  timerState.total = MODES[timerState.mode].minutes * 60;
  timerState.remaining = timerState.total;
  timerState.sessionGoal = '';
  timerState.startedAt = null;
  timerState.endedAt = null;
  timerState.overtime = false;
  timerState.running = false;
  clearInterval(timerState.interval);

  elModeLabel.textContent = MODES[timerState.mode].label;
  document.body.className = 'theme-' + timerState.mode;
  elModeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === timerState.mode);
  });

  renderTimer();
}

function finish(result = '') {
  timerState.running = false;
  clearInterval(timerState.interval);
  saveSession(result);

  timerState.remaining = timerState.total;
  timerState.sessionGoal = '';
  timerState.startedAt = null;
  timerState.endedAt = null;
  timerState.overtime = false;
  document.title = 'focusflow — 세션 완료';
  renderTimer();
}

function requestFinish() {
  if (timerState.mode !== 'pomodoro') {
    finish();
    return;
  }

  timerState.endedAt = Date.now();
  timerState.running = false;
  clearInterval(timerState.interval);
  renderTimer();
  elCompletionGoalName.textContent = timerState.sessionGoal;
  elCompletionInput.value = '';
  elCompletionInput.setCustomValidity('');
  elCompletionDialog.showModal();
  setTimeout(() => elCompletionInput.focus(), 0);
}

function beginTimer() {
  timerState.startedAt = Date.now();
  timerState.endedAt = null;
  timerState.overtime = false;
  timerState.running = true;
  timerState.interval = setInterval(() => {
    const elapsedSeconds = getElapsedSeconds();

    if (elapsedSeconds >= timerState.total) {
      timerState.remaining = 0;
      if (timerState.mode === 'break') {
        timerState.endedAt = Date.now();
        finish();
        return;
      }

      timerState.overtime = true;
      renderTimer();
      return;
    }

    timerState.remaining = timerState.total - elapsedSeconds;
    renderTimer();
  }, 1000);

  renderTimer();
}

function startOrFinish() {
  if (timerState.running) {
    requestFinish();
    return;
  }

  if (timerState.mode === 'pomodoro' && !timerState.sessionGoal) {
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
    .reduce((sum, session) => sum + getSessionSeconds(session), 0);

  const sessionBlocks = sessions.map((session) => {
    const timeRange = `${formatSessionTime(session.startedAt, true)} ~ ${formatSessionTime(session.endedAt, true)}`;

    if (session.mode === 'break') return `${timeRange}\n휴식`;

    return [
      timeRange,
      `목표: ${session.goal || MODES.pomodoro.name}`,
      `결과: ${session.result || ''}`,
      `계획 시간: ${formatDurationFriendly(session.plannedSeconds)}`,
      `실제 시간: ${formatDurationFriendly(getSessionSeconds(session))}`,
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
  if (timerState.running) return;

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

  timerState.running = false;
  clearInterval(timerState.interval);
  timerState.total = duration;
  timerState.remaining = duration;
  timerState.sessionGoal = '';
  timerState.startedAt = null;
  timerState.endedAt = null;
  timerState.overtime = false;
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
    timerState.sessionGoal = elGoalInput.value.trim() || MODES.pomodoro.name;
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
  elSessionList.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('.session-delete');
    if (deleteButton) {
      deleteSession(Number(deleteButton.dataset.sessionIndex));
      return;
    }

    const editButton = event.target.closest('.session-edit');
    if (!editButton) return;
    openSessionEditor(Number(editButton.dataset.sessionIndex));
  });
  elEditSessionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const session = sessions[editingSessionIndex];
    if (!session || session.mode !== 'pomodoro') {
      closeSessionEditor();
      return;
    }

    session.goal = elEditGoalInput.value.trim();
    session.result = elEditResultInput.value.trim();
    localStorage.setItem(storageKey, JSON.stringify(sessions));
    closeSessionEditor();
    renderHistory();
  });
  elEditSessionCancel.onclick = closeSessionEditor;
  elDeleteSessionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    confirmDeleteSession();
  });
  elDeleteSessionCancel.onclick = closeDeleteSessionDialog;
  elDeleteSessionDialog.addEventListener('cancel', () => {
    deletingSessionIndex = null;
  });
  elClearHistory.onclick = () => {
    sessions.length = 0;
    localStorage.removeItem(storageKey);
    renderHistory();
  };
  elCopyHistory.onclick = copyHistory;

  elToday.textContent = todayKey;
  document.body.className = 'theme-' + timerState.mode;
  renderTimer();
  renderHistory();
}

init();
