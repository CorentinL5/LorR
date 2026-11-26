const sourceForm = document.getElementById('source-form');
const sourceInput = document.getElementById('source-url');
const sourceSubmit = sourceForm.querySelector('button[type="submit"]');
const sourceError = document.getElementById('source-error');
const sourceShortcuts = [...sourceForm.querySelectorAll('[data-source-url]')];
const formationPanel = document.getElementById('formation-panel');
const formationList = document.getElementById('formations');
const formationFilter = document.getElementById('formation-filter');
const formationResults = document.getElementById('formation-results');
const selectedFormationList = document.getElementById('selected-formations');
const visibleFormationInputs = new Map();
let renderedFormationSelection;
const formationCount = document.getElementById('formation-count');
const loadButton = document.getElementById('load-planning');
const connectionMessage = document.getElementById('planning-connection');
const subscriptionNote = document.getElementById('ical-note');
const statusMessage = document.getElementById('planning-status');
const scheduleRecovery = document.getElementById('schedule-recovery');
const scheduleRecoveryList = document.getElementById('schedule-recovery-list');
const retryButton = document.getElementById('retry-planning');
const loadingPanel = document.getElementById('loading-panel');
const loadingTitle = document.getElementById('loading-title');
const loadingDetail = document.getElementById('loading-detail');
const loadingProgress = document.getElementById('loading-progress');
const loadingPercent = document.getElementById('loading-percent');
const maximumProgressPause = 2800;
const courseCount = document.getElementById('course-count');
const courseList = document.getElementById('planning-courses');
const courseActions = document.getElementById('course-actions');
const courseRole = document.getElementById('course-role');
const teacherFormationHint = document.getElementById('teacher-formation-hint');
const teacherFilter = document.getElementById('course-teacher-filter');
const teacherSelect = document.getElementById('course-teacher');
const manualTeacherSelection = '\u0000';
const courseFilter = document.getElementById('course-filter');
const reviewCourses = document.getElementById('review-courses');
const checkCourses = document.getElementById('check-courses');
const courseGroupFilter = document.getElementById('course-group-filter');
const courseGroupChoices = document.getElementById('course-group-choices');
const toggleAllCourseGroups = document.getElementById('toggle-all-course-groups');
const courseTools = document.getElementById('course-tools');
const noticePanel = document.getElementById('calendar-notices');
const noticeCount = document.getElementById('notice-count');
const noticeChoices = document.getElementById('notice-choices');
const createButton = document.getElementById('create-planning');
const changesPanel = document.getElementById('schedule-changes');
const changesTitle = document.getElementById('schedule-changes-title');
const changesList = document.getElementById('schedule-changes-list');
const clearChanges = document.getElementById('clear-schedule-changes');
const changesStorageKey = 'lorr-schedule-changes';
const changeDay = new Intl.DateTimeFormat('fr-BE', {dateStyle: 'full', timeZone: 'UTC'});
const localScheduleDay = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Brussels'});
const changeRetention = 14 * 86400;
const scheduleCount = document.getElementById('schedule-count');
const scheduleFreshness = document.getElementById('schedule-freshness');
const scheduleFreshnessLabel = document.getElementById('schedule-freshness-label');
const scheduleFetchedAt = document.getElementById('schedule-fetched-at');
const stepIndicators = document.querySelectorAll('.steps li');
const stepButtons = document.querySelectorAll('.steps [data-step]');
const stepPanels = ['link-step', 'formation-step', 'course-panel', 'my-planning'].map(id => document.getElementById(id));
const dayList = document.getElementById('planning-days');
const copyButton = document.getElementById('copy-planning');
const subscriptionButton = document.getElementById('copy-calendar-subscription');
const sharePlanning = document.getElementById('share-planning');
const saveButton = document.getElementById('save-planning');
const exportButton = document.getElementById('export-planning');
const refreshPlanningButton = document.getElementById('refresh-planning');
const icsWarning = document.getElementById('ics-warning');
const laterNoticesOption = document.getElementById('include-later-notices');
const linkStatus = document.getElementById('link-status');
const linkFallback = document.getElementById('link-fallback');
const linkInput = document.getElementById('planning-address');
const linkLabel = linkFallback.querySelector('label');
const completedEditKey = 'lorr-edit-completed-planning';
const alphabetic = new Intl.Collator('fr-BE', {numeric: true});
const noticeDate = new Intl.DateTimeFormat('fr-BE', {dateStyle: 'medium', timeZone: 'UTC'});
const scheduleFetchDate = new Intl.DateTimeFormat('fr-BE', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Brussels',
});
const planningView = createPlanningView(dayList, element, courseKey, recordCourseClick);

let sources;
let selections;
let selectedCourses;
let selectedCourseGroups;
let showAllCourseGroups;
let teacherChoice = '';
let reviewSelectedCourses = false;
let courseBrowseQuery = '';
let hiddenNotices;
let includeLaterNotices;
let legacyHiddenCourses;
let activeRequest;
let scheduleRequest;
let requestLocksControls = false;
let lastLoadingPercent = -1;
let progressPauseTimer;
let interruptedNavigation = false;
let created = false;
let viewingCompleted = false;
let usingLocalChoices = false;
let draftStep = 1;
let step = 1;
let loadedFormations = '';
let failedFormations = [];
let events = [];
let displayedSchedules = new Map();
const storedChanges = readPlanningPersonal(changesStorageKey);
let scheduleChanges = Array.isArray(storedChanges) ? storedChanges : [];
let renderedChanges;
let courses = [];
let shownCourses = [];
let subjectGroups = [];
let notices = new Map();
let planningLinkRevision = 0;
let planningRestoreRevision = 0;
let planningRestoreTimer;
let portablePlanningLink = '';

function selectionKey(url, formation) {
    return JSON.stringify([url, formation]);
}

function courseKey(event) {
    return JSON.stringify([event.url, event.formation, event.group, event.subject, event.type]);
}

function courseGroupKey(url, formation, name) {
    return JSON.stringify([url, formation, choiceText(cleanCourseGroupName(name))]);
}

function loadLocalChoices(startNew, openCompleted = false, resumeCompletedEdit = false) {
    try {
        const current = readPlanningPersonal(planningDraftKey);
        const completed = readPlanningPersonal(planningCompletedKey);
        if (startNew && !completed && current?.created !== false && current?.selectedCourses?.length) {
            try {
                localStorage.setItem(planningCompletedKey, JSON.stringify(current));
            } catch {
                // The active selection still works when storage is unavailable.
            }
        }
        let completedEdit;
        if (openCompleted) {
            try {
                if (resumeCompletedEdit) {
                    completedEdit = JSON.parse(sessionStorage.getItem(completedEditKey));
                } else {
                    sessionStorage.removeItem(completedEditKey);
                }
            } catch {
                // The last completed planning is still available.
            }
        }
        const hasDraft = current && !(current.created ?? current.selectedCourses?.length);
        let saved = null;
        if (!startNew) {
            saved = hasDraft && !openCompleted ? current : (completedEdit ?? completed ?? current);
        }
        draftStep = [1, 2, 3].includes(saved?.step) ? saved.step : (saved?.formations?.length ? 3 : 2);
        sources = new Map(saved?.sources);
        selections = new Map(saved?.formations);
        selectedCourses = new Set(saved?.selectedCourses);
        selectedCourseGroups = new Set((saved?.courseGroups ?? []).map(key => {
            const [url, formation, name] = JSON.parse(key);
            return courseGroupKey(url, formation, name);
        }));
        showAllCourseGroups = saved?.showAllCourseGroups === true;
        const teacherEntry = startNew && new URLSearchParams(location.search).get('profil') === 'enseignant';
        courseRole.value = teacherEntry || saved?.role === 'teacher' ? 'teacher' : 'student';
        teacherChoice = typeof saved?.teacherChoice === 'string' ? saved.teacherChoice : '';
        hiddenNotices = new Set(saved?.hiddenNotices);
        includeLaterNotices = saved?.includeLaterNotices === true;
        created = saved?.created ?? (selectedCourses.size > 0);
        legacyHiddenCourses = selections.size && !saved?.selectedCourses && Array.isArray(saved?.hiddenCourses)
            ? new Set(saved.hiddenCourses)
            : null;
    } catch {
        sources = new Map();
        selections = new Map();
        selectedCourses = new Set();
        selectedCourseGroups = new Set();
        showAllCourseGroups = false;
        courseRole.value = 'student';
        teacherChoice = '';
        hiddenNotices = new Set();
        includeLaterNotices = false;
        legacyHiddenCourses = null;
        created = false;
        draftStep = 1;
    }
}

