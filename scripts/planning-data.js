const planningCachePrefix = 'lorr-tab-planning-v2:';
const planningCacheName = 'lorr-planning-horaires-v1';
const planningSourceConfig = JSON.parse(document.getElementById('planning-source-config').textContent);
const hehPlanningHost = new RegExp('^(?:' + planningSourceConfig.hehHostPattern + ')$');
const extraPlanningHosts = new Set(planningSourceConfig.extraHosts);
const planningTextEncoder = new TextEncoder();
const planningLinkMaxBytes = 256 * 1024;
const planningLinkMaxSources = 32;
const maxStoredPlanningCode = 4096;
const courseClickBatchLimit = 100;
let pendingCourseClicks = 0;
let courseClickTimer;
let cachedShortLink;
let browserPlanningCache;

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

async function shortPlanningLink(portableLink) {
    if (cachedShortLink?.portableLink === portableLink) {
        return cachedShortLink.address;
    }
    const code = new URLSearchParams(new URL(portableLink).hash.slice(1)).get('p');
    if (!code || code.length > maxStoredPlanningCode) {
        return portableLink;
    }

    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 4000);
    try {
        const response = await fetch('api/planning/links', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({code}),
            signal: request.signal,
        });
        if (response.ok) {
            const {id} = await response.json();
            if (typeof id === 'string' && id.length === 12 && /^[A-Za-z0-9_-]+$/.test(id)) {
                const address = new URL('p/' + id, portableLink).href;
                cachedShortLink = {portableLink, address};
                return address;
            }
        }
    } catch {
        // The portable link still works if the short link cannot be saved.
    } finally {
        clearTimeout(timeout);
    }
    return portableLink;
}

function openBrowserPlanningCache() {
    browserPlanningCache ??= Promise.resolve().then(() => window.caches?.open(planningCacheName)).catch(() => null);
    return browserPlanningCache;
}

function planningCacheAddress(key) {
    const address = new URL('api/planning', location.href);
    address.searchParams.set('cache', key);
    return address.href;
}

async function readPlanningEntry(key) {
    try {
        const cache = await openBrowserPlanningCache();
        const address = planningCacheAddress(key);
        const response = await cache?.match(address);
        const entry = response ? await response.json() : JSON.parse(sessionStorage.getItem(planningCachePrefix + key));
        if (Array.isArray(entry?.data) && Number.isFinite(entry.expires)) {
            entry.keepUntil ??= entry.expires;
            if (entry.keepUntil > Date.now()) {
                return entry;
            }
        }
        if (response) {
            await cache.delete(address);
        } else {
            sessionStorage.removeItem(planningCachePrefix + key);
        }
    } catch {
        // The connector remains available without browser storage.
    }
    return null;
}

async function savePlanningEntry(key, entry) {
    try {
        const cache = await openBrowserPlanningCache();
        const json = JSON.stringify(entry);
        if (cache) {
            await cache.put(planningCacheAddress(key), new Response(json));
        } else {
            sessionStorage.setItem(planningCachePrefix + key, json);
        }
    } catch {
        // The planning also works if the browser storage is full.
    }
}

async function readCachedPlanning(url, formations) {
    const [catalogue, ...entries] = await Promise.all([
        readPlanningEntry(url),
        ...formations.map(formation => readPlanningEntry(JSON.stringify([url, formation]))),
    ]);
    const schedules = new Map();
    for (const [index, entry] of entries.entries()) {
        if (entry) {
            schedules.set(formations[index], entry);
        }
    }
    return {catalogue, schedules};
}

function browserPlanningResult(url, cache, errors = []) {
    return {
        url,
        formations: cache.catalogue?.data ?? [],
        schedules: [...cache.schedules].map(([formation, entry]) => ({formation, events: entry.data})),
        errors,
    };
}

function rememberPlanningResult(cache, url, result) {
    const now = Date.now();
    function remember(key, stored, data, maxAge, cacheMaxAge) {
        if (!Array.isArray(data)) {
            return stored;
        }
        const fresh = Number.isFinite(maxAge) ? maxAge : 0;
        const retained = Number.isFinite(cacheMaxAge) ? cacheMaxAge : fresh;
        const entry = {data, expires: now + fresh * 1000, keepUntil: now + retained * 1000};
        if (stored && stored.keepUntil > entry.keepUntil) {
            return stored;
        }
        if (retained > 0) {
            savePlanningEntry(key, entry);
        }
        return entry;
    }

    if (result.catalogueCacheMaxAge !== 0) {
        cache.catalogue = remember(url, cache.catalogue, result.formations, result.catalogueMaxAge, result.catalogueCacheMaxAge);
    }
    for (const {formation, events, maxAge, cacheMaxAge} of result.schedules || []) {
        const key = JSON.stringify([url, formation]);
        const entry = remember(key, cache.schedules.get(formation), events, maxAge, cacheMaxAge);
        if (entry) {
            cache.schedules.set(formation, entry);
        }
    }
}

async function fetchPlanning(data, signal, onProgress, onSnapshot = () => {}, initialCache = null) {
    const url = planningSource(data.url);
    if (!url) {
        throw new Error('Utilise un lien HTTPS /invite d’un établissement pris en charge.');
    }
    const requested = [...new Set(data.formations)];
    if (requested.length > planningSourceConfig.maxFormationsPerSource || requested.some(name => !isPlanningFormation(name))) {
        throw new Error('Vérifie la liste des formations choisies.');
    }
    const cache = initialCache ?? await readCachedPlanning(url, requested);
    signal.throwIfAborted();
    const now = Date.now();
    const missing = requested.filter(formation => !(cache.schedules.get(formation)?.expires > now));

    if (cache.catalogue?.expires > now && !missing.length) {
        onProgress(1, 'Données récentes déjà disponibles');
        return browserPlanningResult(url, cache);
    }

    try {
        if (initialCache === null && (cache.catalogue || cache.schedules.size)) {
            onSnapshot(browserPlanningResult(url, cache));
        }
        const result = await requestPlanning(url, missing, signal, onProgress, snapshot => {
            rememberPlanningResult(cache, url, snapshot);
            onSnapshot(browserPlanningResult(url, cache));
        });
        rememberPlanningResult(cache, url, result);
        return browserPlanningResult(url, cache, result.errors ?? []);
    } catch (error) {
        if (signal.aborted || !cache.schedules.size) {
            throw error;
        }
        const errors = missing.filter(formation => !(cache.schedules.get(formation)?.expires > Date.now()))
            .map(formation => ({formation, error: error.message}));
        return browserPlanningResult(url, cache, errors);
    }
}

function planningRequestBody(url, formations) {
    const body = JSON.stringify({url, formations});
    if (planningTextEncoder.encode(body).length > planningSourceConfig.maxRequestBytes) {
        throw new Error('La demande d’horaires est trop volumineuse.');
    }
    return body;
}

async function requestPlanning(url, formations, signal, onProgress, onSnapshot) {
    const request = new AbortController();
    const abort = () => request.abort(signal.reason);
    signal.addEventListener('abort', abort, {once: true});
    const timeout = setTimeout(() => request.abort(new Error('L’espace invité met trop de temps à répondre.')), 120000);
    try {
        return await streamPlanning(url, formations, request.signal, onProgress, onSnapshot);
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
    }
}

async function streamPlanning(url, formations, signal, onProgress, onSnapshot) {
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
                } else if (message.type === 'snapshot' && !signal.aborted) {
                    onSnapshot(message.data);
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
