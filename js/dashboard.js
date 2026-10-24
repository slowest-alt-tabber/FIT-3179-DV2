"use strict";

const CHARTS = [
  { id: "chart-trend", path: "js/chart1_trend.json" },
  { id: "chart-field", path: "js/chart2_field.json" },
  { id: "chart-institution", path: "js/chart3_duration_trend.json" },
  { id: "chart-outcomes", path: "js/chart4_outcomes.json" },
  { id: "chart-characteristics", path: "js/chart5_characteristics.json" },
  { id: "chart-dumbbell", path: "js/chart6_dumbbell.json" },
  { id: "chart-qilt-indicators", path: "js/chart8_qilt_indicators.json" },
  { id: "chart-qilt-heatmap", path: "js/chart9_qilt_heatmap.json" },
  { id: "chart-completion-experience", path: "js/chart10_parallel_coords.json" },
  {
    id: "chart-map-choropleth",
    path: "js/chart11_choropleth.json",
    renderer: "canvas"
  },
  {
    id: "chart-map-symbol",
    path: "js/chart12_symbol_map.json",
    renderer: "canvas"
  },
  { id: "chart-map-tile", path: "js/chart13_tile_map.json" }
];

async function embedChart(chart) {
  const container = document.getElementById(chart.id);

  if (!container) {
    console.warn(`Missing chart container: ${chart.id}`);
    return false;
  }

  try {
    const response = await fetch(chart.path);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${chart.path}`);
    }

    const spec = await response.json();

    await vegaEmbed(container, spec, {
      actions: false,
      renderer: chart.renderer || "svg"
    });

    return true;
  } catch (error) {
    console.error(`Unable to render ${chart.id}:`, error);

    const message = document.createElement("p");
    message.className = "chart-error";
    message.textContent =
      "This chart could not load. Please refresh the page.";

    container.replaceChildren(message);
    return false;
  }
}

async function embedCharts() {
  const status = document.getElementById("load-message");

  if (status) {
    status.textContent = "Loading charts…";
  }

  const results = await Promise.all(CHARTS.map(embedChart));
  const failed = results.filter((success) => !success).length;

  if (status) {
    status.textContent = failed
      ? `${failed} chart(s) could not load. Please refresh.`
      : "";
  }
}

document.addEventListener("DOMContentLoaded", embedCharts);