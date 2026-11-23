const sourceForm = document.getElementById('source-form');
const formationPanel = document.getElementById('formation-panel');
const formationList = document.getElementById('formations');
const formationFilter = document.getElementById('formation-filter');
const formationCount = document.getElementById('formation-count');
const loadButton = document.getElementById('load-planning');
const statusMessage = document.getElementById('planning-status');
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
const scheduleCount = document.getElementById('schedule-count');
const editCourses = document.getElementById('edit-courses');
const stepIndicators = document.querySelectorAll('.steps li');
const stepButtons = document.querySelectorAll('.steps [data-step]');
const stepPanels = ['link-step', 'formation-step', 'course-panel', 'my-planning'].map(id => document.getElementById(id));
const dayList = document.getElementById('planning-days');
const copyButton = document.getElementById('copy-planning');
const saveButton = document.getElementById('save-planning');
const exportButton = document.getElementById('export-planning');
const linkStatus = document.getElementById('link-status');
const linkFallback = document.getElementById('link-fallback');
const linkInput = document.getElementById('planning-address');
const preferenceKey = 'lorr-hyperplanning';
const alphabetic = new Intl.Collator('fr-BE', {numeric: true});
const formationNames = new Intl.ListFormat('fr-BE');
const noticeDate = new Intl.DateTimeFormat('fr-BE', {dateStyle: 'medium', timeZone: 'UTC'});
const planningView = createPlanningView(dayList, element, courseKey, recordCourseClick);

let sources;
let selections;
let selectedCourses;
let selectedCourseGroups;
let showAllCourseGroups;
let reviewSelectedCourses = false;
let hiddenNotices;
let legacyHiddenCourses;
let activeRequest;
let scheduleRequest;
let requestLocksControls = false;
let lastLoadingPercent = -1;
let progressPauseTimer;
let interruptedNavigation = false;
let created = false;
let step = 1;
let loadedFormations = '';
let failedFormations = [];
let events = [];
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

function loadLocalChoices(startNew) {
    try {
        const saved = startNew ? null : JSON.parse(localStorage.getItem(preferenceKey));
        sources = new Map(saved?.sources);
        selections = new Map(saved?.formations);
        selectedCourses = new Set(saved?.selectedCourses);
        selectedCourseGroups = new Set(saved?.courseGroups);
        showAllCourseGroups = saved?.showAllCourseGroups === true;
        hiddenNotices = new Set(saved?.hiddenNotices);
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
        hiddenNotices = new Set();
        legacyHiddenCourses = null;
        created = false;
    }
}

function saveChoices() {
    try {
        localStorage.setItem(preferenceKey, JSON.stringify({
            created,
            sources: [...sources],
            formations: [...selections],
            selectedCourses: legacyHiddenCourses ? undefined : [...selectedCourses],
            courseGroups: [...selectedCourseGroups],
            showAllCourseGroups,
            hiddenNotices: [...hiddenNotices],
            hiddenCourses: legacyHiddenCourses ? [...legacyHiddenCourses] : undefined,
        }));
    } catch {
        // The URL and the open page work when storage is unavailable.
    }
    updatePlanningLink();
}

