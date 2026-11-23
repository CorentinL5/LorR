function openLegacyPlanning() {
    if (new URLSearchParams(location.hash.slice(1)).has('planning')) {
        location.replace('planning.html' + location.hash);
        return true;
    }
    return false;
}

if (!openLegacyPlanning()) {
    const showSavedPlanning = () => {
        try {
            const saved = localStorage.getItem('lorr-saved-planning');
            const link = document.getElementById('saved-planning-link');
            const available = Boolean(saved?.startsWith('#') && new URLSearchParams(saved.slice(1)).has('planning'));
            link.hidden = !available;
            if (available) {
                link.href = 'planning.html' + saved;
            }
        } catch {
            // The public home page remains available when storage is disabled.
        }
    };
    showSavedPlanning();
    window.addEventListener('hashchange', openLegacyPlanning);
    window.addEventListener('pageshow', showSavedPlanning);
    window.addEventListener('storage', showSavedPlanning);
}
