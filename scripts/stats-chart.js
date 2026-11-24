const usageChart = document.getElementById('usage-chart');
const usageTable = document.getElementById('usage-table') ?? usageChart.nextElementSibling;
const usagePlot = usageChart.querySelector('svg');
const usageEmpty = usageChart.querySelector('.stats-chart-empty');
const usageHourPlot = document.getElementById('usage-hour-chart');
const usageHourUnavailable = document.getElementById('usage-hour-unavailable');
const usageHourGaps = document.getElementById('usage-hour-gaps');
const usageDaySelection = document.getElementById('usage-day-selection');
const usageHourSelection = document.getElementById('usage-hour-selection');
const usageHourDay = document.getElementById('stats-hour-day');
const usageHourDetails = document.getElementById('usage-hour-details');
const usageHourData = document.getElementById('usage-hours');
const usageHours = usageHourData ? JSON.parse(usageHourData.textContent) : {};
const usageNumber = new Intl.NumberFormat('fr-BE');
const usageDays = [...usageTable.querySelectorAll('tbody tr')].reverse().map(row => {
    const date = row.querySelector('time');
    return {
        label: date.dataset.short ?? date.textContent.slice(0, 5),
        date: date.textContent,
        key: date.dateTime,
        current: date.hasAttribute('aria-current'),
        counts: [...row.querySelectorAll('[data-count]')].map(cell => Number(cell.dataset.count)),
    };
});
const usageHourlyPeriods = Object.entries(usageHours).flatMap(([date, hours]) => {
    const day = date.slice(8, 10) + '/' + date.slice(5, 7);
    return hours.map((hour, index) => ({
        label: index === 0 ? day : '',
        midday: hour.label === '12:00',
        date: day + ' · ' + hour.label,
        current: hour.current,
        counts: hour.counts,
    }));
});
const usageSeries = [...usageChart.querySelectorAll('.stats-chart-legend [data-metric]')].map((item, index) => ({
    metric: item.dataset.metric,
    label: item.title,
    shortLabel: item.textContent.trim(),
    checkbox: item.querySelector('input'),
    index,
}));
const firstRecordedHour = usageHourlyPeriods.findIndex(period => period.counts !== null);
const dayHint = usageDaySelection.textContent;
const hourHint = usageHourSelection.textContent;
let selectedDay = usageHourDetails.open ? usageDays.findIndex(day => day.key === usageHourDay.value) : -1;
let selectedHour = -1;

function visibleUsageSeries() {
    return usageSeries.filter(series => series.checkbox.checked);
}

function usageSvg(tag, attributes = {}, text = '') {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) {
        node.setAttribute(name, value);
    }
    node.textContent = text;
    return node;
}

