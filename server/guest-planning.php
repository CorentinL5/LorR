<?php
declare(strict_types=1);

require_once __DIR__ . '/planning-traffic.php';

final class GuestPlanningClient
{
    private const VIEW = 'DIPLOME.EDT.EDT_LISTE';
    private const RESOURCE_FILTER = ['_T' => 26, 'V' => '[0,6..7]'];
    private const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
    private const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36';

    private CurlHandle $connection;
    private string $guestUrl;
    private string $applicationUrl;
    private string $sessionIv;
    private int $session;
    private ?LegacyGuestPlanning $legacy = null;
    private int $sequence = 1;
    private float $deadline;
    private array $calendar;
    private array $hours = [];

    public function __construct(string $url, ?float $deadline = null)
    {
        if (planningSource($url) !== $url) {
            throw new RuntimeException('Ce lien invité n’est pas pris en charge.');
        }
        $address = parse_url($url);
        $origin = $address['scheme'] . '://' . $address['host'] . (isset($address['port']) ? ':' . $address['port'] : '');
        $http = $address['scheme'] === 'http';
        $connectionOptions = [];
        if ($http) {
            // The legacy HECh endpoint is the only HTTP source. Pin its validated public address.
            $ips = gethostbynamel($address['host']) ?: [];
            $publicIps = array_filter($ips, 'guestPlanningPublicIpv4');
            if (!$publicIps || count($publicIps) !== count($ips)) {
                throw new RuntimeException('L’adresse du serveur invité est indisponible.');
            }
            $connectionOptions = [
                CURLOPT_RESOLVE => [$address['host'] . ':' . $address['port'] . ':' . reset($publicIps)],
                CURLOPT_NOPROXY => '*',
            ];
        }
        $connection = curl_init();
        if (!$connection) {
            throw new RuntimeException('Impossible d’ouvrir l’espace invité.');
        }
        $this->connection = $connection;
        $this->guestUrl = $url;
        $this->applicationUrl = substr($url, 0, -strlen('/invite'));
        $this->deadline = min($deadline ?? INF, microtime(true) + 80);
        $this->sessionIv = random_bytes(16);
        $protocol = defined('CURLOPT_PROTOCOLS_STR') ? [CURLOPT_PROTOCOLS_STR => strtoupper($address['scheme'])]
            : [CURLOPT_PROTOCOLS => $http ? CURLPROTO_HTTP : CURLPROTO_HTTPS];
        curl_setopt_array($connection, $connectionOptions + $protocol + [
            CURLOPT_USERAGENT => self::USER_AGENT,
            CURLOPT_COOKIEFILE => '',
            CURLOPT_ENCODING => '',
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_REFERER => $url,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json; charset=UTF-8',
                'Origin: ' . $origin,
            ],
        ]);

