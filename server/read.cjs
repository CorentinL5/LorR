const [url, requested = '[]', mode] = process.argv.slice(2);
const names = JSON.parse(requested);
const units = 1 + names.length * 3;
let completed = 0;
let lastOutput = Date.now();

function send(type, fields) {
    lastOutput = Date.now();
    console.log(JSON.stringify({type, ...fields}));
}

function progress(done, message) {
    completed = Math.max(completed, done);
    send('progress', {done: completed, total: units, message});
}
const origin = new URL(url).origin;

function isPortalRequest(request) {
    return new URL(request.url()).origin === origin
        && !['font', 'image', 'media'].includes(request.resourceType());
}

const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function dateKey(year, month, day) {
    return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

function noticeKind(title) {
    const text = title?.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim() ?? '';
    if (/^(vacances|conges?|semaine feriee|semaine de vacances)(?:\b|$)/.test(text)) {
        return 'pause';
    }
    if (/^(jours? feries?|feriee?|armistice|toussaint|noel|ascension|lundi de paques|lundi de pentecote)(?:\b|$)/.test(text)) {
        return 'holiday';
    }
    if (/^(fermeture$|fermeture (?:du campus|de l['’](?:ecole|etablissement))\b|journee pedagogique\b)/.test(text)) {
        return 'closure';
    }
    return '';
}

function calendarNotice(date, subject, notice, period) {
    return {
        date, subject, notice, period, start: '', end: '',
        group: '', room: '', type: '', allDay: true,
    };
}

async function readCalendarNotices(page) {
    const list = page.getByRole('listbox', {name: /semaines/i});
    const labels = await list.getByRole('option').evaluateAll(options => options.map(option => {
        const ids = option.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
        return ids.map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim()
            || option.getAttribute('aria-label') || '';
    }));
    return labels.flatMap(label => {
        const match = label.match(/^(.+?),?\s+du\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})$/i);
        if (!match) {
            return [];
        }
        const subject = match[1].replace(/,\s*$/, '').trim();
        const notice = noticeKind(subject);
        if (!notice) {
            return [];
        }
        const start = dateKey(match[4], match[3], match[2]);
        const end = dateKey(match[7], match[6], match[5]);
        const first = new Date(start + 'T00:00:00Z');
        const last = new Date(end + 'T00:00:00Z');
        if (!Number.isFinite(+first) || !(last >= first) || last - first > 6 * 86400000) {
            return [];
        }

        return [calendarNotice(start, subject, notice, [start, end])];
    });
}

async function waitForPortalChange(page, action) {
    const requests = [];
    const watch = request => {
        if (request.resourceType() === 'xhr' && request.method() === 'POST'
            && new URL(request.url()).origin === origin) {
            requests.push(request);
        }
    };
    page.on('request', watch);
    let handled = 0;
    try {
        const result = await action();
        do {
            const pending = requests.slice(handled);
            handled = requests.length;
            await Promise.all(pending.map(async request => {
                const response = await request.response();
                await response?.finished();
            }));
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        } while (handled < requests.length);
        return result;
    } finally {
        page.off('request', watch);
    }
}

async function openFormations(page) {
    await page.getByRole('combobox', {name: /formation|promotion/i})
        .locator('xpath=following-sibling::*[1]').click();
    const menu = page.locator('[role=listbox]:visible').last();
    await menu.getByRole('option').first().waitFor();
    return menu;
}

async function showList(page) {
    await page.getByRole('menuitem', {name: 'Promotions', exact: true}).hover();
    await page.getByRole('menuitem', {name: 'Emploi du temps', exact: true}).hover();
    await waitForPortalChange(page, () => page.getByRole('menuitem', {name: 'en liste', exact: true}).click());
    await page.getByRole('heading', {name: 'en liste', exact: true}).waitFor();
}

async function selectPublishedWeeks(page, start = 0, end = Infinity) {
    const list = page.getByRole('listbox', {name: /semaines/i});
    await list.waitFor();
    const published = list.getByRole('option', {disabled: false});
    const count = await published.count();
    const last = Math.min(end, count - 1);
    if (last < start) {
        return count;
    }
    const selection = () => published.evaluateAll(options =>
        options.map(option => option.getAttribute('aria-selected') === 'true')
    );
    const belongs = index => index >= start && index <= last;
    const matches = values => values.every((chosen, index) => chosen === belongs(index));
    if (last > start && !matches(await selection())) {
        await waitForPortalChange(page, () =>
            published.nth(start).dragTo(published.nth(last), {timeout: 1500})
        ).catch(() => {});
    }
    if (!matches(await selection())) {
        await waitForPortalChange(page, () => published.nth(start).click());
        if (last > start) {
            await waitForPortalChange(page, () => published.nth(last).click({modifiers: ['Shift']}));
        }
        const current = await selection();
        for (const [index, chosen] of current.entries()) {
            if (chosen !== belongs(index)) {
                await waitForPortalChange(page, () => published.nth(index).click({modifiers: ['Control']}));
            }
        }
    }
    if (!matches(await selection())) {
        throw new Error('La sélection des semaines publiées est incomplète.');
    }
    return count;
}

class IncompleteScheduleError extends Error {}

async function readEvents(page, formation) {
    const grid = page.getByRole('treegrid', {name: formation});
    if (!(await grid.count())) {
        return [];
    }

    const rows = await grid.evaluate(async table => {
        const result = new Map();
        const container = table.closest('.liste_zone');
        const selector = '[role=row][aria-owns]';
        const expected = Number(table.getAttribute('aria-rowcount'));
        const scroll = container && [...container.querySelectorAll('div')].find(element =>
            element.clientHeight > 100 && element.scrollHeight > element.clientHeight + 1
            && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)
        );
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const visibleRows = () => Array.from(table.querySelectorAll(selector));
        const signature = () => {
            const rows = visibleRows();
            return [rows[0]?.getAttribute('aria-rowindex'), rows.at(-1)?.getAttribute('aria-rowindex')].join(':');
        };

        const readRows = async () => {
            const previousCount = result.size;
            for (const row of visibleRows()) {
                const index = Number(row.getAttribute('aria-rowindex'));
                if (result.has(index)) {
                    continue;
                }
                const ids = row.getAttribute('aria-owns').trim().split(/\s+/);
                const elements = ids.map(id => document.getElementById(id));
                if (!elements[0]) {
                    continue;
                }
                result.set(index, elements.map(cell => ({
                    text: cell?.innerText.replace(/\s+/g, ' ').trim() ?? '',
                    link: cell?.querySelector('a[aria-label]')?.getAttribute('aria-label') ?? '',
                })));
            }
            if (result.size !== previousCount) {
                await window.lorrReportRows(result.size, expected);
            }
        };
        const move = async position => {
            const previous = scroll.scrollTop;
            const before = signature();
            scroll.scrollTop = position;
            if (scroll.scrollTop === previous) {
                return false;
            }
            const deadline = performance.now() + 180;
            do {
                await nextFrame();
            } while (signature() === before && performance.now() < deadline);
            await nextFrame();
            return true;
        };

        if (scroll) {
            await move(0);
        }
        await readRows();
        if (scroll && result.size < expected) {
            const distance = Math.floor(scroll.clientHeight * 0.62);
            for (const direction of [1, -1]) {
                while (result.size < expected && await move(scroll.scrollTop + direction * distance)) {
                    await readRows();
                }
            }
        }
        if (expected && result.size < expected) {
            return null;
        }
        return [...result.entries()].sort((a, b) => a[0] - b[0]).map(entry => entry[1]);
    });

    if (rows === null) {
        throw new IncompleteScheduleError('Le tableau des horaires est incomplet.');
    }

    const headers = rows[0]?.map(cell => cell.text.toLowerCase()) ?? [];
    const column = label => headers.findIndex(header => header.includes(label));
    const timeColumn = column('horaires');
    const subjectColumn = column('matière');
    if (timeColumn === -1 || subjectColumn === -1) {
        throw new Error('Le tableau des horaires a changé.');
    }

    const groupColumn = headers.findIndex(header => /formation|promotion/.test(header));
    const roomColumn = column('salle');
    const typeColumn = column('type');
    const teacherColumn = column('enseignant');
    let date = '';
    return rows.slice(1).flatMap(cells => {
        const time = cells[timeColumn]?.text ?? '';
        const day = time.toLowerCase().match(/(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+(\S+)\s+(\d{4})/);
        if (day && months.includes(day[2])) {
            date = dateKey(day[3], months.indexOf(day[2]) + 1, day[1]);
            const annotation = time.slice(day.index + day[0].length).replace(/^[\s:()\-–]+|[)\s]+$/g, '');
            const notice = noticeKind(annotation);
            if (notice) {
                return [calendarNotice(date, annotation, notice, [date, date])];
            }
        }

        const times = time.match(/^(\d{1,2})[h:](\d{2})\s*[-–]\s*(\d{1,2})[h:](\d{2})$/);
        const subject = cells[subjectColumn]?.text;
        const type = cells[typeColumn]?.text ?? '';
        const notice = noticeKind(type) || noticeKind(subject);
        if (!date || !subject || (!times && !notice)) {
            return [];
        }
        if (notice && !times) {
            return [calendarNotice(date, subject, notice, [date, date])];
        }
        const groupCell = cells[groupColumn];
        const group = groupCell?.link.replace(/^Accéder à l'emploi du temps de\s+/, '') || groupCell?.text || '';
        return [{
            date,
            start: times[1].padStart(2, '0') + ':' + times[2],
            end: times[3].padStart(2, '0') + ':' + times[4],
            subject,
            group,
            room: cells[roomColumn]?.text ?? '',
            type,
            teacher: cells[teacherColumn]?.text ?? '',
            ...(notice ? {notice, period: [date, date]} : {}),
        }];
    });
}

async function readPlanning(page) {
    progress(0, 'Ouverture de l’espace invité');
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await page.getByRole('combobox', {name: /formation|promotion/i}).waitFor();
    const close = page.getByRole('button', {name: 'Fermer', exact: true}).first();
    if (await close.isVisible()) {
        await close.click();
    }

    if (names.length) {
        await showList(page);
    }
    const menu = await openFormations(page);
    const options = await menu.getByRole('option').allTextContents();
    const formations = [...new Set(options.map(name => name.trim()).filter(Boolean))];
    progress(1, 'Liste des formations lue');

    const schedules = [];
    const errors = [];
    if (!names.length) {
        return {formations, schedules, errors};
    }
    let reportRows = () => {};
    await page.exposeFunction('lorrReportRows', (done, total) => {
        if (Number.isInteger(done) && Number.isInteger(total) && total > 0 && done >= 0 && done <= total) {
            reportRows(done, total);
        }
    });

    for (const [index, formation] of names.entries()) {
        const base = 1 + index * 3;
        const label = (index + 1) + '/' + names.length + ' · ' + formation;
        progress(base, label + ' · Ouverture du planning');
        try {
            if (!formations.includes(formation)) {
                errors.push({formation, error: 'Cette formation n’est plus publiée.'});
                continue;
            }
            const option = page.getByRole('option', {name: formation, exact: true});
            if (!(await option.isVisible())) {
                await openFormations(page);
            }
            await waitForPortalChange(page, () => option.click());

            progress(base + 1, label + ' · Sélection des semaines publiées');
            const weekCount = await selectPublishedWeeks(page);
            progress(base + 2, label + ' · Lecture des horaires');
            reportRows = (done, total) => progress(
                base + 2 + done / total,
                label + ' · ' + done + ' / ' + total + ' lignes lues',
            );
            let events = [];
            if (weekCount) {
                try {
                    events = await readEvents(page, formation);
                } catch (error) {
                    if (!(error instanceof IncompleteScheduleError) || weekCount <= 4) {
                        throw error;
                    }
                    reportRows = () => {};
                    for (let start = 0; start < weekCount; start += 4) {
                        progress(base + 2, label + ' · Lecture du bloc ' + (start / 4 + 1) + '/' + Math.ceil(weekCount / 4));
                        await selectPublishedWeeks(page, start, start + 3);
                        events.push(...await readEvents(page, formation));
                    }
                }
            }
            events.push(...await readCalendarNotices(page));
            const schedule = {formation, events};
            schedules.push(schedule);
            if (mode === '--heartbeat') {
                send('schedule', {schedule});
            }
        } catch (error) {
            console.error(formation, error.message);
            errors.push({formation, error: 'Impossible de lire les horaires de cette formation.'});
        }
    }
    return {formations, schedules, errors};
}

async function main() {
    let browser;
    try {
        const {chromium} = require('playwright-core');
        browser = await chromium.launch({
            executablePath: process.env.LORR_CHROMIUM_PATH || undefined,
            timeout: 8000,
        });
    } catch (error) {
        console.error(error.message);
        send('error', {error: 'La lecture d’Hyperplanning est indisponible pour le moment.'});
        process.exitCode = 2;
        return;
    }

    const pendingSizes = new Set();
    try {
        const page = await browser.newPage({
            locale: 'fr-BE',
            timezoneId: 'Europe/Brussels',
            viewport: {width: 1600, height: 3000},
        });
        page.setDefaultTimeout(6000);
        const measured = new WeakSet();
        await page.route('**/*', route => isPortalRequest(route.request()) ? route.continue() : route.abort());
        page.on('request', request => {
            if (isPortalRequest(request)) {
                measured.add(request);
                send('traffic', {sent: request.postDataBuffer()?.length ?? 0});
            }
        });
        page.on('requestfinished', request => {
            if (!measured.has(request)) {
                return;
            }
            const size = request.sizes().then(({responseBodySize}) => {
                if (responseBodySize > 0) {
                    send('traffic', {received: responseBodySize});
                }
            }, () => {});
            pendingSizes.add(size);
            void size.finally(() => pendingSizes.delete(size));
        });
        send('result', {data: await readPlanning(page)});
    } catch (error) {
        console.error(error.message);
        send('error', {error: 'Impossible de lire les données publiques de cet espace invité.'});
        process.exitCode = 1;
    } finally {
        await Promise.all(pendingSizes);
        await browser.close();
    }
}

const timeout = setTimeout(() => {
    process.stdout.write(JSON.stringify({type: 'error', error: 'L’espace invité met trop de temps à répondre.'}) + '\n', () => process.exit(1));
}, Math.min(110000, 15000 + names.length * 10000));
// Let PHP detect a closed connection even while the portal is waiting on a response.
const heartbeat = mode === '--heartbeat' ? setInterval(() => {
    if (Date.now() - lastOutput >= 200) {
        send('heartbeat', {});
    }
}, 200) : undefined;

main().finally(() => {
    clearTimeout(timeout);
    clearInterval(heartbeat);
});
