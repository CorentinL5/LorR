const teacherSearch = document.getElementById('teacher-search');
const teacherStatus = document.getElementById('teacher-search-status');
const teacherButton = teacherSearch.querySelector('button');
const teacherResults = document.getElementById('teacher-result-area');
const calendarPanel = document.getElementById('teacher-calendar');
const calendarTitle = document.getElementById('teacher-calendar-title');
const scheduleSelect = document.getElementById('teacher-match');
const noSessions = document.getElementById('teacher-no-sessions');
const teacherCourseKey = event => JSON.stringify([event.subject, event.type]);
const teacherView = createPlanningView(document.getElementById('planning-days'), (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
}, teacherCourseKey, () => {});
let teacherSchedules = [];

function showTeacherSchedule() {
    const data = document.getElementById('teacher-schedules');
    const schedule = teacherSchedules[Number(scheduleSelect.value)];
    const events = schedule.events.map(event => ({formation: '', url: data.dataset.url, ...event}));
    const sessions = uniqueSessions(events, teacherCourseKey);
    calendarTitle.textContent = schedule.name + ' · ' + data.dataset.school;
    noSessions.hidden = sessions.length > 0;
    document.getElementById('open-today').hidden = !sessions.length;
    teacherView.show(sessions, data.dataset.complete === '1');
}

function renderTeacherResults(result) {
    const data = result.querySelector('#teacher-schedules');
    teacherSchedules = data ? JSON.parse(data.textContent) : [];
    teacherResults.replaceChildren(result);
    scheduleSelect.replaceChildren(...teacherSchedules.map((schedule, index) => new Option(schedule.name, index)));
    document.getElementById('teacher-matches').hidden = teacherSchedules.length < 2;
    calendarPanel.hidden = !teacherSchedules.length;
    if (teacherSchedules.length) showTeacherSchedule();
    return teacherSchedules.length ? calendarTitle : result.querySelector('#teacher-results');
}

scheduleSelect.addEventListener('change', showTeacherSchedule);

teacherSearch.addEventListener('submit', async event => {
    event.preventDefault();
    if (teacherButton.disabled) return;
    teacherButton.disabled = true;
    teacherResults.setAttribute('aria-busy', 'true');
    teacherStatus.textContent = 'Recherche des horaires…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(teacherSearch.action, {
            method: 'POST',
            body: new URLSearchParams(new FormData(teacherSearch)),
            signal: controller.signal,
        });
        if (!response.ok) throw new Error('Recherche indisponible');
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        const result = html.getElementById('teacher-result-area')?.firstElementChild;
        if (!result) throw new Error('Résultats indisponibles');
        const heading = renderTeacherResults(result);
        teacherStatus.textContent = '';
        heading.focus();
    } catch {
        teacherStatus.textContent = 'La recherche est indisponible. Réessaie dans un instant.';
    } finally {
        clearTimeout(timeout);
        teacherResults.removeAttribute('aria-busy');
        teacherButton.disabled = false;
    }
});

if (teacherResults.firstElementChild) renderTeacherResults(teacherResults.firstElementChild);