        $html = $this->receive($url);
        if (!preg_match('/\bStart\s*\(\s*(\{[^{}]{1,2048}\})/', $html, $match)) {
            throw new RuntimeException('Cet espace invité ne répond pas dans un format reconnu.');
        }
        $start = json_decode($match[1], true);
        $session = ($start['a'] ?? null) === 2 && is_int($start['i'] ?? null) ? $start['i'] : 0;
        if (!$session && $http) {
            require_once __DIR__ . '/legacy-guest-planning.php';
            $this->legacy = new LegacyGuestPlanning($match[1], $this->sessionIv);
            $session = $this->legacy->session;
        }
        if (!$session || $session <= 0) {
            throw new RuntimeException('Impossible d’ouvrir une session invitée.');
        }
        $this->session = $session;
        $settings = $this->call('FonctionParametres', [
            'ModeJeton' => false,
            'Uuid' => base64_encode($this->sessionIv),
            'identifiantNav' => null,
        ]);
        $this->calendar = is_array($settings['parametreGeneral'] ?? null) ? $settings['parametreGeneral'] : [];
        $profile = $this->call('DemandeParametreUtilisateur', null, ['Onglet' => '']);
        $hours = $profile['Horaire']['ListeHeures'] ?? null;
        $this->hours = is_array($hours) ? $hours : [];
    }

    private function receive(string $url, ?array $payload = null): string
    {
        $remaining = min(12000, (int) (($this->deadline - microtime(true)) * 1000));
        if ($remaining <= 0) {
            throw new RuntimeException('L’espace invité met trop de temps à répondre.');
        }
        $body = '';
        curl_setopt_array($this->connection, [
            CURLOPT_URL => $url,
            CURLOPT_CONNECTTIMEOUT_MS => min(3500, $remaining),
            CURLOPT_TIMEOUT_MS => $remaining,
            CURLOPT_WRITEFUNCTION => static function (CurlHandle $connection, string $chunk) use (&$body): int {
                if (strlen($body) + strlen($chunk) > self::MAX_RESPONSE_BYTES) {
                    return 0;
                }
                $body .= $chunk;
                return strlen($chunk);
            },
        ]);
        $requestBody = $payload === null ? '' : json_encode($payload, JSON_THROW_ON_ERROR);
        if ($payload !== null) {
            curl_setopt($this->connection, CURLOPT_POSTFIELDS, $requestBody);
        }
        $result = curl_exec($this->connection);
        $received = (int) curl_getinfo($this->connection, CURLINFO_SIZE_DOWNLOAD_T);
        recordPlanningTraffic($this->guestUrl, 1, strlen($requestBody), $received);
        if ($result === false || curl_getinfo($this->connection, CURLINFO_RESPONSE_CODE) !== 200) {
            throw new RuntimeException('L’espace invité ne répond pas pour le moment.');
        }
        return $body;
    }

    private function sequenceCode(int $sequence, bool $initial = false): string
    {
        $iv = $initial ? str_repeat("\0", 16) : md5($this->sessionIv, true);
        $code = openssl_encrypt((string) $sequence, 'aes-128-cbc', md5('', true), OPENSSL_RAW_DATA, $iv);
        if ($code === false) {
            throw new RuntimeException('Impossible de préparer la session invitée.');
        }
        return bin2hex($code);
    }

    private function call(string $method, ?array $data = null, ?array $signature = null): array
    {
        if ($this->legacy !== null) {
            $number = $this->legacy->sequence($this->sequence);
            $address = $this->applicationUrl . '/appelfonction/2/' . $this->session . '/' . $number;
            $payload = $this->legacy->request($method, $number, $data, $signature, $this->sequence === 1);
            $response = json_decode($this->receive($address, $payload), true, 40);
            $result = $this->legacy->response($method, $this->sequence + 1, $response);
            $this->sequence += 2;
            return $result;
        }

        $number = $this->sequenceCode($this->sequence, $this->sequence === 1);
        $parameters = [];
        if ($signature !== null) {
            $parameters['Signature'] = $signature;
        }
        if ($data !== null) {
            $parameters['data'] = $data;
        }
        $response = json_decode($this->receive($this->applicationUrl . '/appelfonction/2/' . $this->session . '/' . $number, [
            'session' => $this->session,
            'id' => $method,
            'no' => $number,
            'dataSec' => $parameters,
        ]), true, 40);

        $returnedCode = $response['no'] ?? null;
        if (($response['session'] ?? null) !== $this->session || !is_string($returnedCode)
            || !hash_equals($this->sequenceCode($this->sequence + 1), strtolower($returnedCode))
            || ($response['id'] ?? null) !== $method || !is_array($response['dataSec']['data'] ?? null)) {
            throw new RuntimeException('L’espace invité a renvoyé une réponse inattendue.');
        }
        $this->sequence += 2;
        return $response['dataSec']['data'];
    }

    public function formations(): array
    {
        $result = $this->call('FonctionRenvoyerListeDeRessource', [
            'GenreRessource' => 1,
            'GenreRecherche' => 1,
            'AvecPublicationForcee' => false,
            'NomRessource' => '',
            'PourEmail' => false,
            'PourRessource' => false,
            'filtresRessource' => [],
        ], ['Onglet' => self::VIEW]);
        if (!is_array($result['ListeRessources']['Liste'] ?? null)) {
            throw new RuntimeException('La liste des formations n’est pas disponible.');
        }
        $formations = [];
        foreach ($result['ListeRessources']['Liste'] as $record) {
            $label = $record['L'] ?? null;
            $identifier = $record['N'] ?? null;
            if (($record['G'] ?? null) === 1 && is_string($identifier) && strlen($identifier) <= 128
                && validPlanningFormation($label)) {
                $formations[trim($label)] = ['L' => $label, 'N' => $identifier, 'G' => 1];
            }
        }
        return $formations;
    }

    public function schedule(array $formation): array
    {
        $signature = ['Onglet' => self::VIEW, 'listeRecherche' => [$formation]];
        $publication = $this->call('FonctionDomaineDePresence', [
            'FiltreRessources' => self::RESOURCE_FILTER,
            'AvecCalendrier' => false,
        ], $signature);
        if (!is_string($publication['PeriodeConsultation']['V'] ?? null)) {
            throw new RuntimeException('Les semaines publiées ne sont pas disponibles.');
        }
        $weeks = guestPlanningDomain($publication['PeriodeConsultation']['V'], 64);
        $courses = [];
        if ($weeks) {
            $result = $this->call('FonctionEmploiDuTemps', [
                'GenrePeriodeEDT' => 2,
                'GenreAffichageEDT' => 1,
                'FiltreRessources' => self::RESOURCE_FILTER,
                'AvecIndisponibilites' => false,
                'AvecDomaineCours' => true,
                'AvecDomainePere' => false,
                'filterPlagesHoraires' => false,
                'ignorerCoursAnnules' => false,
                'avecInfosAppel' => false,
                'Domaine' => ['_T' => 8, 'V' => '[' . implode(',', $weeks) . ']'],
            ], $signature);
            if (!is_array($result['ListeCours'] ?? null)) {
                throw new RuntimeException('La liste des cours n’est pas disponible.');
            }
            $courses = $result['ListeCours'];
        }
        return guestPlanningEvents($courses, $weeks, $this->calendar, $this->hours);
    }
}