function saveChoices() {
    try {
        const state = JSON.stringify({
            created,
            step,
            sources: [...sources],
            formations: [...selections],
            selectedCourses: legacyHiddenCourses ? undefined : [...selectedCourses],
            courseGroups: [...selectedCourseGroups],
            showAllCourseGroups,
            role: courseRole.value,
            teacherChoice,
            hiddenNotices: [...hiddenNotices],
            includeLaterNotices,
            hiddenCourses: legacyHiddenCourses ? [...legacyHiddenCourses] : undefined,
        });
        if (created && selectedCourses.size && !legacyHiddenCourses) {
            localStorage.setItem(planningCompletedKey, state);
        }
        if (viewingCompleted) {
            if (created) {
                sessionStorage.removeItem(completedEditKey);
            } else {
                sessionStorage.setItem(completedEditKey, state);
            }
        } else {
            localStorage.setItem(planningDraftKey, state);
        }
    } catch {
        // The URL and the open page work when storage is unavailable.
    }
    updatePlanningLink();
}

function readPlanningState(state) {
    if (!Array.isArray(state) || state.length < 3 || state.length > 5 || (state.length === 5 && state[4] !== true)) {
        throw new Error('Format du lien invalide.');
    }
    const [version, formations, picked, excluded = [], restoredLaterNotices = false] = state;
    if (version !== 1 || !Array.isArray(formations) || !formations.length
        || !Array.isArray(picked) || !picked.length || !Array.isArray(excluded)) {
        throw new Error('Format du lien invalide.');
    }
    const restoredSources = new Map();
    const restoredSelections = new Map();
    const targets = formations.map(row => {
        if (!Array.isArray(row) || row.length !== 2 || !isPlanningFormation(row[1])) {
            throw new Error('Formation invalide.');
        }
        const [host, formation] = row;
        const url = planningUrlForHost(host);
        if (!url) {
            throw new Error('Source invalide.');
        }
        if (!restoredSources.has(url)) {
            restoredSources.set(url, []);
        }
        const names = restoredSources.get(url);
        if (!names.includes(formation)) {
            names.push(formation);
        }
        if (restoredSources.size > planningLinkMaxSources || names.length > planningSourceConfig.maxFormationsPerSource) {
            throw new Error('Trop de formations dans le lien.');
        }
        restoredSelections.set(selectionKey(url, formation), {url, formation});
        return {url, formation};
    });
    for (const [url, names] of restoredSources) {
        planningRequestBody(url, names);
    }
    const restoredCourses = new Set(picked.map(row => {
        if (!Array.isArray(row) || row.length !== 4) {
            throw new Error('Cours invalide.');
        }
        const [index, group, subject, type] = row;
        if (!Number.isInteger(index) || index < 0 || index >= targets.length || !subject
            || ![group, subject, type].every(value => typeof value === 'string')) {
            throw new Error('Cours invalide.');
        }
        return courseKey({...targets[index], group, subject, type});
    }));
    const restoredNotices = new Set(excluded.filter(key => {
        const fields = typeof key === 'string' ? JSON.parse(key) : null;
        return Array.isArray(fields) && fields.length === 5 && fields.every(value => typeof value === 'string')
            && restoredSources.has(fields[0]);
    }));
    return {restoredSources, restoredSelections, restoredCourses, restoredNotices, restoredLaterNotices};
}

function planningShareState() {
    const indexes = new Map();
    const formations = [...selections].map(([key, {url, formation}], index) => {
        indexes.set(key, index);
        return [new URL(url).hostname, formation];
    });
    const picked = [...selectedCourses].flatMap(key => {
        const [url, formation, group, subject, type] = JSON.parse(key);
        const index = indexes.get(selectionKey(url, formation));
        return index === undefined ? [] : [[index, group, subject, type]];
    });
    const activeSources = new Set([...selections.values()].map(selection => selection.url));
    const excluded = [...hiddenNotices].filter(key => activeSources.has(JSON.parse(key)[0]));
    if (includeLaterNotices) {
        return [1, formations, picked, excluded, true];
    }
    return excluded.length ? [1, formations, picked, excluded] : [1, formations, picked];
}

function planningHistoryHash() {
    const hash = history.state?.lorrPlanningHash;
    return typeof hash === 'string' ? hash : '';
}

function keepPlanningInHistory(hash) {
    const address = new URL(location.href);
    address.search = '';
    address.hash = '';
    if (address.href !== location.href || hash !== planningHistoryHash()
        || history.state?.lorrCompletedPlanning !== viewingCompleted || history.state?.lorrLocalPlanning !== usingLocalChoices) {
        try {
            history.replaceState({
                ...history.state, lorrPlanningHash: hash, lorrCompletedPlanning: viewingCompleted, lorrLocalPlanning: usingLocalChoices,
            }, '', address);
        } catch {
            // Keep the original address if the browser cannot store the state.
        }
    }
    return address;
}

async function updatePlanningLink(existingCode = null) {
    const revision = ++planningLinkRevision;
    const originalAddress = location.href;
    const originalHistoryHash = planningHistoryHash();
    copyButton.disabled = true;
    subscriptionButton.disabled = true;
    saveButton.disabled = true;
    linkFallback.hidden = true;
    linkInput.value = '';
    portablePlanningLink = '';
    updateConnectionState();
    updatePlanningPush(null);

    let code;
    let errorMessage = '';
    if (created && selections.size && selectedCourses.size && !legacyHiddenCourses) {
        try {
            if (existingCode) {
                code = existingCode;
            } else {
                const state = planningShareState();
                readPlanningState(state);
                code = await encodePlanningCode(state);
            }
        } catch {
            errorMessage = 'Ce planning est trop volumineux ou ne peut pas être partagé par lien.';
        }
    }
    if (revision !== planningLinkRevision || location.href !== originalAddress || planningHistoryHash() !== originalHistoryHash) {
        return;
    }
    const hash = code ? '#p=' + code : '';
    const address = keepPlanningInHistory(hash);
    linkStatus.textContent = errorMessage;
    if (code) {
        address.hash = hash;
        portablePlanningLink = address.href;
        copyButton.disabled = false;
        subscriptionButton.disabled = false;
        saveButton.disabled = false;
        updatePlanningPush(code);
        updateConnectionState();
    }
}

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) {
        node.textContent = text;
    }
    if (className) {
        node.className = className;
    }
    return node;
}

