<?php
require_once __DIR__ . '/../server/usage-history.php';

$labels = [
    'home' => ['Chargements de l’accueil', 'Accueil', 'Nombre de chargements de la page d’accueil. Les visites répétées sont incluses.'],
    'planner' => ['Ouvertures du créateur', 'Créateur', 'Nombre de chargements de la page qui permet de créer un planning.'],
    'reads' => ['Demandes d’horaires', 'Horaires', 'Nombre de demandes reçues pour charger les horaires d’une ou plusieurs formations, y compris lorsque LorR utilise son cache.'],
    'courses' => ['Cours chargés', 'Cours', 'Dans chaque réponse et chaque formation, LorR compte une fois chaque combinaison matière, groupe et type de cours, même si elle a plusieurs séances.'],
    'sessions' => ['Séances chargées', 'Séances', 'LorR compte chaque séance renvoyée pour chaque formation, même si elle vient du cache. Les fériés et les vacances sont exclus.'],
    'distinct_courses' => ['Cours différents', 'Distincts', 'Une matière compte une fois par lien invité dans chaque période affichée. Les groupes et les types de cours sont regroupés.'],
    'sources' => ['Liens invités distincts', 'Liens', 'Un lien invité Hyperplanning compte une fois dans chaque période où son catalogue est chargé.'],
    'clicks' => ['Clics sur des cours', 'Clics', 'Nombre de clics qui ouvrent le détail d’un cours, déclarés par le navigateur.'],
];
$now = usageNow();
$today = usageDay($now);
$recentDays = [];
for ($offset = 0; $offset < 7; $offset++) {
    $day = $today->modify('-' . $offset . ' days');
    $recentDays[$day->format('Y-m-d')] = $day;
}
$metrics = array_keys($labels);
$recentQuarters = [];
if ($usage !== null) {
    $quartersSince = $usage['quartersSince'] ?? null;
    $currentQuarter = usageQuarterStart($now->getTimestamp());
    for ($quarter = usageFirstQuarter($currentQuarter); $quarter <= $currentQuarter; $quarter += USAGE_QUARTER_SECONDS) {
        $local = $now->setTimestamp($quarter);
        $label = $local->format('H:i');
        $repeated = $now->setTimestamp($quarter - 3600)->format('H:i') === $label
            || $now->setTimestamp($quarter + 3600)->format('H:i') === $label;
        $counts = $usage['quarters'][usageQuarterKey($quarter)] ?? [];
        $recentQuarters[] = [
            'day' => $local->format('d/m'),
            'label' => $repeated ? $label . ' (UTC' . $local->format('P') . ')' : $label,
            'counts' => $quartersSince !== null && $quarter >= $quartersSince
                ? array_map(static fn ($metric) => (int) ($counts[$metric] ?? 0), $metrics) : null,
        ];
    }
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fcf8ef">
    <?php require __DIR__ . '/site-meta.php'; ?>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles/planning.css?v=40">
    <?php require __DIR__ . '/web-app-head.php'; ?>
    <script src="scripts/stats-live.js?v=1" defer></script>
    <?php if ($usage !== null): ?>
        <script src="scripts/stats-chart.js?v=10" defer></script>
    <?php endif; ?>
</head>
<body>
    <?php require __DIR__ . '/site-header.php'; ?>
    <main id="contenu" tabindex="-1" class="shell stats-dashboard" aria-labelledby="stats-title">
        <header class="stats-dashboard-header">
            <h1 id="stats-title">Statistiques de LorR</h1>
            <nav class="stats-dashboard-nav" aria-label="Sections des statistiques">
                <a href="#activite-direct">Activité récente</a>
                <a href="#vue-ensemble">Vue d’ensemble</a>
                <?php if ($usage !== null): ?><a href="#tendances">Tendances</a><?php endif; ?>
                <?php if ($usage !== null): ?><a href="#historique">Historique</a><?php endif; ?>
                <a href="#hyperplanning">Hyperplanning et cache</a>
                <a href="#calendriers">Calendriers et liens</a>
            </nav>
        </header>
        <section id="activite-direct" class="stats-dashboard-section stats-live" aria-labelledby="stats-live-title">
            <div class="stats-live-heading">
                <div>
                    <h2 id="stats-live-title">Activité récente</h2>
                    <p id="stats-live-updated">Chargement des compteurs…</p>
                </div>
                <button id="stats-live-refresh" class="button button-light" type="button">Actualiser</button>
            </div>
            <div class="stats-live-counters">
                <section aria-labelledby="stats-live-today-title">
                    <h3 id="stats-live-today-title">Aujourd’hui</h3>
                    <dl id="stats-live-today"></dl>
                </section>
                <section aria-labelledby="stats-live-quarter-title">
                    <h3 id="stats-live-quarter-title">Ce quart d’heure</h3>
                    <dl id="stats-live-quarter"></dl>
                </section>
            </div>
            <h3>Chargements de pages par quart d’heure</h3>
            <p>Accueil et créateur de planning. Les chargements répétés sont comptés.</p>
            <ol id="stats-live-quarters" class="stats-live-quarters" aria-label="Chargements par quart d’heure"></ol>
            <p id="stats-live-status" class="status" role="status"></p>
            <?php if ($usage !== null): ?>
                <script id="stats-live-initial" type="application/json"><?= json_encode(liveUsageSnapshot($usage, $now), JSON_HEX_TAG | JSON_THROW_ON_ERROR) ?></script>
            <?php endif; ?>
        </section>
        <section id="vue-ensemble" class="stats-dashboard-section" aria-label="Vue d’ensemble">
            <?php if ($usage === null): ?>
                <p>Les statistiques d’utilisation sont momentanément indisponibles.</p>
            <?php else: ?>
                <?php require __DIR__ . '/stats-overview.php'; ?>
            <?php endif; ?>
        </section>
        <?php if ($usage !== null): ?>
            <section id="tendances" class="stats-dashboard-section" aria-labelledby="recent-usage-title">
                <h2 id="recent-usage-title">Les 7 derniers jours</h2>
                <div id="usage-chart" class="stats-chart" hidden>
                    <fieldset class="stats-chart-legend">
                        <legend>Courbes affichées</legend>
                        <?php foreach ($labels as $metric => [$label, $shortLabel]): ?>
                            <label data-metric="<?= $metric ?>" title="<?= $label ?>">
                                <input type="checkbox" checked aria-label="<?= $label ?>">
                                <?= $shortLabel ?>
                            </label>
                        <?php endforeach; ?>
                    </fieldset>
                    <h3 id="usage-chart-caption">Par jour</h3>
                    <svg class="stats-chart-plot" role="group" aria-labelledby="usage-chart-caption">
                        <g></g>
                    </svg>
                    <p id="usage-day-selection" class="stats-chart-selection" role="status">Choisis une date pour afficher ses valeurs.</p>
                    <p id="usage-day-unavailable" class="stats-chart-unavailable" hidden>Aucune activité enregistrée sur cette période.</p>
                    <p class="stats-chart-empty" role="status" hidden>Sélectionne un compteur pour afficher sa courbe.</p>
                    <div class="stats-hour-chart">
                        <h3 id="usage-hour-chart-caption">Les 36 dernières heures</h3>
                        <p id="usage-hour-chart-description">Tranches de 15 min · Heure de Bruxelles</p>
                        <svg id="usage-hour-chart" class="stats-chart-plot" role="group" aria-labelledby="usage-hour-chart-caption" aria-describedby="usage-hour-chart-description usage-hour-selection" tabindex="0" hidden>
                            <g></g>
                        </svg>
                        <p id="usage-hour-selection" class="stats-chart-selection" role="status" hidden>Choisis un créneau ou utilise les flèches du clavier.</p>
                        <p id="usage-hour-unavailable" class="stats-chart-unavailable" role="status" hidden>Aucun relevé au quart d’heure sur cette période.</p>
                        <p id="usage-hour-gaps" class="stats-hour-note" hidden>La zone grisée précède le début des relevés au quart d’heure.</p>
                    </div>
                </div>
                <div id="usage-table" class="stats-table" role="region" aria-label="Valeurs par jour" tabindex="0">
                    <table>
                        <thead>
                            <tr>
                                <th scope="col">Date</th>
                                <?php foreach ($labels as [, $shortLabel]): ?>
                                    <th scope="col"><?= $shortLabel ?></th>
                                <?php endforeach; ?>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($recentDays as $date => $day): ?>
                                <tr>
                                    <th scope="row"><time datetime="<?= $date ?>" data-short="<?= $day->format('d/m') ?>" <?= $day == $today ? 'aria-current="date"' : '' ?>><?= $day->format('d/m/Y') ?></time></th>
                                    <?php foreach ($metrics as $metric): ?>
                                        <?php $count = (int) ($usage['daily'][$date][$metric] ?? 0); ?>
                                        <td data-count="<?= $count ?>"><?= number_format($count, 0, ',', ' ') ?></td>
                                    <?php endforeach; ?>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <script id="usage-quarters" type="application/json"><?= json_encode($recentQuarters, JSON_HEX_TAG | JSON_THROW_ON_ERROR) ?></script>
            </section>
            <?php require __DIR__ . '/stats-history.php'; ?>
        <?php endif; ?>
        <?php require __DIR__ . '/stats-advanced.php'; ?>
    </main>
    <?php require __DIR__ . '/site-footer.php'; ?>
</body>
</html>
