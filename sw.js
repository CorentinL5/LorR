const scope = new URL(self.registration.scope);
const shellPrefix = 'lorr-app-shell:' + scope.pathname + ':';
const shellCache = shellPrefix + '1';
const shellAssets = [
    'styles/planning.css',
    'scripts/home.js', 'scripts/web-app.js', 'scripts/calendar-view.js',
    'scripts/calendar-export.js', 'scripts/planning-choices.js', 'scripts/planning-data.js', 'scripts/planning.js',
    'assets/favicon.svg', 'assets/planning-hero.webp',
    'assets/pwa-192.png', 'assets/pwa-512.png', 'assets/pwa-maskable.png',
    'manifest.webmanifest',
].map(path => new URL(path, scope).href);
const shellPages = ['./', 'planning'].map(path => new URL(path, scope).href);

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(shellCache);
        await cache.addAll(shellAssets);
        await Promise.allSettled(shellPages.map(address => cache.add(new Request(address, {
            headers: {'X-LorR-App-Cache': '1'},
        }))));
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

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') {
        return;
    }
    const address = new URL(request.url);
    const pageAddress = address.origin + address.pathname;
    const shellNavigation = request.mode === 'navigate' && shellPages.includes(pageAddress);
    if (!shellNavigation && !shellAssets.includes(address.href)) {
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