function drawUsagePlot(plot, periods, selected, hourly = false) {
    const plotContent = plot.querySelector('g');
    const showPlot = selected.length > 0 && (!hourly || firstRecordedHour >= 0);
    plot.toggleAttribute('hidden', !showPlot);
    if (!showPlot) {
        plotContent.replaceChildren();
        return;
    }

    const width = plot.clientWidth;
    const height = plot.clientHeight;
    if (!width || !height) {
        return;
    }
    plot.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    const seriesData = selected.map(series => ({
        ...series,
        values: periods.map(period => period.counts?.[series.index] ?? null),
    }));
    const maximum = Math.max(1, ...seriesData.flatMap(series => series.values));
    const target = Math.max(1, maximum / 4);
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const step = [1, 2, 2.5, 5, 10].find(value => value * magnitude >= target) * magnitude;
    const interval = Math.ceil(step);
    const ticks = Math.ceil(maximum / interval);
    const limit = ticks * interval;
    const left = Math.max(36, usageNumber.format(limit).length * 8 + 13);
    const right = width - 22;
    const top = 18;
    const bottom = height - 30;
    const lastIndex = periods.length - 1;
    const x = index => lastIndex ? left + (right - left) * index / lastIndex : (left + right) / 2;
    const y = count => Math.round(bottom - (bottom - top) * count / limit);
    const content = document.createDocumentFragment();

    if (hourly && firstRecordedHour > 0) {
        const collectedFrom = (x(firstRecordedHour - 1) + x(firstRecordedHour)) / 2;
        content.append(usageSvg('rect', {
            x: left, y: top, width: collectedFrom - left, height: bottom - top, fill: '#ede7df',
        }));
    }
    const current = periods.findIndex(period => period.current);
    if (!hourly && current >= 0) {
        content.append(usageSvg('rect', {
            class: 'stats-chart-today', fill: '#f3eaff',
            x: x(current) - 14, y: top - 7, width: 28, height: bottom - top + 30, rx: 8,
        }));
    }
    for (let tick = 0; tick <= ticks; tick++) {
        const value = interval * tick;
        const position = y(value);
        content.append(
            usageSvg('line', {class: 'stats-chart-grid', x1: left, x2: right, y1: position, y2: position}),
            usageSvg('text', {class: 'stats-chart-label', x: left - 8, y: position, 'text-anchor': 'end', 'dominant-baseline': 'middle'}, usageNumber.format(value)),
        );
    }
    for (const [index, period] of periods.entries()) {
        const label = period.label || (period.midday && width >= 640 ? '12 h' : '');
        if (!label) continue;
        const position = x(index);
        content.append(
            usageSvg('line', {class: 'stats-chart-grid', x1: position, x2: position, y1: top, y2: bottom}),
            usageSvg('text', {class: 'stats-chart-label', x: position, y: bottom + 21, 'text-anchor': 'middle'}, label),
        );
    }
    for (const {metric, label, values} of seriesData) {
        const group = usageSvg('g', {'data-metric': metric});
        const points = values.flatMap((value, index) => value === null ? [] : [x(index) + ',' + y(value)]);
        group.append(usageSvg('polyline', {class: 'stats-chart-line', fill: 'none', points: points.join(' ')}));
        if (hourly && points.length > 1) {
            content.append(group);
            continue;
        }
        for (const [index, value] of values.entries()) {
            if (value === null) {
                continue;
            }
            const point = usageSvg('circle', {class: 'stats-chart-point', cx: x(index), cy: y(value), r: 3.5});
            point.append(usageSvg('title', {}, label + ' · ' + periods[index].date + ' · ' + usageNumber.format(value)));
            group.append(point);
        }
        content.append(group);
    }
    for (const [index, period] of periods.entries()) {
        if (!period.counts) continue;
        const position = x(index);
        const start = index === 0 ? left - (hourly ? 0 : 16) : (x(index - 1) + position) / 2;
        const end = index === lastIndex ? right + (hourly ? 0 : 16) : (position + x(index + 1)) / 2;
        const target = usageSvg('g', {class: 'stats-chart-target', 'data-period': index});
        if (!hourly) {
            target.setAttribute('role', 'button');
            target.setAttribute('tabindex', '0');
            target.setAttribute('aria-label', 'Détail du ' + period.date);
        }
        const values = selected.map(series => series.label + ' · ' + usageNumber.format(period.counts[series.index]));
        target.append(
            usageSvg('rect', {x: start, y: top, width: end - start, height: bottom - top + (hourly ? 0 : 27), rx: hourly ? 0 : 5}),
            usageSvg('title', {}, [period.date, ...values].join('\n')),
        );
        content.append(target);
    }
    plotContent.replaceChildren(content);
}

function showUsageSelection(plot, output, period, index, hint, hourly = false) {
    const selected = visibleUsageSeries();
    output.hidden = !selected.length || (hourly && firstRecordedHour < 0);
    const values = period ? selected.map(({shortLabel, index}) => shortLabel + ' ' + usageNumber.format(period.counts[index])) : [];
    const message = period ? [period.date, ...values].join(' · ') : hint;
    if (output.textContent !== message) output.textContent = message;
    for (const target of plot.querySelectorAll('[data-period]')) {
        const active = Number(target.dataset.period) === index;
        target.toggleAttribute('data-active', active);
        if (!hourly) target.setAttribute('aria-pressed', String(active));
    }
}

function showDaySelection() {
    showUsageSelection(usagePlot, usageDaySelection, usageDays[selectedDay], selectedDay, dayHint);
}

function showHourSelection() {
    showUsageSelection(usageHourPlot, usageHourSelection, usageHourlyPeriods[selectedHour], selectedHour, hourHint, true);
}

