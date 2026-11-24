<?php
declare(strict_types=1);

const LORR_PUBLIC_PAGES = ['/', '/planning', '/stats', '/soutenir'];

function publicSiteUrl(string $base): string
{
    $configured = rtrim(trim(getenv('LORR_PUBLIC_URL') ?: ''), '/');
    if (filter_var($configured, FILTER_VALIDATE_URL)) {
        $parts = parse_url($configured);
        if (in_array($parts['scheme'], ['http', 'https'], true)
            && !isset($parts['user']) && !isset($parts['pass'])
            && !isset($parts['query']) && !isset($parts['fragment'])) {
            return $configured;
        }
    }

    $host = strtolower($_SERVER['HTTP_HOST'] ?? '');
    if ($host === 'lorr.corentinl5.be') {
        return 'https://lorr.corentinl5.be' . $base;
    }
    if (!preg_match('/\A(?:[a-z0-9.-]+|\[[0-9a-f:]+\])(?::[0-9]{1,5})?\z/i', $host)) {
        return '';
    }
    $scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
    return $scheme . '://' . $host . $base;
}
