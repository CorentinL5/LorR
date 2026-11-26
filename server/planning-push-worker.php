<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/planning-push.php';
require_once __DIR__ . '/site-url.php';

function initPlanningPushKeys(): void
{
    if (planningPushConfig() !== null) {
        return;
    }
    $directory = localStorageDirectory();
    if ($directory === null) {
        throw new RuntimeException('Le stockage des clés VAPID est indisponible.');
    }
    $path = $directory . '/planning-push.json';
    if (file_exists($path)) {
        throw new RuntimeException('Vérifie la configuration VAPID existante.');
    }
    require_once dirname(__DIR__) . '/vendor/autoload.php';
    $keys = Minishlink\WebPush\VAPID::createVapidKeys() + ['subject' => 'https://' . LORR_PRODUCTION_HOST];
    $json = json_encode($keys, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    $temporary = tempnam($directory, 'push-');
    if ($temporary === false) {
        throw new RuntimeException('Impossible de préparer les clés VAPID.');
    }
    try {
        if (dirname($temporary) !== realpath($directory) || file_put_contents($temporary, $json) !== strlen($json)
            || !link($temporary, $path)) {
            throw new RuntimeException('Impossible de conserver les clés VAPID.');
        }
    } finally {
        unlink($temporary);
    }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try {
        if (($argv[1] ?? '') === '--init') {
            initPlanningPushKeys();
        } else {
            throw new RuntimeException('Utilise --init pour configurer le Web Push.');
        }
    } catch (Throwable) {
        fwrite(STDERR, "La tâche des alertes LorR a échoué. Vérifie la configuration Web Push et le stockage SQLite.\n");
        exit(1);
    }
}
