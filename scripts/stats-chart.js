const usageChart = document.getElementById('usage-chart');
const usageTable = document.getElementById('usage-table') ?? usageChart.nextElementSibling;
const usagePlot = usageChart.querySelector('svg');
const usageEmpty = usageChart.querySelector('.stats-chart-empty');
const usageHourPlot = document.getElementById('usage-hour-chart');
const usageHourUnavailable = document.getElementById('usage-hour-unavailable');
const usageHourGaps = document.getElementById('usage-hour-gaps');
const usageHourData = document.getElementById('usage-hours');
const usageHours = usageHourData ? JSON.parse(usageHourData.textContent) : {};
const usageNumber = new Intl.NumberFormat('fr-BE');
const usageDays = [...usageTable.querySelectorAll('tbody tr')].reverse().map(row => {
    const date = row.querySelector('time');
    return {
        label: date.dataset.short ?? date.textContent.slice(0, 5),
        date: date.textContent,
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
    checkbox: item.querySelector('input'),
    index,
}));
const firstRecordedHour = usageHourlyPeriods.findIndex(period => period.counts !== null);

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
    const x = index => Math.round(lastIndex ? left + (right - left) * index / lastIndex : (left + right) / 2);
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
    if (hourly) {
        for (const [index, period] of periods.entries()) {
            if (!period.counts) continue;
            const position = x(index);
            const start = index === 0 ? left : (x(index - 1) + position) / 2;
            const end = index === lastIndex ? right : (position + x(index + 1)) / 2;
            const values = selected.map(series => series.label + ' · ' + usageNumber.format(period.counts[series.index]));
            const target = usageSvg('rect', {x: start, y: top, width: end - start, height: bottom - top, fill: 'transparent'});
            target.append(usageSvg('title', {}, [period.date, ...values].join('\n')));
            content.append(target);
        }
    }
    plotContent.replaceChildren(content);
}

function drawUsageCharts() {
    const selected = usageSeries.filter(series => series.checkbox.checked);
    usageEmpty.hidden = selected.length > 0;
    drawUsagePlot(usagePlot, usageDays, selected);
    if (usageHourPlot) {
        usageHourUnavailable.hidden = firstRecordedHour >= 0;
        usageHourGaps.hidden = firstRecordedHour <= 0 || !selected.length;
        drawUsagePlot(usageHourPlot, usageHourlyPeriods, selected, true);
    }
}

const usageHourDay = document.getElementById('stats-hour-day');
if (usageHourData && usageHourDay) {
    const details = document.getElementById('usage-hour-details');
    const tableBody = details.querySelector('tbody');
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
        tableBody.replaceChildren(...rows);
    }
    usageHourDay.addEventListener('change', showHourValues);
    showHourValues();
    details.hidden = false;
}

usageChart.hidden = false;
usageChart.addEventListener('change', drawUsageCharts);
new ResizeObserver(drawUsageCharts).observe(usageChart);
drawUsageCharts();
