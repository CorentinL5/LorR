<?php
if ($planningTraffic) {
    ksort($planningTraffic);
}
?>
<section class="stats-overview-card stats-planning-traffic" aria-labelledby="planning-traffic-title">
    <h3 id="planning-traffic-title">Requêtes vers Hyperplanning par lien de base</h3>
    <p>Les volumes mesurent les corps de requête et de réponse. La durée et les échecs couvrent les tentatives mesurées par le lecteur PHP.</p>
    <?php if ($planningTraffic === null): ?>
        <p>Les relevés sont momentanément indisponibles.</p>
    <?php elseif (!$planningTraffic): ?>
        <p>Aucune requête enregistrée depuis le début du suivi.</p>
    <?php else: ?>
        <div class="stats-table" role="region" aria-labelledby="planning-traffic-title" tabindex="0">
            <table role="table">
                <thead role="rowgroup">
                    <tr role="row">
                        <th scope="col">Lien de base</th>
                        <th scope="col">Requêtes</th>
                        <th scope="col">Premier relevé</th>
                        <th scope="col">Envoyé</th>
                        <th scope="col">Reçu</th>
                        <th scope="col">Durée moyenne</th>
                        <th scope="col">Échecs</th>
                    </tr>
                </thead>
                <tbody role="rowgroup">
                    <?php foreach ($planningTraffic as $url => $entry): ?>
                        <?php $since = $now->setTimestamp($entry['since']); ?>
                        <?php $timed = $entry['timedRequests'] ?? 0; ?>
                        <tr role="row">
                            <th scope="row" role="rowheader"><?= $escapeSource($url) ?></th>
                            <td role="cell"><span class="stats-mobile-label" aria-hidden="true">Requêtes</span><?= $formatCount($entry['requests']) ?></td>
                            <td role="cell"><span class="stats-mobile-label" aria-hidden="true">Premier relevé</span><time datetime="<?= $since->format(DateTimeInterface::ATOM) ?>"><?= $since->format('d/m/Y') ?></time></td>
                            <td role="cell"><span class="stats-mobile-label" aria-hidden="true">Envoyé</span><?= $formatBytes($entry['sent']) ?><small>Max. <?= $formatBytes($entry['maxSent']) ?></small></td>
                            <td role="cell"><span class="stats-mobile-label" aria-hidden="true">Reçu</span><?= $formatBytes($entry['received']) ?><small>Max. <?= $formatBytes($entry['maxReceived']) ?></small></td>
                            <td role="cell"><span class="stats-mobile-label" aria-hidden="true">Durée moyenne</span><?= $timed ? $formatCount((int) round($entry['durationMs'] / $timed)) . ' ms' : '—' ?></td>
                            <td role="cell"><span class="stats-mobile-label" aria-hidden="true">Échecs</span><?= $timed ? $formatCount($entry['failedRequests']) . ' / ' . $formatCount($timed) : '—' ?></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
</section>
