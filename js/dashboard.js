"use strict";

// FIT3179 Data Visualisation 2
// Finishing the Degree — Australian University Completion
//
// Sources:
//   data/completion_rates.csv
//   data/qilt.csv
//
// 13 chart panels; no global filters.
// All visualisations use Vega-Lite.
//
// Advanced idioms included:
//   Heatmap, dumbbell, violin, box plot, parallel coordinates,
//   choropleth map, proportional-symbol map, tile-grid map.

const COMPLETION_URL = "data/completion_rates.csv";
const QILT_URL = "data/qilt.csv";

const STATE_URL =
  "https://raw.githubusercontent.com/rowanhogan/australian-states/master/states.geojson";

const SCHEMA = "https://vega.github.io/schema/vega-lite/v5.json";

const $ = (id) => document.getElementById(id);

let completionData = [];
let qiltData = [];
let stateFeatures = [];

const STATE_MEAN_LEGEND_TITLE = "Mean Positive Rating";

// ------------------------------------------------------------
// 1. CONSISTENT COLOUR SYSTEM
// ------------------------------------------------------------

// Published completion outcomes always use the same colours.
const OUTCOME_ORDER = [
  "Completed",
  "Never returned",
  "Re-enrolled, then left",
  "Still enrolled"
];

const OUTCOME_COLOURS = {
  "Completed": "#0072B2",
  "Never returned": "#D55E00",
  "Re-enrolled, then left": "#E69F00",
  "Still enrolled": "#009E73"
};

// QILT indicators retain their colours wherever indicators
// are encoded categorically.
const INDICATOR_ORDER = [
  "Skills Development",
  "Learner Engagement",
  "Peer Engagement",
  "Teaching Quality and Engagement",
  "Student Support and Services",
  "Learning Resources",
  "Overall Educational Experience"
];

const INDICATOR_COLOURS = {
  "Skills Development": "#167c80",
  "Learner Engagement": "#4978a8",
  "Peer Engagement": "#315f91",
  "Teaching Quality and Engagement": "#e58a47",
  "Student Support and Services": "#bd665b",
  "Learning Resources": "#8064a2",
  "Overall Educational Experience": "#258577"
};

const COLOURS = {
  ink: "#263943",
  muted: "#73838c",
  neutral: "#71818b",
  pale: "#e2ecef",
  grid: "#e6ecef",
  missing: "#edf1f3"
};

const STATE_ABBR = {
  "New South Wales": "NSW",
  "Victoria": "VIC",
  "Queensland": "QLD",
  "South Australia": "SA",
  "Western Australia": "WA",
  "Tasmania": "TAS",
  "Northern Territory": "NT",
  "Australian Capital Territory": "ACT"
};

const GRID_POSITION = {
  "Western Australia": [0, 2],
  "Northern Territory": [2, 0],
  "South Australia": [2, 2],
  "Queensland": [4, 0],
  "New South Wales": [4, 2],
  "Australian Capital Territory": [5, 3],
  "Victoria": [3, 3],
  "Tasmania": [4, 4]
};

// ------------------------------------------------------------
// 2. GENERAL HELPERS
// ------------------------------------------------------------

function textKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normaliseName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^the /, "");
}

function numberValue(value) {
  if (value === null || value === undefined ||
      String(value).trim() === "") {
    return null;
  }

  const result = Number(
    String(value).replace(/[,%$]/g, "").trim()
  );

  return Number.isFinite(result) ? result : null;
}

