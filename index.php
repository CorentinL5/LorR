<?php
declare(strict_types=1);

$request = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($request, PHP_URL_PATH);
$local = PHP_SAPI === 'cli-server';
$base = $local ? '' : rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/');

$route = null;
if (is_string($path)) {
    if ($base !== '' && $path === $base) {
        $route = '/index.php';
    } elseif (str_starts_with($path, $base . '/')) {
        $route = substr($path, strlen($base));
    }
}

if ($local && $route
    && preg_match('~^/(?:assets/[\w-]+\.(?:ico|svg|webp)|scripts/[\w-]+\.js|styles/[\w-]+\.css)$~D', $route)
    && is_file(__DIR__ . $route)
) {
    return false;
}

$redirects = [
    '/index.html' => '/',
    '/index.php' => '/',
    '/planning.html' => '/planning',
    '/planning.php' => '/planning',
    '/planning/' => '/planning',
    '/stats/' => '/stats',
    '/api-planning.php' => '/api/planning',
    '/api/planning/' => '/api/planning',
];

if (isset($redirects[$route])) {
    $query = parse_url($request, PHP_URL_QUERY);
    $location = $base . $redirects[$route] . (is_string($query) ? '?' . $query : '');
    header('Location: ' . $location, true, 308);
    exit;
}

switch ($route) {
    case '/':
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
            require __DIR__ . '/server/usage.php';
            recordUsage(['home' => 1]);
        }
        require __DIR__ . '/views/home.php';
        break;
    case '/planning':
        require __DIR__ . '/server/planning-sources.php';
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
            require __DIR__ . '/server/usage.php';
            recordUsage(['planner' => 1]);
        }
        require __DIR__ . '/views/planning.php';
        break;
    case '/stats':
        header('Cache-Control: no-store');
        require __DIR__ . '/server/usage.php';
        $usage = siteUsage();
        require __DIR__ . '/views/stats.php';
        break;
    case '/api/planning':
        require __DIR__ . '/api-planning.php';
        break;
    case '/api/stats/course-clicks':
        require __DIR__ . '/server/course-clicks.php';
        break;
    default:
        http_response_code(404);
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'Page introuvable.';
}
