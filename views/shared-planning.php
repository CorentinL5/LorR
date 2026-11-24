<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, follow">
    <?php require __DIR__ . '/site-meta.php'; ?>
    <link rel="icon" href="<?= $escapeMeta($base) ?>/assets/lorr-icon.svg" type="image/svg+xml" sizes="any">
    <link rel="stylesheet" href="<?= $escapeMeta($base) ?>/styles/planning.css">
    <script src="<?= $escapeMeta($base) ?>/scripts/shared-planning.js" defer></script>
</head>
<body>
    <main class="shell">
        <h1>Emploi du temps partagé</h1>
        <a id="shared-planning" class="button button-yellow" href="<?= $escapeMeta($destination) ?>">Ouvrir le planning</a>
    </main>
</body>
</html>
