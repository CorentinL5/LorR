<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

const USAGE_METRICS = ['home', 'planner', 'reads', 'courses', 'sessions', 'clicks'];
const USAGE_DISTINCT_TABLES = ['sources' => 'usage_sources', 'distinct_courses' => 'usage_courses'];

function usageDay(): DateTimeImmutable
{
    return new DateTimeImmutable('today', new DateTimeZone('Europe/Brussels'));
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
        return ['total' => emptyUsageCounts(), 'daily' => []] + $emptySets;
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
    return $data + $emptySets;
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
            foreach (['total' => $snapshot['total']] + $snapshot['daily'] as $day => $counts) {
                foreach (USAGE_METRICS as $metric) {
                    $insert->execute([$day, $metric, $counts[$metric] ?? 0]);
                }
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
    $cutoff = usageDay()->modify('-6 days')->format('Y-m-d');
    $period = "day = 'total' OR day >= :cutoff";
    $queries = ["SELECT day, metric, amount FROM usage_counts WHERE $period"];
    foreach (USAGE_DISTINCT_TABLES as $metric => $table) {
        $queries[] = "SELECT day, '$metric', COUNT(*) FROM $table WHERE $period GROUP BY day";
    }
    $query = $database->prepare(implode(' UNION ALL ', $queries));
    $query->execute(['cutoff' => $cutoff]);
    $data = ['total' => emptyUsageCounts(), 'daily' => []];
    foreach ($query as $row) {
        $day = $row['day'];
        $metric = $row['metric'];
        if ($day === 'total') {
            $data['total'][$metric] = (int) $row['amount'];
        } else {
            $data['daily'][$day] ??= emptyUsageCounts();
            $data['daily'][$day][$metric] = (int) $row['amount'];
        }
    }
    return $data;
}

function recordDatabaseUsage(PDO $database, array $counts, array $distinct): void
{
    $today = usageDay();
    $date = $today->format('Y-m-d');
    $database->beginTransaction();
    try {
        if ($counts) {
            $update = $database->prepare(
                'INSERT INTO usage_counts (day, metric, amount) VALUES (?, ?, ?), (?, ?, ?)
                    ON CONFLICT (day, metric) DO UPDATE SET amount = amount + excluded.amount'
            );
            foreach ($counts as $metric => $amount) {
                $update->execute(['total', $metric, $amount, $date, $metric, $amount]);
            }
        }
        foreach ($distinct as $metric => $fingerprints) {
            if (!$fingerprints) {
                continue;
            }
            $table = USAGE_DISTINCT_TABLES[$metric];
            $insert = $database->prepare("INSERT OR IGNORE INTO $table (day, fingerprint) VALUES (?, ?), (?, ?)");
            foreach ($fingerprints as $fingerprint) {
                $insert->execute(['total', $fingerprint, $date, $fingerprint]);
            }
            $prune = $database->prepare("DELETE FROM $table WHERE day < ?");
            $prune->execute([$today->modify('-6 days')->format('Y-m-d')]);
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

        $today = usageDay();
        $date = $today->format('Y-m-d');
        $cutoff = $today->modify('-6 days')->format('Y-m-d');
        foreach (array_keys($data['daily']) as $day) {
            if ($day < $cutoff) {
                unset($data['daily'][$day]);
                foreach (array_keys(USAGE_DISTINCT_TABLES) as $metric) {
                    unset($data[$metric][$day]);
                }
            }
        }
        $data['daily'][$date] = ($data['daily'][$date] ?? []) + emptyUsageCounts();
        foreach ($counts as $metric => $amount) {
            $data['daily'][$date][$metric] += $amount;
            $data['total'][$metric] += $amount;
        }
        foreach ($distinct as $metric => $fingerprints) {
            foreach ($fingerprints as $fingerprint) {
                $data[$metric]['total'][$fingerprint] = true;
                $data[$metric][$date][$fingerprint] = true;
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
            foreach (array_keys($data['daily']) as $day) {
                $data['daily'][$day][$metric] = count($data[$metric][$day] ?? []);
            }
            unset($data[$metric]);
        }
        return $data;
    } finally {
        fclose($lock);
    }
}
