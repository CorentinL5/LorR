<?php
$formatCount = static fn (int $value): string => number_format($value, 0, ',', ' ');
$formatBytes = static function (int $bytes): string {
    if ($bytes < 1024) {
        return $bytes . ' o';
    }
    $unit = $bytes >= 1024 ** 2 ? 1024 ** 2 : 1024;
    return number_format($bytes / $unit, 1, ',', ' ') . ($unit === 1024 ? ' Kio' : ' Mio');
};
$escapeSource = static fn (string $url): string => htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$sources = $planningActivity['sources'] ?? [];
ksort($sources);
$activityTotals = $planningActivity['totals'] ?? [];
$requests = array_sum(array_column($sources, 'catalogues')) + array_sum(array_column($sources, 'schedules'));
$fresh = array_sum(array_column($sources, 'freshCache'));
$cacheRate = $requests > 0 ? (int) round(100 * $fresh / $requests) : null;
$ical = ($activityTotals['icalDelivered'] ?? 0) + ($activityTotals['icalUnchanged'] ?? 0) + ($activityTotals['icalUnavailable'] ?? 0);
$calendarMetrics = [
    'icalDelivered' => ['Calendriers iCal envoyés', 'HTTP 200'],
    'icalUnchanged' => ['Calendriers déjà à jour', 'HTTP 304'],
    'icalUnavailable' => ['Calendriers indisponibles', 'HTTP 503'],
    'icsExports' => ['Exports .ics lancés', 'Export sur le site'],
    'shortLinks' => ['Liens courts fournis', 'Liens réutilisés inclus'],
];
$sourceMetrics = ['catalogues' => 'Catalogues', 'schedules' => 'Horaires', 'freshCache' => 'Cache frais', 'ical' => 'iCal'];
$outcomeMetrics = [
    'completeResponses' => ['Complètes et à jour', 'Toutes les données demandées sont à jour.'],
    'cachedFallbackResponses' => ['Complètes avec repli sur le cache', 'Toutes les données sont disponibles. Une partie n’a pas pu être actualisée.'],
    'partialResponses' => ['Partielles', 'Il manque les horaires d’au moins une formation.'],
    'unavailableResponses' => ['Indisponibles', 'LorR ne dispose d’aucun des horaires demandés ou du catalogue demandé.'],
];
$outcomeTotals = [];
foreach ($outcomeMetrics as $metric => [$label, $hint]) {
    $outcomeTotals[$metric] = array_sum(array_column($sources, $metric));
}
$measuredOutcomes = array_sum($outcomeTotals);
?>
<div class="stats-advanced">
    <section id="hyperplanning" class="stats-dashboard-section" aria-labelledby="hyperplanning-stats-title">
        <h2 id="hyperplanning-stats-title">Hyperplanning et cache</h2>
        <dl class="stats-featured stats-advanced-highlights">
            <div class="stats-featured-card stats-advanced-requests">
                <dt>Requêtes vers Hyperplanning</dt>
                <dd><?= $planningTraffic === null ? '—' : $formatCount(array_sum(array_column($planningTraffic, 'requests'))) ?></dd>
                <small>Lecteurs PHP et Chromium</small>
            </div>
            <div class="stats-featured-card stats-advanced-cache">
                <dt>Demandes déjà en cache</dt>
                <dd><?= $cacheRate === null ? '—' : $cacheRate . ' %' ?></dd>
                <?php if ($cacheRate !== null): ?>
                    <progress max="100" value="<?= $cacheRate ?>" aria-label="Part des demandes déjà en cache frais"></progress>
                    <small><?= $formatCount($fresh) ?> sur <?= $formatCount($requests) ?> demandes à LorR</small>
                <?php else: ?>
                    <small><?= $planningActivity === null ? 'Relevés indisponibles' : 'En attente des premières demandes' ?></small>
                <?php endif; ?>
            </div>
            <div class="stats-featured-card stats-advanced-ical">
                <dt>Requêtes iCal</dt>
                <dd><?= $planningActivity === null ? '—' : $formatCount($ical) ?></dd>
                <small>Calendriers dynamiques</small>
            </div>
        </dl>

        <section class="stats-overview-card stats-advanced-share stats-response-outcomes" aria-labelledby="response-stats-title">
            <h3 id="response-stats-title">Qualité des réponses de LorR</h3>
            <?php if ($planningActivity === null): ?>
                <p>Les relevés sont momentanément indisponibles.</p>
            <?php elseif (!$measuredOutcomes): ?>
                <p>Le relevé commence avec les prochaines demandes de catalogues et d’horaires.</p>
            <?php else: ?>
                <p><?= $formatCount($measuredOutcomes) ?> <?= $measuredOutcomes === 1 ? 'réponse mesurée' : 'réponses mesurées' ?> depuis le début du relevé.</p>
                <dl>
                    <?php foreach ($outcomeMetrics as $metric => [$label, $hint]): ?>
                        <div>
                            <dt><?= $label ?><small><?= $hint ?></small></dt>
                            <dd><?= $formatCount($outcomeTotals[$metric]) ?><small><?= number_format(100 * $outcomeTotals[$metric] / $measuredOutcomes, 1, ',', ' ') ?> %</small></dd>
                        </div>
                    <?php endforeach; ?>
                </dl>
            <?php endif; ?>
        </section>

        <section class="stats-overview-card stats-planning-traffic stats-advanced-sources" aria-labelledby="source-stats-title">
            <h3 id="source-stats-title">Demandes reçues par LorR</h3>
            <p>Le cache est frais quand le catalogue et tous les horaires demandés sont encore à jour. Un calendrier iCal peut concerner plusieurs sources.</p>
            <?php if ($planningActivity === null): ?>
                <p>Les relevés sont momentanément indisponibles.</p>
            <?php elseif (!$sources): ?>
                <p>Aucune demande enregistrée depuis le début du suivi.</p>
            <?php else: ?>
                <div class="stats-table" role="region" aria-labelledby="source-stats-title" tabindex="0">
                    <table role="table">
                        <thead role="rowgroup">
                            <tr role="row">
                                <th scope="col">Lien de base</th>
                                <?php foreach ($sourceMetrics as $label): ?>
                                    <th scope="col"><?= $label ?></th>
                                <?php endforeach; ?>
                            </tr>
                        </thead>
                        <tbody role="rowgroup">
                            <?php foreach ($sources as $url => $entry): ?>
                                <tr role="row">
                                    <th scope="row" role="rowheader"><?= $escapeSource($url) ?></th>
                                    <?php foreach ($sourceMetrics as $key => $label): ?>
                                        <td role="cell"><span class="stats-mobile-label" aria-hidden="true"><?= $label ?></span><?= $formatCount($entry[$key] ?? 0) ?></td>
                                    <?php endforeach; ?>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </section>

        <?php require __DIR__ . '/stats-planning-traffic.php'; ?>

        <p class="stats-advanced-note">Compteurs agrégés par source. Ces relevés ne contiennent ni IP, ni identifiant de visiteur, ni choix de cours.</p>
    </section>

    <section id="calendriers" class="stats-dashboard-section stats-overview-card stats-advanced-share" aria-labelledby="calendar-stats-title">
        <h2 id="calendar-stats-title">Calendriers et liens</h2>
        <dl>
            <?php foreach ($calendarMetrics as $key => [$label, $hint]): ?>
                <div>
                    <dt><?= $label ?><small><?= $hint ?></small></dt>
                    <dd><?= $planningActivity === null ? '—' : $formatCount($activityTotals[$key] ?? 0) ?></dd>
                </div>
            <?php endforeach; ?>
        </dl>
    </section>
</div>
