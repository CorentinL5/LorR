<?php
declare(strict_types=1);

require_once __DIR__ . '/planning-links.php';
require_once __DIR__ . '/planning-calendar.php';

function planningPushConfig(): ?array
{
    if (!hasLocalSqlite() || !hasPhpPlanningReader() || !is_file(dirname(__DIR__) . '/vendor/autoload.php')) {
        return null;
    }
    $public = getenv('LORR_PUSH_PUBLIC_KEY');
    $private = getenv('LORR_PUSH_PRIVATE_KEY');
    $subject = getenv('LORR_PUSH_SUBJECT');
    if ($public === false && $private === false && $subject === false) {
        $directory = localStorageDirectory();
        $path = $directory === null ? null : $directory . '/planning-push.json';
        $stored = $path !== null && is_file($path) ? @file_get_contents($path) : false;
        $keys = $stored === false ? null : json_decode($stored, true);
        $public = $keys['publicKey'] ?? null;
        $private = $keys['privateKey'] ?? null;
        $subject = $keys['subject'] ?? null;
    }
    $validSubject = is_string($subject) && (
        (str_starts_with($subject, 'mailto:') && filter_var(substr($subject, 7), FILTER_VALIDATE_EMAIL))
        || (str_starts_with($subject, 'https://') && filter_var($subject, FILTER_VALIDATE_URL))
    );
    if (!is_string($public) || !preg_match('/\AB[A-Za-z0-9_-]{86}\z/', $public)
        || !is_string($private) || !preg_match('/\A[A-Za-z0-9_-]{43}\z/', $private)
        || !$validSubject) {
        return null;
    }
    return ['publicKey' => $public, 'privateKey' => $private, 'subject' => $subject];
}

function openPlanningPushDatabase(): PDO
{
    $directory = localStorageDirectory();
    if ($directory === null || !hasLocalSqlite()) {
        throw new RuntimeException('Le stockage des alertes est indisponible.');
    }
    $database = openLocalDatabase($directory);
    $database->exec('PRAGMA foreign_keys = ON');
    $database->exec('CREATE TABLE IF NOT EXISTS planning_push_subscriptions (
        id TEXT PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE, subscription TEXT NOT NULL, code TEXT NOT NULL,
        revision TEXT NOT NULL, snapshot TEXT
    ) WITHOUT ROWID');
    $database->exec('CREATE TABLE IF NOT EXISTS planning_push_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT, subscription_id TEXT NOT NULL,
        payload TEXT NOT NULL, expires INTEGER NOT NULL, next_attempt INTEGER NOT NULL,
        FOREIGN KEY (subscription_id) REFERENCES planning_push_subscriptions(id) ON DELETE CASCADE
    )');
    $database->exec('CREATE INDEX IF NOT EXISTS planning_push_outbox_subscription ON planning_push_outbox (subscription_id)');
    $database->exec('CREATE INDEX IF NOT EXISTS planning_push_outbox_due ON planning_push_outbox (next_attempt)');
    $database->exec('CREATE TABLE IF NOT EXISTS planning_push_tests (
        subscription_id TEXT PRIMARY KEY, sent_at INTEGER NOT NULL,
        FOREIGN KEY (subscription_id) REFERENCES planning_push_subscriptions(id) ON DELETE CASCADE
    ) WITHOUT ROWID');
    $database->exec('CREATE TABLE IF NOT EXISTS planning_push_changes (
        subscription_id TEXT NOT NULL, course TEXT NOT NULL, transition TEXT NOT NULL, date TEXT NOT NULL,
        PRIMARY KEY (subscription_id, course, transition),
        FOREIGN KEY (subscription_id) REFERENCES planning_push_subscriptions(id) ON DELETE CASCADE
    ) WITHOUT ROWID');
    $database->exec('CREATE INDEX IF NOT EXISTS planning_push_changes_date ON planning_push_changes (date)');
    $indexed = $database->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'planning_push_formations'")->fetchColumn();
    if (!$indexed) {
        $database->beginTransaction();
        try {
            $database->exec('CREATE TABLE planning_push_formations (
                source TEXT NOT NULL, formation TEXT NOT NULL, subscription_id TEXT NOT NULL,
                PRIMARY KEY (source, formation, subscription_id),
                FOREIGN KEY (subscription_id) REFERENCES planning_push_subscriptions(id) ON DELETE CASCADE
            ) WITHOUT ROWID');
            $database->exec('CREATE INDEX planning_push_formations_subscription ON planning_push_formations (subscription_id)');
            foreach ($database->query('SELECT id, code FROM planning_push_subscriptions', PDO::FETCH_ASSOC) as $row) {
                $state = decodeSharedPlanningState($row['code']);
                if ($state !== null) {
                    indexPlanningPushChoices($database, $row['id'], planningPushChoices($state));
                }
            }
            $database->commit();
        } catch (Throwable $error) {
            $database->rollBack();
            if (!$database->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'planning_push_formations'")->fetchColumn()) {
                throw $error;
            }
        }
    }
    return $database;
}

