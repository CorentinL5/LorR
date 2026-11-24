<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

function readPlanningTraffic(string $path): ?array
{
    if (!is_file($path)) {
        return [];
    }
    $json = @file_get_contents($path);
    $data = $json === false ? null : json_decode($json, true);
    return is_array($data) ? $data : null;
}

function recordPlanningTraffic(string $url, int $requests, int $sent, int $received): void
{
    $directory = localStorageDirectory();
    if ($directory === null) {
        return;
    }
    $lock = @fopen($directory . '/planning-traffic.lock', 'c');
    if ($lock === false) {
        return;
    }
    try {
        if (!flock($lock, LOCK_EX)) {
            return;
        }
        $path = $directory . '/planning-traffic.json';
        $traffic = readPlanningTraffic($path);
        if ($traffic === null) {
            return;
        }
        $entry = $traffic[$url] ?? [
            'since' => time(),
            'requests' => 0,
            'sent' => 0,
            'received' => 0,
            'maxSent' => 0,
            'maxReceived' => 0,
        ];
        $entry['requests'] += $requests;
        $entry['sent'] += $sent;
        $entry['received'] += $received;
        $entry['maxSent'] = max($entry['maxSent'], $sent);
        $entry['maxReceived'] = max($entry['maxReceived'], $received);
        $traffic[$url] = $entry;

        $temporary = @tempnam($directory, 'traffic-');
        if ($temporary === false) {
            return;
        }
        $json = json_encode($traffic, JSON_UNESCAPED_SLASHES);
        if ($json === false || @file_put_contents($temporary, $json) !== strlen($json)
            || !@rename($temporary, $path)) {
            @unlink($temporary);
        }
    } finally {
        fclose($lock);
    }
}

function planningTraffic(): ?array
{
    $directory = localStorageDirectory();
    if ($directory === null) {
        return null;
    }
    // Writers publish a complete snapshot with an atomic rename.
    return readPlanningTraffic($directory . '/planning-traffic.json');
}
