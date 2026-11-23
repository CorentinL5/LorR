const planningCachePrefix = 'lorr-tab-planning-v2:';
const planningSourceConfig = JSON.parse(document.getElementById('planning-source-config').textContent);
const hehPlanningHost = new RegExp('^(?:' + planningSourceConfig.hehHostPattern + ')$');
const extraPlanningHosts = new Set(planningSourceConfig.extraHosts);
const planningTextEncoder = new TextEncoder();
const planningLinkMaxBytes = 256 * 1024;
const planningLinkMaxSources = 32;
const courseClickBatchLimit = 100;
let pendingCourseClicks = 0;
let courseClickTimer;

function flushCourseClicks() {
    if (!pendingCourseClicks) {
        return;
    }
    clearTimeout(courseClickTimer);
    courseClickTimer = undefined;
    const body = JSON.stringify({clicks: pendingCourseClicks});
    pendingCourseClicks = 0;
    fetch('api/stats/course-clicks', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body,
        keepalive: true,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
    }).catch(() => {
        // A statistics request must not interrupt the planner.
    });
}

function recordCourseClick() {
    pendingCourseClicks++;
    if (pendingCourseClicks >= courseClickBatchLimit) {
        flushCourseClicks();
    } else {
        courseClickTimer ??= setTimeout(flushCourseClicks, 2500);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        flushCourseClicks();
    }
});
window.addEventListener('pagehide', flushCourseClicks);

function isPlanningHost(host) {
    return typeof host === 'string' && host === host.trim() && (hehPlanningHost.test(host) || extraPlanningHosts.has(host));
}

