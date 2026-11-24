const usageChart = document.getElementById('usage-chart');
const usageTable = document.getElementById('usage-table') ?? usageChart.nextElementSibling;
const usagePlot = usageChart.querySelector('svg');
const usagePlotContent = usagePlot.querySelector('g');
const usageEmpty = usageChart.querySelector('.stats-chart-empty');
const usageUnavailable = usageChart.querySelector('.stats-chart-unavailable');
const usageNumber = new Intl.NumberFormat('fr-BE');
const usagePeriods = [...usageTable.querySelectorAll('tbody tr')].reverse().map(row => {
    const date = row.querySelector('time');
    return {
        label: date.dataset.short ?? date.textContent.slice(0, 5),
        date: date.textContent,
        current: date.hasAttribute('aria-current'),
        counts: [...row.querySelectorAll('[data-count]')].map(cell => cell.dataset.count === '' ? null : Number(cell.dataset.count)),
    };
});
const usageSeries = [...usageChart.querySelectorAll('[data-metric]')].map((item, index) => ({
    metric: item.dataset.metric,
    label: item.title,
    checkbox: item.querySelector('input'),
    values: usagePeriods.map(period => period.counts[index]),
}));
const usageHasValues = usagePeriods.some(period => period.counts.some(value => value !== null));

function usageSvg(tag, attributes = {}, text = '') {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) {
        node.setAttribute(name, value);
    }
    node.textContent = text;
    return node;
}

function drawUsageChart() {
    const selected = usageSeries.filter(series => series.checkbox.checked);
    const showPlot = usageHasValues && selected.length > 0;
    usageUnavailable?.toggleAttribute('hidden', usageHasValues);
    usageEmpty.hidden = !usageHasValues || selected.length > 0;
    usagePlot.toggleAttribute('hidden', !showPlot);
    if (!showPlot) {
        usagePlotContent.replaceChildren();
        return;
    }

    const width = usagePlot.clientWidth;
    const height = usagePlot.clientHeight;
    if (!width || !height) {
        return;
    }
    usagePlot.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    const maximum = Math.max(1, ...selected.flatMap(series => series.values));
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
    const lastIndex = usagePeriods.length - 1;
    const x = index => Math.round(lastIndex ? left + (right - left) * index / lastIndex : (left + right) / 2);
    const y = count => Math.round(bottom - (bottom - top) * count / limit);
    const content = document.createDocumentFragment();

    const current = usagePeriods.findIndex(period => period.current);
    if (current >= 0) {
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
    const labelStep = Math.max(1, Math.ceil(lastIndex / Math.max(1, Math.floor((right - left) / 36))));
    for (const [index, period] of usagePeriods.entries()) {
        if (index !== 0 && index !== lastIndex && (index % labelStep !== 0 || lastIndex - index < labelStep)) {
            continue;
        }
        const position = x(index);
        content.append(
            usageSvg('line', {class: 'stats-chart-grid', x1: position, x2: position, y1: top, y2: bottom}),
            usageSvg('text', {class: 'stats-chart-label', x: position, y: bottom + 21, 'text-anchor': 'middle'}, period.label),
        );
    }
    for (const {metric, label, values} of selected) {
        const group = usageSvg('g', {'data-metric': metric});
        const points = values.flatMap((value, index) => value === null ? [] : [x(index) + ',' + y(value)]);
        group.append(usageSvg('polyline', {class: 'stats-chart-line', fill: 'none', points: points.join(' ')}));
        for (const [index, value] of values.entries()) {
            if (value === null) {
                continue;
            }
            const point = usageSvg('circle', {class: 'stats-chart-point', cx: x(index), cy: y(value), r: 3.5});
            point.append(usageSvg('title', {}, label + ' · ' + usagePeriods[index].date + ' · ' + usageNumber.format(value)));
            group.append(point);
        }
        content.append(group);
    }
    usagePlotContent.replaceChildren(content);
}

usageChart.hidden = false;
usageChart.addEventListener('change', drawUsageChart);
new ResizeObserver(drawUsageChart).observe(usagePlot);
drawUsageChart();
