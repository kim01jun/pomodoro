const MODES = {
  pomodoro: { minutes: 25, label: '집중 시간', name: '집중', color: '#d9604f' },
  break: { minutes: 5, label: '휴식 시간', name: '휴식', color: '#648673' },
};

const $ = (selector) => document.querySelector(selector);
const storageKey = 'focusflow-sessions';
const maxDurationSeconds = 99 * 60 + 59;

let mode = 'pomodoro';
let total = 25 * 60;
let remaining = total;
let running = false;
let interval;
let sessionTask = '';

function todayKey() {
  return new Date().toLocaleDateString('sv-SE');
}

function displayDate() {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

// Today's session history is kept only in this browser.
const sessions = JSON.parse(localStorage.getItem(storageKey) || '[]')
  .filter((session) => session.date === todayKey())
  .map((session) => ({
    ...session,
    // Older records used minutes, so preserve those too.
    seconds: session.seconds ?? (session.minutes || 0) * 60,
  }));

function renderTimer() {
  $('#time').value = formatDuration(remaining);
  $('#dial-progress').style.strokeDashoffset = 829.38 * (1 - remaining / total);
  $('#start-label').textContent = running ? '완료하기' : '시작하기';
  $('.play').textContent = running ? '✓' : '▶';
  $('#time').readOnly = running;
  $('#start').classList.toggle('running', running);
  document.querySelectorAll('.mode').forEach((button) => {
    button.disabled = running;
  });
}

function renderHistory() {
  const focusSeconds = sessions
    .filter((session) => session.mode === 'pomodoro')
    .reduce((sum, session) => sum + session.seconds, 0);

  $('#focus-total').textContent = Math.floor(focusSeconds / 60);

  $('#session-list').innerHTML = sessions
    .slice()
    .reverse()
    .map(
      (session) => `
        <li class="session ${session.mode === 'pomodoro' ? '' : 'break'}">
          <span class="session-icon">${session.mode === 'pomodoro' ? '●' : '☕'}</span>
          <span class="session-detail">
            <span class="session-name">${escapeHtml(session.name)}</span>
            ${session.task ? `<span class="session-task">${escapeHtml(session.task)}</span>` : ''}
          </span>
          <span class="session-time">${formatDuration(session.seconds)} · ${session.time}</span>
        </li>
      `,
    )
    .join('');

  const hasSessions = sessions.length > 0;
  $('#empty-history').hidden = hasSessions;
  $('#clear-history').hidden = !hasSessions;
  $('#copy-history').hidden = !hasSessions;
}

function saveSession() {
  const elapsedSeconds = total - remaining;
  if (elapsedSeconds < 1) return;

  const now = new Date();
  sessions.push({
    date: todayKey(),
    mode,
    name: MODES[mode].name,
    task: sessionTask,
    seconds: elapsedSeconds,
    time: now.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
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

  $('#mode-label').textContent = MODES[mode].label;
  document.body.className = 'theme-' + mode;
  document.querySelectorAll('.mode').forEach((button) => {
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
    $('#task-input').value = '';
    $('#task-dialog').showModal();
    setTimeout(() => $('#task-input').focus(), 0);
    return;
  }

  beginTimer();
}

function copyHistory() {
  const focusSeconds = sessions
    .filter((session) => session.mode === 'pomodoro')
    .reduce((sum, session) => sum + session.seconds, 0);

  const text = [
    `오늘의 집중 기록 (${displayDate()})`,
    `총 집중 시간: ${formatDuration(focusSeconds)}`,
    '',
    ...sessions.map(
      (session) =>
        `- ${session.time} · ${session.name} ${formatDuration(session.seconds)}${session.task ? ` · ${session.task}` : ''}`,
    ),
  ].join('\n');

  const copyButton = $('#copy-history');
  const showCopied = () => {
    const originalLabel = copyButton.textContent;
    copyButton.textContent = '복사됨';
    setTimeout(() => {
      copyButton.textContent = originalLabel;
    }, 1500);
  };

  const showCopyDialog = () => {
    $('#copy-text').value = text;
    $('#copy-dialog').showModal();
    setTimeout(() => $('#copy-text').select(), 0);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(showCopied).catch(showCopyDialog);
  } else {
    showCopyDialog();
  }
}

function applyTimeInput() {
  if (running) return;

  const input = $('#time');
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

$('#start').onclick = startOrFinish;

document.querySelectorAll('.mode').forEach((button) => {
  button.onclick = () => setMode(button.dataset.mode);
});

$('#time').addEventListener('change', applyTimeInput);
$('#time').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    applyTimeInput();
    $('#time').blur();
  }
});

$('#task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  sessionTask = $('#task-input').value.trim() || '이름 없는 집중';
  $('#task-dialog').close();
  beginTimer();
});

$('#task-cancel').onclick = () => $('#task-dialog').close();
$('#clear-history').onclick = () => {
  sessions.length = 0;
  localStorage.removeItem(storageKey);
  renderHistory();
};
$('#copy-history').onclick = copyHistory;

$('#today').textContent = displayDate();
document.body.className = 'theme-' + mode;
renderTimer();
renderHistory();
