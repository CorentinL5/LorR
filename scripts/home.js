function hasPlanningCode(hash) {
    const params = new URLSearchParams(hash.slice(1));
    return params.has('p') || params.has('planning');
}

function openLinkedPlanning() {
    if (hasPlanningCode(location.hash)) {
        location.replace('planning' + location.hash);
        return true;
    }
    return false;
}

if (!openLinkedPlanning()) {
    const showLocalPlannings = () => {
        try {
            const saved = localStorage.getItem('lorr-saved-planning');
            const link = document.getElementById('saved-planning-link');
            const available = Boolean(saved?.startsWith('#') && hasPlanningCode(saved));
            link.hidden = !available;
            if (available) {
                link.href = 'planning' + saved;
            }

            const resume = document.getElementById('resume-planning-link');
            resume.hidden = true;
            const draft = JSON.parse(localStorage.getItem('lorr-hyperplanning'));
            if (Array.isArray(draft?.sources) && draft.sources.length && (!draft.created || !available)) {
                resume.hidden = false;
            }
        } catch {
            // The public home page remains available when storage is disabled.
        }
    };
    showLocalPlannings();
    window.addEventListener('hashchange', openLinkedPlanning);
    window.addEventListener('pageshow', showLocalPlannings);
    window.addEventListener('storage', showLocalPlannings);
}
