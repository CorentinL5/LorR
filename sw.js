const scope = new URL(self.registration.scope);
const shellPrefix = 'lorr-app-shell:' + scope.pathname + ':';
const shellCache = shellPrefix + '61';
const shellAssets = [
    'styles/planning.css?v=40',
    'scripts/home.js?v=3', 'scripts/web-app.js?v=36', 'scripts/calendar-view.js?v=17', 'scripts/support.js',
    'scripts/calendar-export.js?v=3', 'scripts/planning-choices.js?v=4', 'scripts/planning-data.js?v=6',
    'scripts/planning-push.js?v=4', 'scripts/planning-link-history.js?v=3', 'scripts/planning-personal.js?v=3', 'scripts/planning.js?v=21',
    'assets/lorr-icon.svg',
    'assets/pwa-192.png', 'assets/pwa-512.png', 'assets/pwa-maskable.png',
    'manifest.webmanifest',
].map(path => new URL(path, scope).href);
const shellPages = ['./', 'planning', 'mes-donnees', 'soutenir'].map(path => new URL(path, scope).href);
const githubStatsAddress = new URL('api/stats/github', scope).href;

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(shellCache);
        await cache.addAll(shellAssets);
        await Promise.allSettled(shellPages.map(address => cache.add(new Request(address, {
            headers: {'X-LorR-App-Cache': '1'},
        }))));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(shellPrefix) && key !== shellCache)
            .map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('push', event => {
    const alert = event.data?.json();
    event.waitUntil((async () => {
        await self.registration.showNotification(alert?.title ?? (alert?.test ? 'Test LorR réussi' : 'Ton planning a changé'), {
            body: alert?.body ?? 'Consulte ton planning.',
            tag: alert?.tag ?? (alert?.test ? 'lorr-push-test' : undefined),
            icon: new URL('assets/pwa-192.png', scope).href,
            data: {code: alert?.code, test: alert?.test},
            actions: alert?.test ? [] : [{action: 'open-planning', title: 'Voir le planning'}],
        });
        if (alert?.test && alert.testId) {
            const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
            for (const client of windows) {
                client.postMessage({type: 'planning-push-test', id: alert.testId});
            }
        }
    })());
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil((async () => {
        const address = new URL('planning', scope);
        const code = event.notification.data?.test ? null : (event.notification.data?.code ?? await subscribedPlanningFromServer());
        if (typeof code === 'string' && /^[bz]\.[A-Za-z0-9_-]+$/.test(code)) {
            address.hash = 'p=' + code;
        }
        const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
        const existing = windows.find(client => client.url === address.href);
        if (existing) {
            await existing.focus();
        } else {
            await self.clients.openWindow(address.href);
        }
    })());
});

async function subscribedPlanningFromServer() {
    try {
        const subscription = await self.registration.pushManager.getSubscription();
        if (subscription) {
            const response = await fetch(new URL('api/planning/push', scope), {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'omit',
                body: JSON.stringify({action: 'status', subscription}),
            });
            if (response.ok) {
                return (await response.json()).code;
            }
        }
    } catch {
        // Open the planner even when the subscription cannot be restored.
    }
    return null;
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') {
        return;
    }
    const address = new URL(request.url);
    const pageAddress = address.origin + address.pathname;
    const shellNavigation = request.mode === 'navigate' && shellPages.includes(pageAddress);
    if (!shellNavigation && !shellAssets.includes(address.href) && address.href !== githubStatsAddress) {
        return;
    }

    const cacheKey = shellNavigation ? pageAddress : address.href;
    const online = fetch(request);
    event.waitUntil(online.then(async response => {
        if (response.ok && !response.redirected) {
            const copy = response.clone();
            const cache = await caches.open(shellCache);
            await cache.put(cacheKey, copy);
        }
    }).catch(() => {}));
    event.respondWith(online.catch(async () => {
        const cache = await caches.open(shellCache);
        return await cache.match(cacheKey) ?? Response.error();
    }));
});
