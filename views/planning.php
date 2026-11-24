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
    <link rel="stylesheet" href="styles/planning.css">
    <?php require __DIR__ . '/web-app-head.php'; ?>
    <script id="planning-source-config" type="application/json"><?= json_encode([
        'hehHostPattern' => HEH_PLANNING_HOST_PATTERN,
        'extraHosts' => extraPlanningHosts(),
        'maxFormationsPerSource' => MAX_FORMATIONS_PER_SOURCE,
        'maxRequestBytes' => MAX_PLANNING_REQUEST_BYTES,
    ], JSON_HEX_TAG | JSON_THROW_ON_ERROR) ?></script>
    <script src="scripts/calendar-view.js" defer></script>
    <script src="scripts/planning-data.js" defer></script>
    <script src="scripts/planning-choices.js?v=2" defer></script>
    <script src="scripts/calendar-export.js" defer></script>
    <script src="scripts/planning.js?v=2" defer></script>
</head>
<body>
    <?php require __DIR__ . '/site-header.php'; ?>
    <main class="shell">
        <ol class="steps" aria-label="Étapes de création">
            <li aria-current="step"><button type="button" data-step="1"><span aria-hidden="true">1</span> Lien</button></li>
            <li><button type="button" data-step="2" disabled><span aria-hidden="true">2</span> Formations</button></li>
            <li><button type="button" data-step="3" disabled><span aria-hidden="true">3</span> Cours</button></li>
            <li><button type="button" data-step="4" disabled><span aria-hidden="true">4</span> Planning</button></li>
        </ol>
        <section id="loading-panel" class="loading-panel" aria-labelledby="loading-title" hidden>
            <div class="loading-heading">
                <span class="loading-icon" aria-hidden="true">✦</span>
                <div>
                    <h2 id="loading-title"></h2>
                    <p id="loading-detail" role="status"></p>
                </div>
                <output id="loading-percent" aria-hidden="true">0 %</output>
            </div>
            <div class="loading-track">
                <progress id="loading-progress" value="0" max="100" aria-label="Avancement du chargement"></progress>
                <span class="loading-sweep" aria-hidden="true"></span>
            </div>
        </section>
        <div class="planning-feedback">
            <p id="planning-status" class="status" role="status"></p>
            <button id="retry-planning" type="button" class="button button-light" hidden>Réessayer de charger</button>
        </div>

        <section class="hero" id="link-step">
            <div class="hero-copy">
                <h1>Ton planning,<br><span>à ta façon.</span></h1>
                <p>Choisis les cours, TP et labos que tu suis. Retrouve ton emploi du temps avec un seul lien.</p>
                <?php if (!hasPlanningReader()): ?>
                    <p>La lecture des nouveaux horaires est indisponible sur cet hébergement. Tu peux consulter les horaires sur Hyperplanning.</p>
                <?php endif; ?>
                <form id="source-form">
                    <label for="source-url">Lien invité Hyperplanning</label>
                    <div class="source-actions">
                        <input id="source-url" type="url" name="url" required placeholder="https://…/invite" autocomplete="url" aria-describedby="source-example">
                        <button type="submit" class="button button-yellow" disabled>Ajouter le lien <span aria-hidden="true">↗</span></button>
                        <button id="cancel-source" type="button" class="text-button" hidden>Revenir aux formations</button>
                    </div>
                    <small class="source-example" id="source-example">
                        Exemple HEH <a href="https://hehplanning2026.umons.ac.be/invite" target="_blank" rel="noopener noreferrer">https://hehplanning2026.umons.ac.be/invite</a>
                    </small>
                </form>
            </div>
            <?php readfile(__DIR__ . '/../assets/planning-hero.svg'); ?>
        </section>

        <section class="panel step-panel" id="formation-step" aria-labelledby="formation-title" hidden>
            <header class="panel-header panel-purple">
                <span class="panel-icon" aria-hidden="true">✓</span>
                <h2 id="formation-title" tabindex="-1">Choisis tes formations</h2>
            </header>
            <div class="panel-body">
                <fieldset id="formation-panel" aria-labelledby="formation-title">
                    <div class="choice-filter">
                        <label for="formation-filter">Filtrer les formations</label>
                        <input id="formation-filter" type="search" placeholder="Ex. Informatique">
                        <p id="formation-count" role="status"></p>
                    </div>
                    <div id="formations"></div>
                    <div class="step-actions">
                        <button id="add-source" type="button" class="button button-light">Ajouter un autre lien</button>
                        <button id="load-planning" type="button" class="button button-blue" disabled>Choisir mes cours <span aria-hidden="true">→</span></button>
                    </div>
                </fieldset>
            </div>
        </section>

        <section class="panel step-panel" id="course-panel" aria-labelledby="course-title" hidden>
            <header class="panel-header panel-purple">
                <span class="panel-icon" aria-hidden="true">✓</span>
                <h2 id="course-title" tabindex="-1">Choisis tes cours</h2>
            </header>
            <div class="panel-body">
                <div id="course-tools" hidden>
                    <fieldset id="course-group-filter" class="group-filter" hidden>
                        <legend>Choisis tes groupes</legend>
                        <p>Les cours communs restent affichés.</p>
                        <div id="course-group-choices"></div>
                        <button id="toggle-all-course-groups" type="button" class="text-button" aria-pressed="false">Voir tous les groupes</button>
                    </fieldset>
                    <div class="choice-filter">
                        <label for="course-filter">Filtrer les cours</label>
                        <div class="course-filter-tools">
                            <input id="course-filter" type="search" placeholder="Matière, formation ou groupe">
                            <button id="review-courses" type="button" class="text-button" aria-pressed="false">Ma sélection</button>
                        </div>
                        <p id="course-count" role="status"></p>
                    </div>
                    <div id="course-actions" class="course-actions" hidden>
                        <button id="check-courses" type="button" class="text-button">Cocher les cours affichés</button>
                        <button id="uncheck-courses" type="button" class="text-button">Décocher les cours affichés</button>
                    </div>
                    <div id="planning-courses" class="choice-groups"></div>
                </div>
                <details id="calendar-notices" class="notice-options" hidden>
                    <summary id="notice-count">Repères du calendrier</summary>
                    <div id="notice-choices" class="choices"></div>
                </details>
                <div class="step-actions">
                    <button id="edit-formations" type="button" class="button button-light">Modifier mes formations</button>
                    <button id="create-planning" type="button" class="button button-yellow" disabled>Créer mon emploi du temps <span aria-hidden="true">→</span></button>
                </div>
            </div>
        </section>

        <section id="my-planning" class="panel step-panel" aria-labelledby="planning-title" hidden>
            <header class="panel-header panel-yellow">
                <span class="panel-icon" aria-hidden="true">▦</span>
                <h2 id="planning-title" tabindex="-1">Mon emploi du temps</h2>
            </header>
            <div class="panel-body">
                <div class="planning-toolbar">
                    <div>
                        <p id="schedule-count"></p>
                        <p id="schedule-freshness" hidden><span id="schedule-freshness-label"></span> <time id="schedule-fetched-at"></time></p>
                    </div>
                    <div class="step-actions">
                        <button id="save-planning" type="button" class="button button-light" disabled>Enregistrer</button>
                        <details id="share-planning" class="share-actions">
                            <summary class="button button-yellow">Partager <span aria-hidden="true">▾</span></summary>
                            <div class="share-options">
                                <button id="copy-planning" type="button" class="button button-light" disabled>Copier mon lien</button>
                                <button id="export-planning" type="button" class="button button-light" aria-describedby="ics-warning" disabled>Télécharger le .ics</button>
                                <p id="ics-warning" class="ics-warning" hidden>
                                    <strong>Horaires non actualisés via ICS.</strong><br>
                                    Tu utilises le fichier à tes risques.<br>
                                    Confirme tes horaires sur Hyperplanning ou ici.
                                </p>
                            </div>
                        </details>
                    </div>
                </div>
                <p id="link-status" class="status" role="status"></p>
                <div id="link-fallback" hidden>
                    <label for="planning-address">Lien du planning</label>
                    <input id="planning-address" type="url" readonly>
                </div>
                <div id="view-options" class="view-options" role="group" aria-label="Affichage du planning" hidden>
                    <button type="button" data-view="month" aria-pressed="true">Mois</button>
                    <button type="button" data-view="week" aria-pressed="false">Semaine</button>
                    <button type="button" data-view="list" aria-pressed="false">Liste</button>
                </div>
                <div id="calendar-tools" hidden>
                    <div class="calendar-tools">
                        <button id="calendar-previous" type="button" class="button button-light" aria-label="Période précédente">←</button>
                        <p id="calendar-period" aria-live="polite"></p>
                        <button id="calendar-next" type="button" class="button button-light" aria-label="Période suivante">→</button>
                    </div>
                    <div class="calendar-shortcuts">
                        <div id="week-picker">
                            <label for="calendar-week-select">Aller à la semaine</label>
                            <select id="calendar-week-select"></select>
                        </div>
                        <div id="month-picker" hidden>
                            <label for="calendar-month-select">Aller au mois</label>
                            <select id="calendar-month-select"></select>
                        </div>
                        <button id="calendar-today" type="button" class="button button-light">Aujourd’hui</button>
                    </div>
                </div>
                <div id="planning-days"></div>
            </div>
        </section>
    </main>
    <dialog id="session-detail" class="session-detail" aria-labelledby="session-title">
        <header class="panel-header">
            <h2 id="session-title"></h2>
            <form method="dialog">
                <button type="submit" class="button button-light" aria-label="Fermer" autofocus>×</button>
            </form>
        </header>
        <dl id="session-info"></dl>
    </dialog>
    <dialog id="day-detail" class="session-detail" aria-labelledby="day-title">
        <header class="panel-header">
            <h2 id="day-title"></h2>
            <form method="dialog">
                <button type="submit" class="button button-light" aria-label="Fermer" autofocus>×</button>
            </form>
        </header>
        <div id="day-sessions"></div>
    </dialog>
    <?php require __DIR__ . '/site-footer.php'; ?>
</body>
</html>
