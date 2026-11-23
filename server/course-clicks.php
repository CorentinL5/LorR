<?php
declare(strict_types=1);

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

$data = json_decode(file_get_contents('php://input', false, null, 0, 128), true);
$clicks = $data['clicks'] ?? null;
if (!is_int($clicks) || $clicks < 1 || $clicks > 100) {
    http_response_code(400);
    return;
}

require __DIR__ . '/usage.php';
recordUsage(['clicks' => $clicks]);
http_response_code(204);
