<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

const PLANNING_LINK_ID_LENGTH = 12;
const MAX_STORED_PLANNING_CODE = 4096;
const MAX_PLANNING_LINKS_PER_PREFIX = 512;

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
    if (!is_array($data) || count($data) !== 1 || !validStoredPlanningCode($code)) {
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
    header('Location: ' . $base . '/planning#p=' . $code, true, 302);
    return true;
}
