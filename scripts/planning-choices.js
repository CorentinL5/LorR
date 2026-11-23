function choiceText(value = '') {
    return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function courseGroupNames(group, formation) {
    return (group ?? '').split(/[\r\n;]+|\s+(?=groupe\s)/i)
        .map(name => name.trim())
        .filter(name => name && choiceText(name) !== choiceText(formation));
}

function noticeKey(event) {
    return JSON.stringify([event.url, event.notice, choiceText(event.subject), ...(event.period || [event.date, event.date])]);
}

function sessionKey(event) {
    const base = [event.url, event.date, event.start, event.end, choiceText(event.subject)];
    if (event.notice) {
        return JSON.stringify([...base, event.notice]);
    }
    return JSON.stringify([...base, ...[event.group, event.room, event.teacher, event.type].map(choiceText)]);
}

function courseOptions(events, courseKey) {
    const sourceOptions = new Map();
    for (const event of events) {
        if (event.notice) {
            continue;
        }
        const key = courseKey(event);
        if (!sourceOptions.has(key)) {
            sourceOptions.set(key, {keys: [key], sample: event, formations: new Set(), sessions: new Set()});
        }
        const option = sourceOptions.get(key);
        option.formations.add(event.formation);
        option.sessions.add(sessionKey(event));
    }

    const options = new Map();
    for (const option of sourceOptions.values()) {
        const signature = JSON.stringify([...option.sessions].sort());
        const existing = options.get(signature);
        if (existing) {
            existing.keys.push(...option.keys);
            for (const formation of option.formations) {
                existing.formations.add(formation);
            }
        } else {
            options.set(signature, option);
        }
    }
    return [...options.values()];
}

function uniqueSessions(events, courseKey) {
    const sessions = new Map();
    function add(event, date) {
        const scheduled = {...event, date};
        const fingerprint = sessionKey(scheduled);
        const existing = sessions.get(fingerprint);
        if (existing) {
            existing.formations.add(event.formation);
        } else {
            sessions.set(fingerprint, {
                ...scheduled,
                colorKey: event.notice ? noticeKey(event) : courseKey(event),
                formations: new Set([event.formation]),
            });
        }
    }
    for (const event of events) {
        const [start, end] = event.period || [event.date, event.date];
        if (!event.allDay || start === end) {
            add(event, event.date);
            continue;
        }
        const last = new Date(end + 'T00:00:00Z');
        for (const day = new Date(start + 'T00:00:00Z'); day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
            add(event, day.toISOString().slice(0, 10));
        }
    }
    return [...sessions.values()]
        .map(event => ({...event, formation: [...event.formations].join(' · ')}))
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function nextPlanningDay(date) {
    const tomorrow = new Date(date + 'T00:00:00Z');
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
}

function groupNoticePeriods(sessions) {
    const periods = [];
    const recent = new Map();
    const formationOrder = new Intl.Collator('fr-BE', {numeric: true});
    for (const event of sessions) {
        if (!event.notice || !event.allDay) {
            continue;
        }
        const formations = [...(event.formations || [event.formation])].sort(formationOrder.compare);
        const key = JSON.stringify([event.url, event.notice, event.subject, formations]);
        const previous = recent.get(key);
        if (previous && nextPlanningDay(previous.rangeEnd || previous.date) === event.date) {
            previous.rangeEnd = event.date;
        } else {
            const period = {...event};
            periods.push(period);
            recent.set(key, period);
        }
    }
    return periods;
}