function planningPushSender(array $config): Minishlink\WebPush\WebPush
{
    require_once dirname(__DIR__) . '/vendor/autoload.php';
    return new Minishlink\WebPush\WebPush(['VAPID' => $config], [], 5, ['allow_redirects' => false]);
}

function sendPlanningPushTest(PDO $database, array $config, string $id, ?string $testId): int
{
    $lookup = $database->prepare('SELECT subscription FROM planning_push_subscriptions WHERE id = ?');
    $lookup->execute([$id]);
    $stored = $lookup->fetchColumn();
    $lookup->closeCursor();
    if ($stored === false) {
        return 404;
    }
    $reserve = $database->prepare('INSERT INTO planning_push_tests (subscription_id, sent_at) VALUES (?, ?)
        ON CONFLICT(subscription_id) DO UPDATE SET sent_at = excluded.sent_at
        WHERE planning_push_tests.sent_at <= excluded.sent_at - 15');
    $reserve->execute([$id, time()]);
    if (!$reserve->rowCount()) {
        return 429;
    }
    try {
        $sender = planningPushSender($config);
        $subscription = Minishlink\WebPush\Subscription::create(
            json_decode($stored, true, 6, JSON_THROW_ON_ERROR) + ['contentEncoding' => 'aes128gcm']
        );
        $payload = json_encode(['test' => true, 'testId' => $testId, 'title' => 'Test LorR réussi',
            'body' => 'Cet appareil reçoit les notifications de LorR.'],
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        $report = $sender->sendOneNotification($subscription, $payload, ['TTL' => 60]);
        return $report->isSuccess() ? 204 : 502;
    } catch (Exception) {
        return 502;
    }
}

function validPlanningPushEndpoint(mixed $endpoint): bool
{
    if (!is_string($endpoint) || strlen($endpoint) > 2048) {
        return false;
    }
    // Keep outbound requests on known browser push services with their expected paths.
    return preg_match('~\Ahttps://(?:fcm\.googleapis\.com/fcm/send/|(?:updates\.)?push\.services\.mozilla\.com/wpush/v[12]/|web\.push\.apple\.com/)[A-Za-z0-9_:.\~-]+\z~', $endpoint) === 1;
}

function planningPushSubscription(mixed $value): ?array
{
    if (!is_array($value) || !validPlanningPushEndpoint($value['endpoint'] ?? null)
        || !is_array($value['keys'] ?? null)) {
        return null;
    }
    $key = $value['keys']['p256dh'] ?? null;
    $auth = $value['keys']['auth'] ?? null;
    if (!is_string($key) || !preg_match('/\AB[A-Za-z0-9_-]{86}\z/', $key)
        || !is_string($auth) || !preg_match('/\A[A-Za-z0-9_-]{22}\z/', $auth)) {
        return null;
    }
    $point = base64_decode(strtr($key, '-_', '+/'), true);
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $point;
    $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der)) . "-----END PUBLIC KEY-----\n";
    if (!@openssl_pkey_get_public($pem)) {
        return null;
    }
    return ['endpoint' => $value['endpoint'], 'keys' => ['p256dh' => $key, 'auth' => $auth]];
}

function planningPushChoices(array $state): array
{
    $choices = calendarPlanningChoices($state);
    foreach ($choices as $host => $formations) {
        $choices[$host] = array_filter($formations);
    }
    return array_filter($choices);
}

function indexPlanningPushChoices(PDO $database, string $id, array $choices): void
{
    $insert = $database->prepare('INSERT INTO planning_push_formations (source, formation, subscription_id) VALUES (?, ?, ?)');
    foreach ($choices as $host => $formations) {
        foreach (array_keys($formations) as $formation) {
            $insert->execute([$host, (string) $formation, $id]);
        }
    }
}

