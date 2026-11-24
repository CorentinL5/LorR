<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/planning-sources.php';

const PLANNING_LINK_ID_LENGTH = 12;
const MAX_STORED_PLANNING_CODE = 4096;
const MAX_PLANNING_LINKS_PER_PREFIX = 512;
const MAX_PLANNING_SHARE_BYTES = 256 * 1024;
const MAX_PLANNING_SHARE_SOURCES = 32;

function planningLinkBase64(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function planningLinkId(string $code): string
{
    return substr(planningLinkBase64(hash('sha256', $code, true)), 0, PLANNING_LINK_ID_LENGTH);
}

function validStoredPlanningCode(mixed $code): bool
{
    if (!is_string($code) || strlen($code) > MAX_STORED_PLANNING_CODE
        || !preg_match('/\A[bz]\.([A-Za-z0-9_-]+)\z/', $code, $match)) {
        return false;
    }
    $bytes = base64_decode(strtr($match[1], '-_', '+/'), true);
    return $bytes !== false && planningLinkBase64($bytes) === $match[1];
}

function validSharedHost(mixed $host): bool
{
    return is_string($host) && planningSource('https://' . $host . '/invite') === 'https://' . $host . '/invite';
}

function validSharedPlanningState(string $code): bool
{
    $bytes = base64_decode(strtr(substr($code, 2), '-_', '+/'), true);
    if ($bytes === false) {
        return false;
    }
    if (str_starts_with($code, 'z.')) {
        if (!function_exists('gzuncompress')) {
            return false;
        }
        $bytes = @gzuncompress($bytes, MAX_PLANNING_SHARE_BYTES);
    }
    if ($bytes === false) {
        return false;
    }

    $state = json_decode($bytes, false, 12);
    if (!is_array($state) || !array_is_list($state)) {
        return false;
    }
    if (($state[0] ?? null) === 1) {
        return validLegacySharedPlanningState($state);
    }
    return ($state[0] ?? null) === 2 && validPackedSharedPlanningState($state);
}

function validLegacySharedPlanningState(array $state): bool
{
    if (count($state) < 3 || count($state) > 4 || !is_array($state[1]) || !array_is_list($state[1])
        || !is_array($state[2]) || !array_is_list($state[2]) || !$state[2]
        || (count($state) === 4 && (!is_array($state[3]) || !array_is_list($state[3])))) {
        return false;
    }
    $hosts = [];
    foreach ($state[1] as $formation) {
        if (!is_array($formation) || !array_is_list($formation) || count($formation) !== 2
            || !validSharedHost($formation[0]) || !validPlanningFormation($formation[1])) {
            return false;
        }
        $hosts[$formation[0]][$formation[1]] = true;
        if (count($hosts) > MAX_PLANNING_SHARE_SOURCES || count($hosts[$formation[0]]) > MAX_FORMATIONS_PER_SOURCE) {
            return false;
        }
    }
    foreach ($state[2] as $course) {
        if (!is_array($course) || !array_is_list($course) || count($course) !== 4
            || !is_int($course[0]) || !isset($state[1][$course[0]]) || !is_string($course[1])
            || !is_string($course[2]) || $course[2] === '' || !is_string($course[3])) {
            return false;
        }
    }
    foreach ($state[3] ?? [] as $notice) {
        $fields = is_string($notice) ? json_decode($notice, false, 3) : null;
        if (!validSharedNotice($fields, 5, 5)) {
            return false;
        }
    }
    return true;
}

function validSharedNotice(mixed $fields, int $minimum, int $maximum): bool
{
    if (!is_array($fields) || count($fields) < $minimum || count($fields) > $maximum) {
        return false;
    }
    foreach ($fields as $value) {
        if (!is_string($value)) {
            return false;
        }
    }
    return true;
}

function validPackedSharedPlanningState(array $state): bool
{
    if (count($state) !== 2 || !is_array($state[1]) || !array_is_list($state[1])
        || !$state[1] || count($state[1]) > MAX_PLANNING_SHARE_SOURCES) {
        return false;
    }
    $hasCourses = false;
    $hosts = [];
    foreach ($state[1] as $source) {
        if (!is_array($source) || !array_is_list($source) || count($source) < 2 || count($source) > 3
            || !is_array($source[1]) || !array_is_list($source[1]) || !$source[1]
            || (count($source) === 3 && (!is_array($source[2]) || !array_is_list($source[2])))) {
            return false;
        }
        $host = $source[0];
        if (is_int($host) && $host >= 0 && $host <= 9999) {
            $host = sprintf('hehplanning%04d.umons.ac.be', $host);
        }
        if (!validSharedHost($host) || isset($hosts[$host]) || count($source[1]) > MAX_FORMATIONS_PER_SOURCE) {
            return false;
        }
        $hosts[$host] = true;
        foreach ($source[1] as $formation) {
            if (!is_array($formation) || !array_is_list($formation) || count($formation) !== 2
                || !validPlanningFormation($formation[0]) || !is_array($formation[1]) || !array_is_list($formation[1])) {
                return false;
            }
            foreach ($formation[1] as $group) {
                if (!is_array($group) || !array_is_list($group) || count($group) < 3) {
                    return false;
                }
                foreach ($group as $index => $value) {
                    if (!is_string($value) || ($index >= 2 && $value === '')) {
                        return false;
                    }
                }
                $hasCourses = true;
            }
        }
        foreach ($source[2] ?? [] as $notice) {
            if (!validSharedNotice($notice, 3, 4)) {
                return false;
            }
        }
    }
    return $hasCourses;
}

function openPlanningLinkDatabase(): ?PDO
{
    if (!hasLocalSqlite()) {
        return null;
    }
    $directory = localStorageDirectory();
    if ($directory === null) {
        throw new RuntimeException('Le stockage SQLite est indisponible.');
    }

    $database = openLocalDatabase($directory);
    $database->exec(
        'CREATE TABLE IF NOT EXISTS planning_links (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL
        ) WITHOUT ROWID'
    );
    return $database;
}

