<?php
$totals = [];
foreach (array_keys($labels) as $metric) {
    $totals[$metric] = (int) ($usage['total'][$metric] ?? 0);
}

$activityColors = [
    'home' => '#99bdeb',
    'planner' => '#bfa6ec',
    'reads' => '#ffcc36',
    'clicks' => '#82d6a7',
];
$activity = array_intersect_key($totals, $activityColors);
$volume = ['sessions' => $totals['sessions'], 'courses' => $totals['courses']];
$actionCount = array_sum($activity);
$donutPoint = static function (int $position) use ($actionCount): string {
    $angle = 2 * M_PI * ($position % $actionCount) / $actionCount;
    return sprintf('%.8F %.8F', 50 + 40 * sin($angle), 50 - 40 * cos($angle));
};

$formatTotal = static fn (int|float $value): string => number_format($value, 0, ',', ' ');
$chartScale = static function (int $largest): array {
    $target = max(1, $largest / 5);
    $magnitude = 10 ** floor(log10($target));
    foreach ([1, 2, 2.5, 5, 10] as $factor) {
        $step = (int) ceil($factor * $magnitude);
        if ($step >= $target) {
            $segments = max(1, (int) ceil($largest / $step));
            return [$segments * $step, range(0, $segments * $step, $step)];
        }
    }
    return [5, range(0, 5)];
};
[$activityLimit, $activityTicks] = $chartScale(max($activity));
[$volumeLimit, $volumeTicks] = $chartScale(max($volume));
$offset = 0;

$showInfo = static function (string $metric) use ($labels): void {
    [$label, , $description] = $labels[$metric];
    ?>
    <details class="stat-info" name="stats-explanations">
        <summary aria-label="Comprendre la statistique <?= $label ?>">
            <span class="stat-info-mark" aria-hidden="true"></span>
        </summary>
        <p><?= $description ?></p>
    </details>
    <?php
};
?>
<dl class="stats-featured" aria-label="Chiffres clés">
    <?php foreach (['sessions', 'distinct_courses', 'sources'] as $metric): ?>
        <div class="stats-featured-card" data-metric="<?= $metric ?>">
            <dt>
                <?= $metric === 'sources' && $totals[$metric] === 1 ? 'Lien invité distinct' : $labels[$metric][0] ?>
                <?php $showInfo($metric); ?>
            </dt>
            <dd>
                <?= $formatTotal($totals[$metric]) ?>
                <?php if ($metric === 'sessions'): ?><span class="stats-calendar-mark" aria-hidden="true">✦</span><?php endif; ?>
            </dd>
        </div>
    <?php endforeach; ?>
</dl>
<div class="stats-overview-charts">
    <section class="stats-overview-card stats-activity-card" aria-labelledby="stats-activity-title">
        <h2 id="stats-activity-title">Activité du site</h2>
        <div class="stats-activity-grid">
            <div class="stats-activity-bars" style="--stat-tick:<?= 100 / (count($activityTicks) - 1) ?>%">
                <ul>
                    <?php foreach ($activity as $metric => $count): ?>
                        <li style="--stat-color:<?= $activityColors[$metric] ?>; --stat-size:<?= 100 * $count / $activityLimit ?>%">
                            <div class="stats-activity-row">
                                <span>
                                    <i class="stats-activity-swatch" aria-hidden="true"></i><button class="stats-activity-filter" type="button" data-activity-metric="<?= $metric ?>" aria-pressed="false" disabled><?= $labels[$metric][0] ?></button>
                                    <?php $showInfo($metric); ?>
                                </span>
                                <strong><?= $formatTotal($count) ?></strong>
                            </div>
                            <div class="stats-activity-track" aria-hidden="true"><span></span></div>
                        </li>
                    <?php endforeach; ?>
                </ul>
                <div class="stats-overview-axis" aria-hidden="true">
                    <?php foreach ($activityTicks as $tick): ?><span><?= $formatTotal($tick) ?></span><?php endforeach; ?>
                </div>
            </div>
            <figure class="stats-donut-figure">
                <div class="stats-donut">
                    <?php if ($actionCount > 0): ?>
                        <svg viewBox="0 0 100 100" aria-hidden="true">
                            <?php foreach (array_filter($activity) as $metric => $count): ?>
                                <g fill="none" stroke="<?= $activityColors[$metric] ?>" stroke-width="20" data-donut-metric="<?= $metric ?>">
                                    <title><?= $labels[$metric][0] ?> · <?= $formatTotal($count) ?></title>
                                    <?php if ($count === $actionCount): ?>
                                        <circle cx="50" cy="50" r="40" />
                                    <?php else: ?>
                                        <path d="M <?= $donutPoint($offset) ?> A 40 40 0 <?= $count > $actionCount / 2 ? 1 : 0 ?> 1 <?= $donutPoint($offset + $count) ?>" />
                                    <?php endif; ?>
                                </g>
                                <?php $offset += $count; ?>
                            <?php endforeach; ?>
                        </svg>
                    <?php endif; ?>
                    <div class="stats-donut-center">
                        <strong><?= $formatTotal($actionCount) ?></strong>
                        <span><?= $actionCount === 1 ? 'action' : 'actions' ?></span>
                    </div>
                </div>
                <figcaption>Répartition des actions</figcaption>
            </figure>
        </div>
    </section>
    <section class="stats-overview-card stats-volume-card" aria-labelledby="stats-volume-title">
        <h2 id="stats-volume-title">Volume chargé</h2>
        <div class="stats-volume-grid" style="--stat-tick:<?= 100 / (count($volumeTicks) - 1) ?>%">
            <div class="stats-overview-axis stats-volume-axis" aria-hidden="true">
                <?php foreach ($volumeTicks as $tick): ?><span><?= $formatTotal($tick) ?></span><?php endforeach; ?>
            </div>
            <dl class="stats-volume-bars">
                <?php foreach ($volume as $metric => $count): ?>
                    <div class="stats-volume-column" data-metric="<?= $metric ?>" style="--stat-size:<?= 100 * $count / $volumeLimit ?>%">
                        <dt><?= $labels[$metric][0] ?> <?php if ($metric === 'courses') { $showInfo($metric); } ?></dt>
                        <dd><div class="stats-volume-bar"><strong><?= $formatTotal($count) ?></strong></div></dd>
                    </div>
                <?php endforeach; ?>
            </dl>
        </div>
    </section>
</div>