function checkbox(label, checked, change) {
    const wrapper = element('label');
    const input = element('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => change(input.checked));
    wrapper.append(input, document.createTextNode(label));
    return wrapper;
}

function stepAvailable(number) {
    if (number === 2) {
        return sources.size > 0;
    }
    if (number === 3) {
        return selections.size > 0;
    }
    if (number === 4) {
        return loadedFormations === formationSignature()
            && activeEvents().some(event => !event.notice && selectedCourses.has(courseKey(event)));
    }
    return number === 1;
}

function updateStepButtons() {
    for (const button of stepButtons) {
        const number = Number(button.dataset.step);
        button.disabled = number !== step && !stepAvailable(number);
    }
}

function showStep(number, moveFocus = false) {
    step = number;
    updateRetry();
    stepPanels.forEach((panel, index) => {
        panel.hidden = index + 1 !== number;
        const indicator = stepIndicators[index];
        indicator.classList.toggle('completed', index + 1 < number);
        if (index + 1 === number) {
            indicator.setAttribute('aria-current', 'step');
        } else {
            indicator.removeAttribute('aria-current');
        }
    });
    document.getElementById('cancel-source').hidden = !sources.size;
    if (number !== 1) clearSourceError();
    updateStepButtons();
    if (moveFocus) {
        stepPanels[number - 1].querySelector('[tabindex="-1"], input').focus();
    }
}

function updateRetry() {
    const showRecovery = step >= 3 && failedFormations.length > 0;
    const restoreFocus = !showRecovery && document.activeElement === retryButton;
    scheduleRecovery.hidden = !showRecovery;
    const cannotRefresh = Boolean(activeRequest) || !navigator.onLine;
    retryButton.setAttribute('aria-disabled', String(cannotRefresh));
    refreshPlanningButton.setAttribute('aria-disabled', String(cannotRefresh));
    if (restoreFocus) statusMessage.focus({preventScroll: true});
}

function updateConnectionState() {
    const offline = !navigator.onLine;
    const message = offline ? 'Hors connexion. LorR affiche les horaires disponibles sur cet appareil.' : '';
    if (connectionMessage.textContent !== message) connectionMessage.textContent = message;
    const canCopySubscription = !offline || cachedShortLink?.portableLink === portablePlanningLink;
    subscriptionButton.setAttribute('aria-disabled', String(!canCopySubscription));
    subscriptionNote.textContent = canCopySubscription
        ? 'Ton agenda actualise les horaires à partir du lien.'
        : 'Connecte-toi pour créer le lien d’abonnement.';
    updateRetry();
}

function showScheduleStatus({verified = false, warnings = []} = {}) {
    const count = failedFormations.length;
    scheduleRecoveryList.replaceChildren(...failedFormations.map(({url, formation, error, available, fetchedAt}) => {
        const item = element('li');
        const name = sources.size > 1 ? formation + ' · ' + new URL(url).hostname : formation;
        const detail = available ? 'Derniers horaires connus affichés.' : 'Aucun horaire disponible.';
        const status = element('p', detail);
        const date = new Date(fetchedAt * 1000);
        if (available && fetchedAt > 0 && Number.isFinite(date.getTime())) {
            const time = element('time', scheduleFetchDate.format(date));
            time.dateTime = date.toISOString();
            status.append(' Dernière lecture le ', time, '.');
        }
        item.append(element('strong', name), status);
        if (error) item.append(element('p', error, 'schedule-recovery-reason'));
        return item;
    }));
    scheduleRecoveryList.tabIndex = count > 4 ? 0 : -1;
    retryButton.textContent = count === 1 ? 'Réessayer pour cette formation' : 'Réessayer pour ces ' + count + ' formations';
    let message = '';
    if (count) {
        message = count === 1 ? 'Une formation reste à vérifier.' : count + ' formations restent à vérifier.';
    } else if (!events.length) {
        message = 'Aucun cours publié pour ces formations.';
    } else if (verified && !warnings.length) {
        message = 'Horaires disponibles. La date de la dernière lecture figure dans le planning.';
    }
    statusMessage.textContent = [message, ...warnings].filter(Boolean).join(' ');
    updateRetry();
}

function setBusy(value, lock = value) {
    requestLocksControls = lock;
    if (!value) {
        clearTimeout(progressPauseTimer);
    }
    updateRetry();
    loadingPanel.hidden = !value;
    formationPanel.disabled = lock;
    sourceSubmit.disabled = lock;
    sourceInput.readOnly = lock;
    for (const shortcut of sourceShortcuts) shortcut.disabled = lock;
    document.getElementById('cancel-source').disabled = lock;
    loadButton.disabled = lock || !selections.size;
    countCourses();
}

function updateLoading(fraction, message) {
    const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    loadingDetail.textContent = message;
    if (!Number.isFinite(percent) || percent <= lastLoadingPercent) {
        return;
    }

    lastLoadingPercent = percent;
    loadingProgress.value = percent;
    loadingPercent.textContent = percent + ' %';
    clearTimeout(progressPauseTimer);

    const request = activeRequest;
    progressPauseTimer = setTimeout(() => {
        if (request && activeRequest === request && !request.signal.aborted) {
            loadingProgress.removeAttribute('value');
            loadingPercent.textContent = 'En cours';
        }
    }, maximumProgressPause);
}

function startRequest(title, lock = true) {
    activeRequest?.abort();
    activeRequest = new AbortController();
    lastLoadingPercent = -1;
    loadingTitle.textContent = title;
    statusMessage.textContent = '';
    updateLoading(0, 'Préparation…');
    setBusy(true, lock);
    if (lock) {
        loadingPanel.scrollIntoView({block: 'nearest'});
    }
    return activeRequest;
}

function finishRequest(request) {
    if (activeRequest === request) {
        activeRequest = null;
        setBusy(false);
    }
}

function renderSelectedFormations() {
    const multipleSources = sources.size > 1;
    const signature = JSON.stringify([multipleSources, ...selections.keys()]);
    if (renderedFormationSelection === signature) return;
    renderedFormationSelection = signature;
    selectedFormationList.hidden = !selections.size;
    selectedFormationList.replaceChildren(...[...selections].map(([key, {url, formation}], index) => {
        const item = element('li');
        const name = multipleSources ? formation + ' · ' + new URL(url).hostname : formation;
        const remove = element('button', '×');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Retirer la formation ' + name);
        remove.addEventListener('click', () => {
            selections.delete(key);
            const input = visibleFormationInputs.get(key);
            if (input) input.checked = false;
            countFormations();
            saveChoices();
            const remaining = selectedFormationList.querySelectorAll('button');
            (remaining[Math.min(index, remaining.length - 1)] ?? formationFilter).focus();
        });
        item.append(element('span', name), remove);
        return item;
    }));
}

function countFormations() {
    const count = selections.size;
    formationCount.textContent = count + (count === 1 ? ' formation choisie' : ' formations choisies');
    renderSelectedFormations();
    loadButton.disabled = requestLocksControls || count === 0;
    updateStepButtons();
}

function renderFormations() {
    teacherFormationHint.hidden = courseRole.value !== 'teacher';
    const terms = choiceText(formationFilter.value).split(' ').filter(Boolean);
    formationList.replaceChildren();
    visibleFormationInputs.clear();
    let matches = 0;
    for (const [url, formations] of sources) {
        const matching = formations.filter(formation => {
            const text = choiceText(formation);
            return terms.every(term => text.includes(term));
        });
        if (!matching.length) {
            continue;
        }
        matches += matching.length;
        const source = element('section', '', 'planning-source');
        const header = element('div', '', 'source-heading');
        const heading = element('h3', new URL(url).hostname);
        const remove = element('button', 'Retirer', 'text-button');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Retirer ' + heading.textContent);
        remove.addEventListener('click', () => {
            sources.delete(url);
            for (const [key, selection] of selections) {
                if (selection.url === url) {
                    selections.delete(key);
                }
            }
            for (const key of selectedCourses) {
                if (JSON.parse(key)[0] === url) {
                    selectedCourses.delete(key);
                }
            }
            for (const key of hiddenNotices) {
                if (JSON.parse(key)[0] === url) {
                    hiddenNotices.delete(key);
                }
            }
            saveChoices();
            renderFormations();
            if (!sources.size) {
                statusMessage.textContent = '';
                showStep(1, true);
            } else {
                formationFilter.focus();
            }
        });
        header.append(heading, remove);
        const choices = element('div', '', 'choices');
        for (const formation of matching) {
            const key = selectionKey(url, formation);
            const option = checkbox(formation, selections.has(key), checked => {
                if (checked) {
                    selections.set(key, {url, formation});
                } else {
                    selections.delete(key);
                }
                countFormations();
                saveChoices();
            });
            visibleFormationInputs.set(key, option.querySelector('input'));
            choices.append(option);
        }
        source.append(header, choices);
        formationList.append(source);
    }
    formationResults.textContent = !terms.length ? ''
        : matches ? matches + (matches === 1 ? ' formation trouvée' : ' formations trouvées')
            : 'Aucune formation ne correspond à la recherche.';
    countFormations();
}

function activeEvents() {
    return events.filter(event => selections.has(selectionKey(event.url, event.formation)));
}

function selectedPlanningEvents() {
    const selected = activeEvents().filter(event =>
        event.notice ? !hiddenNotices.has(noticeKey(event)) : selectedCourses.has(courseKey(event))
    );
    if (includeLaterNotices) {
        return selected;
    }
    const lastCourse = selected.reduce((last, event) => !event.notice && event.date > last ? event.date : last, '');
    if (!lastCourse) {
        return selected;
    }
    return selected.flatMap(event => {
        if (!event.notice) {
            return [event];
        }
        const [start, end] = event.period || [event.date, event.date];
        if (start > lastCourse) {
            return [];
        }
        return [event.allDay && end > lastCourse ? {...event, period: [start, lastCourse]} : event];
    });
}

function renderScheduleFreshness(selectedEvents) {
    scheduleFreshness.hidden = true;
    let oldest = Infinity;
    let newest = 0;
    for (const {fetchedAt} of selectedEvents) {
        if (!Number.isInteger(fetchedAt) || fetchedAt <= 0) {
            return;
        }
        oldest = Math.min(oldest, fetchedAt);
        newest = Math.max(newest, fetchedAt);
    }
    const date = new Date(oldest * 1000);
    if (!Number.isFinite(date.getTime())) {
        return;
    }
    scheduleFreshnessLabel.textContent = oldest === newest
        ? 'Horaires récupérés le' : 'Horaires les plus anciens récupérés le';
    scheduleFetchedAt.dateTime = date.toISOString();
    scheduleFetchedAt.textContent = scheduleFetchDate.format(date);
    scheduleFreshness.hidden = false;
}

function saveScheduleChanges() {
    const threshold = Math.floor(Date.now() / 1000) - changeRetention;
    scheduleChanges = scheduleChanges.filter(change => change?.observedAt >= threshold).slice(0, 30);
    try {
        localStorage.setItem(changesStorageKey, JSON.stringify(scheduleChanges));
    } catch {
        // The current page can still display the changes.
    }
}

function visibleScheduleChanges() {
    const threshold = Math.floor(Date.now() / 1000) - changeRetention;
    const active = new Set([...selectedCourses].filter(key => {
        const [url, formation] = JSON.parse(key);
        return selections.has(selectionKey(url, formation));
    }));
    return scheduleChanges.filter(change => change?.observedAt >= threshold && change.courses.some(key => active.has(key)));
}

function recordScheduleChanges(previous, current) {
    if (!previous?.fetchedAt || !current.fetchedAt || !selectedCourses.size) return;
    const fromDate = localScheduleDay.format(new Date());
    const detected = changedCourseSlots(previous.events, current.events, courseKey, selectedCourses, fromDate);
    if (!detected.length) return;
    for (const {course, ...change} of detected) {
        const existing = scheduleChanges.find(item => item?.id === change.id);
        if (existing) {
            if (!existing.courses.includes(course)) existing.courses.push(course);
        } else {
            scheduleChanges.unshift({...change, courses: [course], observedAt: current.fetchedAt});
        }
    }
    saveScheduleChanges();
}

function renderScheduleChanges() {
    const changes = visibleScheduleChanges();
    const signature = JSON.stringify(changes.map(change => change.id));
    if (signature === renderedChanges) return;
    renderedChanges = signature;
    changesPanel.hidden = !changes.length;
    changesTitle.textContent = changes.length === 1 ? '1 changement récent' : changes.length + ' changements récents';
    changesList.replaceChildren(...changes.map(change => {
        const [oldStart, oldEnd, oldRoom] = change.before;
        const [newStart, newEnd, newRoom] = change.after;
        const date = changeDay.format(new Date(change.date + 'T00:00:00Z'));
        const details = [];
        if (oldStart !== newStart || oldEnd !== newEnd) {
            details.push(oldStart + '–' + oldEnd + ' → ' + newStart + '–' + newEnd);
        }
        if (choiceText(oldRoom) !== choiceText(newRoom)) {
            details.push('Salle ' + (oldRoom || 'à confirmer') + ' → ' + (newRoom || 'à confirmer'));
        }
        const item = element('li');
        const button = element('button', 'Voir la journée', 'text-button');
        button.type = 'button';
        button.setAttribute('aria-label', 'Voir la journée du ' + date);
        button.setAttribute('aria-haspopup', 'dialog');
        button.addEventListener('click', () => planningView.openDay(change.date));
        item.append(element('strong', change.subject), element('p', date + ' · ' + details.join(' · ')), button);
        return item;
    }));
}

clearChanges.addEventListener('click', () => {
    const visible = new Set(visibleScheduleChanges().map(change => change.id));
    scheduleChanges = scheduleChanges.filter(change => !visible.has(change.id));
    saveScheduleChanges();
    renderScheduleChanges();
    document.getElementById('planning-title').focus();
});

function renderDays() {
    const selectedEvents = selectedPlanningEvents();
    const sessions = uniqueSessions(selectedEvents, courseKey);
    const schedulesAvailable = [...selections.keys()].every(key => displayedSchedules.has(key));
    exportButton.disabled = !schedulesAvailable || !sessions.length;
    icsWarning.hidden = false;
    icsWarning.textContent = !schedulesAvailable ? 'Le téléchargement sera disponible quand tous les horaires seront chargés.'
        : sessions.length ? 'Le fichier garde les horaires du jour du téléchargement.'
            : 'Aucune séance disponible à exporter.';
    laterNoticesOption.checked = includeLaterNotices;
    const markers = planningView.show(sessions, schedulesAvailable);
    renderScheduleChanges();
    const count = sessions.filter(event => !event.notice).length;
    scheduleCount.textContent = [
        count ? count + (count === 1 ? ' séance' : ' séances') : '',
        markers ? markers + (markers === 1 ? ' repère' : ' repères') : '',
    ].filter(Boolean).join(' · ');
    renderScheduleFreshness(selectedEvents);
    if (!sessions.length && !activeRequest) {
        const placeholder = element('div', '', 'empty-planning');
        const icon = element('span', '✦', 'empty-icon');
        icon.setAttribute('aria-hidden', 'true');
        placeholder.append(icon, element('h3', 'Aucune séance publiée pour tes cours.'));
        dayList.append(placeholder);
    }
}

function isPicked(option) {
    return option.keys.some(key => selectedCourses.has(key));
}

function countCourses() {
    const count = courses.filter(isPicked).length;
    reviewCourses.disabled = !courses.length;
    const selected = count + (count === 1 ? ' cours sélectionné' : ' cours sélectionnés');
    const visible = shownCourses.length;
    courseCount.textContent = visible === courses.length
        ? selected
        : selected + ' · ' + visible + (visible === 1 ? ' affiché' : ' affichés');
    const auto = [...notices.keys()].filter(key => !hiddenNotices.has(key)).length;
    noticeCount.textContent = 'Repères du calendrier · ' + auto + '/' + notices.size;
    createButton.disabled = !stepAvailable(4);
    updateStepButtons();
    for (const {counter, variants} of subjectGroups) {
        counter.textContent = variants.filter(isPicked).length + '/' + variants.length;
    }
}

function chooseCourse(option, checked) {
    for (const key of option.keys) {
        if (checked) {
            selectedCourses.add(key);
        } else {
            selectedCourses.delete(key);
        }
    }
}

function courseLabel(option, withSubject) {
    const {subject, group, type} = option.sample;
    const alreadyShown = choiceText(group);
    const names = selections.size > 1
        ? [...option.formations].filter(name => !alreadyShown.includes(choiceText(name))).join(', ')
        : '';
    return [withSubject ? subject : '', group, type, names].filter(Boolean).join(' · ') || subject;
}

function makeCourseCheckbox(option, withSubject) {
    const label = checkbox(courseLabel(option, withSubject), isPicked(option), checked => {
        chooseCourse(option, checked);
        saveChoices();
        if (reviewSelectedCourses) {
            renderCourseList();
        } else {
            countCourses();
        }
    });
    const input = label.querySelector('input');
    input.dataset.courseKey = option.keys[0];
    if (!withSubject) {
        input.setAttribute('aria-label', courseLabel(option, true));
    }
    applyCourseColor(label, option.keys[0]);
    return label;
}

function updateGroupToggle() {
    toggleAllCourseGroups.setAttribute('aria-pressed', String(showAllCourseGroups));
}

function renderCourseGroups() {
    const active = document.activeElement;
    const focusedGroup = courseGroupChoices.contains(active) ? active.dataset.groupKey : null;
    const grouped = new Map();
    for (const option of courses) {
        option.groupKeys = new Set();
        option.common = false;
        for (const key of option.keys) {
            const [url, formation, group] = JSON.parse(key);
            const names = courseGroupNames(group, formation);
            if (!names.length) {
                option.common = true;
                continue;
            }
            const reference = selectionKey(url, formation);
            if (!grouped.has(reference)) {
                grouped.set(reference, {url, formation, options: new Map()});
            }
            for (const name of names) {
                const groupKey = courseGroupKey(url, formation, name);
                option.groupKeys.add(groupKey);
                grouped.get(reference).options.set(groupKey, name);
            }
        }
    }

    const choicesByFormation = [...grouped.values()].filter(item => item.options.size > 1);
    const uniqueGroups = new Set([...grouped.values()].filter(item => item.options.size === 1)
        .map(item => item.options.keys().next().value));
    for (const option of courses) {
        option.common ||= [...option.groupKeys].some(key => uniqueGroups.has(key));
    }
    courseGroupFilter.hidden = !choicesByFormation.length;
    courseGroupChoices.replaceChildren();
    let groupToFocus;
    for (const {url, formation, options} of choicesByFormation) {
        const fieldset = element('fieldset', '', 'formation-groups');
        const duplicate = choicesByFormation.some(other => other.formation === formation && other.url !== url);
        const label = duplicate ? formation + ' · ' + new URL(url).hostname : formation;
        fieldset.append(element('legend', label));
        const choices = element('div', '', 'group-options');
        for (const [key, name] of [...options].sort((a, b) => alphabetic.compare(a[1], b[1]))) {
            const shortLabel = name.replace(formation, '').replace(/\s+/g, ' ').trim() || name;
            const groupOption = checkbox(shortLabel, selectedCourseGroups.has(key), checked => {
                if (checked) {
                    selectedCourseGroups.add(key);
                    showAllCourseGroups = false;
                } else {
                    selectedCourseGroups.delete(key);
                }
                updateGroupToggle();
                saveChoices();
                renderCourseList();
            });
            const input = groupOption.querySelector('input');
            input.dataset.groupKey = key;
            if (key === focusedGroup) {
                groupToFocus = input;
            }
            choices.append(groupOption);
        }
        fieldset.append(choices);
        courseGroupChoices.append(fieldset);
    }
    updateGroupToggle();
    if (focusedGroup) {
        (groupToFocus ?? courseFilter).focus({preventScroll: true});
    }
}

function renderCourseList() {
    const previousInputs = [...courseList.querySelectorAll('input')];
    const focusIndex = previousInputs.indexOf(document.activeElement);
    const focusedCourse = previousInputs[focusIndex]?.dataset.courseKey;
    const focusedSummary = document.activeElement.closest('#planning-courses summary')?.parentElement.dataset.subject;
    const previousDetails = new Map([...courseList.querySelectorAll('details')].map(group => [group.dataset.subject, group.open]));
    const scrollPosition = courseList.scrollTop;
    const teacherMode = courseRole.value === 'teacher';
    const filterByTeacher = teacherMode && teacherSelect.value !== manualTeacherSelection;
    const search = choiceText(courseFilter.value).split(' ').filter(Boolean);
    shownCourses = courses.filter(option => {
        if (reviewSelectedCourses && !isPicked(option)) {
            return false;
        }
        if (!reviewSelectedCourses && filterByTeacher && !option.teachers.has(teacherSelect.value)) {
            return false;
        }
        if (!reviewSelectedCourses && !teacherMode && !showAllCourseGroups && !option.common && !isPicked(option)
            && ![...option.groupKeys].some(key => selectedCourseGroups.has(key))) {
            return false;
        }
        const terms = choiceText([courseLabel(option, true), ...option.formations, ...option.teachers.values()].join(' '));
        return search.every(word => terms.includes(word));
    });
    subjectGroups = [];
    const focusActions = courseActions.contains(document.activeElement);
    courseActions.hidden = !shownCourses.length;
    checkCourses.hidden = reviewSelectedCourses;
    checkCourses.textContent = filterByTeacher ? 'Cocher les cours affichés de cet enseignant' : 'Cocher les cours affichés';
    reviewCourses.setAttribute('aria-pressed', String(reviewSelectedCourses));
    courseList.replaceChildren();
    const bySubject = new Map();
    for (const option of shownCourses) {
        const subject = choiceText(option.sample.subject);
        if (!bySubject.has(subject)) {
            bySubject.set(subject, []);
        }
        bySubject.get(subject).push(option);
    }
    for (const [subject, variants] of bySubject) {
        if (variants.length === 1) {
            courseList.append(makeCourseCheckbox(variants[0], true));
        } else {
            const group = element('details', '', 'course-group');
            group.dataset.subject = subject;
            group.open = reviewSelectedCourses || search.length > 0 || (previousDetails.get(subject) ?? (selectedCourseGroups.size > 0));
            const summary = element('summary', variants[0].sample.subject);
            const counter = element('span', '', 'course-group-count');
            summary.append(counter);
            group.append(summary);
            subjectGroups.push({counter, variants});
            const choices = element('div', '', 'choices');
            choices.append(...variants.map(option => makeCourseCheckbox(option, false)));
            group.append(choices);
            courseList.append(group);
        }
    }
    if (courses.length && !shownCourses.length) {
        let message = teacherMode ? 'Choisis un enseignant pour afficher ses cours.' : 'Choisis un groupe pour afficher ses cours.';

        if (search.length) {
            message = 'Aucun cours ne correspond à la recherche.';
        } else if (reviewSelectedCourses) {
            message = 'Aucun cours sélectionné.';
        }
        courseList.append(element('p', message));
    }
    courseList.scrollTop = scrollPosition;
    if (focusedSummary) {
        const group = [...courseList.querySelectorAll('details')].find(item => item.dataset.subject === focusedSummary);
        (group?.querySelector('summary') ?? courseFilter).focus({preventScroll: true});
    } else if (focusedCourse) {
        const inputs = [...courseList.querySelectorAll('input')].filter(input => !input.closest('details:not([open])'));
        const nextFocus = inputs.find(input => input.dataset.courseKey === focusedCourse)
            ?? inputs[Math.min(focusIndex, inputs.length - 1)]
            ?? reviewCourses;
        nextFocus.focus({preventScroll: true});
    } else if (focusActions && !shownCourses.length) {
        reviewCourses.focus({preventScroll: true});
    }
    countCourses();
}

function renderNotices() {
    noticePanel.hidden = !notices.size;
    noticeChoices.replaceChildren();
    for (const [key, event] of notices) {
        const [start, end] = event.period || [event.date, event.date];
        const from = new Date(start + 'T00:00:00Z');
        const to = new Date(end + 'T00:00:00Z');
        const dates = start === end ? noticeDate.format(from) : noticeDate.formatRange(from, to);
        const option = checkbox(event.subject + ' · ' + dates, !hiddenNotices.has(key), checked => {
            if (checked) {
                hiddenNotices.delete(key);
            } else {
                hiddenNotices.add(key);
            }
            saveChoices();
            countCourses();
        });
        applyCourseColor(option, key);
        noticeChoices.append(option);
    }
}

function renderCourseRole() {
    const teacherMode = courseRole.value === 'teacher';
    teacherFilter.hidden = !teacherMode;
    if (!teacherMode) {
        renderCourseGroups();
        return;
    }
    courseGroupFilter.hidden = true;
    const teachers = new Map(courses.flatMap(option => [...option.teachers]));
    teacherSelect.replaceChildren();
    if (teachers.size) {
        teacherSelect.add(new Option('Choisis un enseignant', ''));
        for (const [key, name] of [...teachers].sort((a, b) => alphabetic.compare(a[1], b[1]))) {
            teacherSelect.add(new Option(name, key));
        }
    }
    const manualLabel = teachers.size ? 'Choisir les cours à la main' : 'Aucun nom publié · Choix manuel';
    teacherSelect.add(new Option(manualLabel, manualTeacherSelection));
    teacherSelect.value = teacherChoice === manualTeacherSelection || !teachers.size
        ? manualTeacherSelection : (teachers.has(teacherChoice) ? teacherChoice : '');
}

function renderCourses() {
    const available = activeEvents();
    courses = courseOptions(available, courseKey)
        .sort((a, b) => alphabetic.compare(courseLabel(a, true), courseLabel(b, true)));
    notices = new Map(available.filter(event => event.notice).map(event => [noticeKey(event), event]));
    courseTools.hidden = !courses.length;
    renderCourseRole();
    renderCourseList();
    renderNotices();
    countCourses();
}

function toggleCourses(checked) {
    for (const option of shownCourses) {
        chooseCourse(option, checked);
    }
    for (const input of courseList.querySelectorAll('input')) {
        input.checked = checked;
    }
    saveChoices();
    if (reviewSelectedCourses) {
        renderCourseList();
    } else {
        countCourses();
    }
}

function formationSignature() {
    return JSON.stringify([...selections.keys()].sort());
}

function openCourseSelection() {
    if (!selections.size) {
        return;
    }
    statusMessage.textContent = '';
    showStep(3, true);
    if (scheduleRequest && activeRequest === scheduleRequest) {
        renderCourses();
    } else if (loadedFormations === formationSignature()) {
        renderCourses();
        showScheduleStatus();
    } else {
        loadSchedule();
    }
}

async function loadSchedule(retry = false, manual = false) {
    if (!selections.size) {
        return;
    }

    const targets = retry ? failedFormations : [...selections.values()];
    if (!targets.length) {
        return;
    }
    const request = startRequest('Chargement des cours', false);
    scheduleRequest = request;
    const signature = formationSignature();
    const failures = [];
    const warnings = new Set();
    const displayed = new Map();
    if (retry || manual) {
        for (const [key, schedule] of displayedSchedules) {
            displayed.set(key, schedule);
        }
    } else {
        failedFormations = [];
        events = [];
    }

    function mergeSchedules(result) {
        const {url, formations, schedules} = result;
        if (formations.length) {
            sources.set(url, [...new Set([...formations, ...sources.get(url)])]);
        }
        let changed = false;
        for (const {formation, events: schedule, fetchedAt} of schedules) {
            const key = selectionKey(url, formation);
            const previous = displayed.get(key);
            if (previous && (fetchedAt ?? 0) <= (previous.fetchedAt ?? 0)) {
                continue;
            }
            const current = {fetchedAt, events: schedule.map(event => ({...event, formation, url, fetchedAt}))};
            recordScheduleChanges(previous, current);
            displayed.set(key, current);
            changed = true;
        }
        return changed;
    }

    function renderLoadedSchedules() {
        displayedSchedules = displayed;
        events = [...displayed.values()].flatMap(entry => entry.events).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)
            || alphabetic.compare(a.subject, b.subject));
        if (activeRequest === request && displayed.size) {
            loadedFormations = signature;
            loadingPanel.hidden = true;
            statusMessage.textContent = 'Horaires disponibles. Actualisation en cours…';
        }
        if (step === 3) {
            renderCourses();
        } else {
            renderDays();
        }
    }

    renderLoadedSchedules();
    try {
        const bySource = new Map();
        for (const {formation, url} of targets) {
            if (!bySource.has(url)) {
                bySource.set(url, []);
            }
            bySource.get(url).push(formation);
        }
        const entries = [...bySource.entries()];
        const caches = await Promise.all(entries.map(([url, formations]) => readCachedPlanning(url, formations)));
        if (request.signal.aborted) {
            return;
        }
        for (const [index, [url]] of entries.entries()) {
            mergeSchedules(browserPlanningResult(url, caches[index]));
        }
        if (displayed.size) {
            renderLoadedSchedules();
        }

        for (const [index, [url, formations]] of entries.entries()) {
            const host = new URL(url).hostname;
            const prefix = bySource.size > 1 ? (index + 1) + '/' + bySource.size + ' · ' + host + ' · ' : '';
            const report = (fraction, message) => updateLoading((index + fraction) / bySource.size, prefix + message);
            report(0, 'Recherche des horaires publiés…');
            try {
                const result = await fetchPlanning({url, formations}, request.signal, report, snapshot => {
                    if (mergeSchedules(snapshot)) {
                        renderLoadedSchedules();
                    }
                }, caches[index]);
                if (request.signal.aborted) {
                    return;
                }
                const changed = mergeSchedules(result);
                if (result.warning && !result.errors.length) {
                    warnings.add(result.warning);
                }
                for (const {formation, error} of result.errors) {
                    failures.push({url, formation, error});
                }
                if (changed) {
                    renderLoadedSchedules();
                }
                report(1, 'Horaires récupérés');
            } catch (error) {
                if (request.signal.aborted) {
                    return;
                }
                failures.push(...formations.map(formation => ({url, formation, error: error.message})));
            }
        }

        if (legacyHiddenCourses && events.length) {
            for (const event of events) {
                const key = courseKey(event);
                if (!event.notice && !legacyHiddenCourses.has(key)) {
                    selectedCourses.add(key);
                }
            }
            legacyHiddenCourses = null;
            saveChoices();
        }

        failedFormations = failures.map(item => {
            const schedule = displayed.get(selectionKey(item.url, item.formation));
            return {...item, available: Boolean(schedule), fetchedAt: schedule?.fetchedAt};
        });
        loadedFormations = signature;
        renderFormations();
        showScheduleStatus({verified: manual || retry, warnings: [...warnings]});
    } finally {
        finishRequest(request);
        if (scheduleRequest === request) {
            scheduleRequest = null;
        }
        if (!request.signal.aborted) {
            renderLoadedSchedules();
        }
    }
}

