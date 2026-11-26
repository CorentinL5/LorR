<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fcf8ef">
    <?php require __DIR__ . '/site-meta.php'; ?>
    <meta name="robots" content="noindex, follow">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles/planning.css?v=40">
    <?php require __DIR__ . '/web-app-head.php'; ?>
    <?php require __DIR__ . '/planning-source-config.php'; ?>
    <script src="scripts/planning-data.js?v=6" defer></script>
    <script src="scripts/planning-link-history.js?v=3" defer></script>
    <script src="scripts/planning-push.js?v=4" defer></script>
    <script src="scripts/planning-personal.js?v=3" defer></script>
</head>
<body>
<?php require __DIR__ . '/site-header.php'; ?>
<main id="contenu" tabindex="-1" class="shell planning-personal" aria-labelledby="personal-title">
    <h1 id="personal-title">Mes données</h1>
    <div class="planning-personal-grid">
        <section class="personal-plannings" aria-labelledby="personal-plannings-title">
            <h2 id="personal-plannings-title">Mes plannings sur cet appareil</h2>
            <p id="personal-plannings-empty">Aucun planning créé sur cet appareil.</p>
            <ul id="personal-plannings-list"></ul>
        </section>
        <section aria-labelledby="planning-profile-title">
            <h2 id="planning-profile-title">Infos personnelles</h2>
            <p>Facultatives et enregistrées sur cet appareil.</p>
            <form id="planning-profile-form" class="planning-profile">
                <label>Prénom <input id="planning-given-name" autocomplete="given-name" maxlength="80"></label>
                <label>Nom <input id="planning-family-name" autocomplete="family-name" maxlength="80"></label>
                <button id="save-planning-profile" class="button button-light" type="submit">Enregistrer</button>
            </form>
            <p id="planning-profile-status" class="status" role="status"></p>
        </section>
        <section aria-labelledby="planning-cache-title">
            <h2 id="planning-cache-title">Horaires hors connexion</h2>
            <p id="planning-cache-summary" role="status">Lecture des horaires sur cet appareil…</p>
            <button id="clear-planning-cache" class="button button-light" type="button" aria-describedby="planning-cache-help">Effacer les horaires hors connexion</button>
            <p id="planning-cache-help">Une connexion sera nécessaire pour recharger les horaires.</p>
        </section>
        <section aria-labelledby="planning-test-title">
            <h2 id="planning-test-title">Notifications</h2>
            <p>Teste la réception sur cet appareil.</p>
            <div class="step-actions">
                <button class="button button-light" type="button" data-planning-test="0">Tester maintenant</button>
                <button class="button button-light" type="button" data-planning-test="30">Tester dans 30 s</button>
            </div>
            <p id="planning-test-status" class="status" role="status"></p>
            <?php require __DIR__ . '/planning-push-controls.php'; ?>
        </section>
        <section aria-labelledby="planning-my-links-title">
            <h2 id="planning-my-links-title">Mes liens</h2>
            <p id="planning-my-links-empty">Tes liens apparaissent ici quand tu enregistres ou copies un planning.</p>
            <ul id="planning-my-links"></ul>
            <button id="clear-planning-links" class="button button-light" type="button" hidden>Oublier mes liens sur cet appareil</button>
            <div id="confirm-clear-planning-links" hidden>
                <p>Cette action efface l’historique des liens sur cet appareil.</p>
                <div class="step-actions">
                    <button id="cancel-clear-planning-links" class="button button-light" type="button">Annuler</button>
                    <button id="forget-planning-links" class="button button-yellow" type="button">Oublier tous les liens</button>
                </div>
            </div>
            <p id="planning-my-links-status" class="status" role="status" tabindex="-1"></p>
        </section>
    </div>
</main>
<?php require __DIR__ . '/site-footer.php'; ?>
</body>
</html>
