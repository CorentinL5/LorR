<?php
declare(strict_types=1);

const CATALOGUE_TTL = 900;
const SCHEDULE_TTL = 120;
const PLANNING_CACHE_RETENTION = 7 * 86400;

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
