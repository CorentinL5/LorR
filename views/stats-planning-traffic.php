<?php
$formatTrafficNumber = static fn (int $value): string => number_format($value, 0, ',', ' ');
if ($planningTraffic) {
    ksort($planningTraffic);
}
?>
<section class="stats-overview-card stats-planning-traffic" aria-labelledby="planning-traffic-title">
    <h2 id="planning-traffic-title">Requêtes vers Hyperplanning par lien de base</h2>
    <p>Le tableau compte les tentatives de requête des lecteurs LorR. Une réponse servie uniquement depuis le cache n’ajoute aucune requête. Les tailles couvrent les corps de requête préparés et les corps de réponse mesurés, hors en-têtes HTTP. Les dates sont en heure de Bruxelles.</p>
    <?php if ($planningTraffic === null): ?>
        <p>Les relevés sont momentanément indisponibles.</p>
    <?php elseif (!$planningTraffic): ?>
        <p>Aucune requête enregistrée depuis le début du suivi.</p>
    <?php else: ?>
        <div class="stats-table" role="region" aria-labelledby="planning-traffic-title" tabindex="0">
            <table>
                <thead>
                    <tr>
                        <th scope="col">Lien de base</th>
                        <th scope="col">Requêtes</th>
                        <th scope="col">Volume des requêtes (o)</th>
                        <th scope="col">Volume des réponses (o)</th>
                        <th scope="col">Plus grande requête (o)</th>
                        <th scope="col">Plus grande réponse (o)</th>
                        <th scope="col">Premier relevé</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($planningTraffic as $url => $entry): ?>
                        <?php $since = $now->setTimestamp($entry['since']); ?>
                        <tr>
                            <th scope="row"><?= htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></th>
                            <td><?= $formatTrafficNumber($entry['requests']) ?></td>
                            <td><?= $formatTrafficNumber($entry['sent']) ?></td>
                            <td><?= $formatTrafficNumber($entry['received']) ?></td>
                            <td><?= $formatTrafficNumber($entry['maxSent']) ?></td>
                            <td><?= $formatTrafficNumber($entry['maxReceived']) ?></td>
                            <td><time datetime="<?= $since->format(DateTimeInterface::ATOM) ?>"><?= $since->format('d/m/Y H:i') ?></time></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
</section>