function readPlanningState(state) {
    if (!Array.isArray(state) || state.length < 3 || state.length > 4) {
        throw new Error('Format du lien invalide.');
    }
    const [version, formations, picked, excluded = []] = state;
    if (version !== 1 || !Array.isArray(formations) || !formations.length
        || !Array.isArray(picked) || !picked.length || !Array.isArray(excluded)) {
        throw new Error('Format du lien invalide.');
    }
    const restoredSources = new Map();
    const restoredSelections = new Map();
    const targets = formations.map(row => {
        if (!Array.isArray(row) || row.length !== 2 || !isPlanningHost(row[0]) || !isPlanningFormation(row[1])) {
            throw new Error('Formation invalide.');
        }
        const [host, formation] = row;
        const url = 'https://' + host + '/invite';
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
    return {restoredSources, restoredSelections, restoredCourses, restoredNotices};
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
    if (address.href !== location.href || hash !== planningHistoryHash()) {
        try {
            history.replaceState({...history.state, lorrPlanningHash: hash}, '', address);
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
    saveButton.disabled = true;
    linkFallback.hidden = true;
    linkInput.value = '';
    portablePlanningLink = '';

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
        saveButton.disabled = false;
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
    updateStepButtons();
    if (moveFocus) {
        stepPanels[number - 1].querySelector('[tabindex="-1"], input').focus();
    }
}

function updateRetry() {
    retryButton.hidden = Boolean(activeRequest) || step < 3 || !failedFormations.length;
}

function showScheduleStatus() {
    if (failedFormations.length) {
        const messages = [];
        const available = failedFormations.filter(item => item.available).map(item => item.formation);
        const missing = failedFormations.filter(item => !item.available).map(item => item.formation);
        if (available.length) {
            messages.push('Derniers horaires affichés pour ' + formationNames.format([...new Set(available)]) + '. Actualisation impossible.');
        }
        if (missing.length) {
            messages.push('Aucun horaire disponible pour ' + formationNames.format([...new Set(missing)]) + '.');
        }
        const reasons = [...new Set(failedFormations.map(item => item.error).filter(Boolean))];
        if (reasons.length === 1) {
            messages.push(reasons[0]);
        }
        statusMessage.textContent = messages.join(' ');
    } else {
        statusMessage.textContent = events.length ? '' : 'Aucun cours publié pour ces formations.';
    }
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
    sourceForm.querySelector('button').disabled = lock;
    document.getElementById('cancel-source').disabled = lock;
    loadButton.disabled = lock || !selections.size;
    editCourses.disabled = lock;
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

function countFormations() {
    const count = selections.size;
    formationCount.textContent = count + (count === 1 ? ' formation choisie' : ' formations choisies');
    loadButton.disabled = requestLocksControls || count === 0;
    updateStepButtons();
}

function renderFormations() {
    const query = choiceText(formationFilter.value);
    formationList.replaceChildren();
    let matches = false;
    for (const [url, formations] of sources) {
        const matching = formations.filter(formation => choiceText(formation).includes(query));
        if (!matching.length) {
            continue;
        }
        matches = true;
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
            }
        });
        header.append(heading, remove);
        const choices = element('div', '', 'choices');
        for (const formation of matching) {
            const key = selectionKey(url, formation);
            choices.append(checkbox(formation, selections.has(key), checked => {
                if (checked) {
                    selections.set(key, {url, formation});
                } else {
                    selections.delete(key);
                }
                countFormations();
                saveChoices();
            }));
        }
        source.append(header, choices);
        formationList.append(source);
    }
    if (query && !matches) {
        formationList.append(element('p', 'Aucune formation ne correspond à la recherche.'));
    }
    countFormations();
}

function activeEvents() {
    return events.filter(event => selections.has(selectionKey(event.url, event.formation)));
}

function selectedPlanningSessions() {
    return uniqueSessions(activeEvents().filter(event =>
        event.notice ? !hiddenNotices.has(noticeKey(event)) : selectedCourses.has(courseKey(event))
    ), courseKey);
}

function renderDays() {
    const sessions = selectedPlanningSessions();
    exportButton.disabled = !sessions.length;
    const markers = planningView.show(sessions);
    const count = sessions.filter(event => !event.notice).length;
    scheduleCount.textContent = [
        count ? count + (count === 1 ? ' séance' : ' séances') : '',
        markers ? markers + (markers === 1 ? ' repère' : ' repères') : '',
    ].filter(Boolean).join(' · ');
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
                const groupKey = JSON.stringify([url, formation, choiceText(name)]);
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
    const previousDetails = new Map([...courseList.querySelectorAll('details')].map(group => [group.dataset.subject, group.open]));
    const scrollPosition = courseList.scrollTop;
    const search = choiceText(courseFilter.value).split(' ').filter(Boolean);
    shownCourses = courses.filter(option => {
        if (reviewSelectedCourses && !isPicked(option)) {
            return false;
        }
        if (!reviewSelectedCourses && !showAllCourseGroups && !option.common && !isPicked(option)
            && ![...option.groupKeys].some(key => selectedCourseGroups.has(key))) {
            return false;
        }
        const terms = choiceText(courseLabel(option, true) + ' ' + [...option.formations].join(' '));
        return search.every(word => terms.includes(word));
    });
    subjectGroups = [];
    const focusActions = courseActions.contains(document.activeElement);
    courseActions.hidden = !shownCourses.length;
    checkCourses.hidden = reviewSelectedCourses;
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
            group.open = search.length > 0 || (previousDetails.get(subject) ?? (selectedCourseGroups.size > 0));
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
        let message = 'Choisis un groupe pour afficher ses cours.';
        if (search.length) {
            message = 'Aucun cours ne correspond à la recherche.';
        } else if (reviewSelectedCourses) {
            message = 'Aucun cours sélectionné.';
        }
        courseList.append(element('p', message));
    }
    courseList.scrollTop = scrollPosition;
    if (focusedCourse) {
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

function renderCourses() {
    const available = activeEvents();
    courses = courseOptions(available, courseKey)
        .sort((a, b) => alphabetic.compare(courseLabel(a, true), courseLabel(b, true)));
    notices = new Map(available.filter(event => event.notice).map(event => [noticeKey(event), event]));
    courseTools.hidden = !courses.length;
    renderCourseGroups();
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

async function loadSchedule(retry = false) {
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
    const displayed = new Map();
    for (const event of retry ? events : []) {
        const key = selectionKey(event.url, event.formation);
        if (!displayed.has(key)) {
            displayed.set(key, []);
        }
        displayed.get(key).push(event);
    }
    if (!retry) {
        failedFormations = [];
        events = [];
    }

    function mergeSchedules(result) {
        const {url, formations, schedules} = result;
        if (formations.length) {
            sources.set(url, [...new Set([...formations, ...sources.get(url)])]);
        }
        for (const {formation, events: schedule} of schedules) {
            const key = selectionKey(url, formation);
            displayed.set(key, schedule.map(event => ({...event, formation, url})));
        }
    }

    function renderLoadedSchedules() {
        events = [...displayed.values()].flat().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)
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
                    mergeSchedules(snapshot);
                    if (snapshot.schedules.length) {
                        renderLoadedSchedules();
                    }
                }, caches[index]);
                if (request.signal.aborted) {
                    return;
                }
                mergeSchedules(result);
                for (const {formation, error} of result.errors) {
                    failures.push({url, formation, error});
                }
                if (result.schedules.length) {
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

        failedFormations = failures.map(item => ({
            ...item, available: displayed.has(selectionKey(item.url, item.formation)),
        }));
        loadedFormations = signature;
        renderFormations();
        showScheduleStatus();
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
    courses = [];
    notices = new Map();
    formationFilter.value = '';
    courseFilter.value = '';
    reviewSelectedCourses = false;
    loadedFormations = '';
    failedFormations = [];
    linkFallback.hidden = true;
    linkStatus.textContent = '';
    statusMessage.textContent = '';
    const address = new URL(location.href);
    const startNew = address.searchParams.has('nouveau');
    const resumeDraft = !startNew && address.searchParams.has('reprendre');
    const historyHash = planningHistoryHash();
    const incomingHash = address.hash || (startNew ? '' : historyHash);

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
            sourceForm.querySelector('button').disabled = true;
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
            created = true;
            statusMessage.textContent = '';
        } else {
            loadLocalChoices(startNew);
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
    } else if (resumeDraft && selections.size) {
        openCourseSelection();
    } else {
        showStep(sources.size ? 2 : 1);
    }
}

sourceForm.addEventListener('submit', async event => {
    event.preventDefault();
    const url = new FormData(sourceForm).get('url');
    if (sources.has(planningSource(url))) {
        sourceForm.reset();
        formationFilter.value = '';
        renderFormations();
        statusMessage.textContent = 'Ce lien est déjà ajouté. Retrouve ses formations ci-dessous.';
        showStep(2, true);
        return;
    }
    const request = startRequest('Recherche des formations');
    function showCatalogue(result) {
        sources.set(result.url, result.formations);
        saveChoices();
        renderFormations();
        if (step === 1) {
            showStep(2, true);
        }
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

saveButton.addEventListener('click', () => {
    try {
        localStorage.setItem('lorr-saved-planning', new URL(portablePlanningLink).hash);
        linkStatus.textContent = 'Planning enregistré. Retrouve-le depuis l’accueil.';
    } catch {
        linkStatus.textContent = 'Impossible de sauvegarder sur cet appareil. Tu peux copier le lien.';
    }
});

exportButton.addEventListener('click', () => {
    const sessions = selectedPlanningSessions();
    const file = new Blob([planningCalendarFile(sessions)], {type: 'text/calendar;charset=utf-8'});
    const address = URL.createObjectURL(file);
    const download = document.createElement('a');
    download.href = address;
    download.download = 'planning-lorr.ics';
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(address), 60000);
});

copyButton.addEventListener('click', async () => {
    const portableLink = portablePlanningLink;
    const revision = planningLinkRevision;
    copyButton.disabled = true;
    linkFallback.hidden = true;
    linkStatus.textContent = 'Création du lien court…';
    const shareLink = shortPlanningLink(portableLink);
    let copied = false;
    try {
        const clipboard = navigator.clipboard;
        if (typeof ClipboardItem === 'function' && clipboard?.write) {
            const text = shareLink.then(address => new Blob([address], {type: 'text/plain'}));
            await clipboard.write([new ClipboardItem({'text/plain': text})]);
        } else {
            await clipboard.writeText(await shareLink);
        }
        copied = true;
    } catch {
        // The link can be selected when the browser denies clipboard access.
    }
    const address = await shareLink;
    if (revision !== planningLinkRevision) {
        return;
    }
    copyButton.disabled = false;
    if (copied) {
        linkStatus.textContent = address === portableLink ? 'Lien complet copié.' : 'Lien court copié !';
    } else {
        linkInput.value = address;
        linkFallback.hidden = false;
        linkInput.focus();
        linkInput.select();
        linkStatus.textContent = 'Sélectionne et copie ce lien.';
    }
});

function goToStep(number) {
    if (number === step || !stepAvailable(number)) {
        return;
    }
    if (number === 4) {
        created = true;
        saveChoices();
        showStep(4, true);
        renderDays();
        return;
    }

    const keepSchedule = number === 3 && scheduleRequest && activeRequest === scheduleRequest;
    if (!keepSchedule) {
        activeRequest?.abort();
        activeRequest = null;
        setBusy(false);
    }
    if (created) {
        created = false;
        saveChoices();
    }
    statusMessage.textContent = '';
    if (number === 3) {
        openCourseSelection();
    } else {
        showStep(number, true);
    }
}

for (const button of stepButtons) {
    button.addEventListener('click', () => goToStep(Number(button.dataset.step)));
}
document.getElementById('add-source').addEventListener('click', () => goToStep(1));
document.getElementById('cancel-source').addEventListener('click', () => goToStep(2));
document.getElementById('edit-formations').addEventListener('click', () => goToStep(2));
editCourses.addEventListener('click', () => goToStep(3));
loadButton.addEventListener('click', () => goToStep(3));
retryButton.addEventListener('click', () => loadSchedule(true));
createButton.addEventListener('click', () => goToStep(4));
checkCourses.addEventListener('click', () => toggleCourses(true));
document.getElementById('uncheck-courses').addEventListener('click', () => toggleCourses(false));
formationFilter.addEventListener('input', renderFormations);
courseFilter.addEventListener('input', renderCourseList);
reviewCourses.addEventListener('click', () => {
    reviewSelectedCourses = !reviewSelectedCourses;
    courseList.scrollTop = 0;
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

window.addEventListener('hashchange', restoreAfterNavigation);
window.addEventListener('popstate', restoreAfterNavigation);
restorePlanning();
