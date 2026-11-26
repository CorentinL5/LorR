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
    '/enseignant/' => '/enseignant',
    '/mes-donnees/' => '/mes-donnees',
    '/stats/' => '/stats',
    '/statsohshit' => '/stats#hyperplanning',
    '/statsohshit/' => '/stats#hyperplanning',
    '/soutenir/' => '/soutenir',
    '/api-planning.php' => '/api/planning',
    '/api/planning/' => '/api/planning',
];

if (isset($redirects[$route])) {
    $query = parse_url($request, PHP_URL_QUERY);
    [$destination, $fragment] = array_pad(explode('#', $redirects[$route], 2), 2, null);
    $location = $base . $destination . (is_string($query) ? '?' . $query : '')
        . ($fragment !== null ? '#' . $fragment : '');
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
    case '/mes-donnees':
        require __DIR__ . '/server/planning-sources.php';
        require __DIR__ . '/views/planning-personal.php';
        break;
    case '/enseignant':
        header('Cache-Control: no-store');
        if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD', 'POST'], true)) {
            header('Allow: GET, HEAD, POST');
            http_response_code(405);
            break;
        }
        require __DIR__ . '/server/teacher-planning.php';
        require __DIR__ . '/views/teacher-planning.php';
        break;
    case '/stats':
        header('Cache-Control: no-store');
        require __DIR__ . '/server/usage.php';
        require __DIR__ . '/server/planning-traffic.php';
        $usage = siteUsage();
        $planningTraffic = planningTraffic();
        $planningActivity = planningStatsSnapshot('planning-activity');
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
    case '/api/planning/push':
        require __DIR__ . '/server/planning-push.php';
        servePlanningPush();
        break;
    case '/api/stats/course-clicks':
        require __DIR__ . '/server/course-clicks.php';
        break;
    case '/api/stats/calendar-export':
        header('Cache-Control: no-store');
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            header('Allow: POST');
            http_response_code(405);
            break;
        }
        if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0])) !== 'application/json') {
            http_response_code(415);
            break;
        }
        require __DIR__ . '/server/planning-traffic.php';
        recordPlanningActivity(['icsExports' => 1]);
        http_response_code(204);
        break;
    case '/api/stats/live':
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true)) {
            header('Allow: GET, HEAD');
            http_response_code(405);
            break;
        }
        require __DIR__ . '/server/usage.php';
        $live = readLiveUsage();
        if ($live === null) {
            http_response_code(503);
        }
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            echo json_encode($live, JSON_THROW_ON_ERROR);
        }
        break;
    case '/api/stats/historique.csv':
        require __DIR__ . '/server/usage-history.php';
        serveUsageHistory();
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
