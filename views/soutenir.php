<?php
$supportUrl = getenv('LORR_SUPPORT_URL');
if ($supportUrl === false && PHP_SAPI === 'cli-server') {
    $supportUrl = @file_get_contents(__DIR__ . '/../var/support-url.txt', false, null, 0, 4096);
}
$supportUrl = trim($supportUrl ?: '');
$supportLink = filter_var($supportUrl, FILTER_VALIDATE_URL) ? parse_url($supportUrl) : [];
$showSupport = strtolower($supportLink['scheme'] ?? '') === 'https'
    && in_array(strtolower($supportLink['host'] ?? ''), ['revolut.me', 'ko-fi.com', 'www.ko-fi.com'], true)
    && !isset($supportLink['user']) && !isset($supportLink['pass'])
    && ($supportLink['port'] ?? 443) === 443
    && trim($supportLink['path'] ?? '', '/') !== '';
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fcf8ef">
    <?php require __DIR__ . '/site-meta.php'; ?>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles/planning.css">
    <?php require __DIR__ . '/web-app-head.php'; ?>
    <script src="scripts/support.js" defer></script>
</head>
<body>
    <?php require __DIR__ . '/site-header.php'; ?>
    <main class="shell">
        <section class="panel stats-panel support-panel" aria-labelledby="support-title">
            <header class="panel-header panel-yellow">
                <span class="panel-icon" aria-hidden="true">♥</span>
                <h1 id="support-title">Soutenir LorR</h1>
            </header>
            <div class="panel-body">
                <div class="support-actions">
                    <a class="button button-blue" href="https://github.com/CorentinL5/LorR/issues/new" target="_blank" rel="noopener noreferrer">
                        Proposer une idée sur GitHub <span aria-hidden="true">↗</span>
                    </a>
                    <?php if ($showSupport): ?>
                        <a class="button button-green" href="<?= htmlspecialchars($supportUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"
                            target="_blank" rel="noopener noreferrer" aria-describedby="support-note">
                            Offrir un café <span aria-hidden="true">↗</span>
                        </a>
                    <?php endif; ?>
                </div>
                <?php if ($showSupport): ?>
                    <p id="support-note">Soutien volontaire et sans contrepartie. LorR ne prévoit pas de remboursement pour ces contributions.</p>
                <?php endif; ?>
                <h2 id="github-title">LorR sur GitHub</h2>
                <dl id="github-stats" class="stats-totals" aria-labelledby="github-title">
                    <div class="stats-total"><dt>Étoiles</dt><dd data-github-stat="stars">—</dd></div>
                    <div class="stats-total"><dt>Forks</dt><dd data-github-stat="forks">—</dd></div>
                    <div class="stats-total"><dt>Abonnés</dt><dd data-github-stat="subscribers">—</dd></div>
                </dl>
                <p id="github-status" role="status" hidden></p>
            </div>
        </section>
    </main>
    <?php require __DIR__ . '/site-footer.php'; ?>
</body>
</html>
