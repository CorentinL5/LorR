<?php
declare(strict_types=1);

const LORR_SQLITE_FILENAME = 'lorr-stats.sqlite';

function localStorageDirectory(): ?string
{
    $directory = getenv('LORR_STATS_DIR') ?: dirname(__DIR__) . '/var';
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        return null;
    }

    return $directory;
}

function hasLocalSqlite(): bool
{
    return class_exists(PDO::class) && in_array('sqlite', PDO::getAvailableDrivers(), true);
}

function openLocalDatabase(string $directory): PDO
{
    $database = new PDO('sqlite:' . $directory . '/' . LORR_SQLITE_FILENAME);
    $database->exec('PRAGMA busy_timeout = 2000');
    return $database;
}
