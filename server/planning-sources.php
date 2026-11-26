<?php
declare(strict_types=1);

const HEH_PLANNING_HOST_PATTERN = 'hehplanning[0-9]{4}\.umons\.ac\.be';
const MAX_FORMATIONS_PER_SOURCE = 100;
const MAX_PLANNING_REQUEST_BYTES = 32768;
const HEH_CURRENT_PLANNING_HOST = 'hehplanning2026.umons.ac.be';
const PLANNING_GUEST_URLS = [
    'hpl.hech.be' => 'http://hpl.hech.be:62080/hp/invite',
    'ihecs-prod.pronote-campus.net' => 'https://ihecs-prod.pronote-campus.net/hp/invite',
    'heaj-2627.pronote-campus.net' => 'https://heaj-2627.pronote-campus.net/hp/invite',
];

function hasPlanningReader(): bool
{
    return hasPhpPlanningReader() || hasBrowserPlanningReader();
}

function hasPhpPlanningReader(): bool
{
    return function_exists('curl_init') && function_exists('openssl_encrypt')
        && is_file(__DIR__ . '/guest-planning.php');
}

function hasBrowserPlanningReader(): bool
{
    return function_exists('proc_open') && is_file(__DIR__ . '/read.cjs');
}

function validPlanningFormation(mixed $formation): bool
{
    return is_string($formation) && trim($formation) !== '' && strlen($formation) <= 300
        && !preg_match('/[\x00-\x1f\x7f]/', $formation);
}

function extraPlanningHosts(): array
{
    $hosts = preg_split('/\s*,\s*/', strtolower(trim(getenv('LORR_PLANNING_HOSTS') ?: '')), -1, PREG_SPLIT_NO_EMPTY);
    return array_values(array_filter($hosts, static fn (string $host): bool =>
        preg_match('/\A[a-z0-9.-]+\z/', $host) === 1
    ));
}

function planningUrlForHost(mixed $host): ?string
{
    if (!is_string($host)) {
        return null;
    }
    if (isset(PLANNING_GUEST_URLS[$host])) {
        return PLANNING_GUEST_URLS[$host];
    }
    if (!preg_match('/\A' . HEH_PLANNING_HOST_PATTERN . '\z/', $host) && !in_array($host, extraPlanningHosts(), true)) {
        return null;
    }

    return 'https://' . $host . '/invite';
}

function planningSource(string $url): ?string
{
    if (!preg_match('~\A(https?://([a-z0-9.-]+)(?::[0-9]+)?(?:/hp)?/invite)/?(?:[?#][^\x00-\x20\x7f]*)?\z~i', trim($url, " \t\r\n"), $match)) {
        return null;
    }
    $canonical = planningUrlForHost(strtolower($match[2]));
    return $canonical === strtolower($match[1]) ? $canonical : null;
}
