<?php
declare(strict_types=1);

const STREAM_TYPE = 'application/x-ndjson';
const CATALOGUE_TTL = 900;
const SCHEDULE_TTL = 120;
const PLANNING_CACHE_RETENTION = 7 * 86400;

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

function readCache(string $path): ?array
{
    $stored = @file_get_contents($path);
    if ($stored === false) {
        return null;
    }
    $entry = json_decode($stored, true);
    if (!is_array($entry['data'] ?? null) || !is_int($entry['time'] ?? null)
        || cacheLifetime($entry, PLANNING_CACHE_RETENTION, time()) === 0) {
        return null;
    }
    return $entry;
}

function cacheLifetime(?array $entry, int $ttl, int $now): int
{
    return $entry === null ? 0 : max(0, min($ttl, $entry['time'] + $ttl - $now));
}

function cachedPlanningResponse(string $url, ?array $catalogue, array $schedules, array $errors = []): array
{
    $now = time();
    $results = [];
    foreach ($schedules as $name => $entry) {
        $results[] = [
            'formation' => (string) $name,
            'events' => $entry['data'],
            'maxAge' => cacheLifetime($entry, SCHEDULE_TTL, $now),
            'cacheMaxAge' => cacheLifetime($entry, PLANNING_CACHE_RETENTION, $now),
        ];
    }
    return [
        'url' => $url,
        'formations' => $catalogue['data'] ?? [],
        'catalogueMaxAge' => cacheLifetime($catalogue, CATALOGUE_TTL, $now),
        'catalogueCacheMaxAge' => cacheLifetime($catalogue, PLANNING_CACHE_RETENTION, $now),
        'schedules' => $results,
        'errors' => $errors,
    ];
}

function writeCache(string $directory, string $path, array $entry): void
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
    $content = json_encode($entry, JSON_UNESCAPED_UNICODE);
    if ($content === false || @file_put_contents($temporary, $content) === false || !@rename($temporary, $path)) {
        @unlink($temporary);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, ['error' => 'Cette adresse accepte uniquement les requêtes POST.']);
}

require __DIR__ . '/server/planning-sources.php';
$body = file_get_contents('php://input', false, null, 0, MAX_PLANNING_REQUEST_BYTES + 1);
if ($body === false) {
    respond(400, ['error' => 'Impossible de lire la demande d’horaires.']);
}
if (strlen($body) > MAX_PLANNING_REQUEST_BYTES) {
    respond(413, ['error' => 'La demande d’horaires est trop volumineuse.']);
}
$data = json_decode($body, true);
if (!is_array($data) || !is_string($data['url'] ?? null)) {
    respond(400, ['error' => 'Indique un lien vers un espace invité.']);
}

$url = planningSource($data['url']);
if ($url === null) {
    respond(400, ['error' => 'Utilise un lien HTTPS /invite d’un établissement pris en charge.']);
}

$legacy = !array_key_exists('formations', $data) && !empty($data['formation']);
$requested = $data['formations'] ?? (isset($data['formation']) && $data['formation'] !== '' ? [$data['formation']] : []);
if (!is_array($requested) || !array_is_list($requested)) {
    respond(400, ['error' => 'La liste des formations est invalide.']);
}
foreach ($requested as $name) {
    if (!is_string($name) || trim($name) === '' || strlen($name) > 300 || preg_match('/[\x00-\x1f\x7f]/', $name)) {
        respond(400, ['error' => 'La formation est invalide.']);
    }
}
$requested = array_values(array_unique($requested));
if (count($requested) > MAX_FORMATIONS_PER_SOURCE) {
    respond(400, ['error' => 'Choisis au maximum ' . MAX_FORMATIONS_PER_SOURCE . ' formations par lien invité.']);
}

require __DIR__ . '/server/usage.php';
if ($requested) {
    recordUsage(['reads' => 1]);
}

$directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'lorr-hyperplanning-v3';
$cataloguePath = cachePath($directory, $url);
$requestTime = time();
$catalogue = readCache($cataloguePath);
$schedules = [];
$missing = [];

foreach ($requested as $name) {
    $cached = readCache(cachePath($directory, $url, $name));
    if ($cached !== null) {
        $schedules[$name] = $cached;
    }
    if (!cacheLifetime($cached, SCHEDULE_TTL, $requestTime)) {
        $missing[] = $name;
    }
}

$errors = [];
if (!cacheLifetime($catalogue, CATALOGUE_TTL, $requestTime) || $missing) {
    if ($catalogue !== null || $schedules) {
        sendUpdate(['type' => 'snapshot', 'data' => cachedPlanningResponse($url, $catalogue, $schedules)]);
    }
    if (!function_exists('proc_open')) {
        respond(503, ['error' => 'Cet hébergement doit autoriser PHP à lancer le lecteur Hyperplanning.']);
    }
    if (function_exists('set_time_limit')) {
        set_time_limit(115);
    }
    $command = ['node', __DIR__ . '/server/read.cjs', $url, json_encode($missing, JSON_UNESCAPED_UNICODE)];
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
    $received = [];
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
            case 'schedule':
                $name = $message['schedule']['formation'];
                $entry = ['time' => time(), 'data' => $message['schedule']['events']];
                $received[$name] = $schedules[$name] = $entry;
                writeCache($directory, cachePath($directory, $url, $name), $entry);
                sendUpdate(['type' => 'snapshot', 'data' => cachedPlanningResponse($url, null, [$name => $entry])]);
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
        $catalogue = ['time' => time(), 'data' => $result['formations']];
        writeCache($directory, $cataloguePath, $catalogue);
        foreach ($result['schedules'] as $schedule) {
            $name = $schedule['formation'];
            if (!isset($received[$name])) {
                $schedules[$name] = ['time' => time(), 'data' => $schedule['events']];
                writeCache($directory, cachePath($directory, $url, $name), $schedules[$name]);
            }
        }
        $errors = $result['errors'];
    } else {
        foreach ($missing as $name) {
            if (!isset($received[$name])) {
                $errors[] = ['formation' => $name, 'error' => $failure];
            }
        }
    }
} else {
    sendUpdate(['type' => 'progress', 'done' => 1, 'total' => 1, 'message' => 'Données récentes déjà disponibles']);
}

$loadedCourses = 0;
$subjects = [];
foreach ($schedules as $schedule) {
    $courses = [];
    foreach ($schedule['data'] as $event) {
        if (empty($event['notice'])) {
            $course = serialize([$event['subject'], $event['group'] ?? '', $event['type'] ?? '']);
            $courses[$course] = true;
            $subject = trim(preg_replace('/\s+/u', ' ', $event['subject']) ?? $event['subject']);
            if ($subject !== '') {
                $subjects[$subject] = true;
            }
        }
    }
    $loadedCourses += count($courses);
}
if ($catalogue !== null || $loadedCourses > 0) {
    recordUsage($loadedCourses ? ['courses' => $loadedCourses] : [], [
        'sources' => $catalogue !== null ? [hash('sha256', $url)] : [],
        'distinct_courses' => array_map(static fn ($subject): string => hash('sha256', $url . "\n" . $subject), array_keys($subjects)),
    ]);
}

if ($legacy) {
    if (!$schedules) {
        respond(502, ['error' => $errors[0]['error'] ?? 'Impossible de lire les horaires.']);
    }
    respond(200, ['formations' => $catalogue['data'] ?? [], 'events' => reset($schedules)['data']]);
}

respond(200, cachedPlanningResponse($url, $catalogue, $schedules, $errors));
