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
        const group = document.getElementById('home-resume-actions');
        const saved = document.getElementById('saved-planning-link');
        const latest = document.getElementById('last-planning-link');
        const resume = document.getElementById('resume-planning-link');
        const createStudent = document.getElementById('create-student-planning');
        const {draft, latest: completed} = localPlanningSlots();
        const savedHash = localPlanningValue(planningSavedLinkKey);
        saved.hidden = !savedHash?.startsWith('#') || !hasPlanningCode(savedHash);
        if (!saved.hidden) saved.href = 'planning' + savedHash;
        latest.hidden = !completed;
        resume.hidden = !draft;
        group.hidden = [latest, resume, saved].every(link => link.hidden);
        createStudent.classList.toggle('button-yellow', group.hidden);
        createStudent.classList.toggle('button-light', !group.hidden);
    };
    showLocalPlannings();
    window.addEventListener('hashchange', openLinkedPlanning);
    window.addEventListener('pageshow', showLocalPlannings);
    window.addEventListener('storage', showLocalPlannings);
}
