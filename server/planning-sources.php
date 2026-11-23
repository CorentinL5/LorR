<?php
declare(strict_types=1);

const HEH_PLANNING_HOST_PATTERN = 'hehplanning[0-9]{4}\.umons\.ac\.be';
const MAX_FORMATIONS_PER_SOURCE = 100;
const MAX_PLANNING_REQUEST_BYTES = 32768;

function extraPlanningHosts(): array
{
    $hosts = preg_split('/\s*,\s*/', strtolower(trim(getenv('LORR_PLANNING_HOSTS') ?: '')), -1, PREG_SPLIT_NO_EMPTY);
    return array_values(array_filter($hosts, static fn (string $host): bool =>
        preg_match('/\A[a-z0-9.-]+\z/', $host) === 1
    ));
}

function planningSource(string $url): ?string
{
    if (!preg_match('~\Ahttps://([a-z0-9.-]+)/invite/?(?:[?#][^\x00-\x20\x7f]*)?\z~i', trim($url, " \t\r\n"), $match)) {
        return null;
    }

    $host = strtolower($match[1]);
    if (!preg_match('/\A' . HEH_PLANNING_HOST_PATTERN . '\z/', $host) && !in_array($host, extraPlanningHosts(), true)) {
        return null;
    }

    return 'https://' . $host . '/invite';
}
