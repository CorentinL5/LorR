<?php
declare(strict_types=1);

const CATALOGUE_TTL = 900;
const SCHEDULE_TTL = 600;
const PLANNING_CACHE_RETENTION = 7 * 86400;
const PLANNING_REFRESH_INTERVAL = 60;

function planningCacheDirectory(): string
{
    return sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'lorr-hyperplanning-v3';
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

function cachedSchedules(string $url, array $formations): array
{
    $directory = planningCacheDirectory();
    $now = time();
    $schedules = [];
    $missing = [];
    foreach ($formations as $formation) {
        $entry = readCache(cachePath($directory, $url, $formation));
        if ($entry !== null) {
            $schedules[$formation] = $entry;
        }
        if (!cacheLifetime($entry, SCHEDULE_TTL, $now)) {
            $missing[] = $formation;
        }
    }
    return [$schedules, $missing];
}

/** @return resource|false */
function lockPlanningRefresh(string $url)
{
    $directory = planningCacheDirectory();
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        return false;
    }
    $lock = @fopen($directory . '/refresh-' . hash('sha256', $url) . '.lock', 'c+');
    if ($lock !== false && !flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        return false;
    }
    return $lock;
}

function reservePlanningRefresh($lock): bool
{
    $now = time();
    rewind($lock);
    $stored = json_decode(stream_get_contents($lock, 128) ?: '', true);
    // Two immediate sessions cover the first catalogue and timetable requests.
    // Each further session needs one minute of accumulated credit.
    $capacity = 2 * PLANNING_REFRESH_INTERVAL;
    $elapsed = max(0, $now - (int) ($stored['time'] ?? $now));
    $credit = min($capacity, (int) ($stored['credit'] ?? $capacity) + $elapsed);
    if ($credit < PLANNING_REFRESH_INTERVAL) {
        return false;
    }
    $entry = json_encode(['time' => $now, 'credit' => $credit - PLANNING_REFRESH_INTERVAL]);
    rewind($lock);
    return ftruncate($lock, 0) && fwrite($lock, $entry) === strlen($entry) && fflush($lock);
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
