const planningCachePrefix = 'lorr-tab-planning-v2:';
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

function planningSource(url) {
    try {
        const address = new URL(url);
        if (address.protocol === 'https:' && !address.username && !address.password
            && !address.port && ['/invite', '/invite/'].includes(address.pathname)) {
            return address.origin + '/invite';
        }
    } catch {
        // Invalid URLs are handled by the connector.
    }
    return null;
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
    const cached = [];
    const missing = [];
    const requested = data.formations || [];
    const catalogue = url ? readTabPlanning(url) : null;
    for (const formation of requested) {
        const events = url ? readTabPlanning(JSON.stringify([url, formation])) : null;
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
        const request = requested.length ? {...data, formations: missing} : data;
        const result = await requestPlanning(request, signal, onProgress);
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

async function requestPlanning(data, signal, onProgress) {
    const response = await fetch('api/planning', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'application/x-ndjson'},
        body: JSON.stringify(data),
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
