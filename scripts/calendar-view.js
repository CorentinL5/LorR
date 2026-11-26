function createPlanningView(container, element, courseKey, recordCourseClick) {
    const formationFilter = document.getElementById('display-formation-filter');
    const formationSelect = document.getElementById('display-formation');
    const searchPanel = document.getElementById('schedule-search');
    const searchQuery = document.getElementById('schedule-search-query');
    const searchStatus = document.getElementById('schedule-search-status');
    const searchResults = document.getElementById('schedule-search-results');
    const searchMore = document.getElementById('schedule-search-more');
    const searchPageSize = 8;
    const gapPanel = document.getElementById('schedule-gaps');
    const gapTitle = document.getElementById('schedule-gaps-title');
    const gapList = document.getElementById('schedule-gap-list');
    const conflictPanel = document.getElementById('schedule-conflicts');
    const conflictDays = document.getElementById('schedule-conflict-days');
    const upcoming = document.getElementById('upcoming-session');
    const currentPanel = document.getElementById('current-sessions');
    const currentList = document.getElementById('current-sessions-list');
    const countdown = document.getElementById('upcoming-countdown');
    const upcomingDetail = document.getElementById('upcoming-detail');
    const upcomingOpen = document.getElementById('upcoming-open');
    const planningClock = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
    const options = document.getElementById('view-options');
    const pastOption = document.getElementById('past-sessions-option');
    const showPast = document.getElementById('show-past-sessions');
    const calendarFrame = document.getElementById('calendar-frame');
    const navigation = document.getElementById('calendar-tools');
    const previous = document.getElementById('calendar-previous');
    const next = document.getElementById('calendar-next');
    const period = document.getElementById('calendar-period');
    const compactWeek = matchMedia('(max-width: 610px)');
    const dateForm = document.getElementById('calendar-date-form');
    const dateInput = document.getElementById('calendar-date');
    const dayDetails = document.getElementById('day-detail');
    const dayTitle = document.getElementById('day-title');
    const daySessions = document.getElementById('day-sessions');
    const openToday = document.getElementById('open-today');
    const dayActions = document.getElementById('day-actions');
    const copyDay = document.getElementById('copy-day');
    const copyDayStatus = document.getElementById('copy-day-status');
    const copyDayFallback = document.getElementById('copy-day-fallback');
    const copyDayText = document.getElementById('copy-day-text');
    const details = document.getElementById('session-detail');
    const detailTitle = document.getElementById('session-title');
    const detailFields = document.getElementById('session-info');
    const weekdayFormat = new Intl.DateTimeFormat('fr-BE', {weekday: 'long', timeZone: 'UTC'});
    const dayFormat = new Intl.DateTimeFormat('fr-BE', {dateStyle: 'full', timeZone: 'UTC'});
    const shortDate = new Intl.DateTimeFormat('fr-BE', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
    const monthFormat = new Intl.DateTimeFormat('fr-BE', {month: 'long', year: 'numeric', timeZone: 'UTC'});
    const weekdays = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
    const formationOrder = new Intl.Collator('fr-BE', {numeric: true});
    const viewPreferenceKey = 'lorr-calendar-view';

    let mode = 'week';
    try {
        const savedMode = localStorage.getItem(viewPreferenceKey);
        if (['list', 'week', 'month'].includes(savedMode)) {
            mode = savedMode;
        }
    } catch {
        // The calendar remains available without browser storage.
    }
    let currentDate;
    let days = new Map();
    let allDays = new Map();
    let allSessions = [];
    let shownFormations;
    let noticePeriods = [];
    let allNoticePeriods = [];
    let dailyLayouts = new Map();
    let weekScale;
    let firstDate;
    let lastDate;
    let daySummary = '';
    let dayRevision = 0;
    let searchableSessions = [];
    let searchIndex;
    let searchLimit = searchPageSize;

    function addDays(date, offset) {
        const nextDate = new Date(date);
        nextDate.setUTCDate(nextDate.getUTCDate() + offset);
        return nextDate;
    }

    function dateOf(key) {
        return new Date(key + 'T00:00:00Z');
    }

    function keyOf(date) {
        return date.toISOString().slice(0, 10);
    }

    function monday(date) {
        return addDays(date, -((date.getUTCDay() + 6) % 7));
    }

    function firstOfMonth(date, offset = 0) {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
    }

    function today() {
        return dateOf(planningClock.format(new Date()).slice(0, 10));
    }

    function eventTime(event) {
        return event.allDay || !event.start || !event.end ? 'Toute la journée' : event.start + ' – ' + event.end;
    }

    function isAllDayNotice(event) {
        return Boolean(event.notice && event.allDay);
    }

    function dayStatus(sessions) {
        if (sessions.some(event => event.notice === 'holiday'
            || (event.notice === 'pause' && choiceText(event.subject).startsWith('semaine feriee')))) {
            return 'holiday';
        }
        return sessions.length ? '' : 'empty';
    }

    function holidayLabel() {
        return element('span', 'Férié', 'day-status-holiday');
    }

    function emptyDayLabel() {
        return element('span', 'Pas de cours', 'day-status-empty');
    }

    function lastDay(event) {
        return event.rangeEnd || event.date;
    }

    function dateRange(event) {
        const start = dayFormat.format(dateOf(event.date));
        return event.date === lastDay(event) ? start : start + ' au ' + dayFormat.format(dateOf(lastDay(event)));
    }

    function adjust(date) {
        return date < firstDate ? firstDate : date > lastDate ? lastDate : date;
    }

    function showSession(event) {
        detailTitle.textContent = event.subject;
        applyCourseColor(details, event.colorKey || courseKey(event));
        const formations = [...(event.formations || [event.formation])].filter(Boolean).sort(formationOrder.compare);
        let formationValue = formations[0];
        if (formations.length > 1) {
            formationValue = element('ul');
            formationValue.append(...formations.map(name => element('li', name)));
        }
        const fields = [
            [event.date === lastDay(event) ? 'Date' : 'Dates', dateRange(event)],
            ['Horaire', eventTime(event)],
            ['Salle', event.room],
            [formations.length > 1 ? 'Formations' : 'Formation', formationValue],
            ['Groupe', event.group],
            ['Type', event.type],
            ['Enseignant', event.teacher],
        ];
        detailFields.replaceChildren(...fields.filter(([, value]) => value).flatMap(([label, value]) => {
            const description = element('dd');
            description.append(value);
            return [element('dt', label), description];
        }));
        details.showModal();
        if (!event.notice) {
            recordCourseClick();
        }
    }

    function sessionButton(event, label, className) {
        const item = element('button', label, className);
        item.type = 'button';
        item.setAttribute('aria-haspopup', 'dialog');
        item.setAttribute('aria-label', event.subject + ', ' + eventTime(event));
        item.addEventListener('click', () => showSession(event));
        applyCourseColor(item, event.colorKey || courseKey(event));
        return item;
    }

    function sessionCard(event) {
        const item = sessionButton(event, '', 'planning-event');
        item.classList.toggle('calendar-notice', Boolean(event.notice));
        item.append(
            element('span', eventTime(event)),
            element('strong', event.subject),
            element('small', event.notice ? 'Repère du calendrier' : [event.group || event.formation, event.type, event.room].filter(Boolean).join(' · ')),
        );
        return item;
    }

    function renderSearch(focusResult = null) {
        searchPanel.hidden = !searchableSessions.length;
        const terms = choiceText(searchQuery.value).split(' ').filter(Boolean);
        if (!terms.length || !searchableSessions.length) {
            searchResults.replaceChildren();
            searchStatus.textContent = '';
            searchMore.hidden = true;
            return;
        }

        if (!searchIndex) {
            const dates = new Map();
            searchIndex = searchableSessions.map(event => {
                if (!dates.has(event.date)) dates.set(event.date, dayFormat.format(dateOf(event.date)));
                const date = dates.get(event.date);
                const text = choiceText([event.subject, event.room, event.group, event.teacher, event.formation, event.type, date].join(' '));
                return {event, date, text};
            });
        }
        const now = planningClock.format(new Date()).replace(',', '');
        const upcoming = [];
        const past = [];
        for (const {event, date, text} of searchIndex) {
            if (!terms.every(term => text.includes(term))) continue;
            const end = event.end || '23:59';
            (event.date + ' ' + end > now ? upcoming : past).push({event, date});
        }
        const count = upcoming.length + past.length;
        const matches = upcoming.concat(past.reverse()).slice(0, searchLimit);
        const previousFocus = searchResults.contains(document.activeElement) ? document.activeElement.dataset.session : null;
        searchResults.replaceChildren(...matches.map(({event, date}) => {
            const item = element('li');
            const button = sessionCard(event);
            button.dataset.session = sessionKey(event);
            button.setAttribute('aria-label', [event.subject, date, eventTime(event), event.room].filter(Boolean).join(', '));
            item.append(element('span', date, 'search-session-date'), button);
            return item;
        }));
        searchStatus.textContent = !count ? 'Aucune séance ne correspond à la recherche.'
            : matches.length < count ? matches.length + ' séances affichées sur ' + count
                : count + (count === 1 ? ' séance trouvée' : ' séances trouvées');
        searchMore.hidden = matches.length >= count;
        if (focusResult !== null || previousFocus) {
            const buttons = [...searchResults.querySelectorAll('button')];
            const target = focusResult !== null ? buttons[focusResult] : buttons.find(button => button.dataset.session === previousFocus);
            (target ?? searchQuery).focus();
        }
    }

    searchQuery.addEventListener('input', () => {
        searchLimit = searchPageSize;
        renderSearch();
    });
    searchMore.addEventListener('click', () => {
        const previousLimit = searchLimit;
        searchLimit += searchPageSize;
        renderSearch(previousLimit);
    });

    function showDay(date, sessions, emptyLabel = 'Aucune séance prévue ce jour.') {
        dayRevision++;
        const title = dayFormat.format(date);
        dayTitle.textContent = title;
        const classes = sessions.filter(event => !event.notice);
        const summaryRows = classes.map(event => [eventTime(event), event.subject, event.room].filter(Boolean).join(' · '));
        const incomplete = allSchedulesAvailable ? '' : 'Horaires incomplets. Certaines séances peuvent manquer.';
        daySummary = ['LorR · ' + title, incomplete, ...summaryRows].filter(Boolean).join('\n');
        dayActions.hidden = !classes.length;
        copyDayStatus.textContent = '';
        copyDayFallback.hidden = true;
        copyDayText.value = '';
        const cards = sessions.map(sessionCard);
        if (incomplete) cards.unshift(element('p', incomplete));
        if (!cards.length) cards.push(element('p', emptyLabel));
        daySessions.replaceChildren(...cards);
        dayDetails.showModal();
    }

    function openCalendarDate(date, schedule = days) {
        const key = keyOf(date);
        const inRange = firstDate && lastDate && date >= firstDate && date <= lastDate;
        if (inRange) {
            currentDate = date;
            if (mode !== 'list') render();
        }
        showDay(date, schedule.get(key) ?? [], inRange ? undefined : 'Aucun horaire chargé pour cette date.');
    }

    openToday.addEventListener('click', () => {
        const date = today();
        dateInput.value = keyOf(date);
        openCalendarDate(date, allDays);
    });

    dateForm.addEventListener('submit', event => {
        event.preventDefault();
        if (dateInput.valueAsDate) openCalendarDate(dateInput.valueAsDate);
    });

    copyDay.addEventListener('click', async () => {
        const revision = dayRevision;
        try {
            await navigator.clipboard.writeText(daySummary);
            if (dayDetails.open && revision === dayRevision) {
                copyDayStatus.textContent = 'Horaires et salles copiés.';
            }
        } catch {
            if (dayDetails.open && revision === dayRevision) {
                copyDayText.value = daySummary;
                copyDayFallback.hidden = false;
                copyDayText.focus();
                copyDayText.select();
                copyDayStatus.textContent = 'Le résumé est sélectionné. Tu peux le copier.';
            }
        }
    });

    function dayDetailButton(date, sessions, label, className) {
        const button = element('button', label, className);
        button.type = 'button';
        button.setAttribute('aria-label', dayFormat.format(date));
        button.setAttribute('aria-haspopup', 'dialog');
        button.addEventListener('click', () => showDay(date, sessions));
        return button;
    }

    function renderList() {
        const todayKey = keyOf(today());
        const entries = new Map();
        for (const [key, events] of days) {
            const timed = events.filter(event => !isAllDayNotice(event));
            if (timed.length) {
                entries.set(key, {date: key, end: key, events: timed});
            }
        }
        const ranges = [];
        for (const event of noticePeriods) {
            if (event.date === lastDay(event)) {
                if (!entries.has(event.date)) {
                    entries.set(event.date, {date: event.date, end: event.date, events: []});
                }
                entries.get(event.date).events.unshift(event);
            } else {
                ranges.push({date: event.date, end: lastDay(event), events: [event]});
            }
        }

        const ordered = [...ranges, ...entries.values()].sort((a, b) => a.date.localeCompare(b.date));
        pastOption.hidden = !ordered.some(entry => entry.end < todayKey);
        const visible = showPast.checked ? ordered : ordered.filter(entry => entry.end >= todayKey);
        if (!visible.length) {
            container.append(element('p', 'Aucune séance à venir.', 'empty-planning'));
        }
        let previousWeek;
        let section;
        for (const entry of visible) {
            const week = monday(dateOf(entry.date));
            const weekKey = keyOf(week);
            if (weekKey !== previousWeek) {
                previousWeek = weekKey;
                section = element('section', '', 'planning-week');
                section.append(element('h3', 'Semaine du ' + shortDate.formatRange(week, addDays(week, 6))));
                container.append(section);
            }

            const block = element('section', '', 'planning-day');
            block.classList.toggle('planning-day-range', entry.date !== entry.end);
            const title = element('h4', dayFormat.format(dateOf(entry.date)));
            if (entry.date !== entry.end) {
                title.append(
                    element('span', ' au ', 'range-separator'),
                    element('span', dayFormat.format(dateOf(entry.end))),
                );
            }
            if (entry.date <= todayKey && entry.end >= todayKey) {
                title.setAttribute('aria-current', 'date');
                title.append(element('span', 'Aujourd’hui', 'today-label'));
            }
            block.append(title, ...entry.events.map(sessionCard));
            section.append(block);
        }
    }

    function minutes(time = '') {
        const [hour, minute] = time.split(':').map(Number);
        return hour * 60 + minute;
    }

    function layoutDay(date) {
        const entries = days.get(keyOf(date)) || [];
        const slots = [];
        const allDay = [];
        for (const session of entries) {
            const start = minutes(session.start);
            const end = minutes(session.end);
            if (session.allDay || !Number.isFinite(start) || !Number.isFinite(end)) {
                allDay.push(session);
            } else {
                slots.push({session, start, end: end < start ? 1440 : Math.max(start + 1, end)});
            }
        }
        slots.sort((a, b) => a.start - b.start || b.end - a.end);

        let cluster = [];
        let laneEnds = [];
        let clusterEnd = 0;
        function finishCluster() {
            for (const slot of cluster) {
                slot.lanes = laneEnds.length;
            }
            cluster = [];
            laneEnds = [];
        }
        for (const slot of slots) {
            if (slot.start >= clusterEnd) {
                finishCluster();
            }
            const available = laneEnds.findIndex(end => end <= slot.start);
            slot.lane = available === -1 ? laneEnds.length : available;
            laneEnds[slot.lane] = slot.end;
            clusterEnd = Math.max(...laneEnds);
            cluster.push(slot);
        }
        finishCluster();
        return {date, allDay, slots, status: dayStatus(entries)};
    }

    function updateWeekScale() {
        let firstHour = 8;
        let lastHour = 18;
        let noticeRows = 0;
        dailyLayouts = new Map();
        for (const key of days.keys()) {
            const day = layoutDay(dateOf(key));
            dailyLayouts.set(key, day);
            noticeRows = Math.max(noticeRows, day.allDay.length);
            for (const slot of day.slots) {
                firstHour = Math.min(firstHour, Math.floor(slot.start / 60));
                lastHour = Math.max(lastHour, Math.ceil(slot.end / 60));
            }
        }
        const bandHeight = noticeRows ? 2.7 + (noticeRows - 1) * 1.9 : 0;
        const height = Math.max(48, 4.65 + bandHeight + (lastHour - firstHour) * 3.4);
        weekScale = {firstHour, lastHour, noticeRows, height};
    }

    function renderWeekNotices(week, start, rows) {
        if (!rows) {
            return null;
        }
        const first = keyOf(start);
        const last = keyOf(addDays(start, 6));
        const visible = noticePeriods.filter(event => event.date <= last && lastDay(event) >= first);
        for (const day of week) {
            visible.push(...day.allDay.filter(event => !isAllDayNotice(event)));
        }
        const offset = date => (dateOf(date) - start) / 86400000;
        const ranges = visible.map(event => ({
            event, from: Math.max(0, offset(event.date)), to: Math.min(6, offset(lastDay(event))),
        })).sort((a, b) => a.from - b.from || b.to - a.to);
        const lanes = [];
        for (const range of ranges) {
            const row = lanes.findIndex(end => end < range.from);
            range.row = row < 0 ? lanes.length : row;
            lanes[range.row] = range.to;
        }

        const band = element('div', '', 'week-notice-band');
        band.style.gridTemplateRows = rows === 1 ? '2.7rem' : '2.7rem repeat(' + (rows - 1) + ', 1.9rem)';
        const rowSpan = '1 / span ' + rows;
        const label = element('div', 'Toute la journée', 'week-all-day week-all-day-label');
        label.style.gridColumn = '1';
        label.style.gridRow = rowSpan;
        band.append(label);
        for (let day = 0; day < week.length; day++) {
            const cell = element('div', '', 'week-all-day');
            cell.style.gridColumn = day + 2;
            cell.style.gridRow = rowSpan;
            band.append(cell);
        }
        for (const {event, from, to, row} of ranges) {
            const chip = sessionButton(event, event.subject, 'calendar-chip week-notice-chip');
            chip.style.gridColumn = (from + 2) + ' / ' + (to + 3);
            chip.style.gridRow = row + 1;
            if (lastDay(event) !== event.date) {
                chip.append(element('span', shortDate.formatRange(dateOf(event.date), dateOf(lastDay(event))), 'week-notice-dates'));
                chip.setAttribute('aria-label', event.subject + ', ' + dateRange(event) + ', ' + eventTime(event));
            }
            band.append(chip);
        }
        return band;
    }

    function renderWeek(start, todayKey) {
        const week = Array.from({length: 7}, (_, index) => {
            const date = addDays(start, index);
            return dailyLayouts.get(keyOf(date)) || layoutDay(date);
        });
        const {firstHour, lastHour, noticeRows} = weekScale;
        const duration = (lastHour - firstHour) * 60;
        const grid = element('div', '', 'calendar-grid calendar-week');
        grid.style.setProperty('--week-hours', lastHour - firstHour);
        grid.classList.toggle('has-week-notices', noticeRows > 0);

        grid.append(element('div', 'Heures', 'calendar-weekday week-axis-title'));
        for (const [index, day] of week.entries()) {
            const label = weekdays[index] + ' ' + day.date.getUTCDate();
            const heading = element('div', '', 'calendar-weekday week-date');
            const events = days.get(keyOf(day.date)) || [];
            heading.append(events.length ? dayDetailButton(day.date, events, label, 'week-date-button') : label);
            heading.setAttribute('aria-label', dayFormat.format(day.date));
            if (keyOf(day.date) === todayKey) {
                heading.setAttribute('aria-current', 'date');
                heading.append(element('span', 'Aujourd’hui', 'today-label'));
            }
            if (day.status === 'holiday') {
                heading.classList.add('calendar-holiday');
                heading.append(holidayLabel());
            }
            grid.append(heading);
        }

        const allDay = renderWeekNotices(week, start, noticeRows);
        if (allDay) {
            grid.append(allDay);
        }

        const scale = element('div', '', 'week-time-axis');
        scale.setAttribute('aria-hidden', 'true');
        for (let hour = firstHour; hour <= lastHour; hour++) {
            const label = element('span', String(hour).padStart(2, '0') + ':00', 'week-hour');
            label.style.top = (hour - firstHour) * 60 / duration * 100 + '%';
            if (hour === lastHour) {
                label.classList.add('week-hour-last');
            }
            scale.append(label);
        }
        grid.append(scale);

        for (const day of week) {
            const column = element('section', '', 'week-track');
            column.setAttribute('aria-label', dayFormat.format(day.date));
            column.classList.toggle('week-track-today', keyOf(day.date) === todayKey);
            if (day.status === 'holiday') {
                column.classList.add('calendar-holiday');
            } else if (day.status === 'empty') {
                column.append(emptyDayLabel());
            }
            for (const slot of day.slots) {
                const card = sessionCard(slot.session);
                const length = slot.end - slot.start;
                card.classList.add('week-session');
                card.classList.toggle('week-session-short', length < 45);
                card.classList.toggle('week-session-tiny', length < 25);
                card.style.top = (slot.start - firstHour * 60) / duration * 100 + '%';
                card.style.height = length / duration * 100 + '%';
                card.style.insetInlineStart = slot.lane / slot.lanes * 100 + '%';
                card.style.width = 100 / slot.lanes + '%';
                column.append(card);
            }
            grid.append(column);
        }
        return grid;
    }

    function renderMonth(monthStart, todayKey) {
        const start = monday(monthStart);
        const end = addDays(firstOfMonth(monthStart, 1), -1);
        const grid = element('div', '', 'calendar-grid calendar-month');

        for (const day of weekdays) {
            grid.append(element('div', day, 'calendar-weekday'));
        }
        for (let index = 0; index < 42; index++) {
            const date = addDays(start, index);
            const key = keyOf(date);
            const sessions = days.get(key) || [];
            const cell = element('section', '', 'calendar-cell');
            cell.setAttribute('aria-label', dayFormat.format(date));
            const outside = date < monthStart || date > end;
            const status = dayStatus(sessions);
            cell.classList.toggle('outside-month', outside);
            const header = element('div', '', 'calendar-cell-header');
            if (sessions.length) {
                header.append(dayDetailButton(date, sessions, String(date.getUTCDate()), 'calendar-date'));
            } else {
                header.append(element('h3', String(date.getUTCDate()), 'calendar-date'));
            }
            if (status === 'holiday') {
                cell.classList.add('calendar-holiday');
                header.append(holidayLabel());
            }
            if (key === todayKey) {
                cell.setAttribute('aria-current', 'date');
                header.append(element('span', 'Aujourd’hui', 'today-label'));
            }
            cell.append(header);
            if (status === 'empty' && !outside) {
                cell.append(emptyDayLabel());
            }

            for (const event of sessions.slice(0, 2)) {
                cell.append(sessionButton(event, event.subject, 'calendar-chip'));
            }
            const overflow = sessions.length - 2;
            if (overflow > 0) {
                const extra = element('button', '+' + overflow + (overflow === 1 ? ' séance' : ' séances'), 'calendar-extra');
                extra.type = 'button';
                extra.setAttribute('aria-haspopup', 'dialog');
                extra.addEventListener('click', () => showDay(date, sessions));
                cell.append(extra);
            }
            grid.append(cell);
        }
        return grid;
    }

    function renderCompactWeek(start, todayKey) {
        const week = element('div', '', 'compact-week');
        week.setAttribute('role', 'region');
        week.setAttribute('aria-label', 'Calendrier de la semaine');
        for (let index = 0; index < 7; index++) {
            const date = addDays(start, index);
            const key = keyOf(date);
            const sessions = days.get(key) ?? [];
            const section = element('section', '', 'planning-day compact-week-day');
            const title = element('h3', dayFormat.format(date));
            section.classList.toggle('compact-week-empty', !sessions.length);
            if (key === todayKey) {
                title.setAttribute('aria-current', 'date');
                title.append(element('span', 'Aujourd’hui', 'today-label'));
            }
            section.append(title, ...sessions.map(sessionCard));
            if (!sessions.length) {
                const message = date < firstDate || date > lastDate
                    ? 'Aucun horaire chargé.' : 'Aucune séance prévue.';
                section.append(element('p', message));
            }
            week.append(section);
        }
        container.append(week);
    }

    function renderCalendar() {
        const weekly = mode === 'week';
        const start = weekly ? monday(currentDate) : firstOfMonth(currentDate);
        const firstPeriod = weekly ? monday(firstDate) : firstOfMonth(firstDate);
        const lastPeriod = weekly ? monday(lastDate) : firstOfMonth(lastDate);
        const todayDate = today();
        previous.disabled = start <= firstPeriod;
        next.disabled = start >= lastPeriod;
        period.textContent = weekly ? shortDate.formatRange(start, addDays(start, 6)) : monthFormat.format(currentDate);
        const todayKey = keyOf(todayDate);
        if (weekly && compactWeek.matches) {
            renderCompactWeek(start, todayKey);
            return;
        }
        const viewport = element('div', '', 'calendar-viewport');
        viewport.setAttribute('role', 'region');
        viewport.setAttribute('aria-label', weekly ? 'Calendrier de la semaine' : 'Calendrier du mois');
        viewport.style.setProperty('--calendar-height', weekScale.height + 'rem');
        viewport.append(weekly ? renderWeek(start, todayKey) : renderMonth(start, todayKey));
        container.append(viewport);
    }

    function render() {
        calendarFrame.classList.toggle('compact-week-frame', mode === 'week' && compactWeek.matches);
        pastOption.hidden = true;
        container.replaceChildren();
        options.hidden = !days.size;
        dateForm.hidden = !days.size;
        if (!dateInput.value) dateInput.value = keyOf(today());
        navigation.hidden = !days.size || mode === 'list';
        for (const button of options.querySelectorAll('[data-view]')) {
            button.setAttribute('aria-pressed', String(button.dataset.view === mode));
        }
        if (!days.size) {
            return;
        }
        if (mode === 'list') {
            renderList();
        } else {
            renderCalendar();
        }
    }

    function move(offset) {
        const focused = document.activeElement;
        currentDate = adjust(mode === 'week' ? addDays(currentDate, offset * 7) : firstOfMonth(currentDate, offset));
        render();
        if (mode === 'week' && compactWeek.matches) calendarFrame.scrollIntoView({block: 'start'});
        if (focused.disabled && (focused === previous || focused === next)) period.focus({preventScroll: true});
    }

    options.addEventListener('click', event => {
        const button = event.target.closest('[data-view]');
        if (button) {
            mode = button.dataset.view;
            try {
                localStorage.setItem(viewPreferenceKey, mode);
            } catch {
                // Keep the selected view for this page.
            }
            render();
        }
    });
    showPast.addEventListener('change', render);
    compactWeek.addEventListener('change', render);
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    let visibleSession;
    let currentSessionKeys;
    let timedSessions = [];
    let shownConflicts;
    let shownGaps;
    let allSchedulesAvailable = false;
    upcomingOpen.addEventListener('click', () => {
        if (visibleSession) showSession(visibleSession);
    });

    function renderConflicts(now, first, last) {
        const conflicts = [];
        for (const [date, sessions] of allDays) {
            if (date < first || date > last) continue;
            const overlaps = new Set();
            const periods = [];
            let latestEnding;
            for (const session of sessions) {
                if (session.notice || session.allDay || !session.start || !session.end
                    || session.start >= session.end || date + ' ' + session.end <= now) continue;
                // Sessions arrive sorted by start time. Only the latest end can overlap the next start.
                if (latestEnding && session.start < latestEnding.end) {
                    overlaps.add(latestEnding);
                    overlaps.add(session);
                    const end = session.end < latestEnding.end ? session.end : latestEnding.end;
                    const previous = periods.at(-1);
                    if (previous && session.start <= previous[1]) {
                        if (end > previous[1]) previous[1] = end;
                    } else {
                        periods.push([session.start, end]);
                    }
                }
                if (!latestEnding || session.end > latestEnding.end) latestEnding = session;
            }
            if (overlaps.size) {
                conflicts.push([date, periods, [...new Set([...overlaps].map(session => session.subject))]]);
            }
        }

        const signature = JSON.stringify(conflicts);
        if (signature === shownConflicts) return;
        shownConflicts = signature;
        const focusedDate = document.activeElement.dataset?.conflictDate;
        conflictPanel.hidden = !conflicts.length;
        conflictDays.replaceChildren(...conflicts.map(([date, periods, subjects]) => {
            const dateLabel = dayFormat.format(dateOf(date));
            const item = element('li');
            const button = element('button', 'Voir la journée', 'button button-light');
            button.type = 'button';
            button.dataset.conflictDate = date;
            button.setAttribute('aria-label', 'Voir la journée du ' + dateLabel);
            button.setAttribute('aria-haspopup', 'dialog');
            button.addEventListener('click', () => showDay(dateOf(date), allDays.get(date)));
            const hours = periods.map(([start, end]) => start + '–' + end).join(', ');
            item.append(element('p', [dateLabel, hours, subjects.join(', ')].join(' · ')), button);
            return item;
        }));
        if (focusedDate) {
            const button = [...conflictDays.querySelectorAll('button')].find(item => item.dataset.conflictDate === focusedDate);
            (button ?? (upcoming.hidden ? document.getElementById('planning-title') : upcomingOpen)).focus();
        }
    }

    function sessionEndDate(event) {
        return event.end < event.start ? nextPlanningDay(event.date) : event.date;
    }

    function compactDuration(total) {
        const hours = Math.floor(total / 60);
        const minutes = total % 60;
        return hours ? hours + ' h' + (minutes ? ' ' + String(minutes).padStart(2, '0') : '') : minutes + ' min';
    }

    function upcomingTimeLabel(event, now, timestamp) {
        const {date, start} = event;
        const dateKey = now.slice(0, 10);
        if (date === dateKey) {
            const remaining = calendarTimestamp(date, start) - timestamp;
            if (!Number.isFinite(remaining)) return '';
            if (remaining < 60000) return 'Dans moins d’une minute';
            return 'Dans ' + compactDuration(Math.ceil(remaining / 60000));
        }
        const day = dateOf(date);
        const daysAway = (day - dateOf(dateKey)) / 86400000;
        const label = daysAway === 1 ? 'Demain' : daysAway < 7 ? weekdayFormat.format(day) : dayFormat.format(day);
        const [hour, minute] = start.split(':');
        return label[0].toUpperCase() + label.slice(1) + ' à ' + Number(hour) + ' h' + (minute === '00' ? '' : ' ' + minute);
    }

    function renderCurrentSessions(sessions, timestamp) {
        const signature = JSON.stringify(sessions.map(sessionKey));
        if (signature !== currentSessionKeys) {
            const focused = currentList.contains(document.activeElement) ? document.activeElement.dataset.session : null;
            currentSessionKeys = signature;
            currentPanel.hidden = !sessions.length;
            currentList.replaceChildren(...sessions.map(event => {
                const item = element('li');
                const card = sessionCard(event);
                card.dataset.session = sessionKey(event);
                item.append(card, element('p', '', 'current-session-elapsed'));
                return item;
            }));
            if (focused) {
                const button = [...currentList.querySelectorAll('button')].find(item => item.dataset.session === focused);
                (button ?? (upcoming.hidden ? document.getElementById('planning-title') : upcomingOpen)).focus({preventScroll: true});
            }
        }
        for (const [index, label] of [...currentList.querySelectorAll('.current-session-elapsed')].entries()) {
            const {date, start} = sessions[index];
            const elapsed = Math.floor((timestamp - calendarTimestamp(date, start)) / 60000);
            const text = elapsed >= 1 ? 'Commencé il y a ' + compactDuration(elapsed) : 'Vient de commencer';
            if (label.textContent !== text) label.textContent = text;
        }
    }

    function renderUpcoming(now, timestamp) {
        const current = timedSessions.filter(event => event.date + ' ' + event.start <= now
            && sessionEndDate(event) + ' ' + event.end > now);
        visibleSession = timedSessions.find(event => event.date + ' ' + event.start > now);
        upcoming.hidden = !visibleSession;
        if (visibleSession) {
            upcomingDetail.textContent = [
                visibleSession.subject, dayFormat.format(dateOf(visibleSession.date)), eventTime(visibleSession), visibleSession.room,
            ].filter(Boolean).join(' · ');
            const label = upcomingTimeLabel(visibleSession, now, timestamp);
            if (countdown.textContent !== label) countdown.textContent = label;
            countdown.hidden = !label;
        }
        renderCurrentSessions(current, timestamp);
    }

    function renderGaps(now, first, last) {
        const gaps = [];
        for (const [date, sessions] of allDays) {
            if (!allSchedulesAvailable || date < first || date > last || sessions.some(event => !event.notice && event.allDay)) continue;
            const earliest = date === first ? now.slice(11) : '00:00';
            let occupiedUntil = '';
            for (const session of sessions) {
                if (session.notice || !session.start || !session.end || session.end <= session.start) continue;
                if (occupiedUntil && occupiedUntil < session.start) {
                    const freeFrom = occupiedUntil > earliest ? occupiedUntil : earliest;
                    const freeMinutes = minutes(session.start) - minutes(freeFrom);
                    if (freeMinutes >= 30) {
                        gaps.push({date, start: occupiedUntil, end: session.start, freeMinutes, ongoing: freeFrom > occupiedUntil});
                    }
                }
                if (session.end > occupiedUntil) occupiedUntil = session.end;
            }
        }

        const signature = JSON.stringify(gaps);
        if (signature === shownGaps) return;
        shownGaps = signature;
        if (!gaps.length && document.activeElement === gapTitle) {
            (upcoming.hidden ? document.getElementById('planning-title') : upcomingOpen).focus();
        }
        gapPanel.hidden = !gaps.length;
        if (!gaps.length) return;
        const count = gaps.length;
        gapTitle.textContent = count === 1 ? '1 créneau libre entre tes cours' : count + ' créneaux libres entre tes cours';
        gapList.replaceChildren(...gaps.map(({date, start, end, freeMinutes, ongoing}) => {
            const hours = Math.floor(freeMinutes / 60);
            const remainder = freeMinutes % 60;
            const duration = [hours ? hours + ' h' : '', remainder ? remainder + ' min' : ''].filter(Boolean).join(' ');
            const item = element('li');
            item.append(
                element('strong', dayFormat.format(dateOf(date))),
                element('span', start + '–' + end + ' · ' + duration + (ongoing ? ' restantes' : ' de libre')),
            );
            return item;
        }));
    }

    function renderAgendaSummary() {
        const timestamp = Date.now();
        const now = planningClock.format(timestamp).replace(',', '');
        const first = now.slice(0, 10);
        const last = keyOf(addDays(dateOf(first), 6));
        renderUpcoming(now, timestamp);
        renderConflicts(now, first, last);
        renderGaps(now, first, last);
    }

    setInterval(renderAgendaSummary, 30_000);

    function groupDays(sessions) {
        const grouped = new Map();
        for (const event of sessions) {
            if (!grouped.has(event.date)) grouped.set(event.date, []);
            grouped.get(event.date).push(event);
        }
        return grouped;
    }

    function updateFormationOptions() {
        const options = new Map();
        for (const event of allSessions) {
            if (event.notice) continue;
            for (const formation of event.formations) {
                options.set(JSON.stringify([event.url, formation]), {url: event.url, formation});
            }
        }
        const entries = [...options].sort((a, b) => formationOrder.compare(a[1].formation, b[1].formation)
            || a[1].url.localeCompare(b[1].url));
        const signature = JSON.stringify(entries.map(([key]) => key));
        if (signature === shownFormations) return;
        shownFormations = signature;
        const multiple = options.size > 1;
        const previous = formationSelect.value;
        formationFilter.hidden = !multiple;
        formationSelect.replaceChildren(new Option('Toutes les formations', ''));
        if (!multiple) return;
        const counts = new Map();
        for (const {formation} of options.values()) counts.set(formation, (counts.get(formation) ?? 0) + 1);
        for (const [key, {url, formation}] of entries) {
            const label = counts.get(formation) > 1 ? formation + ' · ' + new URL(url).hostname : formation;
            formationSelect.add(new Option(label, key));
        }
        if (options.has(previous)) formationSelect.value = previous;
    }

    function renderDisplayedSchedule() {
        const filter = formationSelect.value;
        let sessions = allSessions;
        if (filter) {
            const [url, formation] = JSON.parse(filter);
            sessions = allSessions.filter(event => event.url === url && event.formations.has(formation));
        }
        days = filter ? groupDays(sessions) : allDays;
        noticePeriods = filter ? groupNoticePeriods(sessions) : allNoticePeriods;
        searchableSessions = sessions.filter(event => !event.notice);
        searchIndex = null;
        renderSearch();
        if (days.size) updateWeekScale();
        render();
    }

    formationSelect.addEventListener('change', () => {
        searchLimit = searchPageSize;
        renderDisplayedSchedule();
    });

    return {
        openDay(date) {
            showDay(dateOf(date), allDays.get(date) ?? []);
        },
        show(sessions, schedulesAvailable) {
            allSchedulesAvailable = schedulesAvailable;
            allSessions = sessions;
            allDays = groupDays(sessions);
            allNoticePeriods = groupNoticePeriods(sessions);
            timedSessions = sessions.filter(event => !event.notice && !event.allDay && event.start && event.end);
            firstDate = undefined;
            lastDate = undefined;
            if (allDays.size) {
                const dates = [...allDays.keys()];
                const date = today();
                const first = dateOf(dates[0]);
                firstDate = first < date ? first : date;
                lastDate = dateOf(dates.at(-1));
                currentDate = adjust(currentDate || date);
            }
            updateFormationOptions();
            renderDisplayedSchedule();
            renderAgendaSummary();
            return allNoticePeriods.length + sessions.filter(event => event.notice && !isAllDayNotice(event)).length;
        },
    };
}

function applyCourseColor(element, key) {
    let seed = 0;
    for (const letter of key) {
        seed = (Math.imul(seed, 31) + letter.codePointAt(0)) >>> 0;
    }
    const hue = seed % 360;
    const saturation = 55 + Math.floor(seed / 360) % 22;
    const lightness = 86 + Math.floor(seed / 7920) % 7;
    element.style.setProperty('--course-color', 'hsl(' + hue + ' ' + saturation + '% ' + lightness + '%)');
    element.style.setProperty('--course-accent', 'hsl(' + hue + ' ' + saturation + '% 69%)');
}
