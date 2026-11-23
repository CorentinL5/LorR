function createPlanningView(container, element, courseKey) {
    const options = document.getElementById('view-options');
    const navigation = document.getElementById('calendar-tools');
    const previous = document.getElementById('calendar-previous');
    const next = document.getElementById('calendar-next');
    const period = document.getElementById('calendar-period');
    const weekPicker = document.getElementById('week-picker');
    const weekSelect = document.getElementById('calendar-week-select');
    const todayButton = document.getElementById('calendar-today');
    const dayDetails = document.getElementById('day-detail');
    const dayTitle = document.getElementById('day-title');
    const daySessions = document.getElementById('day-sessions');
    const details = document.getElementById('session-detail');
    const detailTitle = document.getElementById('session-title');
    const detailFields = document.getElementById('session-info');
    const dayFormat = new Intl.DateTimeFormat('fr-BE', {dateStyle: 'full', timeZone: 'UTC'});
    const shortDate = new Intl.DateTimeFormat('fr-BE', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
    const monthFormat = new Intl.DateTimeFormat('fr-BE', {month: 'long', year: 'numeric', timeZone: 'UTC'});
    const weekdays = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
    const formationOrder = new Intl.Collator('fr-BE', {numeric: true});

    let mode = 'list';
    let currentDate;
    let days = new Map();
    let noticePeriods = [];
    let dailyLayouts = new Map();
    let weekScale;
    const scrollPositions = new Map();
    let firstDate;
    let lastDate;

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
        const date = new Date();
        return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
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

    function groupNoticePeriods(sessions) {
        const periods = [];
        const recent = new Map();
        for (const event of sessions) {
            if (!isAllDayNotice(event)) {
                continue;
            }
            const formations = [...(event.formations || [event.formation])].sort(formationOrder.compare);
            const key = JSON.stringify([event.url, event.notice, event.subject, formations]);
            const previous = recent.get(key);
            const consecutive = previous && keyOf(addDays(dateOf(lastDay(previous)), 1)) === event.date;
            if (consecutive) {
                previous.rangeEnd = event.date;
            } else {
                const period = {...event};
                periods.push(period);
                recent.set(key, period);
            }
        }
        return periods;
    }

    function fillWeekPicker() {
        weekSelect.replaceChildren();
        for (let week = monday(firstDate); week <= lastDate; week = addDays(week, 7)) {
            weekSelect.add(new Option(shortDate.formatRange(week, addDays(week, 6)), keyOf(week)));
        }
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

    function showDay(date, sessions) {
        dayTitle.textContent = dayFormat.format(date);
        daySessions.replaceChildren(...sessions.map(sessionCard));
        dayDetails.showModal();
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
        let previousWeek;
        let section;
        for (const entry of ordered) {
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
        let width = 1;
        function finishCluster() {
            for (const slot of cluster) {
                slot.lanes = laneEnds.length;
            }
            width = Math.max(width, laneEnds.length);
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
        return {date, allDay, slots, width, status: dayStatus(entries)};
    }

    function updateWeekScale() {
        const widths = [110, 110, 110, 110, 110, 84, 84];
        let firstHour = 8;
        let lastHour = 18;
        let noticeRows = 0;
        dailyLayouts = new Map();
        for (const key of days.keys()) {
            const day = layoutDay(dateOf(key));
            dailyLayouts.set(key, day);
            const weekday = (day.date.getUTCDay() + 6) % 7;
            widths[weekday] = Math.max(widths[weekday], day.width * 84);
            noticeRows = Math.max(noticeRows, day.allDay.length);
            for (const slot of day.slots) {
                firstHour = Math.min(firstHour, Math.floor(slot.start / 60));
                lastHour = Math.max(lastHour, Math.ceil(slot.end / 60));
            }
        }
        weekScale = {firstHour, lastHour, widths, noticeRows};
    }

    function renderWeekNotices(week, start, columns, rows) {
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
        band.style.gridTemplateColumns = columns;
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
        const {firstHour, lastHour, widths, noticeRows} = weekScale;
        const duration = (lastHour - firstHour) * 60;
        const grid = element('div', '', 'calendar-grid calendar-week');
        grid.style.gridTemplateColumns = '4rem ' + widths.map(width => 'minmax(' + width + 'px, 1fr)').join(' ');
        grid.style.minWidth = 'calc(4rem + ' + widths.reduce((sum, width) => sum + width, 0) + 'px)';
        grid.style.setProperty('--week-hours', lastHour - firstHour);

        grid.append(element('div', 'Heures', 'calendar-weekday week-axis-title'));
        for (const [index, day] of week.entries()) {
            const heading = element('div', weekdays[index] + ' ' + day.date.getUTCDate(), 'calendar-weekday week-date');
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

        const allDay = renderWeekNotices(week, start, grid.style.gridTemplateColumns, noticeRows);
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
                const dateButton = element('button', String(date.getUTCDate()), 'calendar-date');
                dateButton.type = 'button';
                dateButton.setAttribute('aria-label', dayFormat.format(date));
                dateButton.setAttribute('aria-haspopup', 'dialog');
                dateButton.addEventListener('click', () => showDay(date, sessions));
                header.append(dateButton);
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

    function renderCalendar() {
        const weekly = mode === 'week';
        const start = weekly ? monday(currentDate) : firstOfMonth(currentDate);
        const firstPeriod = weekly ? monday(firstDate) : firstOfMonth(firstDate);
        const lastPeriod = weekly ? monday(lastDate) : firstOfMonth(lastDate);
        previous.disabled = start <= firstPeriod;
        next.disabled = start >= lastPeriod;
        period.textContent = weekly ? shortDate.formatRange(start, addDays(start, 6)) : monthFormat.format(currentDate);
        weekPicker.hidden = !weekly;
        if (weekly) {
            weekSelect.value = keyOf(start);
        }

        const scroll = element('div', '', 'calendar-scroll');
        scroll.tabIndex = 0;
        scroll.dataset.view = mode;
        scroll.setAttribute('role', 'region');
        scroll.setAttribute('aria-label', weekly ? 'Calendrier de la semaine' : 'Calendrier du mois');
        const todayKey = keyOf(today());
        scroll.append(weekly ? renderWeek(start, todayKey) : renderMonth(start, todayKey));
        container.append(scroll);
        const position = scrollPositions.get(mode);
        if (position) {
            scroll.scrollLeft = position.left;
            scroll.scrollTop = position.top;
        }
    }

    function render() {
        const previousScroll = container.querySelector('.calendar-scroll');
        if (previousScroll) {
            scrollPositions.set(previousScroll.dataset.view, {
                left: previousScroll.scrollLeft, top: previousScroll.scrollTop,
            });
        }
        container.replaceChildren();
        options.hidden = !days.size;
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
        currentDate = adjust(mode === 'week' ? addDays(currentDate, offset * 7) : firstOfMonth(currentDate, offset));
        render();
    }

    options.addEventListener('click', event => {
        const button = event.target.closest('[data-view]');
        if (button) {
            mode = button.dataset.view;
            render();
        }
    });
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    weekSelect.addEventListener('change', () => {
        currentDate = dateOf(weekSelect.value);
        render();
    });
    todayButton.addEventListener('click', () => {
        currentDate = today();
        render();
        const scroll = container.querySelector('.calendar-scroll');
        const cell = scroll?.querySelector('[aria-current=date]');
        if (cell) {
            scroll.scrollLeft += cell.getBoundingClientRect().left - scroll.getBoundingClientRect().left
                - (scroll.clientWidth - cell.offsetWidth) / 2;
        }
    });

    return {
        show(sessions) {
            days = new Map();
            noticePeriods = groupNoticePeriods(sessions);
            for (const event of sessions) {
                if (!days.has(event.date)) {
                    days.set(event.date, []);
                }
                days.get(event.date).push(event);
            }
            if (days.size) {
                const dates = [...days.keys()];
                const date = today();
                const first = dateOf(dates[0]);
                const last = dateOf(dates.at(-1));
                firstDate = first < date ? first : date;
                lastDate = last > date ? last : date;
                currentDate = adjust(currentDate || date);
                updateWeekScale();
                fillWeekPicker();
            }
            render();
            return noticePeriods.length + sessions.filter(event => event.notice && !isAllDayNotice(event)).length;
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
