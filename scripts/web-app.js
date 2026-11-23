const installApp = document.getElementById('install-app');
const installGuide = document.getElementById('install-guide');
const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installedApp = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installPrompt;

if (window.isSecureContext && !installedApp) {
    installApp.hidden = !appleMobile;
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installPrompt = event;
        installApp.hidden = false;
    });
    installApp.addEventListener('click', async () => {
        if (!installPrompt) {
            installGuide.hidden = !installGuide.hidden;
            installApp.setAttribute('aria-expanded', String(!installGuide.hidden));
            return;
        }

        const prompt = installPrompt;
        installPrompt = null;
        installApp.disabled = true;
        try {
            await prompt.prompt();
        } catch {
            // The browser can still offer installation from its own menu.
        } finally {
            installApp.disabled = false;
            installApp.hidden = !appleMobile;
        }
    });
    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        installApp.hidden = true;
        installGuide.hidden = true;
    });
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
        // The site and its existing browser cache can work without a worker.
    });
}