function guestPlanningPublicIpv4(string $ip): bool
{
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        return false;
    }
    // PHP 8.1's reserved-range flag does not exclude these special-use ranges.
    [$first, $second, $third] = array_map('intval', explode('.', $ip));
    return $first < 224
        && !($first === 100 && $second >= 64 && $second <= 127)
        && !($first === 192 && (($second === 0 && in_array($third, [0, 2], true)) || ($second === 88 && $third === 99)))
        && !($first === 198 && (in_array($second, [18, 19], true) || ($second === 51 && $third === 100)))
        && !($first === 203 && $second === 0 && $third === 113);
}

function guestPlanningDomain(mixed $value, int $maximum): array
{
    if ($value === '[]') {
        return [];
    }
    if (!is_string($value) || strlen($value) > 2048
        || !preg_match('/\A\[([0-9,.]+)\]\z/', $value, $contents)) {
        throw new RuntimeException('La période publiée n’est pas dans un format reconnu.');
    }
    $domain = [];
    foreach (explode(',', $contents[1]) as $part) {
        if (!preg_match('/\A(\d{1,3})(?:\.\.(\d{1,3}))?\z/', $part, $range)) {
            throw new RuntimeException('La période publiée n’est pas dans un format reconnu.');
        }
        $first = (int) $range[1];
        $last = (int) ($range[2] ?? $range[1]);
        if ($first < 1 || $last < $first || $last > $maximum) {
            throw new RuntimeException('La période publiée dépasse le calendrier prévu.');
        }
        for ($value = $first; $value <= $last; $value++) {
            $domain[$value] = true;
        }
    }
    ksort($domain, SORT_NUMERIC);
    return array_keys($domain);
}

function guestPlanningLabels(mixed $value): string
{
    $labels = [];
    foreach (is_array($value) && array_is_list($value) ? $value : [$value] as $item) {
        if (is_array($item)) {
            if (($item['p'] ?? true) === false) {
                continue;
            }
            $item = $item['L'] ?? '';
        }
        if (is_string($item) && trim($item) !== '') {
            $labels[] = trim($item);
        }
    }
    return implode(', ', array_unique($labels));
}

function guestPlanningTime(mixed $value): ?string
{
    return is_string($value) && preg_match('/\A(\d{1,2})[h:](\d{2})\z/', $value, $match)
        ? str_pad($match[1], 2, '0', STR_PAD_LEFT) . ':' . $match[2]
        : null;
}

