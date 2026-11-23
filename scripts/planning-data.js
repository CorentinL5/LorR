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

async function encodePlanningCode(state) {
    const bytes = planningTextEncoder.encode(JSON.stringify(state));
    if (bytes.length > planningLinkMaxBytes) {
        throw new Error('Code trop volumineux.');
    }

    let data = bytes;
    let prefix = 'b.';
    if (typeof CompressionStream === 'function' && typeof DecompressionStream === 'function') {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
        const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
        if (compressed.length < bytes.length) {
            data = compressed;
            prefix = 'z.';
        }
    }

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
