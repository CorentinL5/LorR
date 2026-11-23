<?php
declare(strict_types=1);

const USAGE_METRICS = ['home', 'planner', 'reads', 'courses', 'clicks'];

function usageDay(): DateTimeImmutable
{
    return new DateTimeImmutable('today', new DateTimeZone('Europe/Brussels'));
}

function emptyUsageCounts(): array
{
    return array_fill_keys(USAGE_METRICS, 0);
}

function usageDirectory(): ?string
{
    $directory = getenv('LORR_STATS_DIR') ?: dirname(__DIR__) . '/var';
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        return null;
    }

    return $directory;
}

function readUsageSnapshot(string $directory): ?array
{
    $file = $directory . '/lorr-stats.json';
    if (!is_file($file)) {
        return ['total' => emptyUsageCounts(), 'daily' => [], 'sources' => []];
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
    $data['sources'] ??= [];
    return $data;
}

function hasUsageSqlite(): bool
{
    return class_exists(PDO::class) && in_array('sqlite', PDO::getAvailableDrivers(), true);
}

function openUsageDatabase(string $directory): PDO
{
    $database = new PDO('sqlite:' . $directory . '/lorr-stats.sqlite');
    $database->exec('PRAGMA busy_timeout = 2000');
    $database->exec(
        'CREATE TABLE IF NOT EXISTS usage_counts (
            day TEXT NOT NULL,
            metric TEXT NOT NULL,
            amount INTEGER NOT NULL CHECK (amount >= 0),
            PRIMARY KEY (day, metric)
        ) WITHOUT ROWID'
    );
    $database->exec(
        'CREATE TABLE IF NOT EXISTS usage_sources (
            day TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            PRIMARY KEY (day, fingerprint)
        ) WITHOUT ROWID'
    );

    $file = $directory . '/lorr-stats.json';
    if (is_file($file) && $database->query(
        'SELECT 1 FROM usage_counts UNION ALL SELECT 1 FROM usage_sources LIMIT 1'
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
            $insertSource = $database->prepare('INSERT OR IGNORE INTO usage_sources (day, fingerprint) VALUES (?, ?)');
            foreach ($snapshot['sources'] as $day => $sources) {
                foreach (array_keys($sources) as $source) {
                    $insertSource->execute([$day, $source]);
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
    $query = $database->prepare(
        "SELECT day, metric, amount FROM usage_counts WHERE day = 'total' OR day >= :cutoff
        UNION ALL
        SELECT day, 'sources', COUNT(*) FROM usage_sources WHERE day = 'total' OR day >= :cutoff GROUP BY day"
    );
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

function recordDatabaseUsage(PDO $database, array $counts, ?string $source): void
{
    $date = usageDay()->format('Y-m-d');
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
        if ($source !== null) {
            $insert = $database->prepare('INSERT OR IGNORE INTO usage_sources (day, fingerprint) VALUES (?, ?), (?, ?)');
            $insert->execute(['total', $source, $date, $source]);
        }
        $database->commit();
    } catch (RuntimeException $error) {
        $database->rollBack();
        throw $error;
    }
}

function recordFileUsage(string $directory, array $counts, ?string $source): void
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
                unset($data['daily'][$day], $data['sources'][$day]);
            }
        }
        $data['daily'][$date] = ($data['daily'][$date] ?? []) + emptyUsageCounts();
        foreach ($counts as $metric => $amount) {
            $data['daily'][$date][$metric] += $amount;
            $data['total'][$metric] += $amount;
        }
        if ($source !== null) {
            $data['sources']['total'][$source] = true;
            $data['sources'][$date][$source] = true;
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

function recordUsage(array $counts, ?string $sourceUrl = null): void
{
    $directory = usageDirectory();
    if ($directory === null) {
        return;
    }
    $source = $sourceUrl === null ? null : hash('sha256', $sourceUrl);
    if (hasUsageSqlite()) {
        try {
            recordDatabaseUsage(openUsageDatabase($directory), $counts, $source);
        } catch (RuntimeException) {
            // Usage statistics must not interrupt the requested page.
        }
    } elseif (!is_file($directory . '/lorr-stats.sqlite')) {
        recordFileUsage($directory, $counts, $source);
    }
}

function siteUsage(): ?array
{
    $directory = usageDirectory();
    if ($directory === null) {
        return null;
    }
    if (hasUsageSqlite()) {
        try {
            return readUsageDatabase(openUsageDatabase($directory));
        } catch (RuntimeException) {
            return null;
        }
    }
    if (is_file($directory . '/lorr-stats.sqlite')) {
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
        $data['total']['sources'] = count($data['sources']['total'] ?? []);
        foreach (array_keys($data['daily']) as $day) {
            $data['daily'][$day]['sources'] = count($data['sources'][$day] ?? []);
        }
        unset($data['sources']);
        return $data;
    } finally {
        fclose($lock);
    }
}