async function restorePlanning() {
    const revision = ++planningRestoreRevision;
    planningLinkRevision++;
    activeRequest?.abort();
    activeRequest = null;
    events = [];
    displayedSchedules = new Map();
    courses = [];
    notices = new Map();
    formationFilter.value = '';
    courseFilter.value = '';
    courseBrowseQuery = '';
    reviewSelectedCourses = false;
    loadedFormations = '';
    failedFormations = [];
    linkFallback.hidden = true;
    linkStatus.textContent = '';
    statusMessage.textContent = '';
    const address = new URL(location.href);
    const startNew = address.searchParams.has('nouveau');
    const resumeDraft = !startNew && address.searchParams.has('reprendre');
    viewingCompleted = !startNew && !resumeDraft && !address.hash
        && (address.searchParams.has('dernier') || (!address.search && history.state?.lorrCompletedPlanning === true));
    const historyHash = planningHistoryHash();
    const incomingHash = address.hash || (startNew || resumeDraft || viewingCompleted || history.state?.lorrLocalPlanning ? '' : historyHash);
    usingLocalChoices = !incomingHash;

    let code = null;
    let validHash = '';
    const isCurrent = () => revision === planningRestoreRevision
        && location.href === address.href && planningHistoryHash() === historyHash;
    try {
        if (incomingHash.length > planningLinkMaxBytes * 3 + 10) {
            throw new Error('Lien trop volumineux.');
        }
        const params = new URLSearchParams(incomingHash.slice(1));
        if (params.getAll('p').length + params.getAll('planning').length > 1) {
            throw new Error('Le lien contient plusieurs codes.');
        }
        code = params.get('p');
        const legacy = params.get('planning');
        if (code !== null || legacy !== null) {
            loadLocalChoices(true);
            showStep(1);
            sourceSubmit.disabled = true;
            sourceInput.readOnly = true;
            for (const shortcut of sourceShortcuts) shortcut.disabled = true;
            statusMessage.textContent = 'Lecture du lien…';
            if (legacy !== null && planningTextEncoder.encode(legacy).length > planningLinkMaxBytes) {
                throw new Error('Lien trop volumineux.');
            }
            const state = code !== null ? await decodePlanningCode(code) : JSON.parse(legacy);
            if (!isCurrent()) {
                return;
            }
            const restored = readPlanningState(unpackPlanningState(state));
            validHash = incomingHash;
            if (state[0] !== 2 || code?.startsWith('b.')) {
                code = null;
            }
            sources = restored.restoredSources;
            selections = restored.restoredSelections;
            selectedCourses = restored.restoredCourses;
            hiddenNotices = restored.restoredNotices;
            includeLaterNotices = restored.restoredLaterNotices;
            created = true;
            statusMessage.textContent = '';
        } else {
            loadLocalChoices(startNew, viewingCompleted, viewingCompleted && !address.searchParams.has('dernier'));
        }
    } catch {
        if (!isCurrent()) {
            return;
        }
        loadLocalChoices(true);
        statusMessage.textContent = 'Ce lien de planning est incomplet ou invalide.';
    }
    keepPlanningInHistory(validHash);
    setBusy(false);
    updatePlanningLink(code);
    renderFormations();
    if (created && selections.size) {
        showStep(4);
        loadSchedule();
    } else if (!startNew && draftStep === 3 && selections.size) {
        openCourseSelection();
    } else {
        showStep(sources.size && draftStep !== 1 ? 2 : 1);
    }
}

