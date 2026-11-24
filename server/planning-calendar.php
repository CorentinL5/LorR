<?php
declare(strict_types=1);

require_once __DIR__ . '/planning-cache.php';
require_once __DIR__ . '/planning-traffic.php';

function calendarPlanningChoices(array $state): array
{
    $choices = [];
    if ($state[0] === 1) {
        foreach ($state[1] as [$host, $formation]) {
            $choices[$host][$formation] = [];
        }
        foreach ($state[2] as [$index, $group, $subject, $type]) {
            [$host, $formation] = $state[1][$index];
            $choices[$host][$formation][serialize([$group, $subject, $type])] = true;
        }
        return $choices;
    }

    foreach ($state[1] as [$reference, $formations]) {
        $host = is_int($reference) ? sprintf('hehplanning%04d.umons.ac.be', $reference) : $reference;
        foreach ($formations as [$formation, $groups]) {
            $choices[$host][$formation] ??= [];
            foreach ($groups as $entry) {
                [$group, $type] = $entry;
                foreach (array_slice($entry, 2) as $subject) {
                    $choices[$host][$formation][serialize([$group, $subject, $type])] = true;
                }
            }
        }
    }
    return $choices;
}

function refreshCalendarSchedules(string $url, array $formations, float $deadline): void
{
    if (microtime(true) >= $deadline || !hasPhpPlanningReader()) {
        return;
    }

    $lock = lockPlanningRefresh($url);
    if ($lock === false) {
        return;
    }
    try {
        [, $missing] = cachedSchedules($url, $formations);
        if (!$missing || microtime(true) >= $deadline || !reservePlanningRefresh($lock)) {
            return;
        }

        $directory = planningCacheDirectory();
        require_once __DIR__ . '/guest-planning.php';
        $result = readGuestPlanning($url, $missing, static function (): void {},
            static function (string $formation, array $events) use ($directory, $url): void {
                writeCache($directory, cachePath($directory, $url, $formation), ['time' => time(), 'data' => $events]);
            }, $deadline);
        writeCache($directory, cachePath($directory, $url), ['time' => time(), 'data' => $result['formations']]);
    } catch (RuntimeException | JsonException) {
        // Recent cached schedules remain usable during an upstream failure.
    } finally {
        fclose($lock);
    }
}

function calendarPlanningSchedules(array $choices): ?array
{
    $directory = planningCacheDirectory();
    $deadline = microtime(true) + 20;
    $schedules = [];
    foreach ($choices as $host => $formations) {
        $url = planningUrlForHost($host);
        if ($url === null) {
            return null;
        }
        [$schedules[$host], $missing] = cachedSchedules($url, array_map('strval', array_keys($formations)));
        if ($missing) {
            refreshCalendarSchedules($url, $missing, $deadline);
        }
        foreach ($missing as $formation) {
            $entry = readCache(cachePath($directory, $url, $formation)) ?? ($schedules[$host][$formation] ?? null);
            if ($entry === null) {
                // An incomplete feed could remove valid events from a subscriber's calendar.
                return null;
            }
            $schedules[$host][$formation] = $entry;
        }
    }
    return $schedules;
}

function calendarPlanningEvents(array $choices, array $schedules): array
{
    $events = [];
    foreach ($schedules as $host => $formations) {
        foreach ($formations as $formation => $entry) {
            foreach ($entry['data'] as $event) {
                $notice = $event['notice'] ?? '';
                $group = $event['group'] ?? '';
                $type = $event['type'] ?? '';
                if (!$notice && !isset($choices[$host][$formation][serialize([$group, $event['subject'], $type])])) {
                    continue;
                }
                $key = serialize([$host, $event['date'], $event['start'], $event['end'], $event['subject'], $notice,
                    $notice ? ($event['period'] ?? null) : [$group, $type, $event['room'] ?? '', $event['teacher'] ?? '']]);
                $events[$key] ??= $event + ['group' => '', 'type' => '', 'room' => '', 'teacher' => '', 'formations' => []];
                $events[$key]['formations'][$formation] = true;
            }
        }
    }
    uasort($events, static fn (array $a, array $b): int => [$a['date'], $a['start']] <=> [$b['date'], $b['start']]);
    return $events;
}

function calendarIcsText(string $value): string
{
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);
    return strtr($value, ["\\" => "\\\\", "\r\n" => '\\n', "\r" => '\\n', "\n" => '\\n', ',' => '\\,', ';' => '\\;']);
}

function foldCalendarIcsLine(string $line): string
{
    $parts = [];
    $start = 0;
    $length = strlen($line);
    for ($limit = 75; $length - $start > $limit; $limit = 74) {
        $end = $start + $limit;
        while ((ord($line[$end]) & 0xc0) === 0x80) {
            $end--;
        }
        $parts[] = substr($line, $start, $end - $start);
        $start = $end;
    }
    $parts[] = substr($line, $start);
    return implode("\r\n ", $parts);
}

