<?php
declare(strict_types=1);

require __DIR__ . '/server/site-url.php';

$request = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($request, PHP_URL_PATH);
$local = PHP_SAPI === 'cli-server';
$atRoot = $local || strtolower($_SERVER['HTTP_HOST'] ?? '') === LORR_PRODUCTION_HOST;
$base = $atRoot ? '' : rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/');

$route = null;
$rewrittenRoute = $_SERVER['REDIRECT_LORR_ROUTE'] ?? $_SERVER['LORR_ROUTE'] ?? null;
if (!$local && is_string($rewrittenRoute) && str_starts_with($rewrittenRoute, '/')) {
    $route = $rewrittenRoute;
} elseif (is_string($path)) {
    if ($base !== '' && $path === $base) {
        $route = '/index.php';
    } elseif (str_starts_with($path, $base . '/')) {
        $route = substr($path, strlen($base));
    }
}

if ($local && $route
    && preg_match('~^/(?:sw\.js|assets/[\w-]+\.(?:gif|ico|png|svg|webp)|scripts/[\w-]+\.js|styles/[\w-]+\.css)$~D', $route)
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
    '/soutenir/' => '/soutenir',
    '/api-planning.php' => '/api/planning',
    '/api/planning/' => '/api/planning',
];

if (isset($redirects[$route])) {
    $query = parse_url($request, PHP_URL_QUERY);
    $location = $base . $redirects[$route] . (is_string($query) ? '?' . $query : '');
    header('Location: ' . $location, true, 308);
    exit;
}

if (in_array($route, ['/idees', '/idees/'], true)
    && in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true)
) {
    header('Location: ' . $base . '/soutenir', true, 302);
    exit;
}

if ($route !== null && str_starts_with($route, '/p/')) {
    require __DIR__ . '/server/planning-links.php';
    if (preg_match('~\A/p/([A-Za-z0-9_-]{' . PLANNING_LINK_ID_LENGTH . '})/planning\.ics\z~', $route, $match)) {
        require __DIR__ . '/server/planning-calendar.php';
        servePlanningCalendar($match[1]);
        exit;
    }
    if (openPlanningLink($base, $route)) {
        exit;
    }
}

$countPageView = ($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && ($_SERVER['HTTP_X_LORR_APP_CACHE'] ?? '') !== '1';
switch ($route) {
    case '/':
        if ($countPageView) {
            require __DIR__ . '/server/usage.php';
            recordUsage(['home' => 1]);
        }
        require __DIR__ . '/views/home.php';
        break;
    case '/planning':
        require __DIR__ . '/server/planning-sources.php';
        if ($countPageView) {
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
    case '/soutenir':
        require __DIR__ . '/views/soutenir.php';
        break;
    case '/robots.txt':
        header('Content-Type: text/plain; charset=UTF-8');
        echo "User-agent: *\nDisallow: {$base}/api/\n";
        $publicUrl = publicSiteUrl($base);
        if ($publicUrl !== '') {
            echo 'Sitemap: ' . $publicUrl . "/sitemap.xml\n";
        }
        break;
    case '/sitemap.xml':
        header('Content-Type: application/xml; charset=UTF-8');
        $publicUrl = publicSiteUrl($base);
        echo "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
        echo "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
        if ($publicUrl !== '') {
            foreach (LORR_PUBLIC_PAGES as $page) {
                echo '  <url><loc>' . htmlspecialchars($publicUrl . $page, ENT_XML1, 'UTF-8') . "</loc></url>\n";
            }
        }
        echo "</urlset>\n";
        break;
    case '/manifest.webmanifest':
        header('Content-Type: application/manifest+json; charset=UTF-8');
        header('Cache-Control: no-cache');
        readfile(__DIR__ . '/manifest.webmanifest');
        break;
    case '/api/planning':
        require __DIR__ . '/api-planning.php';
        break;
    case '/api/planning/links':
        require __DIR__ . '/server/planning-links.php';
        createPlanningLink();
        break;
    case '/api/stats/course-clicks':
        require __DIR__ . '/server/course-clicks.php';
        break;
    case '/api/stats/github':
        require __DIR__ . '/server/github-stats.php';
        break;
    default:
        http_response_code(404);
        header('Cache-Control: no-store');
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'Page introuvable.';
}
