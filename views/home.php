<?php
$linkedinUrl = trim(getenv('LORR_LINKEDIN_URL') ?: '');
$hasLinkedin = filter_var($linkedinUrl, FILTER_VALIDATE_URL) !== false
    && preg_match('~\Ahttps://(?:[a-z0-9-]+\.)?linkedin\.com/(?:in/|messaging/).+\z~i', $linkedinUrl) === 1;
$ideaUrl = $hasLinkedin ? $linkedinUrl : 'https://github.com/CorentinL5/LorR/issues/new';
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fcf8ef">
    <title>LorR · Crée ton emploi du temps étudiant</title>
    <meta name="description" content="Crée ton emploi du temps étudiant depuis Hyperplanning. Choisis tes formations et tes cours, puis ouvre ton planning en liste ou en calendrier.">
    <meta property="og:type" content="website">
    <meta property="og:title" content="LorR · Ton emploi du temps étudiant à ta façon">
    <meta property="og:description" content="Choisis tes cours Hyperplanning et retrouve ton planning étudiant avec un lien.">
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml" sizes="any">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles/planning.css">
    <?php require __DIR__ . '/web-app-head.php'; ?>
    <script src="scripts/home.js" defer></script>
</head>
<body>
    <?php require __DIR__ . '/site-header.php'; ?>
    <main class="shell">
        <section class="hero">
            <div class="hero-copy">
                <h1>Ton planning,<br><span>à ta façon.</span></h1>
                <p>Compose ton emploi du temps étudiant à partir d’Hyperplanning. Retrouve tous tes cours, TP et labos au même endroit.</p>
                <div class="step-actions">
                    <a href="planning?nouveau=1" class="button button-yellow">Créer mon planning <span aria-hidden="true">↗</span></a>
                    <a href="planning?reprendre=1" id="resume-planning-link" class="button button-green" hidden>Reprendre ma sélection</a>
                    <a href="planning" id="saved-planning-link" class="button button-light" hidden>Mon planning enregistré</a>
                </div>
                <a class="home-guide-link" href="#comment-ca-marche">Comment ça marche</a>
            </div>
            <img class="hero-art" src="assets/planning-hero.webp" alt="" width="960" height="720" fetchpriority="high">
        </section>

        <section id="comment-ca-marche" class="home-guide" aria-labelledby="guide-title">
            <h2 id="guide-title">Ton emploi du temps en 4 étapes</h2>
            <ol class="home-steps">
                <li><h3>Ajoute ton lien</h3><p>Colle le lien de l’espace invité de ton établissement.</p></li>
                <li><h3>Choisis tes formations</h3><p>Ajoute les formations qui te concernent.</p></li>
                <li><h3>Coche tes cours</h3><p>Sélectionne les cours et les groupes que tu suis.</p></li>
                <li><h3>Ouvre ton planning</h3><p>Consulte toutes les séances publiées en liste, par semaine ou par mois.</p></li>
            </ol>
            <p class="home-save">Garde ton planning sur cet appareil ou copie son lien pour le rouvrir ailleurs. Aucun compte à créer.</p>
        </section>

        <section id="proposer-une-idee" class="panel home-idea" aria-labelledby="idea-title">
            <div class="panel-body">
                <div>
                    <h2 id="idea-title">Proposer une idée</h2>
                    <p>Une fonction te manque ou tu as repéré un bug ?</p>
                </div>
                <a class="button button-blue" href="<?= htmlspecialchars($ideaUrl, ENT_QUOTES, 'UTF-8') ?>" rel="noreferrer">
                    <?= $hasLinkedin ? 'Écrire sur LinkedIn' : 'Proposer sur GitHub' ?> <span aria-hidden="true">↗</span>
                </a>
            </div>
        </section>
    </main>
    <?php require __DIR__ . '/site-footer.php'; ?>
</body>
</html>
