<?php
$submitted = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
$schools = [
    HEH_CURRENT_PLANNING_HOST => ['name' => 'HEH', 'cached' => true],
    'hpl.hech.be' => ['name' => 'HECh', 'cached' => true],
    'ihecs-prod.pronote-campus.net' => ['name' => 'IHECS', 'cached' => false],
    'heaj-2627.pronote-campus.net' => ['name' => 'HEAJ', 'cached' => false],
];
$host = is_string($_POST['school'] ?? null) ? $_POST['school'] : '';
$school = $schools[$host] ?? null;
$query = is_string($_POST['name'] ?? null) ? trim($_POST['name']) : '';
$key = strlen($query) <= 160 ? teacherSearchKey($query) : '';
$valid = strlen($key) >= 2 && preg_match_all('/\p{L}/u', $query) >= 2;
$results = [];
$delayed = false;
$refine = false;
$coverage = null;
$escape = static fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$teacherCalendar = true;

if ($submitted && $school !== null && $valid) {
    $url = planningUrlForHost($host);
    if ($school['cached']) {
        $coverage = cachedTeacherSchedules($url, $key);
        $results = $coverage['schedules'];
    } else {
        $found = publicTeacherSchedules($url, $query, $key);
        $results = $found['schedules'];
        $delayed = $found['delayed'];
        $refine = $found['refine'];
    }
}
?>
<!DOCTYPE html>
<html lang="fr-BE">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php require __DIR__ . '/site-meta.php'; ?>
    <link rel="stylesheet" href="styles/planning.css?v=40">
    <script src="scripts/calendar-view.js?v=17" defer></script>
    <script src="scripts/planning-choices.js?v=4" defer></script>
    <script src="scripts/calendar-export.js?v=3" defer></script>
    <script src="scripts/teacher-planning.js?v=4" defer></script>
</head>
<body>
    <?php require __DIR__ . '/site-header.php'; ?>
    <main id="contenu" tabindex="-1" class="shell">
        <section class="home-guide" aria-labelledby="teacher-title">
            <h1 id="teacher-title">Horaire d’un enseignant</h1>
            <form method="post" action="enseignant" id="teacher-search" class="choice-filter">
                <label for="teacher-school">École</label>
                <select id="teacher-school" name="school" required>
                    <option value="">Choisis ton école</option>
                    <?php foreach ($schools as $schoolHost => $option): ?>
                        <option value="<?= $escape($schoolHost) ?>"<?= $schoolHost === $host ? ' selected' : '' ?>><?= $escape($option['name']) ?></option>
                    <?php endforeach; ?>
                </select>
                <label for="teacher-name">Nom de l’enseignant</label>
                <input id="teacher-name" type="search" name="name" value="<?= $escape(strlen($query) <= 160 ? $query : '') ?>"
                    minlength="2" maxlength="80" required>
                <div><button type="submit" class="button button-yellow">Voir l’horaire</button></div>
                <span id="teacher-search-status" role="status"></span>
            </form>
            <noscript><p>Active JavaScript pour rechercher un horaire.</p></noscript>
            <p>Pour la HEH et la HECh, LorR cherche dans les formations déjà consultées. Des cours peuvent manquer.</p>
        </section>

        <div id="teacher-result-area">
        <?php if ($submitted): ?>
            <section class="home-guide" aria-labelledby="teacher-results">
                <h2 id="teacher-results" tabindex="-1">Résultats</h2>
                <?php if ($school === null): ?>
                    <p>Choisis ton école pour rechercher un horaire.</p>
                <?php elseif (!$valid): ?>
                    <p>Entre un nom d’au moins deux lettres.</p>
                <?php elseif (!$results && !$refine): ?>
                    <p>Aucun cours trouvé pour « <?= $escape($query) ?> » dans les horaires disponibles à <?= $escape($school['name']) ?>.</p>
                <?php endif; ?>
                <?php if ($coverage !== null): ?>
                    <?php if ($coverage['total']): ?>
                        <p><?= $coverage['covered'] ?> formations consultées sur <?= $coverage['total'] ?> dans le dernier catalogue disponible.</p>
                    <?php else: ?>
                        <p>LorR n’a pas encore de liste des formations pour cette école.</p>
                    <?php endif; ?>
                    <?php if ($coverage['pending']): ?>
                        <p>LorR n’a pas pu actualiser les horaires pour le moment. Réessaie dans un instant.</p>
                    <?php endif; ?>
                    <?php if ($coverage['stale']): ?>
                        <p>Pour <?= $coverage['stale'] ?> des formations consultées, la dernière vérification date d’au moins 10 minutes.</p>
                    <?php endif; ?>
                    <p>Des séances peuvent manquer ou avoir changé. Consulte <a href="<?= $escape($url) ?>">l’espace invité de ton école</a> pour vérifier.</p>
                    <?php if (!$coverage['total'] || $coverage['stale'] || $coverage['covered'] < $coverage['total']): ?>
                        <button type="submit" form="teacher-search" class="button button-light">Vérifier les horaires</button>
                    <?php endif; ?>
                <?php endif; ?>
                <?php if ($delayed): ?>
                    <p>La recherche n’a pas pu être actualisée pour <?= $escape($school['name']) ?>. LorR affiche les derniers résultats disponibles.</p>
                <?php endif; ?>
                <?php if ($refine): ?>
                    <p>Il y a trop de résultats. Ajoute le prénom pour préciser la recherche.</p>
                <?php endif; ?>
                <?php if ($results): ?>
                    <div id="teacher-schedules" data-complete="<?= !$school['cached'] && !$delayed ? '1' : '0' ?>"
                        data-url="<?= $escape($url) ?>" data-school="<?= $escape($school['name']) ?>" hidden><?= $escape(json_encode($results, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE)) ?></div>
                <?php endif; ?>
            </section>
        <?php endif; ?>
        </div>
        <section id="teacher-calendar" class="panel" aria-labelledby="teacher-calendar-title" hidden>
            <header class="panel-header panel-purple">
                <h2 id="teacher-calendar-title" tabindex="-1">Emploi du temps</h2>
            </header>
            <div class="panel-body">
                <div id="teacher-matches" class="choice-filter" hidden>
                    <label for="teacher-match">Enseignants trouvés</label>
                    <select id="teacher-match"></select>
                </div>
                <p id="teacher-no-sessions" hidden>Aucune séance disponible.</p>
                <div class="step-actions">
                    <button id="open-today" type="button" class="button button-green" aria-haspopup="dialog">Voir ma journée</button>
                </div>
                <?php require __DIR__ . '/calendar-content.php'; ?>
            </div>
        </section>
    </main>
    <?php require __DIR__ . '/calendar-dialogs.php'; ?>
    <?php require __DIR__ . '/site-footer.php'; ?>
</body>
</html>