function clearSourceError() {
    sourceInput.removeAttribute('aria-invalid');
    sourceError.textContent = '';
}

sourceInput.addEventListener('input', clearSourceError);
for (const shortcut of sourceShortcuts) {
    shortcut.addEventListener('click', () => {
        sourceInput.value = shortcut.dataset.sourceUrl;
        sourceInput.focus();
        sourceForm.requestSubmit();
    });
}

sourceForm.addEventListener('submit', async event => {
    event.preventDefault();
    clearSourceError();
    const url = planningSource(sourceInput.value);
    if (!url) {
        sourceInput.setAttribute('aria-invalid', 'true');
        sourceError.textContent = 'Ce lien n’est pas reconnu. Vérifie l’adresse de l’espace invité de ton établissement.';
        sourceInput.focus();
        return;
    }
    if (sources.has(url)) {
        sourceForm.reset();
        formationFilter.value = '';
        renderFormations();
        statusMessage.textContent = 'Ce lien est déjà ajouté. Retrouve ses formations ci-dessous.';
        showStep(2, true);
        saveChoices();
        return;
    }
    const request = startRequest('Recherche des formations');
    function showCatalogue(result) {
        sources.set(result.url, result.formations);
        renderFormations();
        if (step === 1) {
            showStep(2, true);
        }
        saveChoices();
    }
    try {
        const result = await fetchPlanning({url}, request.signal, updateLoading, snapshot => {
            if (snapshot.formations.length) {
                showCatalogue(snapshot);
                setBusy(false);
                statusMessage.textContent = 'Dernières formations affichées. Actualisation en cours…';
            }
        });
        if (request.signal.aborted) {
            return;
        }
        if (!result.formations.length) {
            statusMessage.textContent = 'Aucune formation publiée dans cet espace invité.';
            return;
        }
        showCatalogue(result);
        sourceForm.reset();
        statusMessage.textContent = result.warning ? 'Dernières formations affichées. ' + result.warning : '';
    } catch (error) {
        if (!request.signal.aborted) {
            statusMessage.textContent = error.message;
        }
    } finally {
        finishRequest(request);
    }
});

