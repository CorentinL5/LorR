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
$hourlyDay = is_string($requestedDay) ? ($recentDays[$requestedDay] ?? null) : null;
$hourlySince = $usage['hourlySince'] ?? null;
$rows = [];
if ($hourlyDay === null) {
    foreach ($recentDays as $date => $day) {
        $rows[] = [
            'date' => $date,
            'label' => $day->format('d/m/Y'),
            'short' => $day->format('d/m'),
            'current' => $day == $today,
            'counts' => $usage['daily'][$date] ?? [],
        ];
    }
} else {
    $start = $hourlyDay->getTimestamp();
    $nextDay = $hourlyDay->modify('+1 day')->getTimestamp();
    $last = min($nextDay - 3600, $currentHour);
    for ($hour = $last; $hour >= $start; $hour -= 3600) {
        $local = $now->setTimestamp($hour);
        $label = $local->format('H:i');
        $repeated = $now->setTimestamp($hour - 3600)->format('H:i') === $label
            || $now->setTimestamp($hour + 3600)->format('H:i') === $label;
        $rows[] = [
            'date' => $local->format('c'),
            'label' => $repeated ? $label . ' (UTC' . $local->format('P') . ')' : $label,
            'short' => $local->format('H') . ' h',
            'current' => $hour === $currentHour,
            'counts' => $hourlySince !== null && $hour >= $hourlySince ? ($usage['hourly'][usageHourKey($hour)] ?? []) : null,
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
    <link rel="stylesheet" href="styles/planning.css?v=3">
    <?php require __DIR__ . '/web-app-head.php'; ?>
    <?php if ($usage !== null): ?>
        <script src="scripts/stats-chart.js?v=3" defer></script>
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
                    <div class="stats-period">
                        <nav aria-label="Période du graphique">
                            <a href="stats#recent-usage-title" <?= $hourlyDay === null ? 'aria-current="true"' : '' ?>>Par jour</a>
                            <a href="stats?heure=<?= $today->format('Y-m-d') ?>#recent-usage-title" <?= $hourlyDay !== null ? 'aria-current="true"' : '' ?>>Par heure</a>
                        </nav>
                        <?php if ($hourlyDay !== null): ?>
                            <form action="stats#recent-usage-title" method="get">
                                <label for="stats-hour-day">Jour</label>
                                <select id="stats-hour-day" name="heure">
                                    <?php foreach ($recentDays as $date => $day): ?>
                                        <option value="<?= $date ?>" <?= $day == $hourlyDay ? 'selected' : '' ?>><?= $day == $today ? 'Aujourd’hui' : $day->format('d/m/Y') ?></option>
                                    <?php endforeach; ?>
                                </select>
                                <button type="submit">Afficher</button>
                            </form>
                        <?php endif; ?>
                    </div>
                    <figure id="usage-chart" class="stats-chart" hidden>
                        <figcaption id="usage-chart-caption">
                            <?php if ($hourlyDay === null): ?>
                                Évolution quotidienne · Aujourd’hui est en cours
                            <?php else: ?>
                                <?= $hourlyDay->format('d/m/Y') ?> · Heure de Bruxelles<?= $hourlyDay == $today ? ' · Heure actuelle en cours' : '' ?>
                            <?php endif; ?>
                        </figcaption>
                        <fieldset class="stats-chart-legend">
                            <legend>Courbes affichées</legend>
                            <?php foreach ($labels as $metric => [$label, $shortLabel]): ?>
                                <label data-metric="<?= $metric ?>" title="<?= $label ?>">
                                    <input type="checkbox" checked aria-label="<?= $label ?>">
                                    <?= $shortLabel ?>
                                </label>
                            <?php endforeach; ?>
                        </fieldset>
                        <svg class="stats-chart-plot" role="img" aria-labelledby="usage-chart-caption" aria-describedby="usage-chart-description">
                            <desc id="usage-chart-description">Les valeurs exactes figurent dans le tableau sous le graphique.</desc>
                            <g></g>
                        </svg>
                        <p class="stats-chart-empty" role="status" hidden>Sélectionne un compteur pour afficher sa courbe.</p>
                        <p class="stats-chart-unavailable" role="status" hidden>Aucun relevé horaire pour cette journée.</p>
                    </figure>
                    <?php if ($hourlyDay !== null): ?>
                        <p class="stats-hour-note">Le tiret indique une heure antérieure au début de la collecte horaire.</p>
                    <?php endif; ?>
                    <div id="usage-table" class="stats-table" role="region" aria-labelledby="recent-usage-title" tabindex="0">
                        <table>
                            <thead>
                                <tr>
                                    <th scope="col"><?= $hourlyDay === null ? 'Date' : 'Heure' ?></th>
                                    <?php foreach ($labels as [, $shortLabel]): ?>
                                        <th scope="col"><?= $shortLabel ?></th>
                                    <?php endforeach; ?>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($rows as $row): ?>
                                    <tr>
                                        <th scope="row"><time datetime="<?= $row['date'] ?>" data-short="<?= $row['short'] ?>" <?= $row['current'] ? 'aria-current="time"' : '' ?>><?= $row['label'] ?></time></th>
                                        <?php foreach (array_keys($labels) as $metric): ?>
                                            <?php $count = $row['counts'] === null ? null : (int) ($row['counts'][$metric] ?? 0); ?>
                                            <td data-count="<?= $count ?>"><?= $count === null ? '—' : number_format($count, 0, ',', ' ') ?></td>
                                        <?php endforeach; ?>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                <?php endif; ?>
            </div>
        </section>
    </main>
    <?php require __DIR__ . '/site-footer.php'; ?>
</body>
</html>
