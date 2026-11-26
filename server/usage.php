<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

const USAGE_METRICS = ['home', 'planner', 'reads', 'courses', 'sessions', 'clicks'];
const USAGE_DISTINCT_TABLES = ['sources' => 'usage_sources', 'distinct_courses' => 'usage_courses'];
const USAGE_QUARTER_SECONDS = 900;
const USAGE_QUARTER_WINDOW = 144;
const USAGE_DAILY_WINDOW = 60;

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

function usageQuarterStart(int $timestamp): int
{
    return intdiv($timestamp, USAGE_QUARTER_SECONDS) * USAGE_QUARTER_SECONDS;
}

function usageFirstQuarter(int $timestamp): int
{
    return usageQuarterStart($timestamp) - (USAGE_QUARTER_WINDOW - 1) * USAGE_QUARTER_SECONDS;
}

function usageQuarterKey(int $timestamp): string
{
    return 'quarter:' . gmdate('Y-m-d\TH:i\Z', $timestamp);
}

function emptyUsageCounts(): array
{
    return array_fill_keys(USAGE_METRICS, 0);
}

function readUsageSnapshot(string $directory): ?array
{
    $file = $directory . '/lorr-stats.json';
    $emptySets = array_fill_keys(array_keys(USAGE_DISTINCT_TABLES), []);
    $emptyPeriods = ['hourly' => [], 'quarters' => []];
    if (!is_file($file)) {
        return ['total' => emptyUsageCounts(), 'daily' => []] + $emptyPeriods + $emptySets;
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
    return $data + $emptyPeriods + $emptySets;
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
            $countsByPeriod = ['total' => $snapshot['total']] + $snapshot['daily'] + $snapshot['hourly'] + $snapshot['quarters'];
            foreach ($countsByPeriod as $day => $counts) {
                foreach (USAGE_METRICS as $metric) {
                    $insert->execute([$day, $metric, $counts[$metric] ?? 0]);
                }
            }
            if (isset($snapshot['hourlySince'])) {
                $insert->execute(['hourly-start', 'timestamp', $snapshot['hourlySince']]);
            }
            if (isset($snapshot['quartersSince'])) {
                $insert->execute(['quarters-start', 'timestamp', $snapshot['quartersSince']]);
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
    $timestamp = $now->getTimestamp();
    $period = "day IN ('total', 'hourly-start', 'quarters-start') OR day BETWEEN :cutoff AND :today
        OR day BETWEEN :firstHour AND :lastHour OR day BETWEEN :firstQuarter AND :lastQuarter";
    $queries = ["SELECT day, metric, amount FROM usage_counts WHERE $period OR day BETWEEN :firstDay AND :today"];
    foreach (USAGE_DISTINCT_TABLES as $metric => $table) {
        $queries[] = "SELECT day, '$metric', COUNT(*) FROM $table WHERE $period GROUP BY day";
    }
    $query = $database->prepare(implode(' UNION ALL ', $queries));
    $query->execute([
        'cutoff' => $cutoff->format('Y-m-d'),
        'firstDay' => usageDay($now)->modify('-' . USAGE_DAILY_WINDOW . ' days')->format('Y-m-d'),
        'today' => $now->format('Y-m-d'),
        'firstHour' => usageHourKey($cutoff->getTimestamp()),
        'lastHour' => usageHourKey($timestamp),
        'firstQuarter' => usageQuarterKey(usageFirstQuarter($timestamp)),
        'lastQuarter' => usageQuarterKey(usageQuarterStart($timestamp)),
    ]);
    $data = ['total' => emptyUsageCounts(), 'daily' => [], 'hourly' => [], 'quarters' => []];
    foreach ($query as $row) {
        $day = $row['day'];
        $metric = $row['metric'];
        if ($day === 'total') {
            $data['total'][$metric] = (int) $row['amount'];
        } elseif ($day === 'hourly-start') {
            $data['hourlySince'] = (int) $row['amount'];
        } elseif ($day === 'quarters-start') {
            $data['quartersSince'] = (int) $row['amount'];
        } else {
            $period = match (true) {
                str_starts_with($day, 'hour:') => 'hourly',
                str_starts_with($day, 'quarter:') => 'quarters',
                default => 'daily',
            };
            $data[$period][$day] ??= emptyUsageCounts();
            $data[$period][$day][$metric] = (int) $row['amount'];
        }
    }
    $first = $database->query("SELECT MIN(day) FROM usage_counts WHERE day BETWEEN '0000-01-01' AND '9999-12-31'")->fetchColumn();
    $data['dailySince'] = is_string($first) ? $first : null;
    return $data;
}

function recordDatabaseUsage(PDO $database, array $counts, array $distinct): void
{
    $now = usageNow();
    $date = $now->format('Y-m-d');
    $timestamp = $now->getTimestamp();
    $hour = intdiv($timestamp, 3600) * 3600;
    $quarter = usageQuarterStart($timestamp);
    $hourKey = usageHourKey($hour);
    $quarterKey = usageQuarterKey($quarter);
    $cutoff = usageDay($now)->modify('-6 days');
    $firstHour = usageHourKey($cutoff->getTimestamp());
    $firstQuarter = usageQuarterKey(usageFirstQuarter($timestamp));
    $expiredBuckets = "(day >= 'hour:' AND day < ?) OR (day >= 'quarter:' AND day < ?)";
    $database->beginTransaction();
    try {
        $start = $database->prepare(
            "INSERT INTO usage_counts VALUES ('hourly-start', 'timestamp', ?), ('quarters-start', 'timestamp', ?)
                ON CONFLICT (day, metric) DO UPDATE SET amount = MIN(amount, excluded.amount)"
        );
        $start->execute([$hour, $quarter]);
        if ($counts) {
            $update = $database->prepare(
                'INSERT INTO usage_counts (day, metric, amount) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)
                    ON CONFLICT (day, metric) DO UPDATE SET amount = amount + excluded.amount'
            );
            foreach ($counts as $metric => $amount) {
                $update->execute(['total', $metric, $amount, $date, $metric, $amount, $hourKey, $metric, $amount, $quarterKey, $metric, $amount]);
            }
        }
        $database->prepare("DELETE FROM usage_counts WHERE $expiredBuckets")->execute([$firstHour, $firstQuarter]);
        foreach ($distinct as $metric => $fingerprints) {
            if (!$fingerprints) {
                continue;
            }
            $table = USAGE_DISTINCT_TABLES[$metric];
            $insert = $database->prepare("INSERT OR IGNORE INTO $table (day, fingerprint) VALUES (?, ?), (?, ?), (?, ?), (?, ?)");
            foreach ($fingerprints as $fingerprint) {
                $insert->execute(['total', $fingerprint, $date, $fingerprint, $hourKey, $fingerprint, $quarterKey, $fingerprint]);
            }
            $prune = $database->prepare("DELETE FROM $table WHERE day < ? OR $expiredBuckets");
            $prune->execute([$cutoff->format('Y-m-d'), $firstHour, $firstQuarter]);
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
        $timestamp = $now->getTimestamp();
        $hour = intdiv($timestamp, 3600) * 3600;
        $quarter = usageQuarterStart($timestamp);
        $periodKeys = ['daily' => $date, 'hourly' => usageHourKey($hour), 'quarters' => usageQuarterKey($quarter)];
        $cutoff = usageDay($now)->modify('-6 days');
        $data['hourlySince'] ??= $hour;
        $data['quartersSince'] ??= $quarter;
        $data['dailySince'] ??= $data['daily'] ? min(array_keys($data['daily'])) : $date;
        $earliest = [
            'daily' => usageDay($now)->modify('-' . USAGE_DAILY_WINDOW . ' days')->format('Y-m-d'),
            'hourly' => usageHourKey($cutoff->getTimestamp()),
            'quarters' => usageQuarterKey(usageFirstQuarter($timestamp)),
        ];
        foreach ($earliest as $period => $first) {
            foreach (array_keys($data[$period]) as $key) {
                if ($key < $first) {
                    unset($data[$period][$key]);
                    foreach (array_keys(USAGE_DISTINCT_TABLES) as $metric) {
                        unset($data[$metric][$key]);
                    }
                }
            }
        }
        foreach ($periodKeys as $period => $key) {
            $data[$period][$key] = ($data[$period][$key] ?? []) + emptyUsageCounts();
            foreach ($counts as $metric => $amount) {
                $data[$period][$key][$metric] += $amount;
            }
        }
        foreach ($counts as $metric => $amount) {
            $data['total'][$metric] += $amount;
        }
        foreach ($distinct as $metric => $fingerprints) {
            foreach ($fingerprints as $fingerprint) {
                $data[$metric]['total'][$fingerprint] = true;
                foreach ($periodKeys as $key) {
                    $data[$metric][$key][$fingerprint] = true;
                }
            }
        }
        foreach (array_keys(USAGE_DISTINCT_TABLES) as $metric) {
            foreach (array_keys($data[$metric]) as $key) {
                if ($key < $cutoff->format('Y-m-d')) {
                    unset($data[$metric][$key]);
                }
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
        $data['dailySince'] ??= $data['daily'] ? min(array_keys($data['daily'])) : null;
        foreach (array_keys(USAGE_DISTINCT_TABLES) as $metric) {
            $data['total'][$metric] = count($data[$metric]['total'] ?? []);
            foreach (['daily', 'hourly', 'quarters'] as $period) {
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

function liveUsageSnapshot(array $usage, DateTimeImmutable $now): array
{
    $date = $now->format('Y-m-d');
    $current = usageQuarterStart($now->getTimestamp());
    $quarters = [];
    for ($offset = 7; $offset >= 0; $offset--) {
        $timestamp = $current - $offset * USAGE_QUARTER_SECONDS;
        $counts = ($usage['quartersSince'] ?? PHP_INT_MAX) <= $timestamp
            ? ($usage['quarters'][usageQuarterKey($timestamp)] ?? []) : null;
        $quarters[] = ['start' => $timestamp, 'counts' => $counts];
    }
    return [
        'updatedAt' => $now->getTimestamp(),
        'today' => array_intersect_key($usage['daily'][$date] ?? [], emptyUsageCounts()),
        'quarters' => $quarters,
    ];
}

function readLiveUsage(): ?array
{
    $now = usageNow();
    $directory = localStorageDirectory();
    if ($directory === null) {
        return null;
    }
    if (!hasLocalSqlite()) {
        $snapshot = siteUsage();
        return $snapshot === null ? null : liveUsageSnapshot($snapshot, $now);
    }

    try {
        $database = openUsageDatabase($directory);
        $current = usageQuarterStart($now->getTimestamp());
        $today = $now->format('Y-m-d');
        $query = $database->prepare(
            "SELECT day, metric, amount FROM usage_counts
             WHERE day IN (:today, 'quarters-start') OR day BETWEEN :first AND :last"
        );
        $query->execute([
            'today' => $today,
            'first' => usageQuarterKey($current - 7 * USAGE_QUARTER_SECONDS),
            'last' => usageQuarterKey($current),
        ]);
        $usage = ['daily' => [], 'quarters' => []];
        foreach ($query as ['day' => $period, 'metric' => $metric, 'amount' => $amount]) {
            if ($period === 'quarters-start') {
                $usage['quartersSince'] = (int) $amount;
            } elseif ($period === $today) {
                $usage['daily'][$today][$metric] = (int) $amount;
            } else {
                $usage['quarters'][$period][$metric] = (int) $amount;
            }
        }
        return liveUsageSnapshot($usage, $now);
    } catch (RuntimeException) {
        return null;
    }
}
