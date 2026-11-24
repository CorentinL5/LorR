<?php
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
$currentHour = intdiv($now->getTimestamp(), 3600) * 3600;
$recentDays = [];
for ($offset = 0; $offset < 7; $offset++) {
    $day = $today->modify('-' . $offset . ' days');
    $recentDays[$day->format('Y-m-d')] = $day;
}
$requestedDay = $_GET['heure'] ?? null;
$requestedDay = is_string($requestedDay) && isset($recentDays[$requestedDay]) ? $requestedDay : null;
$selectedDay = $requestedDay ?? $today->format('Y-m-d');
$hourlySince = $usage['hourlySince'] ?? null;
$metrics = array_keys($labels);
$hoursByDay = [];
foreach ($usage === null ? [] : array_reverse($recentDays, true) as $date => $day) {
    $start = $day->getTimestamp();
    $end = min($day->modify('+1 day')->getTimestamp(), $currentHour + 3600);
    $hoursByDay[$date] = [];
    for ($hour = $start; $hour < $end; $hour += 3600) {
        $local = $now->setTimestamp($hour);
        $label = $local->format('H:i');
        $repeated = $now->setTimestamp($hour - 3600)->format('H:i') === $label
            || $now->setTimestamp($hour + 3600)->format('H:i') === $label;
        $counts = $usage['hourly'][usageHourKey($hour)] ?? [];
        $hoursByDay[$date][] = [
            'label' => $repeated ? $label . ' (UTC' . $local->format('P') . ')' : $label,
            'current' => $hour === $currentHour,
            'counts' => $hourlySince !== null && $hour >= $hourlySince
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
    <link rel="stylesheet" href="styles/planning.css?v=4">
    <?php require __DIR__ . '/web-app-head.php'; ?>
    <?php if ($usage !== null): ?>
        <script src="scripts/stats-chart.js?v=4" defer></script>
    <?php endif; ?>
</head>
<body>
    <?php require __DIR__ . '/site-header.php'; ?>
    <main class="shell">
        <section class="panel stats-panel" aria-labelledby="stats-title">
            <header class="panel-header panel-purple">
                <span class="panel-icon" aria-hidden="true">▦</span>
                <h1 id="stats-title">Statistiques de LorR</h1>
            </header>
            <div class="panel-body">
                <?php if ($usage === null): ?>
                    <p>Les statistiques sont momentanément indisponibles.</p>
                <?php else: ?>
                    <dl class="stats-totals" aria-label="Totaux">
                        <?php foreach ($labels as $metric => [$label, , $description]): ?>
                            <div class="stats-total">
                                <dt>
                                    <?= $label ?>
                                    <details class="stat-info" name="stats-explanations">
                                        <summary aria-label="Comprendre la statistique <?= $label ?>">
                                            <span class="stat-info-mark" aria-hidden="true"></span>
                                        </summary>
                                        <p><?= $description ?></p>
                                    </details>
                                </dt>
                                <dd><?= number_format($usage['total'][$metric] ?? 0, 0, ',', ' ') ?></dd>
                            </div>
                        <?php endforeach; ?>
                    </dl>
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
                        <svg class="stats-chart-plot" role="img" aria-labelledby="usage-chart-caption" aria-describedby="usage-chart-description">
                            <desc id="usage-chart-description">Les valeurs exactes figurent dans le tableau sous le graphique.</desc>
                            <g></g>
                        </svg>
                        <p class="stats-chart-empty" role="status" hidden>Sélectionne un compteur pour afficher sa courbe.</p>
                        <div class="stats-hour-chart">
                            <h3 id="usage-hour-chart-caption">Par heure</h3>
                            <p id="usage-hour-chart-description">Un point par heure · Heure de Bruxelles</p>
                            <svg id="usage-hour-chart" class="stats-chart-plot" role="img" aria-labelledby="usage-hour-chart-caption" aria-describedby="usage-hour-chart-description" hidden>
                                <g></g>
                            </svg>
                            <p id="usage-hour-unavailable" class="stats-chart-unavailable" role="status" hidden>Aucun relevé horaire sur cette période.</p>
                            <p id="usage-hour-gaps" class="stats-hour-note" hidden>La zone grisée précède le début des relevés horaires.</p>
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
                    <details id="usage-hour-details" class="stats-hour-details" <?= $requestedDay !== null ? 'open' : '' ?> hidden>
                        <summary>Valeurs par heure</summary>
                        <label for="stats-hour-day">Jour</label>
                        <select id="stats-hour-day">
                            <?php foreach ($recentDays as $date => $day): ?>
                                <option value="<?= $date ?>" <?= $date === $selectedDay ? 'selected' : '' ?>><?= $day == $today ? 'Aujourd’hui' : $day->format('d/m/Y') ?></option>
                            <?php endforeach; ?>
                        </select>
                        <p class="stats-hour-note">Le tiret indique une heure sans historique.</p>
                        <div class="stats-table" role="region" aria-label="Valeurs par heure" tabindex="0">
                            <table>
                                <thead>
                                    <tr>
                                        <th scope="col">Heure</th>
                                        <?php foreach ($labels as [, $shortLabel]): ?>
                                            <th scope="col"><?= $shortLabel ?></th>
                                        <?php endforeach; ?>
                                    </tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                        </div>
                    </details>
                    <script id="usage-hours" type="application/json"><?= json_encode($hoursByDay, JSON_HEX_TAG | JSON_THROW_ON_ERROR) ?></script>
                <?php endif; ?>
            </div>
        </section>
    </main>
    <?php require __DIR__ . '/site-footer.php'; ?>
</body>
</html>
