<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

const USAGE_METRICS = ['home', 'planner', 'reads', 'courses', 'sessions', 'clicks'];
const USAGE_DISTINCT_TABLES = ['sources' => 'usage_sources', 'distinct_courses' => 'usage_courses'];

function usageNow(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone('Europe/Brussels'));
}

function usageDay(?DateTimeImmutable $now = null): DateTimeImmutable
{
    return ($now ?? usageNow())->setTime(0, 0);
}

function usageHourKey(int $timestamp): string
{
    return 'hour:' . gmdate('Y-m-d\TH:00\Z', $timestamp);
}

function emptyUsageCounts(): array
{
    return array_fill_keys(USAGE_METRICS, 0);
}

function readUsageSnapshot(string $directory): ?array
{
    $file = $directory . '/lorr-stats.json';
    $emptySets = array_fill_keys(array_keys(USAGE_DISTINCT_TABLES), []);
    if (!is_file($file)) {
        return ['total' => emptyUsageCounts(), 'daily' => [], 'hourly' => []] + $emptySets;
    }
    $content = @file_get_contents($file);
    if ($content === false) {
        return null;
    }
    $data = json_decode($content, true);
    if (!is_array($data['total'] ?? null) || !is_array($data['daily'] ?? null)) {
        return null;
    }

    $data['total'] += emptyUsageCounts();
    return $data + ['hourly' => []] + $emptySets;
}

function openUsageDatabase(string $directory): PDO
{
    $database = openLocalDatabase($directory);
    $database->exec(
        'CREATE TABLE IF NOT EXISTS usage_counts (
            day TEXT NOT NULL,
            metric TEXT NOT NULL,
            amount INTEGER NOT NULL CHECK (amount >= 0),
            PRIMARY KEY (day, metric)
        ) WITHOUT ROWID'
    );
    foreach (USAGE_DISTINCT_TABLES as $table) {
        $database->exec(
            "CREATE TABLE IF NOT EXISTS $table (
                day TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                PRIMARY KEY (day, fingerprint)
            ) WITHOUT ROWID"
        );
    }

    $file = $directory . '/lorr-stats.json';
    if (is_file($file) && $database->query(
        'SELECT 1 FROM usage_counts UNION ALL SELECT 1 FROM usage_sources UNION ALL SELECT 1 FROM usage_courses LIMIT 1'
    )->fetchColumn() === false) {
        $snapshot = readUsageSnapshot($directory);
        if ($snapshot === null) {
            throw new RuntimeException('Impossible de reprendre les compteurs JSON.');
        }

        // Ignore rows already imported by another request during the first opening.
        $database->beginTransaction();
        try {
            $insert = $database->prepare('INSERT OR IGNORE INTO usage_counts (day, metric, amount) VALUES (?, ?, ?)');
            foreach (['total' => $snapshot['total']] + $snapshot['daily'] + $snapshot['hourly'] as $day => $counts) {
                foreach (USAGE_METRICS as $metric) {
                    $insert->execute([$day, $metric, $counts[$metric] ?? 0]);
                }
            }
            if (isset($snapshot['hourlySince'])) {
                $insert->execute(['hourly-start', 'timestamp', $snapshot['hourlySince']]);
            }
            foreach (USAGE_DISTINCT_TABLES as $metric => $table) {
                $insertDistinct = $database->prepare("INSERT OR IGNORE INTO $table (day, fingerprint) VALUES (?, ?)");
                foreach ($snapshot[$metric] as $day => $fingerprints) {
                    foreach (array_keys($fingerprints) as $fingerprint) {
                        $insertDistinct->execute([$day, $fingerprint]);
                    }
                }
            }
            $database->commit();
        } catch (RuntimeException $error) {
            $database->rollBack();
            throw $error;
        }
    }

    return $database;
}

function readUsageDatabase(PDO $database): array
{
    $now = usageNow();
    $cutoff = usageDay($now)->modify('-6 days');
    $period = "day IN ('total', 'hourly-start') OR day BETWEEN :cutoff AND :today
        OR day BETWEEN :firstHour AND :lastHour";
    $queries = ["SELECT day, metric, amount FROM usage_counts WHERE $period"];
    foreach (USAGE_DISTINCT_TABLES as $metric => $table) {
        $queries[] = "SELECT day, '$metric', COUNT(*) FROM $table WHERE $period GROUP BY day";
    }
    $query = $database->prepare(implode(' UNION ALL ', $queries));
    $query->execute([
        'cutoff' => $cutoff->format('Y-m-d'),
        'today' => $now->format('Y-m-d'),
        'firstHour' => usageHourKey($cutoff->getTimestamp()),
        'lastHour' => usageHourKey($now->getTimestamp()),
    ]);
    $data = ['total' => emptyUsageCounts(), 'daily' => [], 'hourly' => []];
    foreach ($query as $row) {
        $day = $row['day'];
        $metric = $row['metric'];
        if ($day === 'total') {
            $data['total'][$metric] = (int) $row['amount'];
        } elseif ($day === 'hourly-start') {
            $data['hourlySince'] = (int) $row['amount'];
        } else {
            $period = str_starts_with($day, 'hour:') ? 'hourly' : 'daily';
            $data[$period][$day] ??= emptyUsageCounts();
            $data[$period][$day][$metric] = (int) $row['amount'];
        }
    }
    return $data;
}

