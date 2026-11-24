const githubValues = document.querySelectorAll('[data-github-stat]');
const githubStatus = document.getElementById('github-status');

async function loadGitHubStats() {
    try {
        const response = await fetch('api/stats/github', {headers: {Accept: 'application/json'}});
        if (!response.ok) {
            throw new Error('Statistiques GitHub indisponibles.');
        }
        const counts = await response.json();
        const format = new Intl.NumberFormat('fr-BE');
        for (const value of githubValues) {
            const count = counts[value.dataset.githubStat];
            if (Number.isSafeInteger(count) && count >= 0) {
                value.textContent = format.format(count);
            }
        }
    } catch {
        githubStatus.textContent = 'Statistiques GitHub temporairement indisponibles.';
        githubStatus.hidden = false;
    }
}

loadGitHubStats();
