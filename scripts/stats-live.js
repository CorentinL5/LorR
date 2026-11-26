const statsLiveUpdated = document.getElementById('stats-live-updated');
const statsLiveRefresh = document.getElementById('stats-live-refresh');
const statsLiveStatus = document.getElementById('stats-live-status');
const statsLiveNumber = new Intl.NumberFormat('fr-BE');
const statsLiveTime = new Intl.DateTimeFormat('fr-BE', {timeStyle: 'short', timeZone: 'Europe/Brussels'});
const statsLiveTimestamp = new Intl.DateTimeFormat('fr-BE', {timeStyle: 'medium', timeZone: 'Europe/Brussels'});
let statsLivePending = false;
let statsLiveTimer;

function statsLiveElement(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
}

function statsLiveCounters(target, counts) {
    const metrics = [
        ['Total des pages chargées', (counts?.home ?? 0) + (counts?.planner ?? 0)],
        ['Chargements de l’accueil', counts?.home],
        ['Ouvertures du créateur', counts?.planner],
        ['Demandes d’horaires', counts?.reads],
        ['Détails de cours ouverts', counts?.clicks],
    ];
    document.getElementById(target).replaceChildren(...metrics.flatMap(([label, value]) => [
        statsLiveElement('dt', label), statsLiveElement('dd', counts === null ? '—' : statsLiveNumber.format(value ?? 0)),
    ]));
}

function renderStatsLive(data) {
    const {today, quarters, updatedAt} = data;
    statsLiveCounters('stats-live-today', today);
    statsLiveCounters('stats-live-quarter', quarters.at(-1).counts);
    statsLiveUpdated.textContent = 'Actualisé à ' + statsLiveTimestamp.format(updatedAt * 1000)
        + ' · Actualisation toutes les 20 s quand la page est visible';
    const counts = quarters.map(({counts}) => counts === null ? null : (counts.home ?? 0) + (counts.planner ?? 0));
    const max = Math.max(1, ...counts);
    document.getElementById('stats-live-quarters').replaceChildren(...quarters.map(({start}, index) => {
        const count = counts[index];
        const item = document.createElement('li');
        const value = statsLiveElement('strong', count === null ? '—' : statsLiveNumber.format(count));
        if (count === null) value.setAttribute('aria-label', 'Pas de relevé');
        const bar = document.createElement('span');
        bar.className = 'stats-live-bar';
        bar.style.setProperty('--bar-size', (count ?? 0) / max * 100 + '%');
        bar.setAttribute('aria-hidden', 'true');
        const time = statsLiveElement('time', statsLiveTime.format(start * 1000));
        time.dateTime = new Date(start * 1000).toISOString();
        if (index === quarters.length - 1) time.setAttribute('aria-current', 'time');
        item.append(value, bar, time);
        return item;
    }));
}

function scheduleStatsLive() {
    clearTimeout(statsLiveTimer);
    if (!document.hidden) statsLiveTimer = setTimeout(refreshStatsLive, 20000);
}

async function refreshStatsLive() {
    if (document.hidden || statsLivePending) return;
    statsLivePending = true;
    statsLiveRefresh.setAttribute('aria-disabled', 'true');
    try {
        const response = await fetch('api/stats/live', {signal: AbortSignal.timeout(8000)});
        if (!response.ok) throw new Error('Compteurs indisponibles');
        renderStatsLive(await response.json());
        statsLiveStatus.textContent = '';
    } catch {
        statsLiveStatus.textContent = 'Actualisation indisponible. Réessaie dans un instant.';
    } finally {
        statsLivePending = false;
        statsLiveRefresh.setAttribute('aria-disabled', 'false');
        scheduleStatsLive();
    }
}

statsLiveRefresh.addEventListener('click', refreshStatsLive);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(statsLiveTimer);
    else void refreshStatsLive();
});
const initialStatsLive = document.getElementById('stats-live-initial');
if (initialStatsLive) {
    renderStatsLive(JSON.parse(initialStatsLive.textContent));
    scheduleStatsLive();
} else {
    void refreshStatsLive();
}
