<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

function readPlanningStats(string $path): ?array
{
    if (!is_file($path)) {
        return [];
    }
    $json = @file_get_contents($path);
    $data = $json === false ? null : json_decode($json, true);
    return is_array($data) ? $data : null;
}

function updatePlanningStats(string $name, callable $update): void
{
    $directory = localStorageDirectory();
    if ($directory === null) {
        return;
    }
    $lock = @fopen($directory . '/' . $name . '.lock', 'c');
    if ($lock === false) {
        return;
    }
    try {
        if (!flock($lock, LOCK_EX)) {
            return;
        }
        $path = $directory . '/' . $name . '.json';
        $stats = readPlanningStats($path);
        if ($stats === null) {
            return;
        }
        $temporary = @tempnam($directory, 'stats-');
        if ($temporary === false) {
            return;
        }
        $json = json_encode($update($stats), JSON_UNESCAPED_SLASHES);
        if ($json === false || @file_put_contents($temporary, $json) !== strlen($json)
            || !@rename($temporary, $path)) {
            @unlink($temporary);
        }
    } finally {
        fclose($lock);
    }
}

function planningStatsSnapshot(string $name): ?array
{
    $directory = localStorageDirectory();
    if ($directory === null) {
        return null;
    }
    // Writers publish a complete snapshot with an atomic rename.
    return readPlanningStats($directory . '/' . $name . '.json');
}

function planningTraffic(): ?array
{
    return planningStatsSnapshot('planning-traffic');
}

function recordPlanningTraffic(
    string $url, int $requests, int $sent, int $received, ?int $durationMs = null, bool $failed = false
): void {
    updatePlanningStats('planning-traffic', static function (array $traffic) use ($url, $requests, $sent, $received, $durationMs, $failed): array {
        $entry = $traffic[$url] ?? ['since' => time()];
        $entry['requests'] = ($entry['requests'] ?? 0) + $requests;
        $entry['sent'] = ($entry['sent'] ?? 0) + $sent;
        $entry['received'] = ($entry['received'] ?? 0) + $received;
        $entry['maxSent'] = max($entry['maxSent'] ?? 0, $sent);
        $entry['maxReceived'] = max($entry['maxReceived'] ?? 0, $received);
        if ($durationMs !== null) {
            $entry['timedRequests'] = ($entry['timedRequests'] ?? 0) + $requests;
            $entry['failedRequests'] = ($entry['failedRequests'] ?? 0) + (int) $failed;
            $entry['durationMs'] = ($entry['durationMs'] ?? 0) + $durationMs;
        }
        $traffic[$url] = $entry;
        return $traffic;
    });
}

function recordPlanningActivity(array $totals, array $bySource = []): void
{
    updatePlanningStats('planning-activity', static function (array $activity) use ($totals, $bySource): array {
        foreach ($totals as $metric => $value) {
            $activity['totals'][$metric] = ($activity['totals'][$metric] ?? 0) + $value;
        }
        foreach ($bySource as $url => $counts) {
            foreach ($counts as $metric => $value) {
                $activity['sources'][$url][$metric] = ($activity['sources'][$url][$metric] ?? 0) + $value;
            }
        }
        return $activity;
    });
}
