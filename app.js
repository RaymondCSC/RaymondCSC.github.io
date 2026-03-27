const DATA_PATH = "tables_V2.0/Ad_table.csv";

const svg = d3.select("#chart");
const tooltip = d3.select("#tooltip");
const legendContainer = d3.select("#legend");

const makerSelect = d3.select("#makerSelect");
const bodytypeSelect = d3.select("#bodytypeSelect");
const yearFieldSelect = d3.select("#yearFieldSelect");
const topNSelect = d3.select("#topNSelect");
const drilldownModeSelect = d3.select("#drilldownModeSelect");
const backButton = d3.select("#backButton");

const recordCountEl = d3.select("#recordCount");
const yearRangeEl = d3.select("#yearRange");
const filterSummaryEl = d3.select("#filterSummary");
const viewBadgeEl = d3.select("#viewBadge");
const hintTextEl = d3.select("#hintText");

const WIDTH = 1280;
const HEIGHT = 680;
const margin = { top: 30, right: 30, bottom: 58, left: 75 };
const innerWidth = WIDTH - margin.left - margin.right;
const innerHeight = HEIGHT - margin.top - margin.bottom;

const gRoot = svg.append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const gGrid = gRoot.append("g").attr("class", "grid");
const gAreas = gRoot.append("g");
const gAxisX = gRoot.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`);
const gAxisY = gRoot.append("g").attr("class", "axis");
const gTitle = gRoot.append("text")
  .attr("x", 0)
  .attr("y", -10)
  .attr("font-size", 15)
  .attr("font-weight", 700);

const noDataText = gRoot.append("text")
  .attr("class", "no-data")
  .attr("x", innerWidth / 2)
  .attr("y", innerHeight / 2)
  .style("display", "none")
  .text("No data for the selected filters.");

const colorPalette = {
  White: "#f2f2f2",
  Black: "#1f1f1f",
  Gray: "#7f7f7f",
  Silver: "#c0c0c0",
  Blue: "#3b6fb6",
  Red: "#c73a3a",
  Green: "#3f8f5a",
  Yellow: "#d8b400",
  Orange: "#e68a2e",
  Brown: "#8b5a3c",
  Beige: "#c8b48a",
  Gold: "#b59a30",
  Purple: "#7d59a5",
  Pink: "#d97aa6",
  Other: "#9aa0a6"
};

let rawData = [];
let xScale = d3.scaleLinear();
let yScale = d3.scaleLinear();

const state = {
  view: "main",          // "main" or "drilldown"
  selectedColor: null
};

function cleanString(value) {
  return (value ?? "").toString().trim();
}

function parseYear(value) {
  const y = +value;
  if (!Number.isFinite(y)) return null;
  if (y < 1990 || y > 2035) return null;
  return y;
}

function canonicalizeColor(raw) {
  const c = cleanString(raw).toLowerCase();

  if (!c || c === "null" || c === "nan" || c === "n/a" || c === "unknown") {
    return "Other";
  }

  if (/(white|ivory|cream)/.test(c)) return "White";
  if (/(black|ebony)/.test(c)) return "Black";
  if (/(silver)/.test(c)) return "Silver";
  if (/(grey|gray|graphite|charcoal|gunmetal)/.test(c)) return "Gray";
  if (/(blue|navy|azure|teal)/.test(c)) return "Blue";
  if (/(red|burgundy|maroon|crimson)/.test(c)) return "Red";
  if (/(green|olive|lime)/.test(c)) return "Green";
  if (/(yellow)/.test(c)) return "Yellow";
  if (/(orange|amber|bronze|copper)/.test(c)) return "Orange";
  if (/(brown|mocha|chocolate)/.test(c)) return "Brown";
  if (/(beige|sand|champagne|taupe)/.test(c)) return "Beige";
  if (/(gold)/.test(c)) return "Gold";
  if (/(purple|violet|plum)/.test(c)) return "Purple";
  if (/(pink|rose)/.test(c)) return "Pink";

  return "Other";
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => d3.ascending(a, b));
}

function populateSelect(select, values, defaultLabel = "All") {
  const options = [{ value: "All", label: defaultLabel }, ...values.map(v => ({ value: v, label: v }))];

  select.selectAll("option")
    .data(options)
    .join("option")
    .attr("value", d => d.value)
    .text(d => d.label);
}

function getFilteredData() {
  const selectedMaker = makerSelect.property("value");
  const selectedBody = bodytypeSelect.property("value");

  return rawData.filter(d => {
    const makerMatch = selectedMaker === "All" || d.Maker === selectedMaker;
    const bodyMatch = selectedBody === "All" || d.Bodytype === selectedBody;
    return makerMatch && bodyMatch;
  });
}

function buildMainSeries(filtered, yearField, topN) {
  const valid = filtered
    .map(d => ({
      year: d[yearField],
      color: d.colorGroup
    }))
    .filter(d => d.year !== null && d.color);

  if (!valid.length) {
    return { stacked: [], years: [], keys: [], rows: [], totalCount: 0 };
  }

  const years = uniqueSorted(valid.map(d => d.year));
  const colorCountsOverall = d3.rollup(valid, v => v.length, d => d.color);

  let keys = Array.from(colorCountsOverall.entries())
    .sort((a, b) => d3.descending(a[1], b[1]))
    .map(d => d[0]);

  if (topN < 999 && keys.length > topN) {
    const topKeys = new Set(keys.slice(0, topN));
    valid.forEach(d => {
      d.groupKey = topKeys.has(d.color) ? d.color : "Other";
    });
    keys = [...keys.slice(0, topN), "Other"];
  } else {
    valid.forEach(d => {
      d.groupKey = d.color;
    });
  }

  const countMap = d3.rollup(valid, v => v.length, d => d.year, d => d.groupKey);

  const rows = years.map(year => {
    const row = { year };
    const yearMap = countMap.get(year) || new Map();

    keys.forEach(key => {
      row[key] = yearMap.get(key) || 0;
    });

    const total = d3.sum(keys, key => row[key]);
    keys.forEach(key => {
      row[key] = total > 0 ? row[key] / total : 0;
    });

    row.totalCount = total;
    return row;
  });

  const stack = d3.stack()
    .keys(keys)
    .offset(d3.stackOffsetSilhouette)
    .order(d3.stackOrderInsideOut);

  const stacked = stack(rows);

  return { stacked, years, keys, rows, totalCount: valid.length };
}

function buildDrilldownSeries(filtered, yearField, selectedColor, dimension) {
  const valid = filtered
    .filter(d => d.colorGroup === selectedColor)
    .map(d => ({
      year: d[yearField],
      subgroup: cleanString(d[dimension]) || "Unknown"
    }))
    .filter(d => d.year !== null && d.subgroup);

  if (!valid.length) {
    return { stacked: [], years: [], keys: [], rows: [], totalCount: 0 };
  }

  const years = uniqueSorted(valid.map(d => d.year));
  const subgroupCounts = d3.rollup(valid, v => v.length, d => d.subgroup);

  let keys = Array.from(subgroupCounts.entries())
    .sort((a, b) => d3.descending(a[1], b[1]))
    .map(d => d[0]);

  const maxGroups = 12;
  if (keys.length > maxGroups) {
    const topKeys = new Set(keys.slice(0, maxGroups));
    valid.forEach(d => {
      d.groupKey = topKeys.has(d.subgroup) ? d.subgroup : "Other";
    });
    keys = [...keys.slice(0, maxGroups), "Other"];
  } else {
    valid.forEach(d => {
      d.groupKey = d.subgroup;
    });
  }

  const countMap = d3.rollup(valid, v => v.length, d => d.year, d => d.groupKey);

  const rows = years.map(year => {
    const row = { year };
    const yearMap = countMap.get(year) || new Map();

    keys.forEach(key => {
      row[key] = yearMap.get(key) || 0;
    });

    const total = d3.sum(keys, key => row[key]);
    keys.forEach(key => {
      row[key] = total > 0 ? row[key] / total : 0;
    });

    row.totalCount = total;
    return row;
  });

  const stack = d3.stack()
    .keys(keys)
    .offset(d3.stackOffsetSilhouette)
    .order(d3.stackOrderInsideOut);

  const stacked = stack(rows);

  return { stacked, years, keys, rows, totalCount: valid.length };
}

function getShadedColorScale(baseColor, keys) {
  const n = Math.max(keys.length, 1);

  if (baseColor.toLowerCase() === "#f2f2f2") {
    return d3.scaleOrdinal()
      .domain(keys)
      .range(keys.map((_, i) => d3.interpolateRgb("#d9d9d9", "#ffffff")(n === 1 ? 0.7 : i / (n - 1))));
  }

  return d3.scaleOrdinal()
    .domain(keys)
    .range(keys.map((_, i) => d3.interpolateRgb("#e8edf5", baseColor)(n === 1 ? 0.75 : 0.25 + (0.7 * i / (n - 1)))));
}

function renderLegend(keys, fillAccessor) {
  legendContainer.selectAll("*").remove();

  const items = legendContainer.selectAll(".legend-item")
    .data(keys)
    .enter()
    .append("div")
    .attr("class", "legend-item");

  items.append("div")
    .attr("class", "legend-swatch")
    .style("background", d => fillAccessor(d));

  items.append("div")
    .text(d => d);
}

function setAxes(years, stacked) {
  xScale = d3.scaleLinear()
    .domain(d3.extent(years))
    .range([0, innerWidth]);

  const yMin = d3.min(stacked, series => d3.min(series, d => d[0]));
  const yMax = d3.max(stacked, series => d3.max(series, d => d[1]));

  yScale = d3.scaleLinear()
    .domain([yMin, yMax])
    .range([innerHeight, 0]);

  const maxAbs = Math.max(Math.abs(yMin), Math.abs(yMax));
  const pctTicks = d3.range(-0.5, 0.51, 0.1).filter(v => Math.abs(v) <= maxAbs + 1e-6);

  gGrid.call(
    d3.axisLeft(yScale)
      .tickValues(pctTicks)
      .tickSize(-innerWidth)
      .tickFormat("")
  );

  gAxisX.call(
    d3.axisBottom(xScale)
      .ticks(Math.min(10, years.length))
      .tickFormat(d3.format("d"))
  );

  gAxisY.call(
    d3.axisLeft(yScale)
      .tickValues(pctTicks)
      .tickFormat(d => `${Math.round(Math.abs(d) * 100)}%`)
  );
}

function areaGenerator() {
  return d3.area()
    .x(d => xScale(d.data.year))
    .y0(d => yScale(d[0]))
    .y1(d => yScale(d[1]))
    .curve(d3.curveCatmullRom.alpha(0.5));
}

function applyLayerInteractions(selection, rows, mode, extra) {
  selection
    .on("mousemove", function(event, series) {
      const [mx] = d3.pointer(event, gAreas.node());
      const hoveredYear = Math.round(xScale.invert(mx));

      const nearestRow = rows.reduce((best, row) => {
        return Math.abs(row.year - hoveredYear) < Math.abs(best.year - hoveredYear) ? row : best;
      }, rows[0]);

      const share = nearestRow[series.key] || 0;

      d3.selectAll("path.stream-layer").attr("opacity", 0.2);
      d3.select(this).attr("opacity", 1);

      let html = `
        <div><strong>${series.key}</strong></div>
        <div>Year: ${nearestRow.year}</div>
        <div>Share: ${(share * 100).toFixed(1)}%</div>
        <div>Records that year: ${d3.format(",")(nearestRow.totalCount)}</div>
      `;

      if (mode === "main") {
        html += `<div>Click to drill down by ${drilldownModeSelect.property("value")}</div>`;
      } else {
        html += `<div>Within color: <strong>${extra.selectedColor}</strong></div>`;
      }

      tooltip
        .style("opacity", 1)
        .style("left", `${event.clientX + 14}px`)
        .style("top", `${event.clientY + 14}px`)
        .html(html);
    })
    .on("mouseleave", function() {
      d3.selectAll("path.stream-layer").attr("opacity", 0.96);
      tooltip.style("opacity", 0);
    });

  if (mode === "main") {
    selection
      .style("cursor", "pointer")
      .on("click", function(event, series) {
        state.view = "drilldown";
        state.selectedColor = series.key;
        tooltip.style("opacity", 0);
        render();
      });
  } else {
    selection.style("cursor", "default");
  }
}

function renderMainView(filtered, yearField, topN) {
  const result = buildMainSeries(filtered, yearField, topN);
  const { stacked, years, keys, rows, totalCount } = result;

  if (!years.length || !stacked.length) {
    yearRangeEl.text("");
    recordCountEl.text("Records in current view: 0");
    noDataText.style("display", null);
    gAreas.selectAll("path.stream-layer").remove();
    gGrid.selectAll("*").remove();
    gAxisX.selectAll("*").remove();
    gAxisY.selectAll("*").remove();
    renderLegend([], () => "#ccc");
    return;
  }

  noDataText.style("display", "none");

  recordCountEl.text(`Records in current view: ${d3.format(",")(totalCount)}`);
  yearRangeEl.text(`Year range: ${years[0]}–${years[years.length - 1]}`);

  setAxes(years, stacked);

  gTitle.text(
    `Main palette using ${yearField === "Reg_year" ? "Registration Year" : "Advertisement Year"}`
  );

  const area = areaGenerator();

  const layers = gAreas.selectAll("path.stream-layer")
    .data(stacked, d => d.key)
    .join(
      enter => enter.append("path")
        .attr("class", "stream-layer")
        .attr("fill", d => colorPalette[d.key] || colorPalette.Other)
        .attr("stroke", "rgba(0,0,0,0.16)")
        .attr("stroke-width", 0.8)
        .attr("opacity", 0.96)
        .attr("d", area),
      update => update
        .transition()
        .duration(700)
        .attr("fill", d => colorPalette[d.key] || colorPalette.Other)
        .attr("d", area),
      exit => exit.remove()
    );

  // Rebind handlers every update so tooltip uses the current filtered rows
  applyLayerInteractions(gAreas.selectAll("path.stream-layer"), rows, "main", {});

  renderLegend(keys, d => colorPalette[d] || colorPalette.Other);
}

function renderDrilldownView(filtered, yearField) {
  const dimension = drilldownModeSelect.property("value");
  const selectedColor = state.selectedColor;
  const result = buildDrilldownSeries(filtered, yearField, selectedColor, dimension);
  const { stacked, years, keys, rows, totalCount } = result;

  if (!years.length || !stacked.length) {
    yearRangeEl.text("");
    recordCountEl.text(`No records for ${selectedColor} in current filters`);
    noDataText.style("display", null).text(`No ${selectedColor} records for this drilldown.`);
    gAreas.selectAll("path.stream-layer").remove();
    gGrid.selectAll("*").remove();
    gAxisX.selectAll("*").remove();
    gAxisY.selectAll("*").remove();
    renderLegend([], () => "#ccc");
    return;
  }

  noDataText.style("display", "none").text("No data for the selected filters.");

  recordCountEl.text(`Records in drilldown: ${d3.format(",")(totalCount)}`);
  yearRangeEl.text(`Year range: ${years[0]}–${years[years.length - 1]}`);

  setAxes(years, stacked);

  const baseColor = colorPalette[selectedColor] || colorPalette.Other;
  const shadedScale = getShadedColorScale(baseColor, keys);

  gTitle.text(
    `${selectedColor} palette drilldown by ${dimension === "Bodytype" ? "Body Type" : "Maker"}`
  );

  const area = areaGenerator();

  gAreas.selectAll("path.stream-layer")
    .data(stacked, d => d.key)
    .join(
      enter => enter.append("path")
        .attr("class", "stream-layer")
        .attr("fill", d => shadedScale(d.key))
        .attr("stroke", "rgba(0,0,0,0.16)")
        .attr("stroke-width", 0.8)
        .attr("opacity", 0.96)
        .attr("d", area),
      update => update
        .transition()
        .duration(700)
        .attr("fill", d => shadedScale(d.key))
        .attr("d", area),
      exit => exit.remove()
    );

  applyLayerInteractions(gAreas.selectAll("path.stream-layer"), rows, "drilldown", { selectedColor });

  renderLegend(keys, d => shadedScale(d));
}

function render() {
  const filtered = getFilteredData();
  const yearField = yearFieldSelect.property("value");
  const topN = +topNSelect.property("value");

  const selectedMaker = makerSelect.property("value");
  const selectedBody = bodytypeSelect.property("value");

  filterSummaryEl.text(`Maker: ${selectedMaker} | Body Type: ${selectedBody}`);

  if (state.view === "main") {
    viewBadgeEl.text("Main palette view");
    hintTextEl.text("Tip: click a color ribbon to drill down.");
    backButton.property("disabled", true);
    renderMainView(filtered, yearField, topN);
  } else {
    viewBadgeEl.text(`Drilldown view — ${state.selectedColor}`);
    hintTextEl.text(`Showing the selected color split by ${drilldownModeSelect.property("value")}. Use Back to return.`);
    backButton.property("disabled", false);
    renderDrilldownView(filtered, yearField);
  }
}

function prepareData(data) {
  rawData = data.map(d => ({
    Maker: cleanString(d.Maker) || "Unknown",
    Bodytype: cleanString(d.Bodytype) || "Unknown",
    Color: cleanString(d.Color),
    Reg_year: parseYear(d.Reg_year),
    Adv_year: parseYear(d.Adv_year),
    colorGroup: canonicalizeColor(d.Color)
  }))
  .filter(d => d.Reg_year !== null || d.Adv_year !== null);

  const makers = uniqueSorted(rawData.map(d => d.Maker).filter(Boolean));
  const bodytypes = uniqueSorted(rawData.map(d => d.Bodytype).filter(Boolean));

  populateSelect(makerSelect, makers, "All Makers");
  populateSelect(bodytypeSelect, bodytypes, "All Body Types");

  makerSelect.on("change", () => render());
  bodytypeSelect.on("change", () => render());
  yearFieldSelect.on("change", () => render());
  topNSelect.on("change", () => render());

  drilldownModeSelect.on("change", () => {
    if (state.view === "drilldown") render();
  });

  backButton.on("click", () => {
    state.view = "main";
    state.selectedColor = null;
    tooltip.style("opacity", 0);
    render();
  });

  render();
}

function showError(message) {
  gAreas.selectAll("*").remove();
  gGrid.selectAll("*").remove();
  gAxisX.selectAll("*").remove();
  gAxisY.selectAll("*").remove();
  noDataText
    .style("display", null)
    .text(message);
  recordCountEl.text("Failed to load data");
  yearRangeEl.text("");
  filterSummaryEl.text("");
}

d3.csv(DATA_PATH)
  .then(prepareData)
  .catch(error => {
    console.error(error);
    showError("Could not load CSV. Check the file path and run with a local server.");
  });