function findPlanningLink(PDO $database, string $id): ?string
{
    $query = $database->prepare('SELECT code FROM planning_links WHERE id = ?');
    $query->execute([$id]);
    $code = $query->fetchColumn();
    return is_string($code) ? $code : null;
}

function storePlanningLink(string $code): ?string
{
    $database = openPlanningLinkDatabase();
    if ($database === null) {
        return null;
    }

    $id = planningLinkId($code);
    $prefix = $id[0];
    $insert = $database->prepare(
        'INSERT INTO planning_links (id, code)
        SELECT :id, :code
        WHERE (SELECT COUNT(*) FROM planning_links WHERE id >= :first AND id < :next) < '
        . MAX_PLANNING_LINKS_PER_PREFIX . '
        ON CONFLICT (id) DO NOTHING'
    );
    $insert->execute(['id' => $id, 'code' => $code, 'first' => $prefix, 'next' => chr(ord($prefix) + 1)]);
    return findPlanningLink($database, $id) === $code ? $id : null;
}

function createPlanningLink(): void
{
    header('Cache-Control: no-store');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        http_response_code(405);
        return;
    }
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0]));
    if ($contentType !== 'application/json') {
        http_response_code(415);
        return;
    }

    $limit = MAX_STORED_PLANNING_CODE + 32;
    $body = file_get_contents('php://input', false, null, 0, $limit + 1);
    if ($body === false || strlen($body) > $limit) {
        http_response_code(413);
        return;
    }
    $data = json_decode($body, true, 4);
    $code = $data['code'] ?? null;
    if (!is_array($data) || count($data) !== 1 || !validStoredPlanningCode($code) || !validSharedPlanningState($code)) {
        http_response_code(400);
        return;
    }

    try {
        $id = storePlanningLink($code);
    } catch (RuntimeException) {
        $id = null;
    }
    if ($id === null) {
        http_response_code(503);
        return;
    }
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['id' => $id]);
}

function openPlanningLink(string $base, string $route): bool
{
    if (!preg_match('~\A/p/([A-Za-z0-9_-]{' . PLANNING_LINK_ID_LENGTH . '})\z~', $route, $match)) {
        return false;
    }
    header('Cache-Control: no-store');
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        header('Allow: GET, HEAD');
        http_response_code(405);
        return true;
    }

    $id = $match[1];
    try {
        $database = openPlanningLinkDatabase();
        if ($database === null) {
            http_response_code(503);
            return true;
        }
        $code = findPlanningLink($database, $id);
    } catch (RuntimeException) {
        http_response_code(503);
        return true;
    }
    if (!validStoredPlanningCode($code) || planningLinkId($code) !== $id) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'Ce lien de planning est introuvable.';
        return true;
    }
    $destination = $base . '/planning#p=' . $code;
    header('Content-Type: text/html; charset=UTF-8');
    require __DIR__ . '/../views/shared-planning.php';
    return true;
}
