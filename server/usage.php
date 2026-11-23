<?php
declare(strict_types=1);

const USAGE_METRICS = ['home', 'planner', 'reads'];

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
        return ['total' => emptyUsageCounts(), 'daily' => []];
    }
    $content = @file_get_contents($file);
    if ($content === false) {
        return null;
    }
    $data = json_decode($content, true);
    if (!is_array($data['total'] ?? null) || !is_array($data['daily'] ?? null)) {
        return null;
    }

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

    $file = $directory . '/lorr-stats.json';
    if (is_file($file) && $database->query('SELECT 1 FROM usage_counts LIMIT 1')->fetchColumn() === false) {
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
                    $insert->execute([$day, $metric, $counts[$metric]]);
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
    $query = $database->prepare('SELECT day, metric, amount FROM usage_counts WHERE day = ? OR day >= ?');
    $query->execute(['total', $cutoff]);
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

function recordFileUsage(string $directory, string $metric): void
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
            }
        }
        $data['daily'][$date] ??= emptyUsageCounts();
        $data['daily'][$date][$metric]++;
        $data['total'][$metric]++;

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

function recordUsage(string $metric): void
{
    if (!in_array($metric, USAGE_METRICS, true)) {
        return;
    }
    $directory = usageDirectory();
    if ($directory === null) {
        return;
    }
    if (hasUsageSqlite()) {
        try {
            $database = openUsageDatabase($directory);
            $update = $database->prepare(
                'INSERT INTO usage_counts (day, metric, amount) VALUES (?, ?, 1), (?, ?, 1)
                    ON CONFLICT (day, metric) DO UPDATE SET amount = amount + 1'
            );
            $update->execute(['total', $metric, usageDay()->format('Y-m-d'), $metric]);
        } catch (RuntimeException) {
            // Usage statistics must not interrupt the requested page.
        }
    } elseif (!is_file($directory . '/lorr-stats.sqlite')) {
        recordFileUsage($directory, $metric);
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
        return flock($lock, LOCK_SH) ? readUsageSnapshot($directory) : null;
    } finally {
        fclose($lock);
    }
}
