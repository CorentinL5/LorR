<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

function requestGitHubStats(): ?array
{
    $url = 'https://api.github.com/repos/CorentinL5/LorR';
    $headers = ['Accept: application/vnd.github+json', 'User-Agent: LorR'];
    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        if ($handle === false) {
            return null;
        }
        curl_setopt_array($handle, [
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT_MS => 900,
            CURLOPT_TIMEOUT_MS => 1800,
        ]);
        $raw = curl_exec($handle);
        if (curl_getinfo($handle, CURLINFO_RESPONSE_CODE) !== 200) {
            return null;
        }
    } else {
        $context = stream_context_create(['http' => [
            'header' => $headers, 'timeout' => 1.8, 'follow_location' => 0,
        ]]);
        $raw = @file_get_contents($url, false, $context, 0, 65536);
    }
    $repository = is_string($raw) ? json_decode($raw, true) : null;
    $counts = [
        'stars' => $repository['stargazers_count'] ?? null,
        'forks' => $repository['forks_count'] ?? null,
        'subscribers' => $repository['subscribers_count'] ?? null,
    ];
    foreach ($counts as $count) {
        if (!is_int($count) || $count < 0) {
            return null;
        }
    }
    return $counts;
}

function readGitHubStatsCache(string $path): array
{
    $raw = @file_get_contents($path, false, null, 0, 4096);
    $entry = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($entry) || !is_int($entry['retry_after'] ?? null)) {
        return [];
    }
    $counts = $entry['counts'] ?? null;
    if ($counts !== null) {
        foreach (['stars', 'forks', 'subscribers'] as $key) {
            if (!is_int($counts[$key] ?? null) || $counts[$key] < 0) {
                return [];
            }
        }
    }
    return $entry;
}

function cachedGitHubStats(): ?array
{
    $directory = localStorageDirectory();
    if ($directory === null) {
        return null;
    }

    $path = $directory . '/github-stats.json';
    $entry = readGitHubStatsCache($path);
    $previous = $entry['counts'] ?? null;
    if (($entry['retry_after'] ?? 0) > time()) {
        return $previous;
    }

    $lock = @fopen($directory . '/github-stats.lock', 'c');
    if ($lock === false) {
        return $previous;
    }
    try {
        if (!flock($lock, LOCK_EX | LOCK_NB)) {
            return $previous;
        }
        $entry = readGitHubStatsCache($path);
        if (($entry['retry_after'] ?? 0) > time()) {
            return $entry['counts'] ?? null;
        }

        $latest = requestGitHubStats();
        $counts = $latest ?? $entry['counts'] ?? null;
        $temporary = @tempnam($directory, 'github-');
        if ($temporary !== false) {
            $value = json_encode(['counts' => $counts, 'retry_after' => time() + ($latest === null ? 180 : 1800)], JSON_THROW_ON_ERROR);
            if (@file_put_contents($temporary, $value) === false || !@rename($temporary, $path)) {
                @unlink($temporary);
            }
        }
        return $counts;
    } finally {
        fclose($lock);
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    return;
}

header('Content-Type: application/json; charset=UTF-8');
$counts = cachedGitHubStats();
if ($counts === null) {
    header('Cache-Control: no-store');
    http_response_code(503);
    echo '{}';
    return;
}
header('Cache-Control: public, max-age=120');
echo json_encode($counts, JSON_THROW_ON_ERROR);
