<?php
declare(strict_types=1);

const PLANNING_LINK_ID_LENGTH = 12;
const MAX_STORED_PLANNING_CODE = 4096;
const MAX_PLANNING_LINKS_PER_DIRECTORY = 512;

function planningLinkDirectory(string $id): string
{
    $root = getenv('LORR_LINKS_DIR') ?: dirname(__DIR__) . '/var/planning-links';
    return $root . '/' . $id[0];
}

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

function storePlanningLink(string $code): ?string
{
    $id = planningLinkId($code);
    $directory = planningLinkDirectory($id);
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        return null;
    }

    $lock = @fopen($directory . '/.lock', 'c');
    if ($lock === false) {
        return null;
    }
    try {
        if (!flock($lock, LOCK_EX)) {
            return null;
        }
        $path = $directory . '/' . $id . '.link';
        if (is_file($path)) {
            $stored = @file_get_contents($path, false, null, 0, MAX_STORED_PLANNING_CODE + 1);
            return $stored === $code ? $id : null;
        }

        $entries = @scandir($directory, SCANDIR_SORT_NONE);
        if ($entries === false
            || count(array_filter($entries, static fn (string $name): bool => str_ends_with($name, '.link'))) >= MAX_PLANNING_LINKS_PER_DIRECTORY) {
            return null;
        }

        $temporary = @tempnam($directory, 'link-');
        if ($temporary === false) {
            return null;
        }
        if (realpath(dirname($temporary)) !== realpath($directory)
            || @file_put_contents($temporary, $code) !== strlen($code)
            || !@rename($temporary, $path)) {
            @unlink($temporary);
            return null;
        }
        return $id;
    } finally {
        fclose($lock);
    }
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

    $id = storePlanningLink($code);
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
    $path = planningLinkDirectory($id) . '/' . $id . '.link';
    $code = @file_get_contents($path, false, null, 0, MAX_STORED_PLANNING_CODE + 1);
    if (!validStoredPlanningCode($code) || planningLinkId($code) !== $id) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'Ce lien de planning est introuvable.';
        return true;
    }
    header('Location: ' . $base . '/planning#p=' . $code, true, 302);
    return true;
}