function closeShareMenu() {
    const restoreFocus = sharePlanning.open && sharePlanning.contains(document.activeElement);
    sharePlanning.open = false;
    if (restoreFocus) sharePlanning.querySelector('summary').focus({preventScroll: true});
}

saveButton.addEventListener('click', () => {
    try {
        localStorage.setItem(planningSavedLinkKey, new URL(portablePlanningLink).hash);
        void rememberPersonalPlanningLink(portablePlanningLink);
        closeShareMenu();
        linkStatus.textContent = 'Planning enregistré. Retrouve-le depuis l’accueil ou dans Mes données.';
    } catch {
        linkStatus.textContent = 'Impossible de sauvegarder sur cet appareil. Tu peux copier le lien.';
    }
});

laterNoticesOption.addEventListener('change', () => {
    includeLaterNotices = laterNoticesOption.checked;
    linkStatus.textContent = '';
    saveChoices();
    renderDays();
});

exportButton.addEventListener('click', () => {
    closeShareMenu();
    downloadPlanningCalendar(uniqueSessions(selectedPlanningEvents(), courseKey));
});

async function copySharedLink(subscription) {
    const button = subscription ? subscriptionButton : copyButton;
    const portableLink = portablePlanningLink;
    const revision = planningLinkRevision;
    button.disabled = true;
    linkFallback.hidden = true;
    linkStatus.textContent = subscription ? 'Préparation du lien iCal…' : 'Création du lien court…';
    const shareLink = shortPlanningLink(portableLink).then(async address => {
        await rememberPersonalPlanningLink(portableLink, address);
        if (!subscription) {
            return address;
        }
        return address === portableLink ? '' : address + '/planning.ics';
    });
    let copied = false;
    try {
        const clipboard = navigator.clipboard;
        const copyAddress = async () => {
            const address = await shareLink;
            if (!address) {
                throw new Error('Lien indisponible.');
            }
            return address;
        };
        if (typeof ClipboardItem === 'function' && clipboard?.write) {
            const text = copyAddress().then(address => new Blob([address], {type: 'text/plain'}));
            await clipboard.write([new ClipboardItem({'text/plain': text})]);
        } else {
            const address = await copyAddress();
            await clipboard.writeText(address);
        }
        copied = true;
    } catch {
        // The link can be selected when the browser denies clipboard access.
    }
    const address = await shareLink;
    if (revision !== planningLinkRevision) {
        return;
    }
    button.disabled = false;
    updateConnectionState();
    if (!address) {
        linkStatus.textContent = 'Lien iCal indisponible. Tu peux télécharger le fichier .ics.';
    } else if (copied) {
        closeShareMenu();
        linkStatus.textContent = subscription ? 'Lien iCal copié. Ajoute-le comme abonnement dans ton calendrier.'
            : (address === portableLink ? 'Lien complet copié.' : 'Lien court copié !');
    } else {
        sharePlanning.open = false;
        linkLabel.textContent = subscription ? 'Lien d’abonnement iCal' : 'Lien du planning';
        linkInput.value = address;
        linkFallback.hidden = false;
        linkInput.focus();
        linkInput.select();
        linkStatus.textContent = subscription ? 'Copie ce lien et ajoute-le comme abonnement dans ton calendrier.'
            : 'Sélectionne et copie ce lien.';
    }
}

