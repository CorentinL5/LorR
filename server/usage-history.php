<?php
declare(strict_types=1);

require_once __DIR__ . '/usage.php';

const USAGE_HISTORY_PERIODS = [7, 14, 30];
const USAGE_HISTORY_METRICS = [
    'pages' => 'Pages chargées',
    'home' => 'Accueil',
    'planner' => 'Créateur',
    'reads' => 'Demandes d’horaires',
    'courses' => 'Cours chargés',
    'sessions' => 'Séances chargées',
    'clicks' => 'Détails de cours ouverts',
];

function usageHistoryPeriod(mixed $value): int
{
    foreach (USAGE_HISTORY_PERIODS as $days) {
        if ($value === (string) $days) {
            return $days;
        }
    }
    return 30;
}

function usageHistory(array $usage, DateTimeImmutable $today, int $days): array
{
    $rows = [];
    $current = $previous = array_fill_keys(array_keys(USAGE_HISTORY_METRICS), 0);
    $covered = $previousCovered = 0;
    $peak = null;
    $since = $usage['dailySince'] ?? null;
    for ($offset = $days * 2; $offset >= 1; $offset--) {
        $date = $today->modify('-' . $offset . ' days');
        $key = $date->format('Y-m-d');
        $counts = null;
        if ($since !== null && $key >= $since) {
            $counts = ($usage['daily'][$key] ?? []) + emptyUsageCounts();
            $counts['pages'] = $counts['home'] + $counts['planner'];
        }
        if ($offset > $days) {
            if ($counts !== null) {
                $previousCovered++;
                foreach ($previous as $metric => $value) {
                    $previous[$metric] = $value + $counts[$metric];
                }
            }
            continue;
        }
        $rows[] = ['date' => $date, 'counts' => $counts];
        if ($counts === null) {
            continue;
        }
        $covered++;
        foreach ($current as $metric => $value) {
            $current[$metric] = $value + $counts[$metric];
        }
        if ($counts['pages'] > ($peak['count'] ?? 0)) {
            $peak = ['date' => $date, 'count' => $counts['pages']];
        }
    }
    return [
        'rows' => $rows,
        'current' => $current,
        'previous' => $previous,
        'covered' => $covered,
        'comparable' => $previousCovered === $days && $covered === $days,
        'peak' => $peak,
    ];
}

function serveUsageHistory(): void
{
    header('Cache-Control: no-store');
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        header('Allow: GET, HEAD');
        http_response_code(405);
        return;
    }
    $usage = siteUsage();
    if ($usage === null) {
        header('Content-Type: text/plain; charset=UTF-8');
        http_response_code(503);
        if ($method === 'GET') {
            echo 'Les statistiques sont momentanément indisponibles.';
        }
        return;
    }
    $days = usageHistoryPeriod($_GET['jours'] ?? null);
    $today = usageDay();
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="lorr-statistiques-' . $days . 'j-' . $today->format('Y-m-d') . '.csv"');
    if ($method === 'HEAD') {
        return;
    }
    $stream = fopen('php://output', 'wb');
    fwrite($stream, "\xEF\xBB\xBF");
    fputcsv($stream, ['Date (Europe/Brussels)', ...array_values(USAGE_HISTORY_METRICS)], ';', '"', '');
    foreach (usageHistory($usage, $today, $days)['rows'] as ['date' => $date, 'counts' => $counts]) {
        $row = [$date->format('Y-m-d')];
        foreach (USAGE_HISTORY_METRICS as $metric => $label) {
            $row[] = $counts[$metric] ?? '';
        }
        fputcsv($stream, $row, ';', '"', '');
    }
    fclose($stream);
}
