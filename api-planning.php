<?php
declare(strict_types=1);

const STREAM_TYPE = 'application/x-ndjson';
const CATALOGUE_TTL = 900;
const SCHEDULE_TTL = 120;

$streaming = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', STREAM_TYPE);
header('Content-Type: ' . ($streaming ? STREAM_TYPE : 'application/json') . '; charset=UTF-8');
header('Cache-Control: no-store');
if ($streaming) {
    header('X-Accel-Buffering: no');
    ini_set('zlib.output_compression', '0');
    ignore_user_abort(true);
}

function sendUpdate(array $message): void
{
    global $streaming;
    if (!$streaming) {
        return;
    }

    echo json_encode($message, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n";
    if (ob_get_level() && ob_get_length()) {
        ob_flush();
    }
    flush();
}

function respond(int $status, array $body): never
{
    global $streaming;
    if (!headers_sent()) {
        http_response_code($status);
    }
    if ($streaming) {
        sendUpdate($status >= 400
            ? ['type' => 'error', 'error' => $body['error']]
            : ['type' => 'result', 'data' => $body]);
    } else {
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    }
    exit;
}

function cachePath(string $directory, string $url, string $formation = ''): string
{
    return $directory . DIRECTORY_SEPARATOR . hash('sha256', $url . "\n" . $formation) . '.json';
}

function readCache(string $path, int $ttl): ?array
{
    $stored = @file_get_contents($path);
    if ($stored === false) {
        return null;
    }
    $entry = json_decode($stored, true);
    if (!is_array($entry['data'] ?? null) || !is_int($entry['time'] ?? null)) {
        return null;
    }
    $maxAge = $entry['time'] + $ttl - time();
    return $maxAge > 0 ? ['data' => $entry['data'], 'maxAge' => $maxAge] : null;
}

function writeCache(string $directory, string $path, array $data): void
{
    if (!is_dir($directory)) {
        @mkdir($directory, 0700, true);
    }
    if (!is_dir($directory)) {
        return;
    }

    $temporary = @tempnam($directory, 'read-');
    if ($temporary === false) {
        return;
    }
    $content = json_encode(['time' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE);
    if ($content === false || @file_put_contents($temporary, $content) === false || !@rename($temporary, $path)) {
        @unlink($temporary);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, ['error' => 'Cette adresse accepte uniquement les requêtes POST.']);
}

$data = json_decode(file_get_contents('php://input', false, null, 0, 32768), true);
if (!is_array($data) || !is_string($data['url'] ?? null)) {
    respond(400, ['error' => 'Indique un lien vers un espace invité.']);
}

$parts = parse_url(trim($data['url']));
$host = strtolower($parts['host'] ?? '');
$extraHosts = preg_split('/\s*,\s*/', strtolower(getenv('LORR_PLANNING_HOSTS') ?: ''), -1, PREG_SPLIT_NO_EMPTY);
$supportedHost = preg_match('/\Ahehplanning[0-9]{4}\.umons\.ac\.be\z/', $host)
    || in_array($host, $extraHosts, true);

if (($parts['scheme'] ?? '') !== 'https'
    || !in_array($parts['path'] ?? '', ['/invite', '/invite/'], true)
    || isset($parts['pass'])
    || isset($parts['user'])
    || isset($parts['port'])
    || !$supportedHost
) {
    respond(400, ['error' => 'Utilise un lien HTTPS /invite d’un établissement pris en charge.']);
}

$legacy = !array_key_exists('formations', $data) && !empty($data['formation']);
$requested = $data['formations'] ?? (isset($data['formation']) && $data['formation'] !== '' ? [$data['formation']] : []);
if (!is_array($requested) || !array_is_list($requested)) {
    respond(400, ['error' => 'La liste des formations est invalide.']);
}
foreach ($requested as $name) {
    if (!is_string($name) || trim($name) === '' || strlen($name) > 300 || str_contains($name, "\0")) {
        respond(400, ['error' => 'La formation est invalide.']);
    }
}
$requested = array_values(array_unique($requested));

$url = 'https://' . $host . '/invite';
$directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'lorr-hyperplanning-v3';
$cataloguePath = cachePath($directory, $url);
$requestTime = time();
$cachedCatalogue = readCache($cataloguePath, CATALOGUE_TTL);
$catalogue = $cachedCatalogue['data'] ?? null;
$catalogueExpires = $requestTime + ($cachedCatalogue['maxAge'] ?? 0);
$scheduleExpiries = [];
$schedules = [];
$missing = [];

foreach ($requested as $name) {
    $cached = readCache(cachePath($directory, $url, $name), SCHEDULE_TTL);
    if ($cached !== null) {
        $schedules[$name] = ['formation' => $name, 'events' => $cached['data']];
        $scheduleExpiries[$name] = $requestTime + $cached['maxAge'];
    } else {
        $missing[] = $name;
    }
}

$errors = [];
if ($catalogue === null || $missing) {
    set_time_limit(115);
    $command = ['node', __DIR__ . '/planning/read.cjs', $url, json_encode($missing, JSON_UNESCAPED_UNICODE)];
    if ($streaming) {
        $command[] = '--heartbeat';
    }
    $process = proc_open(
        $command,
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'a']],
        $pipes,
        __DIR__
    );
    if (!is_resource($process)) {
        respond(503, ['error' => 'La lecture d’Hyperplanning est indisponible pour le moment.']);
    }

    fclose($pipes[0]);
    $result = null;
    $failure = 'La lecture d’Hyperplanning a été interrompue. Réessaie dans un instant.';
    while (($line = fgets($pipes[1])) !== false) {
        $message = json_decode($line, true);
        switch ($message['type'] ?? '') {
            case 'progress':
            case 'heartbeat':
                sendUpdate($message);
                break;
            case 'result':
                $result = $message['data'];
                break;
            case 'error':
                $failure = $message['error'];
                break;
        }
        if ($streaming && connection_aborted()) {
            proc_terminate($process);
            fclose($pipes[1]);
            proc_close($process);
            exit;
        }
    }
    fclose($pipes[1]);
    $status = proc_close($process);

    if ($result === null && !$schedules) {
        respond($status === 2 ? 503 : 502, ['error' => $failure]);
    }
    if ($result !== null) {
        $catalogue = $result['formations'];
        $catalogueExpires = time() + CATALOGUE_TTL;
        writeCache($directory, $cataloguePath, $catalogue);
        foreach ($result['schedules'] as $schedule) {
            $name = $schedule['formation'];
            $schedules[$name] = $schedule;
            $scheduleExpiries[$name] = time() + SCHEDULE_TTL;
            writeCache($directory, cachePath($directory, $url, $name), $schedule['events']);
        }
        $errors = $result['errors'];
    } else {
        foreach ($missing as $name) {
            $errors[] = ['formation' => $name, 'error' => $failure];
        }
    }
} else {
    sendUpdate(['type' => 'progress', 'done' => 1, 'total' => 1, 'message' => 'Données récentes déjà disponibles']);
}

if ($legacy) {
    if (!$schedules) {
        respond(502, ['error' => $errors[0]['error'] ?? 'Impossible de lire les horaires.']);
    }
    respond(200, ['formations' => $catalogue ?? [], 'events' => reset($schedules)['events']]);
}

$responseTime = time();
foreach ($schedules as $name => $schedule) {
    $schedules[$name]['maxAge'] = max(0, $scheduleExpiries[$name] - $responseTime);
}

respond(200, [
    'url' => $url,
    'formations' => $catalogue ?? [],
    'catalogueMaxAge' => max(0, $catalogueExpires - $responseTime),
    'schedules' => array_values($schedules),
    'errors' => $errors,
]);