function recordDatabaseUsage(PDO $database, array $counts, array $distinct): void
{
    $now = usageNow();
    $date = $now->format('Y-m-d');
    $hour = intdiv($now->getTimestamp(), 3600) * 3600;
    $bucket = usageHourKey($hour);
    $cutoff = usageDay($now)->modify('-6 days');
    $firstHour = usageHourKey($cutoff->getTimestamp());
    $database->beginTransaction();
    try {
        $start = $database->prepare("INSERT OR IGNORE INTO usage_counts VALUES ('hourly-start', 'timestamp', ?)");
        $start->execute([$hour]);
        if ($counts) {
            $update = $database->prepare(
                'INSERT INTO usage_counts (day, metric, amount) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
                    ON CONFLICT (day, metric) DO UPDATE SET amount = amount + excluded.amount'
            );
            foreach ($counts as $metric => $amount) {
                $update->execute(['total', $metric, $amount, $date, $metric, $amount, $bucket, $metric, $amount]);
            }
        }
        $database->prepare("DELETE FROM usage_counts WHERE day >= 'hour:' AND day < ?")->execute([$firstHour]);
        foreach ($distinct as $metric => $fingerprints) {
            if (!$fingerprints) {
                continue;
            }
            $table = USAGE_DISTINCT_TABLES[$metric];
            $insert = $database->prepare("INSERT OR IGNORE INTO $table (day, fingerprint) VALUES (?, ?), (?, ?), (?, ?)");
            foreach ($fingerprints as $fingerprint) {
                $insert->execute(['total', $fingerprint, $date, $fingerprint, $bucket, $fingerprint]);
            }
            $prune = $database->prepare("DELETE FROM $table WHERE day < ? OR (day >= 'hour:' AND day < ?)");
            $prune->execute([$cutoff->format('Y-m-d'), $firstHour]);
        }
        $database->commit();
    } catch (RuntimeException $error) {
        $database->rollBack();
        throw $error;
    }
}

function recordFileUsage(string $directory, array $counts, array $distinct): void
{
    $lock = @fopen($directory . '/lorr-stats.lock', 'c');
    if ($lock === false) {
        return;
    }

    try {
        if (!flock($lock, LOCK_EX)) {
            return;
        }
        $data = readUsageSnapshot($directory);
        if ($data === null) {
            return;
        }

        $now = usageNow();
        $date = $now->format('Y-m-d');
        $hour = intdiv($now->getTimestamp(), 3600) * 3600;
        $bucket = usageHourKey($hour);
        $cutoff = usageDay($now)->modify('-6 days');
        $data['hourlySince'] ??= $hour;
        foreach (['daily' => $cutoff->format('Y-m-d'), 'hourly' => usageHourKey($cutoff->getTimestamp())] as $period => $first) {
            foreach (array_keys($data[$period]) as $key) {
                if ($key < $first) {
                    unset($data[$period][$key]);
                    foreach (array_keys(USAGE_DISTINCT_TABLES) as $metric) {
                        unset($data[$metric][$key]);
                    }
                }
            }
        }
        $data['daily'][$date] = ($data['daily'][$date] ?? []) + emptyUsageCounts();
        $data['hourly'][$bucket] = ($data['hourly'][$bucket] ?? []) + emptyUsageCounts();
        foreach ($counts as $metric => $amount) {
            $data['daily'][$date][$metric] += $amount;
            $data['hourly'][$bucket][$metric] += $amount;
            $data['total'][$metric] += $amount;
        }
        foreach ($distinct as $metric => $fingerprints) {
            foreach ($fingerprints as $fingerprint) {
                $data[$metric]['total'][$fingerprint] = true;
                $data[$metric][$date][$fingerprint] = true;
                $data[$metric][$bucket][$fingerprint] = true;
            }
        }

        $temporary = @tempnam($directory, 'usage-');
        if ($temporary === false) {
            return;
        }
        $json = json_encode($data);
        if ($json === false || @file_put_contents($temporary, $json) !== strlen($json)
            || !@rename($temporary, $directory . '/lorr-stats.json')) {
            @unlink($temporary);
        }
    } finally {
        fclose($lock);
    }
}

function recordUsage(array $counts, array $distinct = []): void
{
    $directory = localStorageDirectory();
    if ($directory === null) {
        return;
    }
    if (hasLocalSqlite()) {
        try {
            recordDatabaseUsage(openUsageDatabase($directory), $counts, $distinct);
        } catch (RuntimeException) {
            // Usage statistics must not interrupt the requested page.
        }
    } elseif (!is_file($directory . '/' . LORR_SQLITE_FILENAME)) {
        recordFileUsage($directory, $counts, $distinct);
    }
}

function siteUsage(): ?array
{
    $directory = localStorageDirectory();
    if ($directory === null) {
        return null;
    }
    if (hasLocalSqlite()) {
        try {
            return readUsageDatabase(openUsageDatabase($directory));
        } catch (RuntimeException) {
            return null;
        }
    }
    if (is_file($directory . '/' . LORR_SQLITE_FILENAME)) {
        return null;
    }

    $lock = @fopen($directory . '/lorr-stats.lock', 'c');
    if ($lock === false) {
        return null;
    }
    try {
        $data = flock($lock, LOCK_SH) ? readUsageSnapshot($directory) : null;
        if ($data === null) {
            return null;
        }
        foreach (array_keys(USAGE_DISTINCT_TABLES) as $metric) {
            $data['total'][$metric] = count($data[$metric]['total'] ?? []);
            foreach (['daily', 'hourly'] as $period) {
                foreach (array_keys($data[$period]) as $key) {
                    $data[$period][$key][$metric] = count($data[$metric][$key] ?? []);
                }
            }
            unset($data[$metric]);
        }
        return $data;
    } finally {
        fclose($lock);
    }
}