function calendarIcsDates(array $event, DateTimeZone $brussels, DateTimeZone $utc): array
{
    if (!empty($event['allDay']) || $event['start'] === '' || $event['end'] === '') {
        [$first, $last] = $event['period'] ?? [$event['date'], $event['date']];
        $until = (new DateTimeImmutable($last, $utc))->modify('+1 day');
        return ['DTSTART;VALUE=DATE:' . str_replace('-', '', $first), 'DTEND;VALUE=DATE:' . $until->format('Ymd')];
    }

    $start = new DateTimeImmutable($event['date'] . ' ' . $event['start'], $brussels);
    $end = new DateTimeImmutable($event['date'] . ' ' . $event['end'], $brussels);
    if ($end < $start) {
        $end = $end->modify('+1 day');
    }
    $format = 'Ymd\THis\Z';
    $dates = ['DTSTART:' . $start->setTimezone($utc)->format($format)];
    if ($end > $start) {
        $dates[] = 'DTEND:' . $end->setTimezone($utc)->format($format);
    }
    return $dates;
}

function calendarIcsBody(array $events, string $stamp): string
{
    $brussels = new DateTimeZone('Europe/Brussels');
    $utc = new DateTimeZone('UTC');
    $lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LorR//Planning//FR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:LorR'];
    foreach ($events as $key => $event) {
        $dates = calendarIcsDates($event, $brussels, $utc);
        $lines[] = 'BEGIN:VEVENT';
        $lines[] = 'UID:' . hash('sha256', $key) . '@lorr';
        $lines[] = 'DTSTAMP:' . $stamp;
        array_push($lines, ...$dates);
        $lines[] = 'SUMMARY:' . calendarIcsText($event['subject']);
        if ($event['room'] !== '') {
            $lines[] = 'LOCATION:' . calendarIcsText($event['room']);
        }
        $notes = ['Formation' => implode(' · ', array_keys($event['formations'])),
            'Groupe' => $event['group'], 'Type' => $event['type'], 'Enseignant' => $event['teacher']];
        $description = [];
        foreach ($notes as $label => $value) {
            if ($value !== '') {
                $description[] = $label . ' : ' . $value;
            }
        }
        if ($description) {
            $lines[] = 'DESCRIPTION:' . calendarIcsText(implode("\n", $description));
        }
        if (!empty($event['notice'])) {
            $lines[] = 'TRANSP:TRANSPARENT';
        }
        $lines[] = 'END:VEVENT';
    }
    $lines[] = 'END:VCALENDAR';
    return implode("\r\n", array_map('foldCalendarIcsLine', $lines)) . "\r\n";
}

function recordPlanningCalendarResponse(string $method, array $choices, string $outcome): void
{
    if ($method !== 'GET') {
        return;
    }
    $sources = [];
    foreach (array_keys($choices) as $host) {
        $url = planningUrlForHost($host);
        if ($url !== null) {
            $sources[$url] = ['ical' => 1];
        }
    }
    recordPlanningActivity([$outcome => 1], $sources);
}

function servePlanningCalendar(string $id): void
{
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        header('Allow: GET, HEAD');
        http_response_code(405);
        return;
    }
    try {
        $code = loadPlanningLink($id);
    } catch (RuntimeException) {
        http_response_code(503);
        return;
    }
    $state = $code === null ? null : decodeSharedPlanningState($code);
    if ($state === null) {
        http_response_code(404);
        return;
    }
    $choices = calendarPlanningChoices($state);
    $schedules = calendarPlanningSchedules($choices);
    if ($schedules === null) {
        recordPlanningCalendarResponse($method, $choices, 'icalUnavailable');
        header('Retry-After: ' . PLANNING_REFRESH_INTERVAL);
        http_response_code(503);
        return;
    }
    $updated = 0;
    foreach ($schedules as $formations) {
        $updated = max($updated, ...array_column($formations, 'time'));
    }
    $stamp = gmdate('Ymd\THis\Z', $updated);
    $body = calendarIcsBody(calendarPlanningEvents($choices, $schedules), $stamp);
    $tag = '"' . hash('sha256', str_replace("\r\nDTSTAMP:$stamp\r\n", "\r\n", $body)) . '"';
    header('Content-Type: text/calendar; charset=UTF-8');
    header('Cache-Control: private, max-age=300');
    header('ETag: W/' . $tag);
    $clientTags = array_map('trim', explode(',', $_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
    if (array_intersect(['*', $tag, 'W/' . $tag], $clientTags)) {
        http_response_code(304);
        recordPlanningCalendarResponse($method, $choices, 'icalUnchanged');
    } elseif ($method === 'GET') {
        recordPlanningCalendarResponse($method, $choices, 'icalDelivered');
        echo $body;
    }
}
