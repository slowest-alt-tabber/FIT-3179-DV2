"use strict";

const CHARTS = [
  { id: "chart-trend", path: "js/chart1_trend.json" },
  { id: "chart-field", path: "js/chart2_field.json" },
  { id: "chart-institution", path: "js/chart3_duration_trend.json" },
  { id: "chart-outcomes", path: "js/chart4_outcomes.json" },
  { id: "chart-characteristics", path: "js/chart5_characteristics.json" },
  { id: "chart-dumbbell", path: "js/chart6_dumbbell.json" },
  { id: "chart-cohort-size", path: "js/chart7_violin.json" },
  { id: "chart-qilt-indicators", path: "js/chart8_qilt_indicators.json" },
  { id: "chart-qilt-heatmap", path: "js/chart9_qilt_heatmap.json" },
  { id: "chart-completion-experience", path: "js/chart10_parallel_coords.json" },
  { id: "chart-map-choropleth", path: "js/chart11_choropleth.json", renderer: "canvas" },
  { id: "chart-map-symbol", path: "js/chart12_symbol_map.json", renderer: "canvas" },
  { id: "chart-map-tile", path: "js/chart13_tile_map.json" }
];

async function embedCharts() {
  const statusEl = document.getElementById("load-message");
  if (statusEl) statusEl.textContent = "Loading visualizations...";

  const embedPromises = CHARTS.map(async (item) => {
    try {
      await vegaEmbed(`#${item.id}`, item.path, {
        actions: false,
        renderer: item.renderer || "svg"
      });
    } catch (error) {
      console.error(`Error rendering chart #${item.id} from ${item.path}:`, error);
      const container = document.getElementById(item.id);
      if (container) {
        container.innerHTML = `<p class="note">Unable to render visualization from ${item.path}.</p>`;
      }
    }
  });

  await Promise.all(embedPromises);
  if (statusEl) statusEl.textContent = "";
}

document.addEventListener("DOMContentLoaded", embedCharts);