function drawUsageCharts() {
    const selected = visibleUsageSeries();
    usageEmpty.hidden = selected.length > 0;
    drawUsagePlot(usagePlot, usageDays, selected);
    usageHourUnavailable.hidden = firstRecordedHour >= 0;
    usageHourGaps.hidden = firstRecordedHour <= 0 || !selected.length;
    drawUsagePlot(usageHourPlot, usageHourlyPeriods, selected, true);
    showDaySelection();
    showHourSelection();
}

function showHourValues() {
    const rows = [...usageHours[usageHourDay.value]].reverse().map(hour => {
        const row = document.createElement('tr');
        const title = document.createElement('th');
        title.scope = 'row';
        title.textContent = hour.label;
        if (hour.current) title.setAttribute('aria-current', 'time');
        row.append(title);
        for (const {index} of usageSeries) {
            const cell = row.insertCell();
            cell.textContent = hour.counts === null ? '—' : usageNumber.format(hour.counts[index]);
        }
        return row;
    });
    usageHourDetails.querySelector('tbody').replaceChildren(...rows);
}

usageHourDay.addEventListener('change', () => {
    selectedDay = usageDays.findIndex(day => day.key === usageHourDay.value);
    showDaySelection();
    showHourValues();
});
showHourValues();
usageHourDetails.hidden = false;

function openUsageDay(target) {
    selectedDay = Number(target.dataset.period);
    usageHourDay.value = usageDays[selectedDay].key;
    usageHourDetails.open = true;
    showDaySelection();
    showHourValues();
}

usagePlot.addEventListener('click', event => {
    const target = event.target.closest('[data-period]');
    if (target) openUsageDay(target);
});
usagePlot.addEventListener('keydown', event => {
    if (event.target.matches('[data-period]') && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openUsageDay(event.target);
    }
});
usageHourPlot.addEventListener('click', event => {
    const target = event.target.closest('[data-period]');
    if (target) {
        selectedHour = Number(target.dataset.period);
        showHourSelection();
    }
});

const activityButtons = [...document.querySelectorAll('[data-activity-metric]')];
const donut = document.querySelector('.stats-donut');
const donutSegments = [...donut.querySelectorAll('[data-donut-metric]')];
const donutCenter = donut.querySelector('.stats-donut-center');
const donutTotal = donutCenter.querySelector('strong').textContent;
const donutLabel = donutCenter.querySelector('span').textContent;
let activeMetric = null;
let previousSeries;

function showDonutSelection(metric) {
    const chosen = activityButtons.find(button => button.dataset.activityMetric === metric);
    donut.toggleAttribute('data-selected', Boolean(chosen));
    for (const button of activityButtons) button.setAttribute('aria-pressed', String(button === chosen));
    for (const segment of donutSegments) segment.toggleAttribute('data-selected', segment.dataset.donutMetric === metric);
    donutCenter.querySelector('strong').textContent = chosen ? chosen.closest('.stats-activity-row').querySelector('strong').textContent : donutTotal;
    donutCenter.querySelector('span').textContent = chosen ? usageSeries.find(series => series.metric === metric).shortLabel : donutLabel;
}

function toggleActivityMetric(metric) {
    if (activeMetric === null) previousSeries = new Set(visibleUsageSeries().map(series => series.metric));
    activeMetric = activeMetric === metric ? null : metric;
    for (const series of usageSeries) {
        series.checkbox.checked = activeMetric === null ? previousSeries.has(series.metric) : series.metric === activeMetric;
    }
    showDonutSelection(activeMetric);
    drawUsageCharts();
}

for (const button of activityButtons) {
    button.disabled = false;
    button.addEventListener('click', () => toggleActivityMetric(button.dataset.activityMetric));
}
for (const segment of donutSegments) {
    segment.addEventListener('click', () => toggleActivityMetric(segment.dataset.donutMetric));
}
donut.setAttribute('data-interactive', '');

usageChart.hidden = false;
usageChart.addEventListener('change', () => {
    if (activeMetric !== null) {
        activeMetric = null;
        showDonutSelection(null);
    }
    drawUsageCharts();
});
let chartWidth;
new ResizeObserver(([entry]) => {
    const {width} = entry.contentRect;
    if (width === chartWidth) return;
    chartWidth = width;
    drawUsageCharts();
}).observe(usageChart);
drawUsageCharts();
