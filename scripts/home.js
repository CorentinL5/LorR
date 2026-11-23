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
    const showSavedPlanning = () => {
        try {
            const saved = localStorage.getItem('lorr-saved-planning');
            const link = document.getElementById('saved-planning-link');
            const available = Boolean(saved?.startsWith('#') && hasPlanningCode(saved));
            link.hidden = !available;
            if (available) {
                link.href = 'planning' + saved;
            }
        } catch {
            // The public home page remains available when storage is disabled.
        }
    };
    showSavedPlanning();
    window.addEventListener('hashchange', openLinkedPlanning);
    window.addEventListener('pageshow', showSavedPlanning);
    window.addEventListener('storage', showSavedPlanning);
}
