<?php
declare(strict_types=1);

require_once __DIR__ . '/planning-sources.php';
require_once __DIR__ . '/planning-cache.php';
require_once __DIR__ . '/guest-planning.php';

const TEACHER_FORMATION_RETRY_DELAY = 300;

function teacherSearchKey(string $text): string
{
    $plain = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
    return trim(preg_replace('/[^a-z0-9]+/', ' ', strtolower($plain === false ? '' : $plain)));
}

function teacherNameMatches(string $label, string $key): bool
{
    $words = explode(' ', teacherSearchKey($label));
    return !array_diff(explode(' ', $key), $words);
}

function cachedTeacherSchedules(string $url, string $key): array
{
    $directory = planningCacheDirectory();
    $path = cachePath($directory, $url);
    $catalogue = readCache($path);
    $formations = array_values(array_unique(array_filter($catalogue['data'] ?? [], 'validPlanningFormation')));
    [$entries, $outdated] = cachedSchedules($url, $formations);
    $pending = false;
    if ($outdated || !cacheLifetime($catalogue, CATALOGUE_TTL, time())) {
        $before = array_column($entries, 'time');
        refreshTeacherFormations($url);
        $catalogue = readCache($path);
        $formations = array_values(array_unique(array_filter($catalogue['data'] ?? [], 'validPlanningFormation')));
        [$entries, $outdated] = cachedSchedules($url, $formations);
        $pending = $before === array_column($entries, 'time') && (!$formations || $outdated);
    }
    $teachers = [];
    foreach ($entries as $entry) {
        foreach ($entry['data'] as $event) {
            foreach (preg_split('/\s*[,;]\s*/u', $event['teacher'] ?? '', -1, PREG_SPLIT_NO_EMPTY) ?: [] as $name) {
                // Older browser reads may have flattened a list of surnames into one label.
                if (substr_count(teacherSearchKey($name), ' ') > 2 && teacherSearchKey($name) !== $key) {
                    continue;
                }
                if (teacherNameMatches($name, $key)) {
                    $name = trim($name);
                    $session = array_intersect_key($event, array_flip(['date', 'start', 'end', 'subject', 'room']));
                    $teachers[$name][serialize($session)] = $session;
                }
            }
        }
    }
    $schedules = [];
    foreach ($teachers as $name => $sessions) {
        $schedules[] = ['name' => $name, 'events' => array_values($sessions)];
    }
    return [
        'schedules' => $schedules,
        'covered' => count($entries),
        'total' => count($formations),
        'stale' => count($outdated) - (count($formations) - count($entries)),
        'pending' => $pending,
    ];
}

function refreshTeacherFormations(string $url, bool $background = false): void
{
    if (!hasPhpPlanningReader() || ($lock = lockPlanningRefresh($url)) === false) {
        return;
    }
    try {
        if ($background && planningRefreshCredit($lock, time()) < 2 * PLANNING_REFRESH_INTERVAL) {
            return;
        }
        $directory = planningCacheDirectory();
        $path = cachePath($directory, $url);
        $retryPath = cachePath($directory, $url, "\0teacher-formation-retry");
        $now = time();
        $retry = array_filter(readCache($retryPath)['data'] ?? [], static fn ($until): bool => is_int($until) && $until > $now);
        $catalogue = readCache($path);
        $formations = array_values(array_unique(array_filter($catalogue['data'] ?? [], 'validPlanningFormation')));
        [, $outdated] = cachedSchedules($url, $formations);
        if ((!array_diff($outdated, array_keys($retry)) && cacheLifetime($catalogue, CATALOGUE_TTL, $now))
            || !reservePlanningRefresh($lock, $background)) {
            return;
        }
        $client = new GuestPlanningClient($url, microtime(true) + 8);
        $resources = $client->formations();
        $formations = array_map('strval', array_keys($resources));
        if (!$formations) {
            return;
        }
        writeCache($directory, $path, ['time' => time(), 'data' => $formations]);
        [$entries, $outdated] = cachedSchedules($url, $formations);
        $outdated = array_diff($outdated, array_keys($retry));
        $missing = array_diff($outdated, array_keys($entries));
        $stale = array_values(array_diff($outdated, $missing));
        usort($stale, static fn (string $a, string $b): int => $entries[$a]['time'] <=> $entries[$b]['time']);
        shuffle($missing);
        // Leave room to refresh an existing schedule while coverage is still growing.
        $batch = $missing && $stale
            ? array_merge(array_slice($missing, 0, 3), $stale, array_slice($missing, 3))
            : array_merge($missing, $stale);
        require_once __DIR__ . '/planning-push-jobs.php';
        $failed = false;
        foreach (array_slice($batch, 0, 4) as $formation) {
            try {
                $entry = ['data' => $client->schedule($resources[$formation]), 'time' => time()];
                writeCache($directory, cachePath($directory, $url, $formation), $entry);
                queuePlanningPushVisit($url, [$formation => $entry]);
            } catch (RuntimeException | JsonException) {
                $retry[$formation] = time() + TEACHER_FORMATION_RETRY_DELAY;
                $failed = true;
            }
        }
        if ($failed) {
            writeCache($directory, $retryPath, ['time' => time(), 'data' => $retry]);
        }
    } catch (RuntimeException | JsonException) {
        // The search can still use the last valid reads.
    } finally {
        fclose($lock);
    }
}

function publicTeacherSchedules(string $url, string $query, string $key): array
{
    $directory = planningCacheDirectory();
    $path = cachePath($directory, $url, "\0teacher:" . $key);
    $entry = readCache($path);
    if (cacheLifetime($entry, SCHEDULE_TTL, time())) {
        return $entry['data'] + ['delayed' => false];
    }
    $lock = lockPlanningRefresh($url);
    if ($lock !== false) {
        try {
            $entry = readCache($path) ?? $entry;
            if (cacheLifetime($entry, SCHEDULE_TTL, time())) {
                return $entry['data'] + ['delayed' => false];
            }
            if (hasPhpPlanningReader() && reservePlanningRefresh($lock)) {
                $client = new GuestPlanningClient($url, microtime(true) + 5);
                $matches = array_filter($client->teachers($query), static fn (array $item): bool => teacherNameMatches($item['L'], $key));
                $data = ['schedules' => [], 'refine' => count($matches) > 3];
                if (!$data['refine']) {
                    foreach ($matches as $teacher) {
                        $data['schedules'][] = ['name' => $teacher['L'], 'events' => $client->schedule($teacher)];
                    }
                }
                writeCache($directory, $path, ['time' => time(), 'data' => $data]);
                return $data + ['delayed' => false];
            }
        } catch (RuntimeException | JsonException) {
            // Keep the last complete response for this search.
        } finally {
            fclose($lock);
        }
    }
    return ($entry['data'] ?? ['schedules' => [], 'refine' => false]) + ['delayed' => true];
}
