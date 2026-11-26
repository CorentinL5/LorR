const planningProfileKey = 'lorr-profile';
const planningGivenName = document.getElementById('planning-given-name');
const planningFamilyName = document.getElementById('planning-family-name');
const planningCacheSummary = document.getElementById('planning-cache-summary');
const planningLinksList = document.getElementById('planning-my-links');
const planningLinksEmpty = document.getElementById('planning-my-links-empty');
const personalPlanningsList = document.getElementById('personal-plannings-list');
const personalPlanningsEmpty = document.getElementById('personal-plannings-empty');
const confirmClear = document.getElementById('confirm-clear-planning-links');
const cancelClear = document.getElementById('cancel-clear-planning-links');
const clearPlanningLinks = document.getElementById('clear-planning-links');

const planningProfile = readPlanningPersonal(planningProfileKey);
planningGivenName.value = planningProfile?.givenName ?? '';
planningFamilyName.value = planningProfile?.familyName ?? '';

document.getElementById('planning-profile-form').addEventListener('submit', event => {
    event.preventDefault();
    const status = document.getElementById('planning-profile-status');
    const givenName = planningGivenName.value.trim();
    const familyName = planningFamilyName.value.trim();
    try {
        if (givenName || familyName) {
            localStorage.setItem(planningProfileKey, JSON.stringify({givenName, familyName}));
            status.textContent = 'Infos enregistrées sur cet appareil.';
        } else {
            localStorage.removeItem(planningProfileKey);
            status.textContent = 'Infos effacées sur cet appareil.';
        }
    } catch {
        status.textContent = 'Le stockage de cet appareil est indisponible.';
    }
});

function planningSessionCacheKeys() {
    try {
        return Object.keys(sessionStorage).filter(key => key.startsWith(planningCachePrefix));
    } catch {
        return [];
    }
}

async function renderPersonalPlanningCache() {
    const keys = new Set(planningSessionCacheKeys().map(key => key.slice(planningCachePrefix.length)));
    try {
        const cache = await openBrowserPlanningCache();
        for (const request of await cache?.keys() ?? []) {
            const key = new URL(request.url).searchParams.get('cache');
            if (key !== null) keys.add(key);
        }
    } catch {
        // The session copy can still be inspected.
    }
    let formations = 0;
    let sessions = 0;
    const entries = await Promise.all([...keys].filter(key => key.startsWith('[')).map(readPlanningEntry));
    for (const entry of entries) {
        if (entry) {
            formations++;
            sessions += entry.data.filter(event => event && !event.notice).length;
        }
    }
    planningCacheSummary.textContent = formations
        ? `${formations} formation${formations === 1 ? '' : 's'} et ${sessions} séance${sessions === 1 ? '' : 's'} en cache.`
        : 'Aucun horaire en cache sur cet appareil.';
}

document.getElementById('clear-planning-cache').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        if (window.caches) {
            await caches.delete(planningCacheName);
            browserPlanningCache = undefined;
        }
        for (const key of planningSessionCacheKeys()) {
            sessionStorage.removeItem(key);
        }
        await renderPersonalPlanningCache();
    } catch {
        planningCacheSummary.textContent = 'Impossible de vider le cache.';
    } finally {
        button.disabled = false;
    }
});

function renderPersonalPlannings() {
    const {draft, latest} = localPlanningSlots();
    const rows = [
        [draft, 'Reprendre ma sélection', 'planning?reprendre=1', 'Brouillon'],
        [latest, 'Ouvrir mon dernier planning', 'planning?dernier=1', 'Dernier planning terminé'],
    ];
    personalPlanningsList.replaceChildren(...rows.filter(([state]) => state).map(([state, label, href, title]) => {
        const item = document.createElement('li');
        const heading = document.createElement('h3');
        heading.textContent = title;
        const description = document.createElement('p');
        const formations = state.formations?.length ?? 0;
        const courses = state.selectedCourses?.length ?? 0;
        description.textContent = [
            formations + (formations === 1 ? ' formation' : ' formations'),
            courses + (courses === 1 ? ' cours coché' : ' cours cochés'),
        ].join(' · ');
        const link = document.createElement('a');
        link.className = 'button button-light';
        link.href = href;
        link.textContent = label;
        item.append(heading, description, link);
        return item;
    }));
    personalPlanningsEmpty.hidden = Boolean(draft || latest);
}

function renderPersonalPlanningLinks() {
    const links = personalPlanningLinks();
    planningLinksList.replaceChildren();
    for (const link of links) {
        if (!link || typeof link.url !== 'string') continue;
        let url;
        try {
            url = new URL(link.url, location.href);
        } catch {
            continue;
        }
        if (url.origin !== location.origin) continue;
        const item = document.createElement('li');
        const open = document.createElement('a');
        open.href = url.href;
        open.textContent = link.title;
        item.append(open);
        if (link.short && /\/p\/[A-Za-z0-9_-]{12}$/.test(url.pathname) && !url.search && !url.hash) {
            const calendar = document.createElement('a');
            calendar.href = url.href + '/planning.ics';
            calendar.textContent = 'Abonnement iCal';
            calendar.setAttribute('aria-label', 'Abonnement iCal du planning ' + link.title);
            item.append(' · ', calendar);
        }
        planningLinksList.append(item);
    }
    const hasLinks = Boolean(planningLinksList.childElementCount);
    planningLinksEmpty.hidden = hasLinks;
    clearPlanningLinks.hidden = !confirmClear.hidden || (!hasLinks && !localPlanningValue(planningSavedLinkKey));
}

clearPlanningLinks.addEventListener('click', () => {
    confirmClear.hidden = false;
    clearPlanningLinks.hidden = true;
    cancelClear.focus();
});
cancelClear.addEventListener('click', () => {
    confirmClear.hidden = true;
    renderPersonalPlanningLinks();
    clearPlanningLinks.focus();
});
document.getElementById('forget-planning-links').addEventListener('click', () => {
    const status = document.getElementById('planning-my-links-status');
    planningLinksRevision++;
    try {
        localStorage.removeItem(planningMyLinksKey);
        localStorage.removeItem(planningSavedLinkKey);
        confirmClear.hidden = true;
        renderPersonalPlanningLinks();
        status.textContent = 'Liens oubliés sur cet appareil.';
        status.focus();
    } catch {
        status.textContent = 'Impossible d’effacer les liens sur cet appareil.';
    }
});

window.addEventListener('planning-links-changed', renderPersonalPlanningLinks);
window.addEventListener('storage', event => {
    if (event.key === null || event.key === planningMyLinksKey || event.key === planningSavedLinkKey) renderPersonalPlanningLinks();
    if (event.key === null || event.key === planningDraftKey || event.key === planningCompletedKey) renderPersonalPlannings();
});
window.addEventListener('pageshow', renderPersonalPlannings);
renderPersonalPlannings();
void renderPersonalPlanningCache();
renderPersonalPlanningLinks();
const saved = localPlanningValue(planningSavedLinkKey);
if (saved?.startsWith('#p=')) {
    void rememberPersonalPlanningLink(new URL('planning' + saved, location.href).href);
}