function uniqueValues(values) {
  return [...new Set(
    values.filter((value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    )
  )];
}

function periodStart(value) {
  const match = String(value ?? "").match(/\b(?:19|20)\d{2}\b/);
  return match ? Number(match[0]) : 0;
}

function periodEnd(value) {
  const matches = String(value ?? "").match(/\b(?:19|20)\d{2}\b/g);

  return matches?.length
    ? Number(matches[matches.length - 1])
    : 0;
}

function normaliseState(value) {
  const aliases = {
    nsw: "New South Wales",
    "new south wales": "New South Wales",
    vic: "Victoria",
    victoria: "Victoria",
    qld: "Queensland",
    queensland: "Queensland",
    sa: "South Australia",
    "south australia": "South Australia",
    wa: "Western Australia",
    "western australia": "Western Australia",
    tas: "Tasmania",
    tasmania: "Tasmania",
    nt: "Northern Territory",
    "northern territory": "Northern Territory",
    act: "Australian Capital Territory",
    "australian capital territory": "Australian Capital Territory"
  };

  return aliases[textKey(value)] || null;
}

function setHeading(id, title) {
  const card = $(id)?.closest(".chart-card");
  const heading = card?.querySelector("h3");

  if (heading) heading.textContent = title;
}

function showEmpty(id, message) {
  // This is reserved for genuine source-data or loading problems.
  // It does not create fabricated chart data.
  const container = $(id);
  if (!container) return;

  container.innerHTML = "";

  const p = document.createElement("p");
  p.className = "note";
  p.textContent = message;

  container.appendChild(p);
}

async function showChart(id, spec, renderer = "svg") {
  try {
    await vegaEmbed(`#${id}`, spec, {
      actions: false,
      renderer
    });
  } catch (error) {
    console.error(`Unable to render ${id}:`, error);
    showEmpty(id, "This visualisation could not be rendered.");
  }
}

function baseSpec(title, values, height = 280) {
  return {
    $schema: SCHEMA,
    title: {
      text: title,
      anchor: "start",
      fontSize: 14,
      color: COLOURS.ink
    },
    width: "container",
    height,
    autosize: {
      type: "fit",
      contains: "padding"
    },
    background: "white",
    data: { values },
    config: {
      view: { stroke: null },
      axis: {
        labelColor: COLOURS.ink,
        titleColor: COLOURS.ink,
        gridColor: COLOURS.grid,
        labelFontSize: 11,
        titleFontSize: 12,
        labelLimit: 180
      },
      legend: {
        labelFontSize: 11,
        titleFontSize: 11
      }
    }
  };
}
function durationColourScale(values) {
  const domain = uniqueValues(values).sort((a, b) => {
    const yearA = Number(String(a).match(/\d+/)?.[0] ?? 0);
    const yearB = Number(String(b).match(/\d+/)?.[0] ?? 0);
    return yearA - yearB;
  });

  // Neutral grayscale for follow-up durations; QILT indicators
  // continue using their own categorical colours.
  const min = 40;
  const max = 150;

  const range = domain.map((_, index) => {
    const value = domain.length === 1
      ? 85
      : Math.round(min + (max - min) * index / (domain.length - 1));

    const hex = value.toString(16).padStart(2, "0");
    return `#${hex}${hex}${hex}`;
  });

  return { domain, range };
}

function indicatorScale(domain = INDICATOR_ORDER) {
  return {
    domain,
    range: domain.map(
      (indicator) => INDICATOR_COLOURS[indicator] || COLOURS.neutral
    )
  };
}

function outcomeScale() {
  return {
    domain: OUTCOME_ORDER,
    range: OUTCOME_ORDER.map(
      (outcome) => OUTCOME_COLOURS[outcome]
    )
  };
}

// ------------------------------------------------------------
// 3. PREPARE COMPLETION DATA
// ------------------------------------------------------------

function prepareCompletion(rows) {
  return rows.map((row) => ({
    ...row,
    section: String(row.section ?? "").trim(),
    provider_scope: String(row.provider_scope ?? "").trim(),
    group: String(row.group ?? "").trim(),
    category: String(row.category ?? "").trim(),
    state: normaliseState(row.state),
    institution: String(row.institution ?? "").trim(),
    duration_label: String(row.duration_label ?? "").trim(),
    duration_years: numberValue(row.duration_years),
    timeframe: String(row.timeframe ?? "").trim(),
    outcome: String(row.outcome ?? "").trim(),
    rate: numberValue(row.rate),
    period_start: periodStart(row.timeframe),
    period_end: periodEnd(row.timeframe)
  })).filter((row) =>
    row.rate !== null &&
    row.duration_years !== null &&
    row.outcome !== ""
  );
}

function outcomeClass(value) {
  const key = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  const outcomeLabels = {
    "completed in any year": "Completed",
    "never came back after the first year": "Never returned",
    "re enrolled but dropped out": "Re-enrolled, then left",
    "still enrolled at the end of the period": "Still enrolled"
  };

  // The CSV's four published outcomes map directly to four
  // concise labels. Preserve an unexpected source value as-is.
  return outcomeLabels[key] ?? String(value ?? "").trim();
}

function isCompleted(row) {
  return outcomeClass(row.outcome) === "Completed";
}

function isExplicitNationalRow(row) {
  return /national total|national level|national aggregate/i.test(
    row.group
  );
}

function isFieldRow(row) {
  const context = [
    row.section,
    row.provider_scope,
    row.group
  ].join(" ");

  if (
    /field of education|study area|field of study|discipline/i.test(context)
  ) {
    return true;
  }

  const knownFields = [
    "natural and physical sciences",
    "information technology",
    "engineering and related technologies",
    "architecture and building",
    "agriculture, environmental and related studies",
    "agriculture and environmental studies",
    "health",
    "education",
    "management and commerce",
    "society and culture",
    "creative arts",
    "food, hospitality and personal services"
  ];

  return knownFields.includes(textKey(row.category));
}

function isInstitutionTypeRow(row) {
  return /institution type|provider type|type of provider|sector type|nuheis/i
    .test(`${row.group} ${row.category}`);
}

function isCharacteristicRow(row) {
  const words =
    /gender|sex|age|indigenous|aboriginal|torres strait|disability|socioeconomic|socio economic|school background|student characteristic|regional|remote|disadvantage|atar|prior education|financial background/i;

  return Boolean(
    words.test(`${row.group} ${row.category}`) &&
    !isFieldRow(row) &&
    !isInstitutionTypeRow(row)
  );
}

function isStateRow(row) {
  return Boolean(row.state) && !row.institution;
}

function isNationalRow(row) {
  if (isExplicitNationalRow(row)) return true;

  return !row.institution &&
    !row.state &&
    !isFieldRow(row) &&
    !isInstitutionTypeRow(row) &&
    !isCharacteristicRow(row) &&
    !row.group;
}

function nationalRows(rows = completionData) {
  const explicit = rows.filter(isExplicitNationalRow);

  if (explicit.length) return explicit;

  const inferred = rows.filter(isNationalRow);

  // Fallback to published completion records if the workbook
  // does not explicitly label national-level rows.
  return inferred.length ? inferred : rows;
}

// Use the most represented published national series where
// multiple populations or categories are present. This prevents
// overlapping populations being mistaken for one time series.

function dominantProfile(rows) {
  if (!rows.length) return [];

  const groups = new Map();

  rows.forEach((row) => {
    const key = [
      row.provider_scope,
      row.group,
      row.category,
      row.state
    ].map(textKey).join("|");

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const profiles = [...groups.values()];

  profiles.sort((a, b) => {
    const scoreA = new Set(
      a.map((r) => `${r.timeframe}|${r.duration_years}|${r.outcome}`)
    ).size;

    const scoreB = new Set(
      b.map((r) => `${r.timeframe}|${r.duration_years}|${r.outcome}`)
    ).size;

    if (scoreB !== scoreA) return scoreB - scoreA;
    return Math.max(...b.map((r) => r.period_end)) -
           Math.max(...a.map((r) => r.period_end));
  });

  return profiles[0];
}

function mainNationalProfile() {
  return dominantProfile(nationalRows());
}

function rowSegment(row) {
  const group = /national total/i.test(row.group) ? "" : row.group;

  return [
    group,
    row.category || row.institution || row.state || "Published total"
  ].filter(Boolean).join(" · ");
}

function seriesKey(row) {
  return [
    row.provider_scope,
    row.group,
    row.category,
    row.state,
    row.institution
  ].map(textKey).join("|");
}

function bestTimeDurationSlice(rows) {
  if (!rows.length) return [];

  const groups = new Map();

  rows.forEach((row) => {
    const key = `${row.timeframe}|${row.duration_years}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const slices = [...groups.values()];

  slices.sort((a, b) => {
    const outcomeDifference =
      new Set(b.map((r) => r.outcome)).size -
      new Set(a.map((r) => r.outcome)).size;

    if (outcomeDifference) return outcomeDifference;

    const endDifference =
      Math.max(...b.map((r) => r.period_end)) -
      Math.max(...a.map((r) => r.period_end));

    if (endDifference) return endDifference;

    return Math.max(...b.map((r) => r.duration_years)) -
           Math.max(...a.map((r) => r.duration_years));
  });

  return slices[0];
}

function bestTimeframe(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    if (!groups.has(row.timeframe)) groups.set(row.timeframe, []);
    groups.get(row.timeframe).push(row);
  });

  const profiles = [...groups.values()];

  profiles.sort((a, b) => {
    const durations =
      new Set(b.map((r) => r.duration_years)).size -
      new Set(a.map((r) => r.duration_years)).size;

    if (durations) return durations;

    return Math.max(...b.map((r) => r.period_end)) -
           Math.max(...a.map((r) => r.period_end));
  });

  return profiles[0] || [];
}

// ------------------------------------------------------------
// 4. PREPARE QILT DATA
// ------------------------------------------------------------

function canonicalIndicator(value) {
  const key = textKey(value);

  if (
    key.includes("overall educational experience") ||
    key.includes("quality of entire educational experience")
  ) {
    return "Overall Educational Experience";
  }

  if (key.includes("skills development")) {
    return "Skills Development";
  }

  if (key.includes("peer engagement")) {
    return "Peer Engagement";
  }

  if (key.includes("learner engagement")) {
    return "Learner Engagement";
  }

  if (key.includes("teaching quality")) {
    return "Teaching Quality and Engagement";
  }

  if (
    key.includes("student support and services") ||
    key === "student support"
  ) {
    return "Student Support and Services";
  }

  if (key.includes("learning resources")) {
    return "Learning Resources";
  }

  return String(value ?? "").trim();
}

function prepareQilt(rows) {
  return rows.map((row) => {
    const rawIndicator = String(row.indicator ?? "").trim();
    const sourceIndicator =
      String(row.indicator_label_source ?? "").trim();

    const mainIndicator = canonicalIndicator(rawIndicator);
    const sourceCanonical = canonicalIndicator(sourceIndicator);

    // Prefer a recognised canonical indicator. If the main column
    // does not identify one, try the original published label.
    const indicator = INDICATOR_ORDER.includes(mainIndicator)
      ? mainIndicator
      : INDICATOR_ORDER.includes(sourceCanonical)
        ? sourceCanonical
        : mainIndicator || sourceCanonical;

    return {
      ...row,
      row_type: textKey(row.row_type),
      provider: String(row.provider ?? "").trim(),
      state: normaliseState(row.state),
      longitude: numberValue(row.longitude),
      latitude: numberValue(row.latitude),
      institution_type: String(row.institution_type ?? "").trim(),
      study_area: String(row.study_area ?? "").trim(),
      indicator,
      indicator_label_source: sourceIndicator,
      survey_year: numberValue(row.survey_year),
      positive_percent: numberValue(row.positive_percent),
      lower_ci: numberValue(row.lower_ci),
      upper_ci: numberValue(row.upper_ci),
      response_count: numberValue(row.response_count),
      study_level: String(row.study_level ?? "").trim(),
      campus_name: String(row.campus_name ?? "").trim(),
      source_sheet: String(row.source_sheet ?? "").trim()
    };
  }).filter((row) => row.positive_percent !== null);
}
function latestYear(rows) {
  const years = rows
    .map((row) => row.survey_year)
    .filter((year) => year !== null);

  return years.length ? Math.max(...years) : null;
}

function latestQiltRows(rows) {
  const year = latestYear(rows);

  return year === null
    ? []
    : rows.filter((row) => row.survey_year === year);
}

function isOverallExperience(row) {
  return row.indicator === "Overall Educational Experience";
}

function isStudentSupport(row) {
  return row.indicator === "Student Support and Services";
}

function providerRows() {
  return qiltData.filter((row) =>
    row.row_type === "provider" &&
    row.provider &&
    row.positive_percent !== null
  );
}

function fieldRows() {
  return qiltData.filter((row) =>
    row.row_type === "field" &&
    row.study_area &&
    textKey(row.study_area) !== "all fields" &&
    row.positive_percent !== null
  );
}

// ------------------------------------------------------------
// 5. CHART 1 — COMPLETION TREND
// ------------------------------------------------------------
async function renderQiltYearSlope() {
  let rows = providerRows().filter(isOverallExperience);

  if (!rows.length) rows = providerRows();

  if (!rows.length) {
    return showEmpty(
      "chart-dumbbell",
      "No provider-level survey observations are available."
    );
  }

  const values = rows.map((row) => ({
    ...row,
    provider_indicator: `${row.provider} | ${row.indicator}`
  }));

  setHeading(
    "chart-dumbbell",
    "How have university experience ratings changed over time?"
  );

  const spec = baseSpec(
    "",
    values,
    310
  );

  spec.mark = {
    type: "line",
    point: true,
    strokeWidth: 1.5,
    opacity: 0.5
  };

  spec.encoding = {
    x: {
      field: "survey_year",
      type: "quantitative",
      title: "Survey year",
      axis: { tickMinStep: 1 }
    },
    y: {
      field: "positive_percent",
      type: "quantitative",
      title: "Positive rating (%)",
      scale: { domain: [0, 100] }
    },
    color: {
      field: "indicator",
      type: "nominal",
      title: "Experience indicator",
      scale: indicatorScale()
    },
    detail: { field: "provider_indicator" },
    order: {
      field: "survey_year",
      type: "quantitative"
    },
    tooltip: [
      { field: "provider", title: "University" },
      { field: "indicator", title: "Indicator" },
      { field: "survey_year", title: "Survey year" },
      { field: "positive_percent", title: "Rating (%)", format: ".1f" }
    ]
  };

  await showChart("chart-dumbbell", spec);
}

async function renderTrend() {
  let rows = dominantProfile(
    nationalRows().filter(isCompleted)
  );

  // If there is no explicit completed-only national profile,
  // show all published completion records of that outcome.
  if (!rows.length) {
    rows = completionData.filter(isCompleted);
  }

  rows = rows.map((row) => ({
    ...row,
    duration_series: row.duration_label || `${row.duration_years} years`
  }));

  const spec = baseSpec(
    "",
    rows,
    280
  );

  spec.mark = { type: "line", point: true, strokeWidth: 2.5 };
  spec.encoding = {
    x: {
      field: "timeframe",
      type: "nominal",
      title: "Published cohort period",
      sort: {
        field: "period_start",
        order: "ascending"
      },
      axis: { labelAngle: -25 }
    },
    y: {
      field: "rate",
      type: "quantitative",
      title: "Completed (%)",
      scale: { domain: [0, 100] }
    },
    color: {
        field: "duration_series",
        type: "nominal",
        title: "Follow-up duration",
        scale: durationColourScale(
            rows.map((row) => row.duration_series)
        )
        },
    detail: {
      field: "duration_series"
    },
    order: {
      field: "period_start",
      type: "quantitative"
    },
    tooltip: [
      { field: "timeframe", title: "Cohort period" },
      { field: "duration_label", title: "Follow-up" },
      { field: "category", title: "Published population" },
      { field: "rate", title: "Completion rate (%)", format: ".2f" }
    ]
  };

  await showChart("chart-trend", spec);
}

// ------------------------------------------------------------
// 6. CHART 2 — COMPLETION BY THE AVAILABLE CATEGORY
// ------------------------------------------------------------

async function renderFieldBars() {
  const completed = completionData.filter(isCompleted);

  let rows = completed.filter(isFieldRow);
  let title = "Completion rates by field of education";
  let label = "category";

  // Display the richest available published slice. No data are
  // manufactured when a field/provider breakdown is unavailable.
  const slice = bestTimeDurationSlice(rows);
  if (slice.length) rows = slice;

  const values = rows.map((row) => ({
    ...row,
    display_category:
      row[label] ||
      row.category ||
      row.group ||
      row.provider_scope ||
      "Published total"
  }));

  setHeading("chart-field", title);

  const spec = baseSpec("", values, Math.max(220, Math.min(390, values.length * 25)));

  spec.mark = { type: "bar", cornerRadiusEnd: 3 };
  spec.encoding = {
    y: {
      field: "display_category",
      type: "nominal",
      title: null,
      sort: "-x"
    },
    x: {
      field: "rate",
      type: "quantitative",
      title: "Completion rate (%)",
      scale: { domain: [0, 100] }
    },
    color: { value: "#167c80" },
    tooltip: [
      { field: "display_category", title: "Published category" },
      { field: "provider_scope", title: "Population covered" },
      { field: "duration_label", title: "Follow-up" },
      { field: "timeframe", title: "Cohort period" },
      { field: "rate", title: "Completion rate (%)", format: ".2f" }
    ]
  };

  await showChart("chart-field", spec);
}

// ------------------------------------------------------------
// 7. CHART 3 — OUTCOMES BY FOLLOW-UP DURATION
// ------------------------------------------------------------


async function renderDurationTrend() {
  // Keep the selected national profile across ALL cohort periods.
  // Do not call bestTimeframe(), which discards other periods.
  const profile = dominantProfile(nationalRows());
  const rows = profile.length ? profile : completionData;

  const values = rows
    .filter((row) =>
      row.duration_years !== null &&
      row.rate !== null &&
      row.outcome !== ""
    )
    .map((row) => ({
      ...row,
      outcome_display: outcomeClass(row.outcome)
    }));

  const spec = baseSpec(
    "",
    values,
    280
  );

  // Different follow-up durations can represent different cohorts.
  // Points avoid implying that these observations belong to one cohort.
  spec.mark = {
    type: "point",
    filled: true,
    size: 85,
    opacity: 0.8
  };

  spec.encoding = {
    x: {
      field: "duration_years",
      type: "quantitative",
      title: "Follow-up duration (years)",
      axis: { tickMinStep: 1 }
    },
    y: {
      field: "rate",
      type: "quantitative",
      title: "Published rate (%)",
      scale: { domain: [0, 100] }
    },
    color: {
      field: "outcome_display",
      type: "nominal",
      title: "Outcome",
      scale: outcomeScale()
    },
    tooltip: [
      { field: "timeframe", title: "Cohort period" },
      { field: "duration_label", title: "Follow-up" },
      { field: "outcome", title: "Published outcome" },
      { field: "rate", title: "Rate (%)", format: ".2f" }
    ]
  };

  await showChart("chart-institution", spec);
}


// ------------------------------------------------------------
// 8. CHART 4 — OUTCOME COMPARISON
// ------------------------------------------------------------

async function renderOutcomes() {
  let rows = bestTimeDurationSlice(
    dominantProfile(nationalRows())
    );

  if (!rows.length) rows = bestTimeDurationSlice(completionData);

  const values = rows.map((row) => ({
    ...row,
    outcome_display: outcomeClass(row.outcome)
  }));

  const spec = baseSpec(
    "",
    values,
    270
  );

  spec.mark = { type: "bar", cornerRadiusEnd: 3 };
  spec.encoding = {
    y: {
      field: "outcome_display",
      type: "nominal",
      title: null,
      sort: OUTCOME_ORDER
    },
    x: {
      field: "rate",
      type: "quantitative",
      title: "Published rate (%)",
      scale: { domain: [0, 100] }
    },
    color: {
      field: "outcome_display",
      type: "nominal",
      title: "Outcome",
      scale: outcomeScale()
    },
    tooltip: [
      { field: "provider_scope", title: "Population" },
      { field: "category", title: "Category" },
      { field: "outcome", title: "Published outcome" },
      { field: "duration_label", title: "Follow-up" },
      { field: "timeframe", title: "Cohort period" },
      { field: "rate", title: "Rate (%)", format: ".2f" }
    ]
  };

  await showChart("chart-outcomes", spec);
}

// ------------------------------------------------------------
// 9. CHART 5 — COMPLETION OUTCOME HEATMAP (ADVANCED)
// ------------------------------------------------------------

async function renderCharacteristics() {
  let rows = completionData.filter((row) =>
    isCharacteristicRow(row) ||
    isFieldRow(row) ||
    isStateRow(row) ||
    isInstitutionTypeRow(row) ||
    Boolean(row.institution)
  );

  let title = "Completion outcomes across published groups";

  if (rows.some(isCharacteristicRow)) {
    rows = rows.filter(isCharacteristicRow);
    title = "Completion outcomes by student characteristics";
  } else if (rows.some(isFieldRow)) {
    rows = rows.filter(isFieldRow);
    title = "Completion outcomes by field of education";
  } else if (rows.some(isStateRow)) {
    rows = rows.filter(isStateRow);
    title = "Completion outcomes by state or territory";
  }

  if (!rows.length) rows = completionData;

  // Pick the cohort/duration containing the richest collection
  // of real published outcomes and group values.
  const slice = bestTimeDurationSlice(rows);
  if (slice.length) rows = slice;

  const values = rows.map((row) => ({
    ...row,
    segment: rowSegment(row),
    outcome_display: outcomeClass(row.outcome)
  }));

  setHeading("chart-characteristics", title);

  const spec = baseSpec("", values, Math.max(
    260,
    Math.min(440, uniqueValues(values.map((r) => r.segment)).length * 25)
  ));

  spec.mark = { type: "rect", cornerRadius: 2 };

  spec.encoding = {
    x: {
      field: "outcome_display",
      type: "nominal",
      title: "Published outcome",
      sort: OUTCOME_ORDER,
      axis: { labelAngle: -25 }
    },
    y: {
      field: "segment",
      type: "nominal",
      title: "Published group",
      sort: "ascending"
    },
    color: {
      field: "rate",
      type: "quantitative",
      title: "Published rate (%)",
      scale: { domain: [0, 100], scheme: "tealblues" }
    },
    tooltip: [
      { field: "provider_scope", title: "Population covered" },
      { field: "group", title: "Published group" },
      { field: "category", title: "Category" },
      { field: "outcome", title: "Published outcome" },
      { field: "duration_label", title: "Follow-up duration" },
      { field: "timeframe", title: "Cohort period" },
      { field: "rate", title: "Rate (%)", format: ".2f" }
    ]
  };

  await showChart("chart-characteristics", spec);
}

// ------------------------------------------------------------
// 10. CHART 6 — DUMBBELL PLOT (ADVANCED)
// ------------------------------------------------------------

function completionDumbbellPairs() {
  const rows = dominantProfile(
    nationalRows().filter(isCompleted)
  );

  // First try to compare different follow-up durations for the
  // same published cohort and population.
  const groups = new Map();

  rows.forEach((row) => {
    const key = `${row.timeframe}|${seriesKey(row)}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const pairs = [];

  for (const group of groups.values()) {
    const durations = [...new Set(
      group.map((r) => r.duration_years)
    )].sort((a, b) => a - b);

    if (durations.length < 2) continue;

    const early = group.find(
      (r) => r.duration_years === durations[0]
    );
    const late = group.find(
      (r) => r.duration_years === durations[durations.length - 1]
    );

    if (!early || !late) continue;

    pairs.push({
      label: rowSegment(early),
      early_rate: early.rate,
      late_rate: late.rate,
      early_label: early.duration_label,
      late_label: late.duration_label,
      early_period: early.timeframe,
      late_period: late.timeframe,
      comparison: "Follow-up duration"
    });
  }

  if (pairs.length) return pairs;

  // Fallback: compare early and late QILT educational-experience
  // ratings for the same university and indicator. This is still
  // a meaningful dumbbell plot and does not fabricate matches.

  const qilt = providerRows().filter(isOverallExperience);
  const qiltGroups = new Map();

  qilt.forEach((row) => {
    const key = normaliseName(row.provider);

    if (!qiltGroups.has(key)) qiltGroups.set(key, []);
    qiltGroups.get(key).push(row);
  });

  const experiencePairs = [];

  for (const group of qiltGroups.values()) {
    const years = [...new Set(
      group.map((r) => r.survey_year)
    )].filter((year) => year !== null).sort((a, b) => a - b);

    if (years.length < 2) continue;

    const early = group.find((r) => r.survey_year === years[0]);
    const late = group.find((r) => r.survey_year === years[years.length - 1]);

    if (!early || !late) continue;

    experiencePairs.push({
      label: early.provider,
      early_rate: early.positive_percent,
      late_rate: late.positive_percent,
      early_label: String(early.survey_year),
      late_label: String(late.survey_year),
      early_period: String(early.survey_year),
      late_period: String(late.survey_year),
      comparison: "Overall educational experience"
    });
  }

  return experiencePairs;
}

async function renderDumbbell() {
  const pairs = completionDumbbellPairs();

  if (!pairs.length) {
    // In standard use, the supplied completion cohort table or
    // repeated QILT provider observations should support the plot.
    return renderQiltYearSlope();
  }

  const points = pairs.flatMap((pair) => [
    {
      ...pair,
      rate: pair.early_rate,
      comparison_label: pair.early_label
    },
    {
      ...pair,
      rate: pair.late_rate,
      comparison_label: pair.late_label
    }
  ]);

  const spec = {
    $schema: SCHEMA,
    title: {
      text: "",
      anchor: "start",
      fontSize: 14,
      color: COLOURS.ink
    },
    width: "container",
    height: Math.max(240, Math.min(390, pairs.length * 24)),
    layer: [
      {
        data: { values: pairs },
        mark: { type: "rule", strokeWidth: 2, color: "#aab7bd" },
        encoding: {
          x: {
            field: "early_rate",
            type: "quantitative",
            title: "Published rate (%)",
            scale: { domain: [0, 100] }
          },
          x2: { field: "late_rate" },
          y: {
            field: "label",
            type: "nominal",
            title: "Published comparison",
            sort: "-x"
          }
        }
      },
      {
        data: { values: points },
        mark: { type: "point", filled: true, size: 85 },
        encoding: {
          x: {
            field: "rate",
            type: "quantitative",
            scale: { domain: [0, 100] }
          },
          y: { field: "label", type: "nominal" },
          color: {
            field: "comparison_label",
            type: "nominal",
            title: "Comparison endpoint",
            scale: {
              range: ["#e58a47", "#167c80"]
            }
          },
          tooltip: [
            { field: "label", title: "Group" },
            { field: "comparison", title: "Measure" },
            { field: "comparison_label", title: "Endpoint" },
            { field: "rate", title: "Rate (%)", format: ".2f" }
          ]
        }
      }
    ],
    config: {
      view: { stroke: null },
      axis: { gridColor: COLOURS.grid }
    }
  };

  await showChart("chart-dumbbell", spec);
}

// ------------------------------------------------------------
// 11. CHART 7 — VIOLIN PLOT (ADVANCED)
// ------------------------------------------------------------

function latestRowsPerIndicator(rows) {
  const latest = new Map();

  rows.forEach((row) => {
    if (row.survey_year === null) return;

    const current = latest.get(row.indicator);

    if (current === undefined || row.survey_year > current) {
      latest.set(row.indicator, row.survey_year);
    }
  });

  return rows.filter((row) =>
    row.survey_year !== null &&
    row.survey_year === latest.get(row.indicator)
  );
}

function latestProviderIndicatorRows() {
  const validRows = qiltData.filter((row) =>
    row.row_type &&
    row.indicator &&
    row.survey_year !== null &&
    row.positive_percent !== null
  );

  const rowsByType = new Map();

  validRows.forEach((row) => {
    if (!rowsByType.has(row.row_type)) {
      rowsByType.set(row.row_type, []);
    }

    rowsByType.get(row.row_type).push(row);
  });

  const candidates = [...rowsByType.entries()].map(
    ([rowType, rows]) => {
      // Field-level data can include an overall aggregate as well
      // as individual study areas. Prefer individual fields when
      // they are available.
      let usableRows = rows;

      if (
        rowType === "field" &&
        rows.some((row) =>
          row.study_area &&
          textKey(row.study_area) !== "all fields"
        )
      ) {
        usableRows = rows.filter((row) =>
          row.study_area &&
          textKey(row.study_area) !== "all fields"
        );
      }

      const latest = latestRowsPerIndicator(usableRows);

      const counts = new Map();

      latest.forEach((row) => {
        counts.set(
          row.indicator,
          (counts.get(row.indicator) || 0) + 1
        );
      });

      const replicatedIndicators = [...counts.values()]
        .filter((count) => count >= 2).length;

      return {
        rowType,
        rows: latest,
        indicatorCount: counts.size,
        replicatedIndicators,
        observationCount: latest.length
      };
    }
  );

  candidates.sort((a, b) =>
    b.replicatedIndicators - a.replicatedIndicators ||
    b.indicatorCount - a.indicatorCount ||
    b.observationCount - a.observationCount
  );

  const selected = candidates[0];

  if (!selected) {
    return {
      year: null,
      scopeLabel: "no eligible QILT records",
      indicators: [],
      rows: []
    };
  }

  const observed = uniqueValues(
    selected.rows.map((row) => row.indicator)
  );

  const indicators = [
    ...INDICATOR_ORDER.filter((indicator) =>
      observed.includes(indicator)
    ),
    ...observed
      .filter((indicator) => !INDICATOR_ORDER.includes(indicator))
      .sort()
  ];

  const index = new Map(
    indicators.map((indicator, i) => [indicator, i])
  );

  return {
    year: latestYear(selected.rows),
    scopeLabel: `QILT ${selected.rowType} data`,
    indicators,
    rows: selected.rows.map((row) => ({
      ...row,
      indicator_display: row.indicator,
      indicator_index: index.get(row.indicator),
      distribution_group: row.provider || row.study_area
    }))
  };
}

async function renderViolin() {
  const dataset = latestProviderIndicatorRows();
  const rows = dataset.rows;
  const indicators = dataset.indicators;

  if (!rows.length || !indicators.length) {
    return showEmpty(
      "chart-cohort-size",
      "No usable QILT indicator observations are available."
    );
  }

  const groups = new Map(
    indicators.map((indicator) => [indicator, []])
  );

  rows.forEach((row) => {
    if (
      groups.has(row.indicator_display) &&
      Number.isFinite(row.positive_percent) &&
      row.positive_percent >= 0 &&
      row.positive_percent <= 100
    ) {
      groups.get(row.indicator_display).push(row);
    }
  });

  const violinValues = [];

  indicators.forEach((indicator, index) => {
    const samples = groups.get(indicator) || [];
    const ratings = samples.map((row) => row.positive_percent);

    // A genuine distribution needs at least two observations.
    if (ratings.length < 2) return;

    const mean = ratings.reduce((sum, value) => sum + value, 0)
      / ratings.length;

    const variance = ratings.reduce(
      (sum, value) => sum + (value - mean) ** 2,
      0
    ) / ratings.length;

    const sd = Math.sqrt(variance);

    const bandwidth = Math.max(
      2.5,
      Math.min(
        10,
        1.06 * (sd || 5) * Math.pow(ratings.length, -0.2)
      )
    );

    const densityPoints = [];

    for (let rating = 0; rating <= 100; rating += 2) {
      let density = 0;

      ratings.forEach((sample) => {
        const z = (rating - sample) / bandwidth;
        density += Math.exp(-0.5 * z * z);
      });

      density /= ratings.length *
        bandwidth *
        Math.sqrt(2 * Math.PI);

      densityPoints.push({ rating, density });
    }

    const maxDensity = Math.max(
      ...densityPoints.map((point) => point.density)
    );

    if (!(maxDensity > 0)) return;

    densityPoints.forEach((point) => {
      const halfWidth = 0.42 * point.density / maxDensity;

      violinValues.push({
        indicator_display: indicator,
        indicator_index: index,
        rating: point.rating,
        rating_start: Math.max(0, point.rating - 1),
        rating_end: Math.min(100, point.rating + 1),
        density: point.density,
        y0: index - halfWidth,
        y1: index + halfWidth,
        sample_size: ratings.length,
        survey_year: Math.max(
            ...samples.map((row) => row.survey_year)
        )
        });
    });
  });

  setHeading(
    "chart-cohort-size",
    `Rating distributions by indicator`
  );

  if (!violinValues.length) {
    return showEmpty(
      "chart-cohort-size",
      "The available data do not contain enough repeated observations to estimate a violin distribution."
    );
  }

  const labelExpression = indicators
    .map((indicator, index) =>
      `datum.value === ${index} ? ${JSON.stringify(indicator)}`
    )
    .join(" : ") + ` : ""`;

  const spec = {
  $schema: SCHEMA,
  width: "container",
  height: Math.max(300, indicators.length * 42),

  title: {
    text: "",
    anchor: "start",
    fontSize: 14,
    color: COLOURS.ink
  },

  data: {
    values: violinValues
  },

  mark: {
    type: "rect",
    clip: true
  },

  encoding: {
    x: {
      field: "rating_start",
      type: "quantitative",
      title: "Positive rating (%)",
      scale: {
        domain: [0, 100],
        nice: false
      },
      axis: {
        values: [0, 20, 40, 60, 80, 100]
      }
    },

    x2: {
      field: "rating_end"
    },

    y: {
      field: "y0",
      type: "quantitative",
      title: "Indicator",
      scale: {
        domain: [-0.5, indicators.length - 0.5],
        reverse: true,
        nice: false
      },
      axis: {
        values: indicators.map((_, index) => index),
        labelExpr: labelExpression,
        labelAngle: 0,
        labelLimit: 240,
        labelOverlap: false,
        tickSize: 0
      }
    },

    y2: {
      field: "y1"
    },

    color: {
      field: "indicator_display",
      type: "nominal",
      scale: indicatorScale(indicators),
      legend: null
    },

    tooltip: [
      {
        field: "indicator_display",
        title: "Indicator"
      },
      {
        field: "rating",
        title: "Rating (%)",
        format: ".1f"
      },
      {
        field: "survey_year",
        title: "Survey year"
      },
      {
        field: "sample_size",
        title: "Observations used"
      },
      {
        field: "density",
        title: "Estimated density",
        format: ".4f"
      }
    ]
  },

  config: {
    view: {
      stroke: null
    },
    axis: {
      labelColor: COLOURS.ink,
      titleColor: COLOURS.ink,
      gridColor: COLOURS.grid,
      labelFontSize: 10,
      titleFontSize: 12
    }
  }
};

await showChart("chart-cohort-size", spec);

  await showChart("chart-cohort-size", spec);
}
// ------------------------------------------------------------
// 12. CHART 8 — QILT BOX PLOT (ADVANCED)
// ------------------------------------------------------------

async function renderQiltIndicators() {
  const dataset = latestProviderIndicatorRows();
  const rows = dataset.rows;

  if (!rows.length) {
    return showEmpty(
      "chart-qilt-indicators",
      "No QILT observations are available for the rating distribution."
    );
  }

  setHeading(
    "chart-qilt-indicators",
    `How do rating distributions vary by indicator?`
  );

  const spec = {
    $schema: SCHEMA,
    title: "",
    width: "container",
    height: 320,
    layer: [
      {
        data: { values: rows },
        mark: { type: "boxplot", extent: 1.5 },
        encoding: {
          x: {
            field: "indicator_display",
            type: "nominal",
            title: null,
            sort: dataset.indicators,
            axis: { labelAngle: -35, labelLimit: 155 }
          },
          y: {
            field: "positive_percent",
            type: "quantitative",
            title: "Positive rating (%)",
            scale: { domain: [0, 100] }
          },
          color: {
            field: "indicator_display",
            type: "nominal",
            scale: indicatorScale(dataset.indicators),
            legend: null
          }
        }
      },
      {
        data: { values: rows },
        mark: {
          type: "circle",
          filled: true,
          size: 28,
          opacity: 0.35
        },
        encoding: {
          x: {
            field: "indicator_display",
            type: "nominal",
            sort: dataset.indicators
          },
          xOffset: { field: "provider", type: "nominal" },
          y: {
            field: "positive_percent",
            type: "quantitative",
            scale: { domain: [0, 100] }
          },
          color: {
            field: "indicator_display",
            type: "nominal",
            scale: indicatorScale(dataset.indicators)
          },
          tooltip: [
            { field: "provider", title: "University" },
            { field: "study_area", title: "Study area" },
            { field: "indicator_label_source", title: "Source indicator" },
            { field: "positive_percent", title: "Rating (%)", format: ".1f" },
            { field: "lower_ci", title: "Lower confidence limit", format: ".1f" },
            { field: "upper_ci", title: "Upper confidence limit", format: ".1f" }
          ]
        }
      }
    ],
    config: {
      view: { stroke: null },
      axis: { gridColor: COLOURS.grid }
    }
  };

  await showChart("chart-qilt-indicators", spec);
}

// ------------------------------------------------------------
// 13. CHART 9 — QILT HEATMAP BY FIELD OR PROVIDER
// ------------------------------------------------------------

async function renderQiltHeatmap() {
  let rows = latestQiltRows(fieldRows());
  let rowLabel = "study_area";
  let heading = "Student-experience ratings by field of education";

  if (!rows.length) {
    rows = latestQiltRows(providerRows());
    rowLabel = "provider";
    heading = "Student-experience ratings by university";
  }

  if (!rows.length) {
    // Institution-type rows can still provide a meaningful
    // published comparison if field and provider records are absent.
    rows = latestQiltRows(qiltData.filter(
      (row) => row.row_type === "institution type"
    ));
    rowLabel = "institution_type";
    heading = "Student-experience ratings by institution type";
  }

  if (!rows.length) {
    return showEmpty(
      "chart-qilt-heatmap",
      "No suitable QILT category-level observations were found."
    );
  }

  const year = latestYear(rows);

  setHeading("chart-qilt-heatmap", `${heading} (${year})`);

  const values = rows.map((row) => ({
    ...row,
    display_group: row[rowLabel] || row.study_area || row.provider,
    indicator_display: row.indicator
  }));

  const spec = baseSpec("", values,
    Math.max(270, Math.min(440, uniqueValues(
      values.map((r) => r.display_group)
    ).length * 22))
  );

  spec.mark = { type: "rect", cornerRadius: 2 };
  spec.encoding = {
    x: {
      field: "indicator_display",
      type: "nominal",
      title: "Experience indicator",
      sort: INDICATOR_ORDER,
      axis: { labelAngle: -35, labelLimit: 150 }
    },
    y: {
      field: "display_group",
      type: "nominal",
      title: null,
      sort: "ascending"
    },
    color: {
        field: "positive_percent",
        type: "quantitative",
        title: "Positive rating (%)",
        scale: {
            domain: [0, 100],
            range: FIELD_EXPERIENCE_RANGE,
            clamp: true
        }
        },
    tooltip: [
      { field: "display_group", title: "Category" },
      { field: "indicator_label_source", title: "Published indicator" },
      { field: "survey_year", title: "Survey year" },
      { field: "positive_percent", title: "Rating (%)", format: ".1f" },
      { field: "lower_ci", title: "Lower confidence limit", format: ".1f" },
      { field: "upper_ci", title: "Upper confidence limit", format: ".1f" }
    ]
  };

  await showChart("chart-qilt-heatmap", spec);
}

// ------------------------------------------------------------
// 14. CHART 10 — PARALLEL COORDINATES (ADVANCED)
// ------------------------------------------------------------

async function renderCompletionExperience() {
  const rows = latestQiltRows(providerRows());
  const counts = new Map();

  rows.forEach((row) => {
    const key = normaliseName(row.provider);
    if (!counts.has(key)) counts.set(key, new Set());
    counts.get(key).add(row.indicator);
  });

  // Keep providers with several published indicator values.
  // Do not join them to completion data unless the source
  // records really identify a common institution or field.
  const eligible = new Set(
    [...counts.entries()]
      .filter(([, indicators]) => indicators.size >= 3)
      .map(([provider]) => provider)
  );

  const index = new Map(
    INDICATOR_ORDER.map((indicator, i) => [indicator, i])
  );

  const values = rows
    .filter((row) => eligible.has(normaliseName(row.provider)))
    .map((row) => ({
      ...row,
      indicator_display: row.indicator,
      indicator_index: index.get(row.indicator)
    }));

  if (!values.length) {
    // Use the field-level indicator profiles if provider records
    // are missing; these remain genuine survey values.
    const fallback = latestQiltRows(fieldRows()).map((row) => ({
      ...row,
      provider: row.study_area,
      indicator_display: row.indicator,
      indicator_index: index.get(row.indicator)
    }));

    if (!fallback.length) {
      return showEmpty(
        "chart-completion-experience",
        "No multi-indicator QILT records are available for comparison."
      );
    }

    setHeading(
      "chart-completion-experience",
      "How do experience indicators compare across fields?"
    );

    const fallbackSpec = baseSpec(
      "",
      fallback,
      320
    );

    fallbackSpec.mark = {
      type: "line",
      strokeWidth: 1.2,
      opacity: 0.45,
      point: { size: 25 }
    };

    fallbackSpec.encoding = {
      x: {
        field: "indicator_display",
        type: "nominal",
        sort: INDICATOR_ORDER,
        title: "Experience indicator",
        axis: { labelAngle: -35 }
      },
      y: {
        field: "positive_percent",
        type: "quantitative",
        title: "Positive rating (%)",
        scale: { domain: [0, 100] }
      },
      detail: { field: "provider" },
      color: { value: COLOURS.neutral },
      order: { field: "indicator_index", type: "quantitative" },
      tooltip: [
        { field: "provider", title: "Field of education" },
        { field: "indicator_display", title: "Indicator" },
        { field: "positive_percent", title: "Rating (%)", format: ".1f" }
      ]
    };

    return showChart("chart-completion-experience", fallbackSpec);
  }

  setHeading(
    "chart-completion-experience",
    `How do indicators compare across universities? (2025))`
  );

  const spec = baseSpec(
    "",
    values,
    330
  );

  spec.mark = {
    type: "line",
    strokeWidth: 1.1,
    opacity: 0.24
  };

  spec.encoding = {
    x: {
      field: "indicator_display",
      type: "nominal",
      title: "Experience indicator",
      sort: INDICATOR_ORDER,
      axis: { labelAngle: -35, labelLimit: 155 }
    },
    y: {
      field: "positive_percent",
      type: "quantitative",
      title: "Positive rating (%)",
      scale: { domain: [0, 100] }
    },
    detail: { field: "provider" },
    order: {
      field: "indicator_index",
      type: "quantitative"
    },
    color: { value: "#4978a8" },
    tooltip: [
      { field: "provider", title: "University" },
      { field: "indicator_display", title: "Indicator" },
      { field: "positive_percent", title: "Rating (%)", format: ".1f" }
    ]
  };

  await showChart("chart-completion-experience", spec);
}

// ------------------------------------------------------------
// 15. GEOJSON
// ------------------------------------------------------------

async function loadStateFeatures() {
  const response = await fetch(STATE_URL);

  if (!response.ok) {
    throw new Error(
      `Unable to load Australian state geometry: HTTP ${response.status}`
    );
  }

  const geojson = await response.json();

  if (!Array.isArray(geojson.features)) {
    throw new Error("Expected a GeoJSON FeatureCollection.");
  }

  const features = geojson.features.map((feature) => {
    const properties = feature.properties || {};

    // Prefer the documented state-name field.
    const rawName =
      properties.STATE_NAME ??
      properties.state_name ??
      properties.STATE ??
      properties.name ??
      properties.NAME_1;

    const stateName = normaliseState(rawName);

    return {
      ...feature,
      properties: {
        ...properties,
        state_norm: stateName
      }
    };
  }).filter((feature) => feature.properties.state_norm);

  console.log(
    "Recognised GeoJSON states:",
    features.map((feature) => ({
      sourceName: feature.properties.STATE_NAME,
      normalisedName: feature.properties.state_norm,
      geometryType: feature.geometry?.type
    }))
  );

  if (features.length < 7) {
    throw new Error(
      `Only ${features.length} Australian state features were recognised. ` +
      "Check the GeoJSON properties and STATE_NAME values."
    );
  }

  return features;
}

// ------------------------------------------------------------
// 16. MAP DATA
// ------------------------------------------------------------

function getMapMetricRows() {
  let rows = providerRows().filter((row) =>
    row.state &&
    row.latitude !== null &&
    row.longitude !== null
  );

  if (!rows.length) return [];

  // Prefer student-support indicators.
  let metricRows = rows.filter(isStudentSupport);
  let metricName = "Student Support and Services";

  // If the chosen worksheet does not contain that indicator,
  // use overall educational experience instead of inventing a
  // support value.
  if (!metricRows.length) {
    metricRows = rows.filter(isOverallExperience);
    metricName = "Overall Educational Experience";
  }

  // Final fallback: use the indicator with the most available
  // mapped records and identify it honestly in the chart titles.
  if (!metricRows.length) {
    const counts = new Map();

    rows.forEach((row) => {
      counts.set(
        row.indicator,
        (counts.get(row.indicator) || 0) + 1
      );
    });

    metricName = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    metricRows = rows.filter((row) => row.indicator === metricName);
  }

  const year = latestYear(metricRows);
  metricRows = metricRows.filter((row) => row.survey_year === year);

  // Retain one row per institution for the selected year/metric.
  const byProvider = new Map();

  metricRows.forEach((row) => {
    const key = normaliseName(row.provider);
    if (!key || byProvider.has(key)) return;

    byProvider.set(key, {
      ...row,
      mapped_state: normaliseState(row.state),
      metric_name: metricName
    });
  });

  return [...byProvider.values()];
}

function summariseStates(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const state = row.mapped_state;
    if (!state) return;

    if (!grouped.has(state)) grouped.set(state, []);
    grouped.get(state).push(row);
  });

  return [...grouped.entries()].map(([state, providers]) => ({
    state,
    state_abbr: STATE_ABBR[state],
    mean_rating:
      providers.reduce((sum, row) => sum + row.positive_percent, 0) /
      providers.length,
    university_count: uniqueValues(
      providers.map((row) => normaliseName(row.provider))
    ).length
  }));
}

function mapProjection() {
  return {
    type: "mercator",
    center: [134, -26],
    scale: 500
  };
}

// ------------------------------------------------------------
// 17. MAP 1 — CHOROPLETH MAP (ADVANCED)
// ------------------------------------------------------------
const FIELD_EXPERIENCE_RANGE = [
  "#fff0d9",
  "#b94700"
];

const INSTITUTION_RATING_RANGE = [
  "#deebf7",
  "#08519c"
];

const STATE_MEAN_RATING_RANGE = [
  "#d1eee7",
  "#00695c"
];

function featuresWithStateSummary(stateSummary) {
  const summaryByState = new Map(
    stateSummary.map((row) => [
      normaliseState(row.state),
      row
    ])
  );

  return stateFeatures.map((feature) => {
    const state = normaliseState(
      feature.properties?.STATE_NAME ??
      feature.properties?.state_norm
    );

    const summary = summaryByState.get(state);

    return {
      ...feature,
      properties: {
        ...(feature.properties || {}),
        state_norm: state,
        mean_rating: summary?.mean_rating ?? null,
        university_count: summary?.university_count ?? 0
      }
    };
  });
}

async function renderChoropleth(stateSummary, metricName) {
  if (!stateFeatures.length) {
    return showEmpty(
      "chart-map-choropleth",
      "Australian state geometry is not available."
    );
  }

  const mappedFeatures = featuresWithStateSummary(stateSummary);

  const spec = {
    $schema: SCHEMA,

    width: "container",
    height: 340,

    projection: mapProjection(),

    data: {
      values: mappedFeatures
    },

    mark: {
      type: "geoshape",
      stroke: "#627984",
      strokeWidth: 0.9
    },

    encoding: {
      color: {
        condition: {
          test: "isValid(datum.properties.mean_rating)",
          field: "properties.mean_rating",
          type: "quantitative",
          title: "Placeholder",
          scale: {
            domain: [0, 100],
            range: STATE_MEAN_RATING_RANGE,
            clamp: true
          },
          legend: {
            title: "Mean Positive Rating"
          }
        },
        value: "#d5e1e7"
      },

      tooltip: [
        {
          field: "properties.state_norm",
          type: "nominal",
          title: "State or territory"
        },
        {
          field: "properties.mean_rating",
          type: "quantitative",
          title: "Mean university rating (%)",
          format: ".1f"
        },
        {
          field: "properties.university_count",
          type: "quantitative",
          title: "Universities represented"
        }
      ]
    },

    config: {
      view: {
        stroke: null
      }
    }
  };


  await showChart("chart-map-choropleth", spec, "canvas");
}

// ------------------------------------------------------------
// 18. MAP 2 — PROPORTIONAL-SYMBOL MAP (ADVANCED)
// ------------------------------------------------------------

async function renderSymbolMap(rows, metricName) {
  if (!stateFeatures.length) {
    return showEmpty(
      "chart-map-symbol",
      "Australian state geometry is not available."
    );
  }

  if (!rows.length) {
    return showEmpty(
      "chart-map-symbol",
      "No universities have usable coordinates and rating observations."
    );
  }

  const spec = {
    $schema: SCHEMA,

    width: "container",
    height: 340,

    projection: mapProjection(),

    layer: [
      {
        data: {
          values: stateFeatures
        },

        mark: {
          type: "geoshape",
          stroke: "#627984",
          strokeWidth: 0.9
        },

        encoding: {
          color: {
            value: "#d5e1e7"
          }
        }
      },

      {
        data: {
          values: rows
        },

        mark: {
          type: "circle",
          filled: true,
          size: 95,
          opacity: 0.9,
          stroke: "#ffffff",
          strokeWidth: 0.8
        },

        encoding: {
          longitude: {
            field: "longitude",
            type: "quantitative"
          },

          latitude: {
            field: "latitude",
            type: "quantitative"
          },

          color: {
            field: "positive_percent",
            type: "quantitative",
            title: `Institution rating (%)`,
            scale: {
                domain: [0, 100],
                range: INSTITUTION_RATING_RANGE,
                clamp: true
            }
            },

          tooltip: [
            {
              field: "provider",
              title: "University"
            },
            {
              field: "campus_name",
              title: "Representative campus"
            },
            {
              field: "state",
              title: "State or territory"
            },
            {
              field: "survey_year",
              title: "Survey year"
            },
            {
              field: "indicator",
              title: "Indicator"
            },
            {
              field: "positive_percent",
              title: "Rating (%)",
              format: ".1f"
            }
          ]
        }
      }
    ],

    config: {
      view: {
        stroke: null
      }
    }
  };

  console.log(
    "Symbol-map coordinate sample:",
    rows.slice(0, 5).map((row) => ({
      university: row.provider,
      longitude: row.longitude,
      latitude: row.latitude,
      state: row.mapped_state,
      rating: row.positive_percent
    }))
  );

  await showChart("chart-map-symbol", spec, "canvas");
}

// ------------------------------------------------------------
// 19. MAP 3 — TILE-GRID MAP (ADVANCED)
// ------------------------------------------------------------

async function renderTileMap(stateSummary, metricName) {
  const lookup = new Map(
    stateSummary.map((row) => [row.state, row])
  );

  const tiles = Object.entries(GRID_POSITION).map(
    ([state, [col, row]]) => {
      const summary = lookup.get(state);

      return {
        state,
        state_abbr: STATE_ABBR[state],
        col,
        row,
        mean_rating: summary?.mean_rating ?? null,
        university_count: summary?.university_count ?? 0
      };
    }
  );

  const spec = {
    $schema: SCHEMA,
    width: "container",
    height: 300,
    data: { values: tiles },
    layer: [
      {
        mark: {
          type: "rect",
          stroke: "white",
          strokeWidth: 3,
          cornerRadius: 5
        },
        encoding: {
          x: {
            field: "col",
            type: "ordinal",
            title: null,
            axis: null,
            sort: [0, 1, 2, 3, 4, 5],
            scale: { paddingInner: 0.08 }
          },
          y: {
            field: "row",
            type: "ordinal",
            title: null,
            axis: null,
            sort: [0, 1, 2, 3, 4],
            scale: { paddingInner: 0.08 }
          },
          color: {
            field: "mean_rating",
            type: "quantitative",
            title: STATE_MEAN_LEGEND_TITLE,
            scale: {
                domain: [0, 100],
                range: STATE_MEAN_RATING_RANGE,
                clamp: true
            }
            },
          tooltip: [
            { field: "state", title: "State or territory" },
            {
              field: "mean_rating",
              title: "Mean university rating (%)",
              format: ".1f"
            },
            {
              field: "university_count",
              title: "Universities represented"
            }
          ]
        }
      },
      {
        mark: {
          type: "text",
          fontSize: 13,
          fontWeight: "bold",
          color: "#18343d"
        },
        encoding: {
          x: {
            field: "col",
            type: "ordinal",
            sort: [0, 1, 2, 3, 4, 5],
            axis: null
          },
          y: {
            field: "row",
            type: "ordinal",
            sort: [0, 1, 2, 3, 4],
            axis: null
          },
          text: { field: "state_abbr" }
        }
      }
    ],
    config: { view: { stroke: null } }
  };

  await showChart("chart-map-tile", spec);
}

// ------------------------------------------------------------
// 20. RENDER THE DASHBOARD
// ------------------------------------------------------------

async function renderDashboard() {
  // All charts select their own suitable rows. There are no
  // shared filters that can remove data from unrelated charts.
  const mapRows = getMapMetricRows();
  const stateSummary = summariseStates(mapRows);
  const metricName = mapRows[0]?.metric_name || "student experience";

  await Promise.all([
    renderTrend(),                   // 1: line chart
    renderFieldBars(),               // 2: bar chart
    renderDurationTrend(),           // 3: multi-line chart
    renderOutcomes(),                // 4: outcome bars
    renderCharacteristics(),         // 5: heatmap
    renderDumbbell(),                // 6: dumbbell
    renderViolin(),                  // 7: violin plot
    renderQiltIndicators(),          // 8: box plot
    renderQiltHeatmap(),             // 9: category heatmap
    renderCompletionExperience(),    // 10: parallel coordinates
    renderChoropleth(stateSummary, metricName), // 11
    renderSymbolMap(mapRows, metricName),       // 12
    renderTileMap(stateSummary, metricName)     // 13
  ]);
}

// ------------------------------------------------------------
// 21. LOAD DATA AND INITIALISE
// ------------------------------------------------------------

async function initialise() {
  const status = $("load-message");

  try {
    status.textContent = "Loading source data...";

    const [completionRows, qiltRows, features] = await Promise.all([
      d3.csv(COMPLETION_URL),
      d3.csv(QILT_URL),
      loadStateFeatures()
    ]);

    completionData = prepareCompletion(completionRows);
    qiltData = prepareQilt(qiltRows);
    console.log("QILT observations by row type and indicator:");

    console.table(
    [...new Set(qiltData.map((row) => row.row_type))].flatMap((type) =>
        [...new Set(
        qiltData
            .filter((row) => row.row_type === type)
            .map((row) => row.indicator)
        )].map((indicator) => ({
        row_type: type,
        indicator,
        observations: qiltData.filter(
            (row) => row.row_type === type &&
                    row.indicator === indicator
        ).length
        }))
    )
    );

    console.log(
    "Matched states:",
    stateFeatures.map((feature) => feature.properties.state_norm)
    );

    console.log(
    "State rating summary:",
    summariseStates(getMapMetricRows())
    );
    stateFeatures = features;

    if (!completionData.length) {
      throw new Error(
        "No valid completion rates were loaded. Check the completion CSV headers and values."
      );
    }

    if (!qiltData.length) {
      throw new Error(
        "No valid QILT percentage values were loaded. Check qilt.csv and its positive_percent column."
      );
    }

    status.textContent = "";
    await renderDashboard();

  } catch (error) {
    console.error(error);

    status.textContent =
      "The dashboard could not load its data. Check the CSV paths, required columns, network connection and browser console.";
  }
}

initialise();