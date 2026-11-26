<?php
declare(strict_types=1);

require_once __DIR__ . '/planning-push.php';

function planningPushSnapshot(array $choices, array $schedules, array $previous, DateTimeImmutable $now): array
{
    $snapshot = [];
    $today = $now->format('Y-m-d');
    $until = $now->modify('+14 days')->format('Y-m-d');
    foreach ($choices as $host => $formations) {
        foreach ($formations as $formation => $courses) {
            $key = hash('sha256', serialize([$host, $formation]));
            $entry = $schedules[$host][$formation] ?? null;
            if ($entry === null) {
                if (isset($previous[$key])) {
                    $snapshot[$key] = $previous[$key];
                }
                continue;
            }
            $snapshot[$key] = [];
            $events = calendarPlanningEvents([$host => [$formation => $courses]], [$host => [$formation => $entry]]);
            foreach ($events as $event) {
                if (!empty($event['notice']) || $event['start'] === '' || $event['end'] === ''
                    || $event['date'] < $today || $event['date'] > $until) {
                    continue;
                }
                // The guest reader has no verified stable occurrence ID. Only match within the same day.
                $course = hash('sha256', serialize([$host, $event['date'], $event['subject'], $event['group'], $event['type']]));
                $slot = [$event['start'], $event['end'], $event['room']];
                $snapshot[$key][$course][hash('sha256', serialize($slot))] = $slot + [
                    'subject' => $event['subject'], 'date' => $event['date'],
                ];
            }
        }
    }
    return $snapshot;
}

function planningPushChanges(array $previous, array $current, DateTimeImmutable $now): array
{
    $changes = [];
    $currentTime = $now->format('Y-m-d H:i');
    foreach ($current as $formation => $courses) {
        foreach ($courses as $course => $sessions) {
            $before = $previous[$formation][$course] ?? [];
            $old = array_diff_key($before, $sessions);
            $new = array_diff_key($sessions, $before);
            if (count($old) !== 1 || count($new) !== 1) {
                continue;
            }
            $transition = array_key_first($old) . ':' . array_key_first($new);
            $old = reset($old);
            $new = reset($new);
            if ($new['date'] . ' ' . $new[0] > $currentTime || $old['date'] . ' ' . $old[0] > $currentTime) {
                $changes[$course][$transition] = [$old, $new];
            }
        }
    }
    return $changes;
}

function planningPushMessage(array $changes): array
{
    [[$old, $new]] = $changes;
    $details = [];
    if ($old[0] !== $new[0] || $old[1] !== $new[1]) {
        $details[] = 'Heure ' . $old[0] . '–' . $old[1] . ' → ' . $new[0] . '–' . $new[1];
    }
    if ($old[2] !== $new[2]) {
        $before = $old[2] === '' ? 'à confirmer' : mb_strimwidth($old[2], 0, 32, '…', 'UTF-8');
        $after = $new[2] === '' ? 'à confirmer' : mb_strimwidth($new[2], 0, 32, '…', 'UTF-8');
        $details[] = 'Salle ' . $before . ' → ' . $after;
    }
    $date = substr($new['date'], 8, 2) . '/' . substr($new['date'], 5, 2);
    $remaining = count($changes) - 1;
    $body = $date . ' · ' . implode("\n", $details);
    if ($remaining) {
        $body .= "\n+" . $remaining . ($remaining === 1 ? ' autre changement' : ' autres changements');
    }
    return ['title' => mb_strimwidth($new['subject'], 0, 64, '…', 'UTF-8'), 'body' => $body];
}

function startingPlanningPushSnapshot(array $choices): string
{
    $schedules = [];
    $observed = [];
    foreach ($choices as $host => $formations) {
        [$schedules[$host]] = cachedSchedules(planningUrlForHost($host), array_map('strval', array_keys($formations)));
        foreach ($schedules[$host] as $formation => $entry) {
            $observed[$host][$formation] = $entry['time'];
        }
    }
    $now = new DateTimeImmutable('now', new DateTimeZone('Europe/Brussels'));
    return json_encode(planningPushSnapshot($choices, $schedules, [], $now) + ['observed' => $observed], JSON_THROW_ON_ERROR);
}