function planningSource(url) {
    const match = typeof url === 'string' && /^https:\/\/([a-z0-9.-]+)\/invite\/?(?:[?#][^\x00-\x20\x7f]*)?$/i.exec(url.trim());
    const host = match ? match[1].toLowerCase() : null;
    return isPlanningHost(host) ? 'https://' + host + '/invite' : null;
}

function isPlanningFormation(name) {
    return typeof name === 'string' && name.trim() && !/[\x00-\x1f\x7f]/.test(name)
        && planningTextEncoder.encode(name).length <= 300;
}

function packPlanningState([, formations, picked, excluded = []]) {
    const sources = new Map();
    const groupsByFormation = formations.map(([host, name]) => {
        const url = 'https://' + host + '/invite';
        if (!sources.has(url)) {
            const heh = /^hehplanning([0-9]{4})\.umons\.ac\.be$/.exec(host);
            const reference = heh ? Number(heh[1]) : host;
            sources.set(url, [reference, []]);
        }
        const groups = [];
        sources.get(url)[1].push([name, groups]);
        return {entries: groups, indexes: new Map()};
    });
    for (const [index, group, subject, type] of picked) {
        const {entries, indexes} = groupsByFormation[index];
        const key = JSON.stringify([group, type]);
        if (!indexes.has(key)) {
            const entry = [group, type];
            indexes.set(key, entry);
            entries.push(entry);
        }
        indexes.get(key).push(subject);
    }
    for (const key of excluded) {
        const [url, kind, subject, first, last] = JSON.parse(key);
        const source = sources.get(url);
        source[2] ??= [];
        source[2].push(first === last ? [kind, subject, first] : [kind, subject, first, last]);
    }
    return [2, [...sources.values()]];
}

function unpackPlanningState(state) {
    if (!Array.isArray(state) || state[0] !== 2) {
        return state;
    }
    const [, sources] = state;
    if (state.length !== 2 || !Array.isArray(sources) || sources.length > planningLinkMaxSources) {
        throw new Error('Sources invalides.');
    }

    const unpacked = [1, [], [], []];
    const [, formations, picked, excluded] = unpacked;
    let size = JSON.stringify(unpacked).length;
    function appendRow(list, row) {
        size += planningTextEncoder.encode(JSON.stringify(row)).length + Number(list.length > 0);
        // The legacy form can omit the trailing empty notice array.
        if (size > planningLinkMaxBytes + 3) {
            throw new Error('Code trop volumineux.');
        }
        list.push(row);
    }

    for (const source of sources) {
        if (!Array.isArray(source) || source.length < 2 || source.length > 3) {
            throw new Error('Source invalide.');
        }
        const [reference, entries, notices = []] = source;
        const host = Number.isInteger(reference) && reference >= 0 && reference <= 9999
            ? 'hehplanning' + String(reference).padStart(4, '0') + '.umons.ac.be'
            : reference;
        if (!isPlanningHost(host) || !Array.isArray(entries) || !entries.length || !Array.isArray(notices)) {
            throw new Error('Source invalide.');
        }

        for (const entry of entries) {
            if (!Array.isArray(entry) || entry.length !== 2 || !isPlanningFormation(entry[0]) || !Array.isArray(entry[1])) {
                throw new Error('Formation invalide.');
            }
            const [name, groups] = entry;
            const index = formations.length;
            appendRow(formations, [host, name]);
            for (const group of groups) {
                if (!Array.isArray(group) || group.length < 3 || !group.every(value => typeof value === 'string')) {
                    throw new Error('Cours invalide.');
                }
                for (let item = 2; item < group.length; item++) {
                    appendRow(picked, [index, group[0], group[item], group[1]]);
                }
            }
        }
        for (const notice of notices) {
            if (!Array.isArray(notice) || notice.length < 3 || notice.length > 4
                || !notice.every(value => typeof value === 'string')) {
                throw new Error('Repère du calendrier invalide.');
            }
            const [kind, subject, first, last = first] = notice;
            appendRow(excluded, JSON.stringify(['https://' + host + '/invite', kind, subject, first, last]));
        }
    }
    return unpacked;
}

async function compressPlanningBytes(bytes) {
    if (typeof CompressionStream === 'function' && typeof DecompressionStream === 'function') {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
        const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
        if (compressed.length < bytes.length) {
            return {data: compressed, prefix: 'z.'};
        }
    }
    return {data: bytes, prefix: 'b.'};
}

async function encodePlanningCode(state) {
    const raw = planningTextEncoder.encode(JSON.stringify(state));
    if (raw.length > planningLinkMaxBytes) {
        throw new Error('Code trop volumineux.');
    }

    const packed = planningTextEncoder.encode(JSON.stringify(packPlanningState(state)));
    const candidates = packed.length <= planningLinkMaxBytes ? [raw, packed] : [raw];
    const compressed = await Promise.all(candidates.map(compressPlanningBytes));
    const {data, prefix} = compressed.reduce((best, option) => option.data.length < best.data.length ? option : best);
    let binary = '';
    for (let start = 0; start < data.length; start += 8192) {
        binary += String.fromCharCode(...data.subarray(start, start + 8192));
    }
    return prefix + btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function decodePlanningCode(code) {
    if (code.length > Math.ceil(planningLinkMaxBytes * 4 / 3) + 2 || !/^[bz]\.[A-Za-z0-9_-]+$/.test(code)) {
        throw new Error('Code invalide.');
    }

    const binary = atob(code.slice(2).replaceAll('-', '+').replaceAll('_', '/'));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const decoder = new TextDecoder('utf-8', {fatal: true});
    if (code.startsWith('b.')) {
        if (bytes.length > planningLinkMaxBytes) {
            throw new Error('Code trop volumineux.');
        }
        return JSON.parse(decoder.decode(bytes));
    }

    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    const reader = stream.getReader();
    let size = 0;
    let json = '';
    try {
        while (true) {
            const {value, done} = await reader.read();
            if (done) {
                return JSON.parse(json + decoder.decode());
            }
            size += value.length;
            if (size > planningLinkMaxBytes) {
                throw new Error('Code trop volumineux.');
            }
            json += decoder.decode(value, {stream: true});
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
}

function readTabPlanning(key) {
    try {
        const raw = sessionStorage.getItem(planningCachePrefix + key);
        if (raw) {
            const entry = JSON.parse(raw);
            if (entry.expires > Date.now()) {
                return entry.data;
            }
            sessionStorage.removeItem(planningCachePrefix + key);
        }
    } catch {
        // The connector remains available without browser storage.
    }
    return null;
}

function saveTabPlanning(key, data, maxAge) {
    if (Array.isArray(data) && Number.isFinite(maxAge) && maxAge > 0) {
        try {
            sessionStorage.setItem(planningCachePrefix + key, JSON.stringify({
                data,
                expires: Date.now() + maxAge * 1000,
            }));
        } catch {
            // The planning also works if the browser storage is full.
        }
    }
}

async function fetchPlanning(data, signal, onProgress) {
    const url = planningSource(data.url);
    if (!url) {
        throw new Error('Utilise un lien HTTPS /invite d’un établissement pris en charge.');
    }
    const cached = [];
    const missing = [];
    const requested = [...new Set(data.formations)];
    if (requested.length > planningSourceConfig.maxFormationsPerSource || requested.some(name => !isPlanningFormation(name))) {
        throw new Error('Vérifie la liste des formations choisies.');
    }
    const catalogue = readTabPlanning(url);
    for (const formation of requested) {
        const events = readTabPlanning(JSON.stringify([url, formation]));
        if (events) {
            cached.push({formation, events});
        } else {
            missing.push(formation);
        }
    }

    if (catalogue && !missing.length) {
        onProgress(1, 'Données récentes déjà disponibles');
        return {url, formations: catalogue, schedules: cached, errors: []};
    }

    try {
        const result = await requestPlanning(url, missing, signal, onProgress);
        const fresh = result.schedules || [];
        if (result.url) {
            saveTabPlanning(result.url, result.formations, result.catalogueMaxAge);
            for (const schedule of fresh) {
                saveTabPlanning(
                    JSON.stringify([result.url, schedule.formation]), schedule.events, schedule.maxAge,
                );
            }
        }
        return {...result, schedules: [...cached, ...fresh]};
    } catch (error) {
        if (signal.aborted || !cached.length) {
            throw error;
        }
        return {
            url, formations: catalogue || requested, schedules: cached,
            errors: missing.map(formation => ({formation, error: error.message})),
        };
    }
}

function planningRequestBody(url, formations) {
    const body = JSON.stringify({url, formations});
    if (planningTextEncoder.encode(body).length > planningSourceConfig.maxRequestBytes) {
        throw new Error('La demande d’horaires est trop volumineuse.');
    }
    return body;
}

async function requestPlanning(url, formations, signal, onProgress) {
    const response = await fetch('api/planning', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'application/x-ndjson'},
        body: planningRequestBody(url, formations),
        signal,
    });

    if (!response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
        const result = await response.json().catch(() => null);
        if (!result || !response.ok) {
            throw new Error(result?.error || 'Impossible de charger les données pour le moment.');
        }
        return result;
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let result;
    try {
        while (true) {
            const {value, done} = await reader.read();
            if (done) {
                break;
            }
            buffer += value;
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                if (!line.trim()) {
                    continue;
                }
                const message = JSON.parse(line);
                if (message.type === 'progress' && message.total > 0 && !signal.aborted) {
                    onProgress(message.done / message.total, message.message);
                } else if (message.type === 'result') {
                    result = message.data;
                } else if (message.type === 'error') {
                    throw new Error(message.error);
                }
            }
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
    if (!result) {
        throw new Error('Le chargement a été interrompu.');
    }
    return result;
}
