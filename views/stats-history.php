<?php
$historyDays = usageHistoryPeriod($_GET['jours'] ?? null);
$history = usageHistory($usage, $today, $historyDays);
$historyCounts = $history['current'];
$historyPeak = $history['peak'];
$historyFormat = static fn (int $count): string => number_format($count, 0, ',', ' ');
?>
<section id="historique" class="stats-dashboard-section stats-overview-card stats-history" aria-labelledby="stats-history-title">
    <header class="stats-history-header">
        <div>
            <h2 id="stats-history-title">Historique d’utilisation</h2>
            <p>Jours terminés, en heure de Bruxelles.</p>
        </div>
        <a class="button button-light" href="api/stats/historique.csv?jours=<?= $historyDays ?>" download>Télécharger le CSV</a>
    </header>
    <nav class="stats-dashboard-nav" aria-label="Période de l’historique">
        <?php foreach (USAGE_HISTORY_PERIODS as $days): ?>
            <a href="?jours=<?= $days ?>#historique"<?= $days === $historyDays ? ' aria-current="true"' : '' ?>><?= $days ?> jours</a>
        <?php endforeach; ?>
    </nav>
    <?php if ($history['covered'] === 0): ?>
        <p>Aucune journée terminée n’a encore été mesurée sur cette période.</p>
    <?php else: ?>
        <?php if ($history['covered'] < $historyDays): ?>
            <p><?= $history['covered'] ?> jours mesurés sur <?= $historyDays ?>.</p>
        <?php elseif ($history['comparable']): ?>
            <p>Évolution par rapport aux <?= $historyDays ?> jours précédents.</p>
        <?php else: ?>
            <p>La comparaison sera disponible après deux périodes complètes.</p>
        <?php endif; ?>
        <dl class="stats-history-totals">
            <?php foreach (['pages', 'reads', 'sessions'] as $metric): ?>
                <?php $before = $history['previous'][$metric]; $change = $historyCounts[$metric] - $before; ?>
                <div>
                    <dt><?= USAGE_HISTORY_METRICS[$metric] ?></dt>
                    <dd><?= $historyFormat($historyCounts[$metric]) ?></dd>
                    <?php if ($history['comparable']): ?>
                        <dd class="stats-history-change">
                            <?php if ($change === 0): ?>
                                Stable
                            <?php elseif ($before > 0): ?>
                                <?= ($change > 0 ? '+' : '−') . $historyFormat((int) round(abs($change) * 100 / $before)) ?> %
                            <?php else: ?>
                                +<?= $historyFormat($change) ?> depuis zéro
                            <?php endif; ?>
                        </dd>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
        </dl>
        <?php if ($historyPeak !== null): ?>
            <h3>Pages chargées par jour</h3>
            <p>Pic le <time datetime="<?= $historyPeak['date']->format('Y-m-d') ?>"><?= $historyPeak['date']->format('d/m/Y') ?></time> · <?= $historyFormat($historyPeak['count']) ?> <?= $historyPeak['count'] === 1 ? 'page chargée' : 'pages chargées' ?></p>
            <ol class="stats-history-bars" aria-hidden="true">
                <?php foreach ($history['rows'] as ['date' => $day, 'counts' => $counts]): ?>
                    <?php $pageCount = $counts['pages'] ?? null; ?>
                    <li title="<?= $day->format('d/m/Y') ?> · <?= $pageCount === null ? 'Pas de relevé' : $historyFormat($pageCount) ?>">
                        <span class="<?= $pageCount === null ? 'stats-history-missing' : 'stats-history-bar' ?>"
                            style="--bar-size:<?= ($pageCount ?? 0) * 100 / $historyPeak['count'] ?>%"></span>
                    </li>
                <?php endforeach; ?>
            </ol>
            <div class="stats-history-axis" aria-hidden="true">
                <span><?= $history['rows'][0]['date']->format('d/m') ?></span>
                <span><?= $history['rows'][$historyDays - 1]['date']->format('d/m') ?></span>
            </div>
        <?php endif; ?>
        <details class="stats-history-details">
            <summary>Voir les valeurs par jour</summary>
            <div class="stats-table" role="region" aria-label="Historique par jour" tabindex="0">
                <table>
                    <thead>
                        <tr>
                            <th scope="col">Date</th>
                            <?php foreach (USAGE_HISTORY_METRICS as $label): ?><th scope="col"><?= $label ?></th><?php endforeach; ?>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach (array_reverse($history['rows']) as ['date' => $day, 'counts' => $counts]): ?>
                            <tr>
                                <th scope="row"><time datetime="<?= $day->format('Y-m-d') ?>"><?= $day->format('d/m/Y') ?></time></th>
                                <?php foreach (USAGE_HISTORY_METRICS as $metric => $label): ?>
                                    <td><?= $counts === null ? '—' : $historyFormat($counts[$metric]) ?></td>
                                <?php endforeach; ?>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </details>
    <?php endif; ?>
</section>
