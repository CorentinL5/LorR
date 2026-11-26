<!DOCTYPE html>
<html lang="fr-BE">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fcf8ef">
    <?php require __DIR__ . '/site-meta.php'; ?>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles/planning.css?v=40">
    <?php require __DIR__ . '/web-app-head.php'; ?>
    <script src="scripts/planning-link-history.js?v=3" defer></script>
    <script src="scripts/home.js?v=3" defer></script>
</head>
<body>
    <?php require __DIR__ . '/site-header.php'; ?>
    <main id="contenu" tabindex="-1" class="shell">
        <section class="hero">
            <div class="hero-copy">
                <h1>Ton planning,<br><span>à ta façon.</span></h1>
                <p>Retrouve tes cours ou tes séances d’enseignement, même sur plusieurs formations. Ouvre ton planning sans compte.</p>
                <div id="home-resume-actions" class="step-actions" hidden>
                    <a href="planning?reprendre=1" id="resume-planning-link" class="button button-yellow" hidden>Reprendre ma sélection</a>
                    <a href="planning?dernier=1" id="last-planning-link" class="button button-green" hidden>Ouvrir mon dernier planning</a>
                    <a href="planning" id="saved-planning-link" class="button button-light" hidden>Ouvrir mon planning enregistré</a>
                </div>
                <div id="home-create-actions" class="step-actions">
                    <a href="planning?nouveau=1" id="create-student-planning" class="button button-yellow">Je suis élève ou étudiant</a>
                    <a href="enseignant" class="button button-light">Je suis enseignant</a>
                </div>
                <a class="home-guide-link" href="#comment-ca-marche">Comment ça marche</a>
            </div>
            <?php readfile(__DIR__ . '/../assets/planning-hero.svg'); ?>
        </section>

        <section id="comment-ca-marche" class="home-guide" aria-labelledby="guide-title">
            <h2 id="guide-title">Ton emploi du temps en 4 étapes</h2>
            <ol class="home-steps">
                <li><h3>Ajoute ton lien</h3><p>Colle le lien de l’espace invité de ton établissement.</p></li>
                <li><h3>Choisis tes formations</h3><p>Ajoute les formations qui te concernent.</p></li>
                <li><h3>Coche tes cours</h3><p>Sélectionne les cours que tu suis ou filtre-les par enseignant.</p></li>
                <li><h3>Ouvre ton planning</h3><p>Consulte toutes les séances publiées en liste, par semaine ou par mois.</p></li>
            </ol>
            <p class="home-save">Garde ton planning sur cet appareil, copie son lien pour le rouvrir ailleurs ou exporte-le au format ICS.</p>
        </section>

        <section class="home-guide" aria-labelledby="sources-title">
            <h2 id="sources-title">Quels horaires peux-tu ajouter ?</h2>
            <p>LorR utilise les horaires que ton établissement publie dans son espace invité Hyperplanning, aussi appelé PRONOTE Campus. Utilise le lien invité de l’année en cours. Les horaires et les noms d’enseignants dépendent de ce que ton établissement publie.</p>
        </section>

    </main>
    <?php require __DIR__ . '/site-footer.php'; ?>
</body>
</html>
