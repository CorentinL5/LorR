<script id="planning-source-config" type="application/json"><?= json_encode([
    'hehHostPattern' => HEH_PLANNING_HOST_PATTERN,
    'extraHosts' => extraPlanningHosts(),
    'guestUrls' => PLANNING_GUEST_URLS,
    'maxFormationsPerSource' => MAX_FORMATIONS_PER_SOURCE,
    'maxRequestBytes' => MAX_PLANNING_REQUEST_BYTES,
], JSON_HEX_TAG | JSON_THROW_ON_ERROR) ?></script>