function recordPlanningPushSnapshot(PDO $database, array $subscription, array $previous, array $snapshot, array $observed, DateTimeImmutable $now): bool
{
    $json = json_encode($snapshot + ['observed' => $observed], JSON_THROW_ON_ERROR);
    $changes = planningPushChanges($previous, $snapshot, $now);
    $database->beginTransaction();
    try {
        $update = $database->prepare('UPDATE planning_push_subscriptions SET snapshot = ? WHERE id = ? AND revision = ? AND snapshot IS ?');
        $update->execute([$json, $subscription['id'], $subscription['revision'], $subscription['snapshot']]);
        $updated = $update->rowCount() === 1;
        if ($updated && $changes) {
            $deduplicate = $database->prepare('INSERT INTO planning_push_changes (subscription_id, course, transition, date)
                VALUES (?, ?, ?, ?) ON CONFLICT (subscription_id, course, transition) DO NOTHING');
            $pending = [];
            foreach ($changes as $course => $transitions) {
                foreach ($transitions as $transition => $change) {
                    $deduplicate->execute([$subscription['id'], $course, $transition, $change[1]['date']]);
                    if ($deduplicate->rowCount()) {
                        $pending[] = $change;
                    }
                }
            }
            if ($pending) {
                queuePlanningPushChanges($database, $subscription, $pending, $now->getTimestamp());
            }
        }
        $database->commit();
        return $updated;
    } catch (Throwable $error) {
        $database->rollBack();
        throw $error;
    }
}

function queuePlanningPushChanges(PDO $database, array $subscription, array $changes, int $now): void
{
    $payload = planningPushMessage($changes);
    if (strlen($subscription['code']) <= 2800) {
        $payload['code'] = $subscription['code'];
    }
    $database->prepare('INSERT INTO planning_push_outbox (subscription_id, payload, expires, next_attempt)
        VALUES (?, ?, ?, ?)')->execute([$subscription['id'], json_encode($payload, JSON_THROW_ON_ERROR),
            $now + 3600, $now]);
}

function observePlanningPushSchedules(PDO $database, string $host, array $schedules): void
{
    $placeholders = implode(',', array_fill(0, count($schedules), '?'));
    $query = $database->prepare('SELECT DISTINCT s.id, s.code, s.revision, s.snapshot
        FROM planning_push_formations f JOIN planning_push_subscriptions s ON s.id = f.subscription_id
        WHERE f.source = ? AND f.formation IN (' . $placeholders . ')');
    $query->execute([$host, ...array_map('strval', array_keys($schedules))]);
    $subscriptions = $query->fetchAll(PDO::FETCH_ASSOC);
    $query->closeCursor();
    $reload = $database->prepare('SELECT id, code, revision, snapshot FROM planning_push_subscriptions WHERE id = ? AND revision = ?');
    $now = new DateTimeImmutable('now', new DateTimeZone('Europe/Brussels'));
    foreach ($subscriptions as $subscription) {
        $state = decodeSharedPlanningState($subscription['code']);
        if ($state === null) {
            continue;
        }
        $choices = planningPushChoices($state);
        $selected = array_intersect_key($schedules, $choices[$host] ?? []);
        for ($attempt = 0; $attempt < 3 && $subscription; $attempt++) {
            $previous = json_decode($subscription['snapshot'] ?? '[]', true, 8, JSON_THROW_ON_ERROR);
            $observed = $previous['observed'] ?? [];
            unset($previous['observed']);
            $new = [];
            foreach ($selected as $formation => $entry) {
                if ($entry['time'] > ($observed[$host][$formation] ?? 0)) {
                    $new[$formation] = $entry;
                    $observed[$host][$formation] = $entry['time'];
                }
            }
            if (!$new || recordPlanningPushSnapshot($database, $subscription, $previous,
                planningPushSnapshot($choices, [$host => $new], $previous, $now), $observed, $now)) {
                break;
            }
            $reload->execute([$subscription['id'], $subscription['revision']]);
            $subscription = $reload->fetch(PDO::FETCH_ASSOC);
            $reload->closeCursor();
        }
    }
}

function queuePlanningPushVisit(string $url, array $schedules): void
{
    static $observations = [];
    static $configurationChecked = false;
    $host = parse_url($url, PHP_URL_HOST);
    if ($schedules) {
        $observations[$host] = $schedules + ($observations[$host] ?? []);
    }
    if ($configurationChecked) {
        return;
    }
    $configurationChecked = true;
    $config = planningPushConfig();
    if ($config === null) {
        return;
    }
    register_shutdown_function(static function () use (&$observations, $config): void {
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }
        ignore_user_abort(true);
        try {
            $database = openPlanningPushDatabase();
            if ($observations) {
                $today = new DateTimeImmutable('now', new DateTimeZone('Europe/Brussels'));
                $database->prepare('DELETE FROM planning_push_changes WHERE date < ?')->execute([$today->format('Y-m-d')]);
            }
            foreach ($observations as $host => $schedules) {
                observePlanningPushSchedules($database, $host, $schedules);
            }
            sendPlanningPushOutbox($database, $config);
        } catch (Throwable) {
            error_log('LorR : traitement des alertes après consultation indisponible.');
        }
    });
}

