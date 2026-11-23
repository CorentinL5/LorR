const calendarEncoder = new TextEncoder();
const calendarDecoder = new TextDecoder();
const brusselsClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function calendarDateTime(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
}

function brusselsOffset(timestamp) {
    const parts = Object.fromEntries(brusselsClock.formatToParts(timestamp).map(part => [part.type, part.value]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - timestamp;
}

function calendarTimestamp(date, time) {
    const wallClock = Date.parse(date + 'T' + time.padStart(5, '0') + ':00Z');
    if (!Number.isFinite(wallClock)) {
        return NaN;
    }
    // The previous offset resolves repeated or skipped times at a clock change.
    const earlierOffset = brusselsOffset(wallClock - 86400000);
    const first = wallClock - earlierOffset;
    const currentOffset = brusselsOffset(first);
    const adjusted = wallClock - currentOffset;
    return brusselsOffset(adjusted) === currentOffset ? adjusted : first;
}

function calendarText(value) {
    return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
        .replace(/[,;]/g, '\\$&').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function foldCalendarLine(line) {
    const bytes = calendarEncoder.encode(line);
    if (bytes.length <= 75) {
        return line;
    }
    const lines = [];
    let start = 0;
    while (start < bytes.length) {
        let end = Math.min(start + (start ? 74 : 75), bytes.length);
        while ((bytes[end] & 0xc0) === 0x80) {
            end--;
        }
        lines.push(calendarDecoder.decode(bytes.subarray(start, end)));
        start = end;
    }
    return lines.join('\r\n ');
}

function calendarUid(event) {
    const key = sessionKey(event) + ' ' + (event.rangeEnd ?? '');
    let hash = 14695981039346656037n;
    for (const byte of calendarEncoder.encode(key)) {
        hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
    }
    return hash.toString(16) + '@lorr';
}

function planningCalendarFile(sessions) {
    const entries = sessions.filter(event => !event.notice || !event.allDay).concat(groupNoticePeriods(sessions))
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const stamp = calendarDateTime(Date.now());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LorR//Planning//FR', 'CALSCALE:GREGORIAN'];
    for (const event of entries) {
        const dates = [];
        if (event.allDay || !event.start || !event.end) {
            const last = nextPlanningDay(event.rangeEnd || event.date);
            dates.push('DTSTART;VALUE=DATE:' + event.date.replaceAll('-', ''), 'DTEND;VALUE=DATE:' + last.replaceAll('-', ''));
        } else {
            const last = event.end.padStart(5, '0') < event.start.padStart(5, '0') ? nextPlanningDay(event.date) : event.date;
            const start = calendarTimestamp(event.date, event.start);
            const end = calendarTimestamp(last, event.end);
            if (!Number.isFinite(start)) {
                continue;
            }
            dates.push('DTSTART:' + calendarDateTime(start));
            if (end > start) {
                dates.push('DTEND:' + calendarDateTime(end));
            }
        }
        lines.push('BEGIN:VEVENT', 'UID:' + calendarUid(event), 'DTSTAMP:' + stamp, ...dates, 'SUMMARY:' + calendarText(event.subject));
        if (event.room) {
            lines.push('LOCATION:' + calendarText(event.room));
        }
        const notes = [
            event.formation && 'Formation : ' + event.formation,
            event.group && 'Groupe : ' + event.group,
            event.type && 'Type : ' + event.type,
            event.teacher && 'Enseignant : ' + event.teacher,
        ].filter(Boolean);
        if (notes.length) {
            lines.push('DESCRIPTION:' + calendarText(notes.join('\n')));
        }
        if (event.notice) {
            lines.push('TRANSP:TRANSPARENT');
        }
        lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}
