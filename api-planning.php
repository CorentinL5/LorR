<?php
declare(strict_types=1);

const STREAM_TYPE = 'application/x-ndjson';
require __DIR__ . '/server/planning-cache.php';

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

function cachedPlanningResponse(string $url, ?array $catalogue, array $schedules, array $errors = []): array
{
    $now = time();
    $results = [];
    foreach ($schedules as $name => $entry) {
        $results[] = [
            'formation' => (string) $name,
            'events' => $entry['data'],
            'fetchedAt' => $entry['time'],
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

function readBrowserPlanning(string $url, array $missing, callable $publishSchedule, bool $streaming): array
{
    if (function_exists('set_time_limit')) {
        set_time_limit(115);
    }
    $command = ['node', __DIR__ . '/server/read.cjs', $url, json_encode($missing, JSON_UNESCAPED_UNICODE)];
    if ($streaming) {
        $command[] = '--heartbeat';
    }
    $workerEnvironment = getenv();
    unset($workerEnvironment['LORR_IDEAS_MODERATOR_PASSWORD'], $workerEnvironment['LORR_IDEAS_MODERATOR_HASH']);
    $process = @proc_open(
        $command,
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'a']],
        $pipes,
        __DIR__,
        $workerEnvironment
    );
    if (!is_resource($process)) {
        return [null, 503, 'La lecture d’Hyperplanning est indisponible pour le moment.'];
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
            case 'schedule':
                $publishSchedule($message['schedule']['formation'], $message['schedule']['events']);
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
    return [$result, proc_close($process) === 2 ? 503 : 502, $failure];
}

function refreshRequestedPlanning($lock, string $url, array $missing, callable $publishSchedule, bool $streaming): array
{
    $phpReader = hasPhpPlanningReader();
    $browserReader = hasBrowserPlanningReader();
    if (!$phpReader && !$browserReader) {
        return [null, 503, 'La lecture en direct est indisponible sur cet hébergement. Consulte les horaires sur Hyperplanning.'];
    }
    if (!reservePlanningRefresh($lock)) {
        return [null, 503, 'Hyperplanning a déjà été consulté récemment. Réessaie dans une minute.'];
    }
    if (!$phpReader) {
        return readBrowserPlanning($url, $missing, $publishSchedule, $streaming);
    }

    require __DIR__ . '/server/guest-planning.php';
    try {
        $result = readGuestPlanning($url, $missing, static function (int $done, int $total, string $message) use ($streaming): void {
            sendUpdate(['type' => 'progress', 'done' => $done, 'total' => $total, 'message' => $message]);
            if ($streaming && connection_aborted()) {
                exit;
            }
        }, $publishSchedule);
        return [$result, 200, ''];
    } catch (RuntimeException | JsonException $error) {
        if ($browserReader && reservePlanningRefresh($lock)) {
            return readBrowserPlanning($url, $missing, $publishSchedule, $streaming);
        }
        return [null, 503, $error->getMessage()];
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, ['error' => 'Cette adresse accepte uniquement les requêtes POST.']);
}
$contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0]));
if ($contentType !== 'application/json') {
    respond(415, ['error' => 'Envoie la demande d’horaires au format JSON.']);
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
    if (!validPlanningFormation($name)) {
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

$directory = planningCacheDirectory();
$cataloguePath = cachePath($directory, $url);
$catalogue = readCache($cataloguePath);
[$schedules, $missing] = cachedSchedules($url, $requested);

$errors = [];
$warning = null;
if (!cacheLifetime($catalogue, CATALOGUE_TTL, time()) || $missing) {
    if ($catalogue !== null || $schedules) {
        sendUpdate(['type' => 'snapshot', 'data' => cachedPlanningResponse($url, $catalogue, $schedules)]);
    }
    $result = null;
    $received = [];
    $failureStatus = 503;
    $failure = 'Les horaires sont déjà en cours d’actualisation. Réessaie dans un instant.';
    $refreshPending = true;
    $publishSchedule = static function (string $name, array $events) use ($directory, $url, &$received, &$schedules): void {
        $entry = ['time' => time(), 'data' => $events];
        $received[$name] = $schedules[$name] = $entry;
        writeCache($directory, cachePath($directory, $url, $name), $entry);
        sendUpdate(['type' => 'snapshot', 'data' => cachedPlanningResponse($url, null, [$name => $entry])]);
    };
    $lock = lockPlanningRefresh($url);
    if ($lock !== false) {
        try {
            $catalogue = readCache($cataloguePath) ?? $catalogue;
            [$latest, $missing] = cachedSchedules($url, $requested);
            $schedules = $latest + $schedules;
            $refreshPending = !cacheLifetime($catalogue, CATALOGUE_TTL, time()) || $missing;
            if ($refreshPending) {
                [$result, $failureStatus, $failure] = refreshRequestedPlanning($lock, $url, $missing, $publishSchedule, $streaming);
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
            }
        } finally {
            fclose($lock);
        }
    }

    if ($refreshPending && $result === null) {
        if (!$schedules && ($requested || $catalogue === null)) {
            if ($failureStatus === 503 && !headers_sent()) {
                header('Retry-After: ' . PLANNING_REFRESH_INTERVAL);
            }
            respond($failureStatus, ['error' => $failure]);
        }
        $warning = $failure;
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
$loadedSessions = 0;
$subjects = [];
foreach ($schedules as $schedule) {
    $courses = [];
    foreach ($schedule['data'] as $event) {
        if (empty($event['notice'])) {
            $loadedSessions++;
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
if ($catalogue !== null || $loadedSessions > 0) {
    recordUsage($loadedSessions ? ['courses' => $loadedCourses, 'sessions' => $loadedSessions] : [], [
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

$response = cachedPlanningResponse($url, $catalogue, $schedules, $errors);
if ($warning !== null) {
    $response['warning'] = $warning;
}
respond(200, $response);
