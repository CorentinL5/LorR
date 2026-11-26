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
    <script src="scripts/calendar-view.js?v=17" defer></script>
    <script src="scripts/planning-data.js?v=6" defer></script>
    <script src="scripts/planning-choices.js?v=4" defer></script>
    <script src="scripts/calendar-export.js?v=3" defer></script>
    <script src="scripts/planning-push.js?v=4" defer></script>
    <script src="scripts/planning-link-history.js?v=3" defer></script>
    <script src="scripts/planning.js?v=21" defer></script>
</head>
<body>
    <?php require __DIR__ . '/site-header.php'; ?>
    <main id="contenu" tabindex="-1" class="shell">
        <ol class="steps" aria-label="Étapes de création">
            <li aria-current="step"><button type="button" data-step="1"><span aria-hidden="true">1</span> Lien</button></li>
            <li><button type="button" data-step="2" disabled><span aria-hidden="true">2</span> Formations</button></li>
            <li><button type="button" data-step="3" disabled><span aria-hidden="true">3</span> Cours</button></li>
            <li><button type="button" data-step="4" disabled><span aria-hidden="true">4</span> Planning</button></li>
        </ol>
        <?php require __DIR__ . '/planning-push-controls.php'; ?>
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
            <p id="planning-connection" class="planning-connection" role="status"></p>
            <p id="planning-status" class="status" role="status" tabindex="-1"></p>
            <section id="schedule-recovery" class="schedule-recovery" aria-labelledby="schedule-recovery-title" hidden>
                <h2 id="schedule-recovery-title">Horaires à vérifier</h2>
                <ul id="schedule-recovery-list"></ul>
                <button id="retry-planning" type="button" class="button button-light">Réessayer</button>
            </section>
        </div>

        <section class="hero" id="link-step">
            <div class="hero-copy">
                <h1>Ton planning,<br><span>à ta façon.</span></h1>
                <p>Rassemble les cours que tu suis ou que tu donnes. Retrouve ton emploi du temps avec un seul lien.</p>
                <?php if (!hasPlanningReader()): ?>
                    <p>La lecture des nouveaux horaires est indisponible sur cet hébergement. Tu peux consulter les horaires sur Hyperplanning.</p>
                <?php endif; ?>
                <form id="source-form">
                    <fieldset class="source-shortcuts">
                        <legend>Choisis ton établissement</legend>
                        <div class="source-shortcut-list">
                            <?php foreach ([
                                HEH_CURRENT_PLANNING_HOST => 'HEH',
                                'hpl.hech.be' => 'HECh',
                                'ihecs-prod.pronote-campus.net' => 'IHECS',
                                'heaj-2627.pronote-campus.net' => 'HEAJ',
                            ] as $host => $label): ?>
                                <button <?= $label === 'HEH' ? 'id="use-heh-source" ' : '' ?>type="button" class="button button-light"
                                    data-source-url="<?= htmlspecialchars(planningUrlForHost($host), ENT_QUOTES, 'UTF-8') ?>"
                                    aria-label="Charger les formations de <?= $label ?>" disabled><?= $label ?></button>
                            <?php endforeach; ?>
                        </div>
                    </fieldset>
                    <label for="source-url">Ou colle ton lien invité Hyperplanning</label>
                    <div class="source-actions">
                        <input id="source-url" type="url" name="url" required placeholder="https://…/invite" autocomplete="url" aria-describedby="source-help source-error">
                        <button type="submit" class="button button-yellow" disabled>Ajouter le lien <span aria-hidden="true">↗</span></button>
                        <button id="cancel-source" type="button" class="text-button" hidden>Revenir aux formations</button>
                    </div>
                    <p id="source-help" class="source-help">Utilise l’adresse de l’espace invité de ton établissement.</p>
                    <p id="source-error" class="source-error" role="status"></p>
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
                    <p id="teacher-formation-hint" hidden>Ajoute toutes les formations dans lesquelles tu donnes cours. Tu pourras ensuite filtrer les cours par enseignant.</p>
                    <div class="choice-filter">
                        <label for="formation-filter">Filtrer les formations</label>
                        <input id="formation-filter" type="search" placeholder="Ex. Informatique">
                        <p id="formation-results" role="status"></p>
                    </div>
                    <div class="formation-selection">
                        <p id="formation-count" role="status"></p>
                        <ul id="selected-formations" aria-label="Formations choisies" hidden></ul>
                    </div>
                    <div class="step-actions formation-actions">
                        <button id="add-source" type="button" class="button button-light">Ajouter un autre lien</button>
                        <button id="load-planning" type="button" class="button button-blue" disabled>Choisir mes cours <span aria-hidden="true">→</span></button>
                    </div>
                    <div id="formations"></div>
                </fieldset>
            </div>
        </section>

        <section class="panel step-panel" id="course-panel" aria-labelledby="course-title" hidden>
            <header class="panel-header panel-purple">
                <span class="panel-icon" aria-hidden="true">✓</span>
                <h2 id="course-title" tabindex="-1">Choisis tes cours</h2>
            </header>
            <div class="panel-body">
                <div class="course-selection-bar">
                    <div>
                        <p id="course-count" role="status"></p>
                        <button id="review-courses" type="button" class="text-button" aria-pressed="false" aria-controls="planning-courses" disabled>Cours cochés</button>
                    </div>
                    <button id="create-planning" type="button" class="button button-yellow" disabled>Ouvrir mon planning <span aria-hidden="true">→</span></button>
                </div>
                <div id="course-tools" hidden>
                    <div class="choice-filter">
                        <label for="course-role">Je prépare le planning</label>
                        <select id="course-role">
                            <option value="student">Des cours que je suis</option>
                            <option value="teacher">Des cours que je donne</option>
                        </select>
                    </div>
                    <div id="course-teacher-filter" class="choice-filter" hidden>
                        <label for="course-teacher">Enseignant</label>
                        <select id="course-teacher" aria-describedby="teacher-filter-help"></select>
                        <p id="teacher-filter-help">LorR cherche dans les formations choisies. Si plusieurs personnes se partagent un cours, vérifie les séances retenues.</p>
                    </div>
                    <fieldset id="course-group-filter" class="group-filter" hidden>
                        <legend>Choisis tes groupes</legend>
                        <p>Les cours communs restent affichés.</p>
                        <div id="course-group-choices"></div>
                        <button id="toggle-all-course-groups" type="button" class="text-button" aria-pressed="false">Voir tous les groupes</button>
                    </fieldset>
                    <div class="choice-filter">
                        <label for="course-filter">Filtrer les cours</label>
                        <input id="course-filter" type="search" placeholder="Matière, groupe ou enseignant">
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
                        <button id="edit-planning-courses" type="button" class="text-button">Modifier mes cours</button>
                    </div>
                    <div class="step-actions">
                        <button id="open-today" type="button" class="button button-green" aria-haspopup="dialog">Voir ma journée</button>
                        <button id="refresh-planning" type="button" class="button button-light">Vérifier les horaires</button>
                        <details id="share-planning" class="share-actions">
                            <summary class="button button-yellow">Liens et export <span aria-hidden="true">▾</span></summary>
                            <div class="share-options">
                                <button id="save-planning" type="button" class="button button-light" disabled>Enregistrer sur cet appareil</button>
                                <button id="copy-planning" type="button" class="button button-light" disabled>Copier le lien du planning</button>
                                <p class="share-calendar-label">Ajouter tout le planning sélectionné à un agenda</p>
                                <button id="copy-calendar-subscription" type="button" class="button button-light" aria-describedby="ical-note" disabled>Copier le lien d’abonnement iCal</button>
                                <p id="ical-note" class="share-option-note">Ton agenda actualise les horaires à partir du lien.</p>
                                <button id="export-planning" type="button" class="button button-light" aria-describedby="ics-warning" disabled>Télécharger le planning (.ics)</button>
                                <p id="ics-warning" class="share-option-note" hidden>Le fichier garde les horaires du jour du téléchargement.</p>
                            </div>
                        </details>
                    </div>
                </div>
                <p id="link-status" class="status" role="status"></p>
                <div id="link-fallback" hidden>
                    <label for="planning-address">Lien du planning</label>
                    <input id="planning-address" type="url" readonly>
                </div>
                <?php require __DIR__ . '/calendar-content.php'; ?>
                <details id="schedule-changes" class="schedule-changes" hidden>
                    <summary id="schedule-changes-title">Changements récents</summary>
                    <p>Changements d’heure ou de salle détectés sur cet appareil.</p>
                    <ul id="schedule-changes-list"></ul>
                    <button id="clear-schedule-changes" type="button" class="text-button">Effacer ces changements</button>
                </details>
            </div>
        </section>
    </main>
    <?php require __DIR__ . '/calendar-dialogs.php'; ?>
    <?php require __DIR__ . '/site-footer.php'; ?>
</body>
</html>