copyButton.addEventListener('click', () => copySharedLink(false));
subscriptionButton.addEventListener('click', () => {
    if (subscriptionButton.getAttribute('aria-disabled') !== 'true') void copySharedLink(true);
});

document.addEventListener('click', event => {
    if (sharePlanning.open && !sharePlanning.contains(event.target)) {
        sharePlanning.open = false;
    }
});
sharePlanning.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sharePlanning.open) {
        sharePlanning.open = false;
        sharePlanning.querySelector('summary').focus();
    }
});

function goToStep(number) {
    if (number === step || !stepAvailable(number)) {
        return;
    }
    if (number === 4) {
        created = true;
        usingLocalChoices = true;
        showStep(4, true);
        saveChoices();
        renderDays();
        return;
    }

    const keepSchedule = number === 3 && scheduleRequest && activeRequest === scheduleRequest;
    if (!keepSchedule) {
        activeRequest?.abort();
        activeRequest = null;
        setBusy(false);
    }
    created = false;
    statusMessage.textContent = '';
    if (number === 3) {
        openCourseSelection();
    } else {
        showStep(number, true);
    }
    saveChoices();
}

for (const button of stepButtons) {
    button.addEventListener('click', () => goToStep(Number(button.dataset.step)));
}
document.getElementById('add-source').addEventListener('click', () => goToStep(1));
document.getElementById('cancel-source').addEventListener('click', () => goToStep(2));
document.getElementById('edit-formations').addEventListener('click', () => goToStep(2));
document.getElementById('edit-planning-courses').addEventListener('click', () => goToStep(3));
loadButton.addEventListener('click', () => goToStep(3));
retryButton.addEventListener('click', () => {
    if (!activeRequest && navigator.onLine) void loadSchedule(true);
});
refreshPlanningButton.addEventListener('click', () => {
    if (!activeRequest && navigator.onLine) {
        void loadSchedule(false, true);
    }
});
createButton.addEventListener('click', () => goToStep(4));
checkCourses.addEventListener('click', () => toggleCourses(true));
document.getElementById('uncheck-courses').addEventListener('click', () => toggleCourses(false));
formationFilter.addEventListener('input', renderFormations);
courseFilter.addEventListener('input', renderCourseList);
courseRole.addEventListener('change', () => {
    setCourseReview(false);
    renderCourseRole();
    renderCourseList();
    saveChoices();
});
teacherSelect.addEventListener('change', () => {
    teacherChoice = teacherSelect.value;
    setCourseReview(false);
    renderCourseList();
    saveChoices();
});
function setCourseReview(review) {
    if (review === reviewSelectedCourses) return;
    if (review) {
        courseBrowseQuery = courseFilter.value;
        courseFilter.value = '';
    } else {
        courseFilter.value = courseBrowseQuery;
    }
    reviewSelectedCourses = review;
    courseList.scrollTop = 0;
}

