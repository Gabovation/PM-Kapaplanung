export function readPolytecChartTheme(root = document.documentElement) {
  const styles = getComputedStyle(root);
  const value = (name) => styles.getPropertyValue(name).trim();
  return {
    series: [1, 2, 3, 4, 5].map((index) => value(`--polytec-chart-series-${index}`)),
    focus: value("--polytec-chart-series-focus"),
    text: value("--polytec-color-text-primary"),
    secondaryText: value("--polytec-color-text-secondary"),
    grid: value("--polytec-color-border-default"),
    panel: value("--polytec-color-surface-panel"),
  };
}

/**
 * Shared Chart.js options. Applications provide data, units and domain labels;
 * this helper owns token colors, legend treatment, tooltip behavior and axes.
 */
export function createPolytecChartOptions({
  root = document.documentElement,
  stacked = false,
  legend = "bottom",
  unit = "",
  valueFormatter = (value) => `${value}${unit}`,
  tooltipTitle = (items) => items[0]?.label || "",
} = {}) {
  const theme = readPolytecChartTheme(root);
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: legend !== "none",
        position: legend,
        labels: {
          color: theme.text,
          boxWidth: 12,
          boxHeight: 12,
          padding: 16,
          usePointStyle: true,
          pointStyle: "rectRounded",
          font: { family: "Quicksand, Segoe UI, sans-serif", weight: "600" },
        },
      },
      tooltip: {
        enabled: true,
        displayColors: true,
        backgroundColor: theme.text,
        titleColor: theme.panel,
        bodyColor: theme.panel,
        padding: 12,
        cornerRadius: 4,
        callbacks: {
          title: tooltipTitle,
          label: (context) => `${context.dataset.label}: ${valueFormatter(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { stacked, ticks: { color: theme.secondaryText }, grid: { color: theme.grid } },
      y: {
        stacked,
        beginAtZero: true,
        ticks: { color: theme.secondaryText, callback: valueFormatter },
        grid: { color: theme.grid },
      },
    },
  };
}

export function createPolytecDataset({ label, data, index = 0, type = "line", root } = {}) {
  const theme = readPolytecChartTheme(root);
  const color = theme.series[index % theme.series.length];
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: type === "line" ? 2.5 : 0,
    pointRadius: type === "line" ? 3 : 0,
    pointHoverRadius: type === "line" ? 5 : 0,
    borderRadius: type === "bar" ? 3 : 0,
  };
}