function sendPlanningPushOutbox(PDO $database, array $config): void
{
    $due = $database->prepare('SELECT 1 FROM planning_push_outbox WHERE next_attempt <= ? LIMIT 1');
    $due->execute([time()]);
    $hasPending = $due->fetchColumn();
    $due->closeCursor();
    if (!$hasPending) {
        return;
    }
    $directory = localStorageDirectory();
    $lock = $directory === null ? false : @fopen($directory . '/planning-push.lock', 'c');
    if ($lock === false) {
        return;
    }
    try {
        if (flock($lock, LOCK_EX | LOCK_NB)) {
            flushPlanningPushOutbox($database, $config);
        }
    } finally {
        fclose($lock);
    }
}

function flushPlanningPushOutbox(PDO $database, array $config): void
{
    $database->prepare('DELETE FROM planning_push_outbox WHERE expires <= ?')->execute([time()]);
    $query = $database->prepare('SELECT outbox.id, outbox.payload, outbox.expires, s.id AS subscription_id, s.subscription, s.revision
        FROM planning_push_outbox outbox JOIN planning_push_subscriptions s ON s.id = outbox.subscription_id
        WHERE next_attempt <= ? ORDER BY next_attempt, outbox.id LIMIT 12');
    $query->execute([time()]);
    $pending = $query->fetchAll(PDO::FETCH_ASSOC);
    $query->closeCursor();
    if (!$pending) {
        return;
    }

    $sender = planningPushSender($config);
    $delete = $database->prepare('DELETE FROM planning_push_outbox WHERE id = ?');
    $retry = $database->prepare('UPDATE planning_push_outbox SET next_attempt = ? WHERE id = ?');
    $expire = $database->prepare('DELETE FROM planning_push_subscriptions WHERE id = ? AND revision = ?');
    $stillPending = $database->prepare('SELECT 1 FROM planning_push_outbox WHERE id = ?');
    $batch = [];
    foreach ($pending as $message) {
        $stillPending->execute([$message['id']]);
        $exists = $stillPending->fetchColumn();
        $stillPending->closeCursor();
        if (!$exists || $message['expires'] <= time()) {
            continue;
        }
        $subscription = planningPushSubscription(json_decode($message['subscription'], true));
        if ($subscription === null) {
            $expire->execute([$message['subscription_id'], $message['revision']]);
            continue;
        }
        try {
            $target = Minishlink\WebPush\Subscription::create($subscription + ['contentEncoding' => 'aes128gcm']);
            $tag = 'planning-' . $message['id'];
            $payload = json_decode($message['payload'], true, 3, JSON_THROW_ON_ERROR) + ['tag' => $tag];
            $sender->queueNotification($target, json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), [
                'TTL' => max(0, $message['expires'] - time()), 'topic' => $tag,
            ]);
            $batch[$tag] = $message;
        } catch (Throwable) {
            $retry->execute([time() + 300, $message['id']]);
        }
    }
    $sender->flushPooled(static function ($report) use ($batch, $expire, $delete, $retry): void {
        $message = $batch[$report->getRequest()->getHeaderLine('Topic')] ?? null;
        if ($message === null) {
            return;
        }
        if ($report->isSubscriptionExpired()) {
            $expire->execute([$message['subscription_id'], $message['revision']]);
        } elseif ($report->isSuccess()) {
            $delete->execute([$message['id']]);
        } else {
            $retry->execute([time() + 300, $message['id']]);
        }
    }, 12, 6);
}
