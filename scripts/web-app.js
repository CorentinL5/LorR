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
    navigator.serviceWorker.register('sw.js?v=61').catch(() => {
        // The site and its existing browser cache can work without a worker.
    });
}

const heroArt = document.querySelector('svg.hero-art');
if (heroArt && typeof heroArt.getAnimations === 'function') {
    let heroOnScreen = !('IntersectionObserver' in window);
    let heroStarted = false;
    let heroObserver;

    const startVisibleHero = () => {
        if (heroStarted || !heroOnScreen || document.hidden) {
            return;
        }
        heroStarted = true;
        heroObserver?.disconnect();
        document.removeEventListener('visibilitychange', startVisibleHero);

        const entrance = [];
        for (const animation of heroArt.getAnimations({subtree: true})) {
            animation.currentTime = 0;
            animation.play();
            if (animation.effect.getTiming().iterations === 1) {
                entrance.push(animation.finished);
            }
        }
        Promise.allSettled(entrance).then(() => heroArt.classList.add('hero-entered'));
    };

    if ('IntersectionObserver' in window) {
        heroObserver = new IntersectionObserver(([entry]) => {
            heroOnScreen = entry.isIntersecting && entry.intersectionRatio >= 0.12;
            startVisibleHero();
        }, {threshold: 0.12});
        heroObserver.observe(heroArt);
    }
    document.addEventListener('visibilitychange', startVisibleHero);
    startVisibleHero();
}