function savePlanningPush(PDO $database, string $id, array $subscription, string $code, array $choices): void
{
    $database->beginTransaction();
    try {
        $save = $database->prepare('INSERT INTO planning_push_subscriptions (id, endpoint, subscription, code, revision)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET subscription = excluded.subscription, code = excluded.code,
            revision = excluded.revision, snapshot = NULL WHERE code <> excluded.code');
        $save->execute([$id, $subscription['endpoint'], json_encode($subscription, JSON_THROW_ON_ERROR), $code, bin2hex(random_bytes(16))]);
        if ($save->rowCount()) {
            $database->prepare('DELETE FROM planning_push_outbox WHERE subscription_id = ?')->execute([$id]);
            $database->prepare('DELETE FROM planning_push_formations WHERE subscription_id = ?')->execute([$id]);
            indexPlanningPushChoices($database, $id, $choices);
            require_once __DIR__ . '/planning-push-jobs.php';
            $database->prepare('UPDATE planning_push_subscriptions SET snapshot = ? WHERE id = ?')
                ->execute([startingPlanningPushSnapshot($choices), $id]);
        }
        $database->commit();
    } catch (Throwable $error) {
        $database->rollBack();
        throw $error;
    }
}

function servePlanningPush(): void
{
    header('Cache-Control: no-store');
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    $config = planningPushConfig();
    if ($method === 'GET') {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['publicKey' => $config['publicKey'] ?? null]);
        return;
    }
    if ($method !== 'POST') {
        header('Allow: GET, POST');
        http_response_code(405);
        return;
    }
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0]));
    if ($contentType !== 'application/json') {
        http_response_code(415);
        return;
    }
    $maxCodeLength = intdiv(MAX_PLANNING_SHARE_BYTES + 2, 3) * 4 + 2;
    $limit = $maxCodeLength + 4096;
    $body = file_get_contents('php://input', false, null, 0, $limit + 1);
    if ($body === false || strlen($body) > $limit) {
        http_response_code(413);
        return;
    }
    $data = json_decode($body, true, 6);
    $action = $data['action'] ?? null;
    if ($action === 'save' && is_string($data['subscription']['endpoint'] ?? null)
        && !validPlanningPushEndpoint($data['subscription']['endpoint'])) {
        http_response_code(422);
        return;
    }
    $subscription = planningPushSubscription($data['subscription'] ?? null);
    if ($subscription === null || !in_array($action, ['status', 'save', 'remove', 'test'], true)) {
        http_response_code(400);
        return;
    }
    $code = $data['code'] ?? null;
    $testId = $data['testId'] ?? null;
    if ($action === 'test' && $testId !== null && (!is_string($testId) || !preg_match('/\A[a-f0-9]{32}\z/', $testId))) {
        http_response_code(400);
        return;
    }
    if ($action === 'save') {
        if ($config === null) {
            http_response_code(503);
            return;
        }
        $state = validStoredPlanningCode($code, $maxCodeLength) ? decodeSharedPlanningState($code) : null;
        $choices = $state === null ? [] : planningPushChoices($state);
        if (!$choices) {
            http_response_code(400);
            return;
        }
    }
    // The browser's subscription secret also serves as proof of possession.
    $id = hash('sha256', $subscription['endpoint'] . "\n" . $subscription['keys']['auth']);
    try {
        $database = openPlanningPushDatabase();
        if ($action === 'save') {
            savePlanningPush($database, $id, $subscription, $code, $choices);
        } elseif ($action === 'remove') {
            $database->prepare('DELETE FROM planning_push_subscriptions WHERE id = ?')->execute([$id]);
        } elseif ($action === 'test') {
            http_response_code($config === null ? 503 : sendPlanningPushTest($database, $config, $id, $testId));
            return;
        } else {
            $query = $database->prepare('SELECT code FROM planning_push_subscriptions WHERE id = ?');
            $query->execute([$id]);
            $storedCode = $query->fetchColumn();
            header('Content-Type: application/json; charset=UTF-8');
            echo json_encode(['code' => $storedCode === false ? null : $storedCode]);
            return;
        }
        http_response_code(204);
    } catch (RuntimeException | JsonException) {
        http_response_code(503);
    }
}