function guestPlanningEvents(array $courses, array $weeks, array $calendar, array $hours): array
{
    $startDate = $calendar['PremierLundi']['V'] ?? '';
    $first = is_string($startDate) && preg_match('/\A\d{2}\/\d{2}\/\d{4}\z/', $startDate)
        ? DateTimeImmutable::createFromFormat('!d/m/Y', $startDate, new DateTimeZone('UTC')) : false;
    $weekdays = guestPlanningDomain($calendar['JoursOuvres']['V'] ?? '[]', 7);
    $slotsPerDay = $calendar['PlacesParJour'] ?? 0;
    if (!$first || !$weekdays || !is_int($slotsPerDay) || $slotsPerDay < 1 || !$hours) {
        throw new RuntimeException('Le calendrier de l’espace invité est incomplet.');
    }
    $events = [];
    foreach ($courses as $course) {
        $position = $course['p'] ?? null;
        $duration = $course['d'] ?? null;
        // The list view sends one row per week, with its week number in G.
        $week = $course['G'] ?? null;
        if (!is_int($position) || $position < 0 || $position >= $slotsPerDay * count($weekdays)
            || !is_int($duration) || $duration < 1 || $duration > $slotsPerDay || !in_array($week, $weeks, true)) {
            continue;
        }
        $day = $weekdays[intdiv($position, $slotsPerDay)] - 1;
        $slot = $position % $slotsPerDay;
        $start = guestPlanningTime($hours[$slot]['Debut'] ?? null);
        $end = guestPlanningTime($hours[$slot + $duration - 1]['Fin'] ?? null);
        $contents = [];
        foreach ($course['listeC'] ?? [] as $item) {
            if (in_array($item['G'] ?? null, [0, 1, 3, 7, 12, 13, 14, 15], true)) {
                $contents[$item['G']] = guestPlanningLabels($item['C'] ?? null);
            }
        }
        $subject = $contents[0] ?? '';
        if ($start === null || $end === null || $subject === '') {
            continue;
        }
        $groups = array_filter([$contents[12] ?? '', $contents[14] ?? '', $contents[15] ?? '']);
        $group = $groups ? implode(', ', array_unique($groups)) : ($contents[13] ?? '');
        $date = $first->modify('+' . (($week - 1) * 7 + $day) . ' days')->format('Y-m-d');
        $events[] = ['date' => $date, 'start' => $start, 'end' => $end, 'subject' => $subject,
            'group' => $group, 'teacher' => $contents[1] ?? '', 'room' => $contents[3] ?? '', 'type' => $contents[7] ?? ''];
    }

    $holidayWeeks = guestPlanningDomain($calendar['SemainesFeriees']['V'] ?? '[]', 64);
    foreach ($holidayWeeks as $week) {
        $monday = $first->modify('+' . (($week - 1) * 7) . ' days');
        $until = $monday->modify('+' . (max($weekdays) - 1) . ' days');
        $events[] = guestPlanningNotice($monday->format('Y-m-d'), $until->format('Y-m-d'), 'Semaine fériée', 'pause');
    }
    foreach (guestPlanningDomain($calendar['JoursFeries']['V'] ?? '[]', 448) as $day) {
        $week = intdiv($day - 1, 7) + 1;
        if (in_array($week, $weeks, true) && !in_array($week, $holidayWeeks, true)
            && in_array(($day - 1) % 7 + 1, $weekdays, true)) {
            $date = $first->modify('+' . ($day - 1) . ' days')->format('Y-m-d');
            $events[] = guestPlanningNotice($date, $date, 'Jour férié', 'holiday');
        }
    }
    return $events;
}

function guestPlanningNotice(string $from, string $until, string $subject, string $notice): array
{
    return ['date' => $from, 'subject' => $subject, 'notice' => $notice, 'period' => [$from, $until],
        'start' => '', 'end' => '', 'group' => '', 'room' => '', 'type' => '', 'allDay' => true];
}

function readGuestPlanning(string $url, array $requested, callable $report, callable $publish, ?float $deadline = null): array
{
    $total = count($requested) + 1;
    $report(0, $total, 'Ouverture de l’espace invité');
    $client = new GuestPlanningClient($url, $deadline);
    $catalogue = $client->formations();
    $formations = array_map('strval', array_keys($catalogue));
    $report(1, $total, 'Liste des formations lue');
    $schedules = [];
    $errors = [];
    foreach ($requested as $index => $name) {
        if (!isset($catalogue[$name])) {
            $errors[] = ['formation' => $name, 'error' => 'Cette formation n’est plus publiée.'];
            continue;
        }
        $report($index + 1, $total, $name . ' · Lecture des semaines publiées');
        try {
            $events = $client->schedule($catalogue[$name]);
            $schedules[] = ['formation' => $name, 'events' => $events];
            $publish($name, $events);
        } catch (RuntimeException | JsonException $error) {
            $errors[] = ['formation' => $name, 'error' => $error->getMessage()];
        }
        $report($index + 2, $total, $name . ' · Lecture terminée');
    }
    return ['formations' => $formations, 'schedules' => $schedules, 'errors' => $errors];
}
