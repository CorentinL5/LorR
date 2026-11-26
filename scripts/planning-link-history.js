const planningMyLinksKey = 'lorr-my-planning-links';
const planningSavedLinkKey = 'lorr-saved-planning';
const planningDraftKey = 'lorr-hyperplanning';
const planningCompletedKey = 'lorr-last-completed-planning';

let planningLinksRevision = 0;

function localPlanningValue(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function readPlanningPersonal(key) {
    try {
        return JSON.parse(localPlanningValue(key));
    } catch {
        return null;
    }
}


function isCompletedPlanning(choices) {
    return Boolean((choices?.created ?? choices?.selectedCourses?.length)
        && Array.isArray(choices?.formations) && choices.formations.length
        && Array.isArray(choices?.selectedCourses) && choices.selectedCourses.length);
}

function localPlanningSlots() {
    const current = readPlanningPersonal(planningDraftKey);
    const completed = readPlanningPersonal(planningCompletedKey);
    return {
        draft: !isCompletedPlanning(current) && Array.isArray(current?.sources) && current.sources.length ? current : null,
        latest: isCompletedPlanning(completed) ? completed : isCompletedPlanning(current) ? current : null,
    };
}

function personalPlanningLinks() {
    const links = readPlanningPersonal(planningMyLinksKey);
    return Array.isArray(links) ? links : [];
}


async function rememberPersonalPlanningLink(portable, address = portable) {
    const revision = planningLinksRevision;
    try {
        const code = new URLSearchParams(new URL(portable).hash.slice(1)).get('p');
        if (!code) return;
        const [, formations, selected, excluded = [], includeLaterNotices = false] = unpackPlanningState(await decodePlanningCode(code));
        const courses = [...new Set(selected.map(([index, ...course]) => JSON.stringify([...formations[index], ...course])))].sort();
        const sources = [...new Set(formations.map(formation => JSON.stringify(formation)))].sort();
        const identity = JSON.stringify([sources, courses, [...new Set(excluded)].sort(), includeLaterNotices]);
        const digest = window.crypto?.subtle ? await crypto.subtle.digest('SHA-256', planningTextEncoder.encode(identity)) : null;
        const key = digest ? [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') : identity;
        if (revision !== planningLinksRevision) return;
        const links = personalPlanningLinks();
        const short = address !== portable;
        const names = [...new Set(selected.map(([index]) => formations[index][1]))].sort();
        const title = `${courses.length} cours · ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`;
        const existing = links.find(link => link?.key === key);
        if (!existing || (short && (!existing.short || address !== existing.url))) {
            const entry = {key, title, url: address, short};
            const otherLinks = links.filter(link => link?.key !== key && link?.url !== address);
            localStorage.setItem(planningMyLinksKey, JSON.stringify([entry, ...otherLinks]));
        }
    } catch {
        // A link still works if local history is unavailable.
    }
    window.dispatchEvent(new Event('planning-links-changed'));
}
