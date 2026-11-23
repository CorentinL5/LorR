<?php
$labels = [
    'home' => ['Chargements de l’accueil', 'Accueil'],
    'planner' => ['Ouvertures du créateur', 'Créateur'],
    'reads' => ['Demandes d’horaires', 'Horaires'],
    'courses' => ['Cours chargés', 'Cours'],
    'distinct_courses' => ['Cours différents', 'Distincts'],
    'sources' => ['Liens invités distincts', 'Liens'],
    'clicks' => ['Clics sur des cours', 'Clics'],
];
$today = usageDay();
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fcf8ef">
    <title>Statistiques · LorR</title>
    <meta name="description" content="Consulte les compteurs publics d’utilisation de LorR.">
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml" sizes="any">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles/planning.css">
    <?php require __DIR__ . '/web-app-head.php'; ?>
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
                    <p>Les liens invités et les matières d’un même espace Hyperplanning comptent une fois au total et une fois par jour de chargement.</p>
                    <dl class="stats-totals" aria-label="Totaux">
                        <?php foreach ($labels as $metric => [$label]): ?>
                            <div class="stats-total">
                                <dt><?= $label ?></dt>
                                <dd><?= number_format($usage['total'][$metric] ?? 0, 0, ',', ' ') ?></dd>
                            </div>
                        <?php endforeach; ?>
                    </dl>
                    <h2 id="recent-usage-title">Les 7 derniers jours</h2>
                    <div class="stats-table" role="region" aria-labelledby="recent-usage-title" tabindex="0">
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
                                <?php for ($offset = 0; $offset < 7; $offset++): ?>
                                    <?php
                                    $day = $today->modify('-' . $offset . ' days');
                                    $date = $day->format('Y-m-d');
                                    $counts = $usage['daily'][$date] ?? [];
                                    ?>
                                    <tr>
                                        <th scope="row"><time datetime="<?= $date ?>"><?= $day->format('d/m/Y') ?></time></th>
                                        <?php foreach (array_keys($labels) as $metric): ?>
                                            <td><?= number_format($counts[$metric] ?? 0, 0, ',', ' ') ?></td>
                                        <?php endforeach; ?>
                                    </tr>
                                <?php endfor; ?>
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