reviewCourses.addEventListener('click', () => {
    setCourseReview(!reviewSelectedCourses);
    renderCourseList();
});
toggleAllCourseGroups.addEventListener('click', () => {
    showAllCourseGroups = !showAllCourseGroups;
    updateGroupToggle();
    saveChoices();
    renderCourseList();
});
function stopLoadingBeforeNavigation() {
    if (activeRequest) {
        interruptedNavigation = true;
        activeRequest.abort();
    }
}

document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    document.getElementById('contenu').focus();
});

document.querySelector('.site-header').addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
    }
    if (link.getAttribute('aria-current') === 'page') {
        event.preventDefault();
        return;
    }
    stopLoadingBeforeNavigation();
});
window.addEventListener('pagehide', stopLoadingBeforeNavigation);
window.addEventListener('pageshow', event => {
    if (event.persisted && interruptedNavigation) {
        interruptedNavigation = false;
        restorePlanning();
    }
});
function restoreAfterNavigation() {
    clearTimeout(planningRestoreTimer);
    planningRestoreTimer = setTimeout(restorePlanning, 0);
}

window.addEventListener('offline', updateConnectionState);
window.addEventListener('online', updateConnectionState);
window.addEventListener('pageshow', updateConnectionState);
window.addEventListener('hashchange', restoreAfterNavigation);
window.addEventListener('popstate', restoreAfterNavigation);
restorePlanning();
