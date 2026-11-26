<?php
[$pageTitle, $pageDescription] = match ($route) {
    '/' => ['LorR – Emploi du temps étudiant avec Hyperplanning', 'Crée ton emploi du temps étudiant à partir d’Hyperplanning. Choisis tes formations et tes cours, puis consulte, partage ou exporte ton planning. Sans compte.'],
    '/planning' => ['Créer mon planning Hyperplanning – LorR', 'Colle le lien invité de ton établissement, choisis tes formations et tes cours, puis ouvre ton planning en vue mois, semaine ou liste.'],
    '/enseignant' => ['Horaire d’un enseignant – LorR', 'Trouve un horaire par nom dans les sources invitées de LorR.'],
    '/mes-donnees' => ['Mes données – LorR', 'Consulte les informations, les liens et les horaires enregistrés sur cet appareil.'],
    '/stats' => ['Statistiques de LorR', 'Retrouve les chiffres d’utilisation de LorR, les requêtes Hyperplanning, le cache, les calendriers iCal et les liens courts.'],
    '/soutenir' => ['Soutenir le projet étudiant LorR', 'Retrouve le code de LorR sur GitHub, propose une amélioration ou soutiens le projet étudiant.'],
    default => ['Emploi du temps partagé · LorR', 'Ouvre ce planning étudiant partagé avec LorR.'],
};
$escapeMeta = static fn (string $text): string => htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$publicUrl = publicSiteUrl($base);
$imageAlt = 'Calendrier illustré de LorR. Ton planning, à ta façon. Toutes tes semaines, sans compte.';
?>
    <title><?= $escapeMeta($pageTitle) ?></title>
    <meta name="description" content="<?= $escapeMeta($pageDescription) ?>">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="LorR">
    <meta property="og:locale" content="fr_BE">
    <meta property="og:title" content="<?= $escapeMeta($pageTitle) ?>">
    <meta property="og:description" content="<?= $escapeMeta($pageDescription) ?>">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="<?= $escapeMeta($pageTitle) ?>">
    <meta name="twitter:description" content="<?= $escapeMeta($pageDescription) ?>">
    <?php if ($publicUrl !== ''): ?>
        <?php $canonical = $escapeMeta($publicUrl . $route); ?>
        <?php $image = $escapeMeta($publicUrl . '/assets/lorr-social.gif'); ?>
        <link rel="canonical" href="<?= $canonical ?>">
        <meta property="og:url" content="<?= $canonical ?>">
        <meta property="og:image" content="<?= $image ?>">
        <meta property="og:image:type" content="image/gif">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:image:alt" content="<?= $imageAlt ?>">
        <meta name="twitter:image" content="<?= $image ?>">
        <meta name="twitter:image:alt" content="<?= $imageAlt ?>">
        <?php if ($route === '/'): ?>
            <?php $schema = [
                '@context' => 'https://schema.org',
                '@graph' => [
                    [
                        '@type' => 'WebSite', '@id' => $publicUrl . '/#website',
                        'name' => 'LorR', 'url' => $publicUrl . '/', 'inLanguage' => 'fr-BE',
                    ],
                    [
                        '@type' => 'WebApplication', '@id' => $publicUrl . '/#application',
                        'name' => 'LorR', 'url' => $publicUrl . '/planning', 'inLanguage' => 'fr-BE',
                        'description' => $pageDescription, 'applicationCategory' => 'EducationalApplication',
                        'operatingSystem' => 'Web', 'isAccessibleForFree' => true,
                        'offers' => ['@type' => 'Offer', 'price' => 0, 'priceCurrency' => 'EUR'],
                    ],
                ],
            ]; ?>
            <script type="application/ld+json"><?= json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script>
        <?php endif; ?>
    <?php endif; ?>
