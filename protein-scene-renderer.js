/* protein-scene-renderer.js */

(function (global) {
  "use strict";

  const COLORS = {
    sapi: "#5A7A52",
    ayam: "#C9952A",
    telur: "#C4522A"
  };

  const LABELS = {
    sapi: "Daging Sapi",
    ayam: "Daging Ayam",
    telur: "Telur Ayam"
  };
  const PROVINCE_ISLAND = {
    "Aceh": "Sumatera",
    "Sumatera Utara": "Sumatera",
    "Sumatera Barat": "Sumatera",
    "Riau": "Sumatera",
    "Kepulauan Riau": "Sumatera",
    "Jambi": "Sumatera",
    "Sumatera Selatan": "Sumatera",
    "Bangka Belitung": "Sumatera",
    "Bengkulu": "Sumatera",
    "Lampung": "Sumatera",
    "DKI Jakarta": "Jawa",
    "Jawa Barat": "Jawa",
    "Banten": "Jawa",
    "Jawa Tengah": "Jawa",
    "DI Yogyakarta": "Jawa",
    "Jawa Timur": "Jawa",
    "Bali": "Bali & Nusa",
    "Nusa Tenggara Barat": "Bali & Nusa",
    "Nusa Tenggara Timur": "Bali & Nusa",
    "Kalimantan Barat": "Kalimantan",
    "Kalimantan Tengah": "Kalimantan",
    "Kalimantan Selatan": "Kalimantan",
    "Kalimantan Timur": "Kalimantan",
    "Kalimantan Utara": "Kalimantan",
    "Sulawesi Utara": "Sulawesi",
    "Gorontalo": "Sulawesi",
    "Sulawesi Tengah": "Sulawesi",
    "Sulawesi Barat": "Sulawesi",
    "Sulawesi Selatan": "Sulawesi",
    "Sulawesi Tenggara": "Sulawesi",
    "Maluku": "Maluku & Papua",
    "Maluku Utara": "Maluku & Papua",
    "Papua Barat": "Maluku & Papua",
    "Papua": "Maluku & Papua"
  };
  const ISLAND_COLORS = {
    "Sumatera": "#C4522A",
    "Jawa": "#C9952A",
    "Bali & Nusa": "#A3783F",
    "Kalimantan": "#5A7A52",
    "Sulawesi": "#7FA872",
    "Maluku & Papua": "#7A5230",
    "Lainnya": "#9A8060"
  };

  const leafletMaps = {};
  const leafletBounds = {};
  const chartInstances = {};

  // ── Shared custom tooltip (dark brown card, gold value) ──────────────────
  function makeCustomTooltip(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.cssText = `
        display:none;position:fixed;z-index:9999;
        background:#5C3D1E;color:#FDFAF4;
        border-radius:8px;padding:9px 14px;
        font-family:'DM Sans',sans-serif;font-size:11.5px;
        box-shadow:0 4px 20px rgba(0,0,0,0.22);
        pointer-events:none;min-width:150px;line-height:1.7;
      `;
      document.body.appendChild(el);
    }
    return el;
  }

  function positionTooltip(el, chartCanvas, caretX, caretY) {
    const pos = chartCanvas.getBoundingClientRect();
    const x = pos.left + caretX;
    const y = pos.top  + caretY;
    el.style.left = Math.min(x + 14, window.innerWidth - 220) + "px";
    el.style.top  = Math.max(y - el.offsetHeight / 2, 8) + "px";
  }

  function externalTooltipFactory(ttEl, buildHtml) {
    return function(context) {
      const { chart, tooltip } = context;
      if (tooltip.opacity === 0) { ttEl.style.display = "none"; return; }
      ttEl.innerHTML = buildHtml(tooltip);
      ttEl.style.display = "block";
      positionTooltip(ttEl, chart.canvas, tooltip.caretX, tooltip.caretY);
    };
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function fmtRp(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
    return "Rp " + Math.round(Number(v)).toLocaleString("id-ID") + "/kg";
  }

  function fmtPct(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
    const sign = Number(v) > 0 ? "+" : "";
    return sign + Number(v).toFixed(1).replace(".", ",") + "%";
  }
  function fmtShortRp(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
    const n = Number(v);
    if (n >= 1e6) return "Rp" + (n / 1e6).toFixed(1).replace(".", ",") + "jt";
    return "Rp" + Math.round(n / 1000).toLocaleString("id-ID") + "rb";
  }
  function mean(arr) {
    const values = (arr || []).map(Number).filter(v => Number.isFinite(v));
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function normalizeProvName(raw) {
    const s = String(raw || "")
      .replace(/^Provinsi\s+/i, "")
      .replace(/D\.I\.\s*/i, "DI ")
      .trim()
      .toLowerCase();

    const aliases = {
      "aceh": "Aceh",
      "sumatera utara": "Sumatera Utara",
      "sumatera barat": "Sumatera Barat",
      "riau": "Riau",
      "kepulauan riau": "Kepulauan Riau",
      "jambi": "Jambi",
      "sumatera selatan": "Sumatera Selatan",
      "kepulauan bangka belitung": "Bangka Belitung",
      "bangka belitung": "Bangka Belitung",
      "papua tengah": "Papua Tengah",
      "papua selatan": "Papua Selatan",
      "papua pegunungan": "Papua Pegunungan",
      "papua barat daya": "Papua Barat Daya",
      "bengkulu": "Bengkulu",
      "lampung": "Lampung",
      "dki jakarta": "DKI Jakarta",
      "jakarta raya": "DKI Jakarta",
      "jawa barat": "Jawa Barat",
      "banten": "Banten",
      "jawa tengah": "Jawa Tengah",
      "di yogyakarta": "DI Yogyakarta",
      "daerah istimewa yogyakarta": "DI Yogyakarta",
      "yogyakarta": "DI Yogyakarta",
      "jawa timur": "Jawa Timur",
      "bali": "Bali",
      "nusa tenggara barat": "Nusa Tenggara Barat",
      "nusa tenggara timur": "Nusa Tenggara Timur",
      "kalimantan barat": "Kalimantan Barat",
      "kalimantan tengah": "Kalimantan Tengah",
      "kalimantan selatan": "Kalimantan Selatan",
      "kalimantan timur": "Kalimantan Timur",
      "kalimantan utara": "Kalimantan Utara",
      "sulawesi utara": "Sulawesi Utara",
      "gorontalo": "Gorontalo",
      "sulawesi tengah": "Sulawesi Tengah",
      "sulawesi barat": "Sulawesi Barat",
      "sulawesi selatan": "Sulawesi Selatan",
      "sulawesi tenggara": "Sulawesi Tenggara",
      "maluku": "Maluku",
      "maluku utara": "Maluku Utara",
      "papua barat": "Papua Barat",
      "papua": "Papua"
    };

    return aliases[s] || raw;
  }

  function getFeatureName(feature) {
    const p = feature.properties || {};
    return normalizeProvName(
      p.Propinsi || p.provinsi || p.PROVINSI || p.name || p.NAME_1 || p.NAME || p.state || ""
    );
  }

  function renderTrendKPIs(scenes) {
    const events = scenes?.trend?.events || {};
    const monthly = scenes?.trend?.monthly || [];
    const datasets = scenes?.trend?.datasets || [];

    const COLOR = { sapi: "#5A7A52", ayam: "#C9952A", telur: "#C4522A" };
    const LABEL = { sapi: "Daging Sapi", ayam: "Daging Ayam", telur: "Telur Ayam" };

    // --- KPI 1: Lonjakan bulanan terbesar (semua komoditas) ---
    const jumpCandidates = Object.entries(events)
      .map(([key, val]) => ({ key, pct: val?.maxMonthlyJump?.pct, from: val?.maxMonthlyJump?.from, to: val?.maxMonthlyJump?.to }))
      .filter(d => d.pct != null);
    const maxJump = jumpCandidates.sort((a, b) => b.pct - a.pct)[0];

    setText("trend-max-jump", fmtPct(maxJump?.pct));
    setText("trend-max-jump-unit", maxJump
      ? `${LABEL[maxJump.key]}, ${formatMonthLabel(maxJump.from)} → ${formatMonthLabel(maxJump.to)}`
      : "-");
    const accentJump = document.getElementById("kpi-accent-jump");
    if (accentJump && maxJump) accentJump.style.background = COLOR[maxJump.key];

    // --- KPI 2: Kenaikan kumulatif tertinggi ---
    const cumulCandidates = Object.entries(events)
      .map(([key, val]) => ({ key, pct: val?.cumulativePct }))
      .filter(d => d.pct != null);
    const maxCumul = cumulCandidates.sort((a, b) => b.pct - a.pct)[0];

    setText("trend-cumulative", fmtPct(maxCumul?.pct));
    setText("trend-cumulative-unit", maxCumul
      ? `${LABEL[maxCumul.key]}, awal data vs akhir data`
      : "-");
    const accentCumul = document.getElementById("kpi-accent-cumulative");
    if (accentCumul && maxCumul) accentCumul.style.background = COLOR[maxCumul.key];

    // --- KPI 3: Paling stabil (range persen terkecil) ---
    const stableCandidates = datasets.map(ds => {
      const vals = ds.data.filter(v => v != null && v > 0);
      if (!vals.length) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const rangePct = ((Math.max(...vals) - Math.min(...vals)) / avg) * 100;
      return { key: ds.key, rangePct };
    }).filter(Boolean);
    const mostStable = stableCandidates.sort((a, b) => a.rangePct - b.rangePct)[0];

    setText("trend-stable", LABEL[mostStable?.key] || "-");
    setText("trend-stable-unit", mostStable
      ? `Range harga relatif: ${fmtPct(mostStable.rangePct)}`
      : "-");
    const accentStable = document.getElementById("kpi-accent-stable");
    if (accentStable && mostStable) accentStable.style.background = COLOR[mostStable.key];
  }

  function renderLandscapeKPIs(scenes) {
    const landscape = scenes?.landscape || {};

    const items = [
      ["sapi", "land-sapi-prov", "land-sapi-price"],
      ["ayam", "land-ayam-prov", "land-ayam-price"],
      ["telur", "land-telur-prov", "land-telur-price"]
    ];

    items.forEach(([key, provId, priceId]) => {
      const top = landscape[key]?.mostExpensive;
      const price = top?.[key] ?? top?.value ?? null;

      setText(provId, top?.province || "-");
      setText(priceId, price ? "rata-rata " + fmtRp(price) : "-");
    });
  }

  async function renderMap(containerId, commodity, rows) {
    const container = document.getElementById(containerId);
    if (!container || !global.L) return;

    container.innerHTML = `<div id="leaflet-${commodity}" class="map-leaflet"></div>`;

    // Build lookup from processor rows (fallback)
    const dataFromProcessor = {};
    rows.forEach(r => {
      dataFromProcessor[r.province] = r.value;
    });

    const commodityKey = { sapi: "Sapi", ayam: "Ayam", telur: "Telur" }[commodity];

    if (leafletMaps[commodity]) {
      leafletMaps[commodity].remove();
    }

    const map = L.map(`leaflet-${commodity}`, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      dragging: true,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false
    }).setView([-2.4, 118], 4);

    leafletMaps[commodity] = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
      maxZoom: 7,
      minZoom: 4,
      opacity: 0.55,
      attribution: "&copy; OpenStreetMap &copy; CARTO"
    }).addTo(map);

    // Use local GeoJSON
    const res = await fetch("./choropleth_map.geojson");
    const geo = await res.json();

    // Parse price from GeoJSON property (format "163,304" → 163304)
    function parsePriceStr(val) {
      if (val == null || val === "") return null;
      // Format is Indonesian thousand-separator: "155,182" = 155182
      return parseFloat(String(val).replace(/,/g, "")) || null;
    }

    // Build merged data: GeoJSON prices take precedence, fallback to processor
    const data = {};
    geo.features.forEach(feature => {
      const p = feature.properties || {};
      const name = normalizeProvName(p.PROVINSI || p.Propinsi || p.provinsi || p.name || "");
      const geoPrice = parsePriceStr(p[commodityKey]);
      if (geoPrice) {
        data[name] = geoPrice;
      } else if (dataFromProcessor[name]) {
        data[name] = dataFromProcessor[name];
      }
    });

    // Fill in processor data for any provinces not in GeoJSON
    Object.entries(dataFromProcessor).forEach(([prov, val]) => {
      if (!data[prov]) data[prov] = val;
    });

    const values = Object.values(data).filter(Boolean);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const rgb = hexToRgb(COLORS[commodity]);

    function colorFor(v) {
      if (!v) return "rgba(210,200,185,0.55)";
      const t = (v - minV) / (maxV - minV || 1);
      const a = 0.18 + t * 0.82;
      return `rgba(${rgb.r},${rgb.g},${rgb.b},${a.toFixed(2)})`;
    }

    const geoJsonLayer = L.geoJSON(geo, {
      style: feature => {
        const p = feature.properties || {};
        const name = normalizeProvName(p.PROVINSI || p.Propinsi || p.provinsi || p.name || "");
        const v = data[name];

        return {
          fillColor: colorFor(v),
          fillOpacity: 0.92,
          color: "#FDFAF4",
          weight: 0.75,
          opacity: 1
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const name = normalizeProvName(p.PROVINSI || p.Propinsi || p.provinsi || p.name || "");
        const v = data[name];

        // Parse all three commodities from GeoJSON properties
        const parsePriceStr = val => val != null && val !== "" ? parseFloat(String(val).replace(/,/g, "")) || null : null;
        const sapiVal  = parsePriceStr(p.Sapi);
        const ayamVal  = parsePriceStr(p.Ayam);
        const telurVal = parsePriceStr(p.Telur);
        const tpak     = p.TPAK != null ? Number(p.TPAK).toFixed(2).replace(".", ",") + "%" : "-";
        const tpt      = p.TPT  != null ? Number(p.TPT).toFixed(2).replace(".", ",") + "%" : "-";

        const fmtFull = val => val ? "Rp " + Math.round(val).toLocaleString("id-ID") + "/kg" : "Tidak ada data";

        const activeColor = { sapi: "#7FA872", ayam: "#E8B84B", telur: "#E07040" };

        const activeVal = { sapi: sapiVal, ayam: ayamVal, telur: telurVal }[commodity];
        layer.bindTooltip(
          `<div style="font-weight:700;margin-bottom:3px;">${name}</div>
           <div style="font-size:10px;opacity:.55;margin-bottom:5px;">${LABELS[commodity]}</div>
           <div style="font-family:'DM Mono',monospace;font-size:13px;color:#E8B84B;font-weight:600;">${fmtFull(activeVal)}</div>`,
          { sticky: true, direction: "top", className: "prot-tooltip" }
        );

        layer.on({
          mouseover: e => {
            e.target.setStyle({
              weight: 1.5,
              color: "#5C3D1E",
              fillOpacity: 1
            });
            e.target.bringToFront();
          },
          mouseout: e => {
            geoJsonLayer.resetStyle(e.target);
          }
        });
      }
    }).addTo(map);

    const bounds = geoJsonLayer.getBounds();
    leafletBounds[commodity] = bounds;
    map.fitBounds(bounds, { padding: [8, 8] });

    // Expose so switchTab can access
    window.leafletMaps = leafletMaps;
    window.leafletBounds = leafletBounds;

    setTimeout(() => {
      map.invalidateSize(false);
      map.fitBounds(bounds, { padding: [8, 8], animate: false });
    }, 250);
  }

  function renderBarChart(canvasId, commodity, top10) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !global.Chart) return;

    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
    }

    const labels = top10.map(d => d.province);
    const values = top10.map(d => d.value);
    const labelMap = { sapi: "Daging Sapi", ayam: "Daging Ayam", telur: "Telur Ayam" };

    // Shared custom tooltip element per chart
    let ttEl = document.getElementById("bar-tooltip-" + canvasId);
    if (!ttEl) {
      ttEl = document.createElement("div");
      ttEl.id = "bar-tooltip-" + canvasId;
      ttEl.style.cssText = `
        display:none;position:fixed;z-index:9999;
        background:#5C3D1E;color:#FDFAF4;
        border-radius:8px;padding:9px 13px;
        font-family:'DM Sans',sans-serif;font-size:11.5px;
        box-shadow:0 4px 18px rgba(0,0,0,0.22);
        pointer-events:none;min-width:160px;line-height:1.65;
      `;
      document.body.appendChild(ttEl);
    }

    chartInstances[canvasId] = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: values.map((_, i) =>
            i < 3 ? COLORS[commodity] : COLORS[commodity] + "55"
          ),
          borderWidth: 0,
          borderRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: {
            ticks: {
              color: "#9A8060",
              font: { family: "DM Sans", size: 9 },
              callback: v => "Rp" + (v / 1000).toFixed(0) + "rb"
            },
            grid: { color: "rgba(92,61,30,0.055)" },
            border: { color: "transparent" }
          },
          y: {
            ticks: {
              color: "#9A8060",
              font: { family: "DM Sans", size: 9 }
            },
            grid: { color: "transparent" },
            border: { color: "transparent" }
          }
        }
      }
    });

    // Manual mousemove: deteksi bar tepat sesuai posisi mouse aktual
    canvas.addEventListener("mousemove", (e) => {
      const chart = chartInstances[canvasId];
      if (!chart) return;

      const elements = chart.getElementsAtEventForMode(e, "nearest", { intersect: true }, false);
      if (!elements.length) {
        ttEl.style.display = "none";
        canvas.style.cursor = "default";
        return;
      }

      const idx      = elements[0].index;
      const province = labels[idx] || "";
      const value    = values[idx] || 0;
      const rank     = idx + 1;

      ttEl.innerHTML = `
        <div style="font-weight:700;margin-bottom:3px;">${province}</div>
        <div style="font-size:10px;opacity:.55;margin-bottom:5px;">${labelMap[commodity]} · Peringkat #${rank}</div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;color:#E8B84B;font-weight:600;">
          Rp ${Math.round(value).toLocaleString("id-ID")}/kg
        </div>`;

      ttEl.style.display = "block";
      const ttW = ttEl.offsetWidth || 180;
      const ttH = ttEl.offsetHeight || 60;
      ttEl.style.left = Math.min(e.clientX + 14, window.innerWidth - ttW - 8) + "px";
      ttEl.style.top  = Math.max(e.clientY - ttH / 2, 8) + "px";
      canvas.style.cursor = "pointer";
    });

    canvas.addEventListener("mouseleave", () => {
      ttEl.style.display = "none";
      canvas.style.cursor = "default";
    });
  }

  // Parse price string from GeoJSON ("163,304" → 163304)
  function parseGeoPrice(val) {
    if (val == null || val === "") return 0;
    return parseFloat(String(val).replace(/,/g, "")) || 0;
  }

  // Build top10 and stats from GeoJSON for all commodities
  async function buildGeoStats() {
    const res = await fetch("./choropleth_map.geojson");
    const geo = await res.json();
    const stats = { sapi: [], ayam: [], telur: [] };

    geo.features.forEach(feat => {
      const p = feat.properties || {};
      const name = normalizeProvName(p.PROVINSI || p.Propinsi || p.provinsi || p.name || "");
      stats.sapi.push({ province: name, value: parseGeoPrice(p.Sapi) });
      stats.ayam.push({ province: name, value: parseGeoPrice(p.Ayam) });
      stats.telur.push({ province: name, value: parseGeoPrice(p.Telur) });
    });

    const result = {};
    ["sapi", "ayam", "telur"].forEach(key => {
      const sorted = stats[key].filter(d => d.value > 0).sort((a, b) => b.value - a.value);
      const top10  = sorted.slice(0, 10);
      const cheapest = sorted[sorted.length - 1];
      const mostExpensive = sorted[0];
      result[key] = { top10, mostExpensive, cheapest, gap: mostExpensive.value - cheapest.value };
    });

    return result;
  }

  function renderLandscapeVisuals(scenes) {
    const landscape = scenes?.landscape || {};

    const pairs = [
      ["sapi", "map-sapi-wrap", "c2a"],
      ["ayam", "map-ayam-wrap", "c2b"],
      ["telur", "map-telur-wrap", "c2c"]
    ];

    // Render maps immediately (they fetch GeoJSON internally)
    pairs.forEach(([key, mapId]) => {
      renderMap(mapId, key, landscape[key]?.mapRows || []);
    });

    // Fetch GeoJSON once, build accurate stats, then render bar charts + callout
    buildGeoStats().then(geoStats => {
      window._geoStats = geoStats;

      pairs.forEach(([key, , chartId]) => {
        renderBarChart(chartId, key, geoStats[key].top10);
      });

      renderLandscapeKPIsFromGeo(geoStats);
      renderLandscapeCalloutFromGeo(geoStats);
    });
  }

  function renderLandscapeKPIsFromGeo(geoStats) {
    const items = [
      ["sapi",  "land-sapi-prov",  "land-sapi-price"],
      ["ayam",  "land-ayam-prov",  "land-ayam-price"],
      ["telur", "land-telur-prov", "land-telur-price"]
    ];
    items.forEach(([key, provId, priceId]) => {
      const top = geoStats[key]?.mostExpensive;
      setText(provId, top?.province || "-");
      setText(priceId, top?.value ? "rata-rata " + fmtRp(top.value) : "-");
    });
  }

  function renderLandscapeCalloutFromGeo(geoStats) {
    const el = document.getElementById("landscape-callout");
    if (!el) return;

    const fmtRpLocal = v => v ? "Rp " + Math.round(v).toLocaleString("id-ID") + "/kg" : "-";

    const sapiTop    = geoStats.sapi.mostExpensive;
    const ayamTop    = geoStats.ayam.mostExpensive;
    const telurTop   = geoStats.telur.mostExpensive;
    const sapiBot    = geoStats.sapi.cheapest;
    const ayamBot    = geoStats.ayam.cheapest;
    const telurBot   = geoStats.telur.cheapest;
    const sapiGap    = geoStats.sapi.gap;
    const ayamGap    = geoStats.ayam.gap;
    const telurGap   = geoStats.telur.gap;

    const sapiGapPct  = Math.round((sapiGap  / sapiTop.value)  * 100);
    const ayamGapPct  = Math.round((ayamGap  / ayamTop.value)  * 100);
    const telurGapPct = Math.round((telurGap / telurTop.value) * 100);

    const biggestGap = [
      { label: "daging sapi",  value: sapiGap,  pct: sapiGapPct,  top: sapiTop,  bot: sapiBot  },
      { label: "daging ayam",  value: ayamGap,  pct: ayamGapPct,  top: ayamTop,  bot: ayamBot  },
      { label: "telur ayam",   value: telurGap, pct: telurGapPct, top: telurTop, bot: telurBot  }
    ].sort((a, b) => b.value - a.value)[0];

    el.innerHTML = `
      <strong>${sapiTop.province}</strong> menjadi provinsi dengan harga daging sapi tertinggi
      (${fmtRpLocal(sapiTop.value)}), <strong>${ayamTop.province}</strong> tertinggi untuk daging ayam
      (${fmtRpLocal(ayamTop.value)}), dan <strong>${telurTop.province}</strong> tertinggi untuk telur ayam
      (${fmtRpLocal(telurTop.value)}).
      Gap terbesar terjadi pada <strong>${biggestGap.label}</strong>: selisih
      <strong>${fmtRpLocal(biggestGap.value)}</strong>
      antara ${biggestGap.top.province} (${fmtRpLocal(biggestGap.top.value)}) dan
      ${biggestGap.bot.province} (${fmtRpLocal(biggestGap.bot.value)}),
      sekitar ${biggestGap.pct}% lebih murah.
      Ketimpangan ini mencerminkan beban distribusi dan biaya logistik yang berbeda-beda di seluruh kepulauan Indonesia.
    `;
  }

  function renderLandscapeCallout(scenes) {
  const land = scenes?.landscape || {};

  const sapiTop    = land.sapi?.mostExpensive?.province  || "-";
  const ayamTop    = land.ayam?.mostExpensive?.province  || "-";
  const telurTop   = land.telur?.mostExpensive?.province || "-";

  const sapiTopPrice   = land.sapi?.mostExpensive?.sapi   ?? land.sapi?.mostExpensive?.value   ?? null;
  const ayamTopPrice   = land.ayam?.mostExpensive?.ayam   ?? land.ayam?.mostExpensive?.value   ?? null;
  const telurTopPrice  = land.telur?.mostExpensive?.telur ?? land.telur?.mostExpensive?.value  ?? null;

  // Cheapest provinces
  const sapiBot  = land.sapi?.cheapest?.province  || "-";
  const ayamBot  = land.ayam?.cheapest?.province  || "-";
  const telurBot = land.telur?.cheapest?.province || "-";

  const sapiGap   = land.sapi?.gap   ?? null;
  const ayamGap   = land.ayam?.gap   ?? null;
  const telurGap  = land.telur?.gap  ?? null;

  // Gap pct relative to top price
  const sapiGapPct  = sapiTopPrice  && sapiGap   ? Math.round((sapiGap  / sapiTopPrice)  * 100) : null;
  const ayamGapPct  = ayamTopPrice  && ayamGap   ? Math.round((ayamGap  / ayamTopPrice)  * 100) : null;
  const telurGapPct = telurTopPrice && telurGap  ? Math.round((telurGap / telurTopPrice)  * 100) : null;

  const biggestGap = [
    { label: "daging sapi", value: sapiGap,  pct: sapiGapPct,  top: sapiTop,  bot: sapiBot  },
    { label: "daging ayam", value: ayamGap,  pct: ayamGapPct,  top: ayamTop,  bot: ayamBot  },
    { label: "telur ayam",  value: telurGap, pct: telurGapPct, top: telurTop, bot: telurBot  }
  ].sort((a, b) => (b.value || 0) - (a.value || 0))[0];

  const fmtRpLocal = v => v != null ? "Rp " + Math.round(Number(v)).toLocaleString("id-ID") + "/kg" : "-";

  const el = document.getElementById("landscape-callout");
  if (!el) return;

  el.innerHTML = `
    <strong>${sapiTop}</strong> menjadi provinsi dengan harga daging sapi tertinggi 
    (${fmtRpLocal(sapiTopPrice)}), <strong>${ayamTop}</strong> tertinggi untuk daging ayam 
    (${fmtRpLocal(ayamTopPrice)}), dan <strong>${telurTop}</strong> tertinggi untuk telur ayam 
    (${fmtRpLocal(telurTopPrice)}).
    Gap terbesar terjadi pada <strong>${biggestGap.label}</strong>: selisih sekitar 
    <strong>${fmtRpLocal(biggestGap.value)}</strong> 
    ${biggestGap.pct != null ? `(sekitar ${biggestGap.pct}% lebih murah di ${biggestGap.bot} dibanding ${biggestGap.top})` : `antara provinsi termurah dan termahal`}.
    Ketimpangan ini mencerminkan beban distribusi dan biaya logistik yang berbeda-beda di seluruh kepulauan Indonesia.
  `;
}

function renderTrendScene(scenes) {
  const monthly = scenes?.trend?.monthly || [];
  const events = scenes?.trend?.events || {};

  const labels = monthly.map(d => d.label);

  const datasets = [
    { key: "sapi",  label: "Daging Sapi", data: monthly.map(d => d.sapi),  color: "#5A7A52" },
    { key: "ayam",  label: "Daging Ayam", data: monthly.map(d => d.ayam),  color: "#C9952A" },
    { key: "telur", label: "Telur Ayam",  data: monthly.map(d => d.telur), color: "#C4522A" }
  ];

  // Chart tren nasional
  renderTrendChart(labels, datasets);

  // Event list otomatis
  renderTrendEventListAuto(scenes);
}

function renderTrendChart(labels, datasets) {
  const canvas = document.getElementById("c3a");
  if (!canvas || !window.Chart) return;

  if (chartInstances["c3a"]) chartInstances["c3a"].destroy();

  const ttTrend = makeCustomTooltip("tt-trend");

  chartInstances["c3a"] = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color,
        backgroundColor: ds.color + "22",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
        // Default: sembunyikan daging sapi, tampilkan ayam & telur
        hidden: ds.key === "sapi"
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          mode: "index",
          intersect: false,
          external: externalTooltipFactory(ttTrend, (tt) => {
            const label = tt.dataPoints?.[0]?.label || "";
            const rows = tt.dataPoints
              .filter(p => p.parsed.y !== null)
              .map(p => `
                <div style="display:flex;justify-content:space-between;gap:20px;align-items:center;margin-top:4px;">
                  <span style="display:flex;align-items:center;gap:6px;font-size:10.5px;opacity:.85;">
                    <span style="width:7px;height:7px;border-radius:50%;background:${p.dataset.borderColor};display:inline-block;flex-shrink:0;"></span>
                    ${p.dataset.label}
                  </span>
                  <strong style="font-family:'DM Mono',monospace;font-size:12px;color:#E8B84B;">
                    Rp ${Math.round(p.parsed.y).toLocaleString("id-ID")}
                  </strong>
                </div>`).join("");
            return `<div style="font-weight:700;font-size:12px;margin-bottom:4px;">${label}</div>${rows}`;
          })
        }
      },
      scales: {
        x: {
          ticks: { color: "#9A8060", font: { family: "DM Sans", size: 8.5 }, maxTicksLimit: 14, maxRotation: 0 },
          grid: { color: "rgba(92,61,30,0.055)" }, border: { color: "transparent" }
        },
        y: {
          ticks: { color: "#9A8060", font: { family: "DM Sans", size: 9 }, callback: v => "Rp" + (v/1000).toFixed(0) + "rb" },
          grid: { color: "rgba(92,61,30,0.055)" }, border: { color: "transparent" }
        }
      }
    }
  });

  canvas.addEventListener("mouseleave", () => { ttTrend.style.display = "none"; });
}

function renderTrendEventList(maxJump, maxCumulative, mostStable, events) {
  const el = document.getElementById("trend-event-list");
  if (!el) return;

  const items = [];

  if (maxJump) {
    items.push({
      date: `${maxJump.from} → ${maxJump.to}`,
      desc: `${maxJump.label} mengalami lonjakan bulanan paling tajam sebesar ${fmtPct(maxJump.pct)}.`
    });
  }

  if (maxCumulative) {
    items.push({
      date: "Awal → Akhir",
      desc: `${maxCumulative.label} mencatat kenaikan kumulatif tertinggi sebesar ${fmtPct(maxCumulative.pct)} sepanjang periode data.`
    });
  }

  if (events.sapi?.cumulativePct !== undefined) {
    items.push({
      date: "Sapi",
      desc: `Harga sapi bergerak ${fmtPct(events.sapi.cumulativePct)} dari awal sampai akhir periode.`
    });
  }

  if (events.ayam?.cumulativePct !== undefined) {
    items.push({
      date: "Ayam",
      desc: `Harga ayam bergerak ${fmtPct(events.ayam.cumulativePct)} dari awal sampai akhir periode.`
    });
  }

  if (events.telur?.cumulativePct !== undefined) {
    items.push({
      date: "Telur",
      desc: `Harga telur bergerak ${fmtPct(events.telur.cumulativePct)} dari awal sampai akhir periode.`
    });
  }

  if (mostStable) {
    items.push({
      date: "Stabilitas",
      desc: `${mostStable.label} menjadi komoditas paling stabil berdasarkan range harga relatif.`
    });
  }

  el.innerHTML = items.map(item => `
    <div class="event-item">
      <span class="event-date">${item.date}</span>
      <span class="event-desc">${item.desc}</span>
    </div>
  `).join("");
}

function formatMonthLabel(monthStr) {
  if (!monthStr) return "-";
  const [y, m] = monthStr.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${months[Number(m) - 1]} ${y}`;
}

function renderTrendEventListAuto(scenes) {
  const el = document.getElementById("trend-event-list");
  if (!el) return;

  const events = scenes?.trend?.events || {};
  const monthly = scenes?.trend?.monthly || [];

  const LABEL = { sapi: "Daging sapi", ayam: "Daging ayam", telur: "Telur ayam" };
  const COLOR = { sapi: "var(--sapi)", ayam: "var(--ayam)", telur: "var(--telur)" };

  const lines = [];

  // 1. Lonjakan bulanan terbesar tiap komoditas
  Object.entries(events).forEach(([key, e]) => {
    const jump = e?.maxMonthlyJump;
    if (!jump?.pct) return;
    const range = `${formatMonthLabel(jump.from)}–${formatMonthLabel(jump.to)}`;
    lines.push({
      key,
      html: `<span style="font-weight:700;color:var(--brown);font-family:'DM Mono',monospace;font-size:11.5px;">${range}:</span> ${LABEL[key]} mencatat lonjakan tertinggi (<strong style="color:${COLOR[key]};">${fmtPct(jump.pct)}</strong>)`
    });
  });

  // 2. Kenaikan kumulatif tiap komoditas
  Object.entries(events).forEach(([key, e]) => {
    if (e?.cumulativePct == null) return;
    const first = monthly[0]?.label;
    const last = monthly.at(-1)?.label;
    lines.push({
      key,
      html: `<span style="font-weight:700;color:var(--brown);font-family:'DM Mono',monospace;font-size:11.5px;">${first}–${last}:</span> ${LABEL[key]} naik kumulatif sebesar <strong style="color:${COLOR[key]};">${fmtPct(e.cumulativePct)}</strong> sepanjang periode`
    });
  });

  // 3. Harga tertinggi periode akhir
  const latest = monthly.at(-1);
  if (latest) {
    const highest = ["sapi", "ayam", "telur"]
      .map(k => ({ key: k, value: latest[k] }))
      .sort((a, b) => b.value - a.value)[0];
    lines.push({
      key: highest.key,
      html: `<span style="font-weight:700;color:var(--brown);font-family:'DM Mono',monospace;font-size:11.5px;">${scenes.meta?.latestLabel || latest.label}:</span> ${LABEL[highest.key]} menjadi yang termahal secara nasional (<strong style="color:${COLOR[highest.key]};">${fmtRp(highest.value)}</strong>)`
    });
  }

  el.innerHTML = lines.slice(0, 7).map(line => `
    <div style="padding:9px 0;border-bottom:1px solid var(--line);font-size:12px;color:var(--text2);line-height:1.6;">
      ${line.html}
    </div>
  `).join("").replace(/border-bottom:[^;]+;([^"]*)"([^"]*last-child)/, '');

  // remove border on last item
  const divs = el.querySelectorAll("div");
  if (divs.length) divs[divs.length - 1].style.borderBottom = "none";
}

function fmtRpNumber(v) {
  if (v == null || isNaN(Number(v))) return "-";
  return Math.round(Number(v)).toLocaleString("id-ID");
}
function renderHeroKPIs(scenes) {
  const hero = scenes?.hero || [];

  hero.forEach(item => {
    const key = item.key; // sapi / ayam / telur

    setText(`hero-${key}-val`, fmtRpNumber(item.value));
    setText(`hero-${key}-sub`, `${item.unit} · nasional ${scenes.meta?.latestLabel || item.month}`);
    setText(`hero-${key}-yoy`, fmtPct(item.yoyPct));
  });
}

  function renderSeasonalHeatmap(scenes) {
    const el = document.getElementById("heatmap-wrap");
    if (!el) return;

    const seasonal = scenes?.seasonal?.rows || {};
    const MONTHS     = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    const MONTHS_ID  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const ROWS = [
      { key: "sapi",  label: "🐄 Sapi",  colorHigh: [90,122,82],   colorLow: [164,210,156] },
      { key: "ayam",  label: "🍗 Ayam",  colorHigh: [180,120,20],  colorLow: [220,185,110] },
      { key: "telur", label: "🥚 Telur", colorHigh: [180,65,30],   colorLow: [225,150,120] }
    ];
    const neutral = [237, 229, 212]; // --cream2

    // Build index per komoditas (baseline = mean = 100)
    const indexed = {};
    const amplitudes = {};
    ROWS.forEach(({ key }) => {
      const data = (seasonal[key] || []).slice(0, 12);
      const vals = data.map(d => d.value).filter(v => v > 0);
      const avg  = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const idxData = data.map(d => ({
        month:    d.month,
        label:    MONTHS[d.month - 1],
        labelID:  MONTHS_ID[d.month - 1],
        value:    d.value,
        avg,
        index:    avg > 0 ? Math.round((d.value / avg) * 100) : 100,
        dev:      avg > 0 ? ((d.value / avg) - 1) * 100 : 0
      }));
      indexed[key] = idxData;

      const peak   = idxData.reduce((a, b) => a.index > b.index ? a : b);
      const trough = idxData.reduce((a, b) => a.index < b.index ? a : b);
      amplitudes[key] = {
        peak, trough,
        amp: peak.index - trough.index  // in index points = %
      };
    });

    // Color: neutral at 100, commodity color above, sage-ish below — NO dark/black
    function cellBg(key, dev) {
      const row = ROWS.find(r => r.key === key);
      const t = Math.max(-1, Math.min(1, dev / 8)); // clamp ±8%
      const from = t >= 0 ? row.colorHigh : row.colorLow;
      const u = Math.abs(t);
      const r = Math.round(neutral[0] + u * (from[0] - neutral[0]));
      const g = Math.round(neutral[1] + u * (from[1] - neutral[1]));
      const b = Math.round(neutral[2] + u * (from[2] - neutral[2]));
      return `rgb(${r},${g},${b})`;
    }

    // Build tooltip div (hidden, absolute)
    el.innerHTML = `<div id="seas-tooltip" style="
      display:none;position:fixed;z-index:9999;
      background:var(--brown);color:var(--white);
      border-radius:8px;padding:10px 14px;
      font-family:'DM Sans',sans-serif;font-size:11.5px;
      box-shadow:0 4px 20px rgba(0,0,0,0.22);
      pointer-events:none;min-width:180px;line-height:1.7;
    "></div>`;

    const headerCells = MONTHS.map(m =>
      `<th style="font-family:'DM Mono',monospace;font-size:9.5px;color:var(--text3);
        font-weight:500;padding:4px 0;text-align:center;min-width:54px;">${m}</th>`
    ).join("");

    const dataRows = ROWS.map(({ key, label }) => {
      const cells = (indexed[key] || []).map(d => {
        const bg  = cellBg(key, d.dev);
        const sign = d.dev >= 0 ? "+" : "";
        return `<td
          data-key="${key}"
          data-month="${d.labelID}"
          data-index="${d.index}"
          data-dev="${d.dev.toFixed(2)}"
          data-value="${d.value}"
          data-avg="${Math.round(d.avg)}"
          style="background:${bg};color:#2E1F0E !important;border-radius:5px;
            text-align:center;padding:11px 4px;
            font-family:'DM Mono',monospace;font-size:11.5px;font-weight:700;
            cursor:default;transition:filter .15s;min-width:54px;"
          onmouseover="window._seasHover(event,this)"
          onmouseout="window._seasOut()"
        >${d.index}</td>`;
      }).join("");

      return `<tr>
        <td style="font-size:11.5px;font-weight:600;color:var(--text2);
          padding-right:14px;padding-top:3px;padding-bottom:3px;
          white-space:nowrap;font-family:'DM Sans',sans-serif;">${label}</td>
        ${cells}
      </tr>`;
    }).join("");

    el.innerHTML += `
      <table style="border-collapse:separate;border-spacing:3px;width:100%;">
        <thead><tr><th style="min-width:72px;"></th>${headerCells}</tr></thead>
        <tbody>${dataRows}</tbody>
      </table>
      <div style="margin-top:8px;font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);">
        Indeks 100 = rata-rata harga tahunan tiap komoditas. Di atas 100 = lebih mahal dari rata-rata.
      </div>`;

    // Tooltip hover handlers
    window._seasHover = function(e, td) {
      const tt = document.getElementById("seas-tooltip");
      if (!tt) return;
      const key   = td.dataset.key;
      const month = td.dataset.month;
      const index = Number(td.dataset.index);
      const dev   = Number(td.dataset.dev);
      const value = Number(td.dataset.value);
      const avg   = Number(td.dataset.avg);
      const sign  = dev >= 0 ? "+" : "";
      const label = { sapi:"Daging Sapi", ayam:"Daging Ayam", telur:"Telur Ayam" }[key];

      tt.innerHTML = `
        <div style="font-weight:700;margin-bottom:4px;">${month}</div>
        <div style="font-size:10px;opacity:.65;margin-bottom:6px;">${label}</div>
        <div style="display:flex;justify-content:space-between;gap:16px;">
          <span style="opacity:.7;">Indeks</span>
          <strong>${index}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;gap:16px;">
          <span style="opacity:.7;">vs rata-rata</span>
          <strong style="color:${dev>=0?'#E8B84B':'#a0d090'};">${sign}${dev.toFixed(1).replace(".",",")}%</strong>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.12);margin:6px 0;"></div>
        <div style="display:flex;justify-content:space-between;gap:16px;">
          <span style="opacity:.7;">Harga bulan ini</span>
          <strong>${fmtRp(value)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;gap:16px;">
          <span style="opacity:.7;">Rata-rata tahunan</span>
          <span style="opacity:.8;">${fmtRp(avg)}</span>
        </div>`;

      tt.style.display = "block";
      td.style.filter = "brightness(1.1)";
      const rect = td.getBoundingClientRect();
      tt.style.left = Math.min(rect.left, window.innerWidth - 210) + "px";
      tt.style.top  = (rect.top - tt.offsetHeight - 8) + "px";
    };
    window._seasOut = function() {
      const tt = document.getElementById("seas-tooltip");
      if (tt) tt.style.display = "none";
      document.querySelectorAll("#heatmap-wrap td[data-key]")
        .forEach(td => td.style.filter = "");
    };

    // Populate KPI cards + insight
    ROWS.forEach(({ key }) => {
      const { peak, trough, amp } = amplitudes[key];
      const sign = amp >= 0 ? "+" : "";
      setText(`seas-${key}-peak`,   peak.labelID   || "-");
      setText(`seas-${key}-trough`, trough.labelID || "-");
      setText(`seas-${key}-amp`,    `${sign}${amp.toFixed(1).replace(".",",")}%`);
    });

    // Dynamic insight text
    const ampSapi  = amplitudes.sapi?.amp  || 0;
    const ampAyam  = amplitudes.ayam?.amp  || 0;
    const ratio    = ampSapi > 0 ? (ampAyam / ampSapi) : 0;
    const fmt = v => v.toFixed(1).replace(".", ",");
    setText("seas-insight-ayam-amp", `${fmt(ampAyam)}%`);
    setText("seas-insight-sapi-amp", `${fmt(ampSapi)}%`);
    setText("seas-insight-ratio",    `${ratio.toFixed(1).replace(".", ",")}`);
  }

  /* ─── SCENE 4: KETIMPANGAN ─── */
  function renderKetimpangan(scenes) {
    const gapEl = document.getElementById('gap-lollipop');
    if (gapEl) renderGapLollipop(scenes, gapEl);
    renderKetimpanganByComodity(scenes, 'sapi');
  }

  function renderGapLollipop(scenes, gapEl) {
    const inequality = scenes?.inequality || {};
    const C = COLORS;

    const gapData = (inequality.gap || [])
      .filter(d => d.min != null && d.max != null)
      .map(d => ({
        label: d.label,
        min: Number(d.min),
        minProvince: d.minProvince || '-',
        max: Number(d.max),
        maxProvince: d.maxProvince || '-',
        gap: Number(d.max) - Number(d.min),
        color: d.color || C[d.key] || '#9A8060'
      }));

    if (!gapData.length) { gapEl.innerHTML = ''; return; }

    // Axis global agar skala sama antar-komoditas
    const allValues = gapData.flatMap(d => [d.min, d.max]);
    const globalMin = Math.min(...allValues);
    const globalMax = Math.max(...allValues);
    const globalRange = Math.max(globalMax - globalMin, 1);

    const PAD = 0.05;
    function toPct(v) {
      return PAD * 100 + ((v - globalMin) / globalRange) * (1 - 2 * PAD) * 100;
    }

    let html = '<div style="padding:0;">';

    gapData.forEach((item, i) => {
      const pctMin = toPct(item.min);
      const pctMax = toPct(item.max);
      const connectorWidth = pctMax - pctMin;
      const pctMid = (pctMin + pctMax) / 2;
      const isLast = i === gapData.length - 1;

      html += `
        <div style="margin-bottom:${isLast ? '0' : '36px'};">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
            <div style="width:10px;height:10px;border-radius:50%;background:${item.color};flex-shrink:0;"></div>
            <span style="font-size:14px;color:var(--text2);font-weight:600;">${item.label}</span>
          </div>
          <div style="position:relative;height:32px;">
            <!-- Background track -->
            <div style="position:absolute;top:50%;left:0;right:0;height:2px;
              background:var(--cream3);border-radius:1px;transform:translateY(-50%);"></div>
            <!-- Connector -->
            <div style="position:absolute;top:50%;left:${pctMin}%;width:${connectorWidth}%;height:4px;
              background:${item.color};border-radius:2px;transform:translateY(-50%);"></div>
            <!-- Gap label -->
            <div style="position:absolute;top:0;left:${pctMid}%;transform:translateX(-50%);
              font-family:'DM Mono',monospace;font-size:9.5px;font-weight:600;
              color:${item.color};white-space:nowrap;line-height:1;
              background:var(--white,#FDFAF4);padding:0 4px;">
              ← Rp ${item.gap.toLocaleString('id-ID')} →
            </div>
            <!-- Dot MIN -->
            <div style="position:absolute;top:50%;left:${pctMin}%;
              transform:translate(-50%,-50%);
              width:14px;height:14px;border-radius:50%;
              background:var(--white,#FDFAF4);border:2.5px solid ${item.color};
              z-index:2;box-sizing:border-box;cursor:default;transition:transform .15s;"
              onmouseover="this.style.transform='translate(-50%,-50%) scale(1.4)';this.nextElementSibling.style.opacity='1';"
              onmouseout="this.style.transform='translate(-50%,-50%)';this.nextElementSibling.style.opacity='0';">
            </div>
            <!-- Tooltip MIN -->
            <div style="position:absolute;top:calc(50% + 14px);left:${pctMin}%;transform:translateX(-50%);
              white-space:nowrap;pointer-events:none;
              background:#5C3D1E;color:#FDFAF4;
              font-family:'DM Mono',monospace;font-size:9.5px;line-height:1.7;
              padding:6px 11px;border-radius:7px;
              opacity:0;transition:opacity .15s;z-index:10;">
              <div style="opacity:.7;font-size:8.5px;margin-bottom:1px;">Termurah</div>
              <div>${item.minProvince}</div>
              <div style="color:#E8B84B;font-weight:600;">Rp ${item.min.toLocaleString('id-ID')}</div>
            </div>
            <!-- Dot MAX -->
            <div style="position:absolute;top:50%;left:${pctMax}%;
              transform:translate(-50%,-50%);
              width:14px;height:14px;border-radius:50%;
              background:${item.color};
              box-shadow:0 0 0 3px rgba(253,250,244,0.9);
              z-index:3;box-sizing:border-box;cursor:default;transition:transform .15s;"
              onmouseover="this.style.transform='translate(-50%,-50%) scale(1.4)';this.nextElementSibling.style.opacity='1';"
              onmouseout="this.style.transform='translate(-50%,-50%)';this.nextElementSibling.style.opacity='0';">
            </div>
            <!-- Tooltip MAX -->
            <div style="position:absolute;top:calc(50% + 14px);left:${pctMax}%;transform:translateX(-50%);
              white-space:nowrap;pointer-events:none;
              background:#5C3D1E;color:#FDFAF4;
              font-family:'DM Mono',monospace;font-size:9.5px;line-height:1.7;
              padding:6px 11px;border-radius:7px;
              opacity:0;transition:opacity .15s;z-index:10;">
              <div style="opacity:.7;font-size:8.5px;margin-bottom:1px;">Termahal</div>
              <div>${item.maxProvince}</div>
              <div style="color:#E8B84B;font-weight:600;">Rp ${item.max.toLocaleString('id-ID')}</div>
            </div>
          </div>
        </div>`;
    });

    html += '</div>';
    gapEl.innerHTML = html;
  }

  function renderKetimpanganByComodity(scenes, commodity = 'sapi') {
    const inequality = scenes?.inequality || {};
    const tick = '#9A8060', fnt = 'DM Sans', grid = 'rgba(92,61,30,0.055)';
    const LABEL = { sapi: "Daging Sapi", ayam: "Daging Ayam", telur: "Telur Ayam" };
    const commodityLabel = LABEL[commodity] || "Komoditas";

    const scatterData = (inequality.scatter || [])
      .filter(d => d.ump && d[commodity])
      .map(d => ({
        province: d.province,
        island: PROVINCE_ISLAND[d.province] || "Lainnya",
        x: Number(d.ump),
        y: Number(d[commodity])
      }));

    // Calculate min-max for this commodity
    const yValues = scatterData.map(d => d.y).filter(v => Number.isFinite(v));
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const padding = (maxY - minY) * 0.1;

    // Create dataset grouped by island
    const datasets = Object.keys(ISLAND_COLORS).map(island => {
      const islandPoints = scatterData.filter(d => d.island === island);
      return {
        label: island,
        data: islandPoints,
        backgroundColor: ISLAND_COLORS[island] + "88",
        borderColor: ISLAND_COLORS[island] + "DD",
        borderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        showLine: false
      };
    }).filter(ds => ds.data.length > 0);

    const c4a = document.getElementById('c4a');
    if (c4a) {
      if (chartInstances['c4a']) chartInstances['c4a'].destroy();
      chartInstances['c4a'] = new Chart(c4a, {
        type: 'scatter',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const d = ctx.raw || {};
                  return `${d.province}: ${fmtRp(d.y)}`;
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: tick, font: { family: fnt, size: 9 }, callback: v => 'Rp' + (v / 1e6).toFixed(1) + 'jt' },
              grid: { color: grid },
              border: { color: 'transparent' },
              title: { display: true, text: 'UMP 2025 (Rp/bulan)', color: tick, font: { size: 9, family: fnt } }
            },
            y: {
              ticks: { color: tick, font: { family: fnt, size: 9 }, callback: v => 'Rp' + (v / 1000).toFixed(0) + 'rb' },
              grid: { color: grid },
              border: { color: 'transparent' },
              title: { display: true, text: `Harga ${commodityLabel} Apr 2026 (Rp/kg)`, color: tick, font: { size: 9, family: fnt } },
              min: minY - padding,
              max: maxY + padding
            }
          }
        }
      });
    }

    // Render legend
    const legendEl = document.getElementById('ketimpangan-legend');
    if (legendEl) {
      let legendHtml = '';
      Object.keys(ISLAND_COLORS).forEach(island => {
        const count = scatterData.filter(d => d.island === island).length;
        if (count > 0) {
          legendHtml += `<div style="display:flex;align-items:center;gap:6px;font-size:11px;">
            <span style="width:10px;height:10px;border-radius:50%;background:${ISLAND_COLORS[island]};"></span>
            <span>${island} (${count})</span>
          </div>`;
        }
      });
      legendEl.innerHTML = legendHtml;
    }

    // Generate conclusion
    const conclusionEl = document.getElementById('ketimpangan-conclusion');
    if (conclusionEl) {
      const topUmpProvs = [...scatterData].sort((a, b) => b.x - a.x).slice(0, 3);
      const lowUmpProvs = [...scatterData].sort((a, b) => a.x - b.x).slice(0, 3);
      const topPriceProvs = [...scatterData].sort((a, b) => b.y - a.y).slice(0, 3);

      const topUmpNames = topUmpProvs.map(p => `<strong>${p.province}</strong>`).join(', ');
      const lowUmpNames = lowUmpProvs.map(p => `<strong>${p.province}</strong>`).join(', ');
      const topPriceNames = topPriceProvs.map(p => `<strong>${p.province}</strong> (Rp ${p.y.toLocaleString('id-ID')}/kg)`).join(', ');

      const conclusion = `Pada ${commodityLabel}, pola ketimpangan terlihat jelas: provinsi-provinsi dengan UMP tinggi seperti ${topUmpNames} tidak otomatis membayar harga yang lebih mahal. Sebaliknya, provinsi dengan UMP rendah seperti ${lowUmpNames} justru menghadapi harga termahal, termasuk ${topPriceNames}. Ini menunjukkan <strong>double burden</strong> bagi provinsi dengan ekonomi lemah — upah rendah namun beban pangan tinggi.`;

      conclusionEl.innerHTML = conclusion;
    }
  }
/* ─── SCENE 5: NUTRISI ─── */
  function renderNutrisi(scenes) {
    const nutritionScene = scenes?.nutrition || {};
    const nutrisi = nutritionScene?.raw || {};
    const efficiency = nutritionScene?.efficiency || {};
    const C = COLORS;
    const tick = '#9A8060', fnt = 'DM Sans', grid = 'rgba(92,61,30,0.055)';

    // Protein per Rp 1000 (g) dari processor
    const protPer1k = {
      sapi:  Number(efficiency.sapi?.proteinPerRp1000)  || 1.3,
      ayam:  Number(efficiency.ayam?.proteinPerRp1000)  || 4.3,
      telur: Number(efficiency.telur?.proteinPerRp1000) || 3.7
    };


    const nutriCardsWrap = document.getElementById("nutri-waffle-cards");

    if (nutriCardsWrap) {
      const cards = [
        {
          label: "Daging Sapi",
          color: C.sapi,
          rows: [
            ["Protein", Number(nutrisi.sapi?.protein) || 18.8, "18,8 g", 25],
            ["Lemak", Number(nutrisi.sapi?.fat) || 14.0, "14,0 g", 25],
            ["Kalori", Number(nutrisi.sapi?.calorie) || 201, "201 kal", 300],
            ["Karbohidrat", Number(nutrisi.sapi?.carb) || 0, "0 g", 25]
          ]
        },
        {
          label: "Daging Ayam",
          color: C.ayam,
          rows: [
            ["Protein", Number(nutrisi.ayam?.protein) || 18.2, "18,2 g", 25],
            ["Lemak", Number(nutrisi.ayam?.fat) || 25.0, "25,0 g", 25],
            ["Kalori", Number(nutrisi.ayam?.calorie) || 298, "298 kal", 300],
            ["Karbohidrat", Number(nutrisi.ayam?.carb) || 0, "0 g", 25]
          ]
        },
        {
          label: "Telur Ayam",
          color: C.telur,
          rows: [
            ["Protein", Number(nutrisi.telur?.protein) || 12.4, "12,4 g", 25],
            ["Lemak", Number(nutrisi.telur?.fat) || 10.8, "10,8 g", 25],
            ["Kalori", Number(nutrisi.telur?.calorie) || 154, "154 kal", 300],
            ["Karbohidrat", Number(nutrisi.telur?.carb) || 0.7, "0,7 g", 25]
          ]
        }
      ];

      const makeWaffle = (value, max, color) => {
        const total = 40;
        const filled = Math.round((value / max) * total);

        return `
          <div class="nut-waffle-mini">
            ${Array.from({ length: total }).map((_, i) => `
              <div class="waffle-cell" style="
                background:${i < filled ? color : 'var(--cream2)'};
                opacity:${i < filled ? 1 : 0.55};
              "></div>
            `).join("")}
          </div>
        `;
      };

      nutriCardsWrap.innerHTML = cards.map(card => `
        <div class="nut-waffle-card">
          <div class="nut-waffle-title">
            <span class="nut-waffle-dot" style="background:${card.color};"></span>
            ${card.label}
          </div>

          ${card.rows.map(([name, value, label, max]) => `
            <div class="nut-waffle-row">
              <div class="nut-waffle-label">${name}</div>
              ${makeWaffle(value, max, card.color)}
              <div class="nut-waffle-val">${label}</div>
            </div>
          `).join("")}
        </div>
      `).join("");
    }
    // KPI -> Waffle (replaces KPI chart)
    const kpiWaffleEl = document.getElementById("c6b-waffle");
    if (kpiWaffleEl) {
      const items = [
        { key: "sapi",  label: "Daging Sapi",  val: protPer1k.sapi,  color: C.sapi },
        { key: "ayam",  label: "Daging Ayam",  val: protPer1k.ayam,  color: C.ayam },
        { key: "telur", label: "Telur Ayam",   val: protPer1k.telur, color: C.telur }
      ].sort((a, b) => b.val - a.val);

      const max = Math.max(...items.map(d => d.val), 1);
      let html = `<div style="font-size:10px;color:var(--text3);margin-bottom:10px;">
        Tiap baris = 50 sel (skala relatif terhadap komoditas paling efisien).
      </div>`;

      items.forEach(item => {
        const filled = Math.max(0, Math.min(50, Math.round((item.val / max) * 50)));
        html += `<div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;gap:14px;align-items:baseline;margin-bottom:6px;">
            <div style="font-size:11px;color:var(--text2);"><strong>${item.label}</strong></div>
            <div style="font-family:'DM Mono',monospace;font-size:10.5px;color:var(--brown);">
              ${item.val.toFixed(2)} g / Rp 1.000
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(25,1fr);gap:2px;max-width:260px;">
            ${Array.from({ length: 50 }).map((_, i) =>
              `<div class="waffle-cell" style="background:${item.color};opacity:${i < filled ? 1 : 0.16};"></div>`
            ).join("")}
          </div>
        </div>`;
      });

      kpiWaffleEl.innerHTML = html;
    }

    // Waffle chart efisiensi per Rp10.000
    const waffleEl = document.getElementById('waffle-wrap');
    if (waffleEl) {
      const items = [
        {label:`Sapi (${(protPer1k.sapi*10).toFixed(1)}g)`, count:Math.round(protPer1k.sapi*10), color:C.sapi},
        {label:`Ayam (${(protPer1k.ayam*10).toFixed(1)}g)`, count:Math.round(protPer1k.ayam*10), color:C.ayam},
        {label:`Telur (${(protPer1k.telur*10).toFixed(1)}g)`, count:Math.round(protPer1k.telur*10), color:C.telur}
      ];
      let html = `<div style="margin-bottom:8px;font-size:10px;color:var(--text3);">Tiap sel = 1g protein per Rp 10.000 dibelanjakan</div>`;
      items.forEach(item => {
        html += `<div style="margin-bottom:10px;">
          <div style="font-size:10px;color:var(--text2);margin-bottom:4px;">${item.label}</div>
          <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:2px;max-width:200px;">`;
        for (let i = 0; i < 50; i++) {
          const filled = i < item.count;
          html += `<div style="aspect-ratio:1;border-radius:2px;background:${filled?item.color:'var(--cream3)'};opacity:${filled?1:0.4};transition:opacity .15s;" title="${filled?item.label:''}"></div>`;
        }
        html += '</div></div>';
      });
      waffleEl.innerHTML = html;
    }

    // Waffle kandungan nutrisi per komoditas (ambil dari angka card yang tampil)
    const nutCardWaffle = document.getElementById("nut-card-waffle");
    if (nutCardWaffle) {
      const parseNum = (txt) => {
        const n = String(txt || "").replace(",", ".").match(/-?\d+(\.\d+)?/);
        return n ? Number(n[0]) : 0;
      };
      const nutrientColors = {
        "Protein": "#5A7A52",
        "Lemak": "#C9952A",
        "Kalori": "#A3783F",
        "Karbohidrat": "#C4522A"
      };
      const cards = Array.from(document.querySelectorAll("#nut-100g .nut-card")).map(card => {
        const label = card.querySelector(".nut-card-title")?.textContent?.trim() || "-";
        const rows = Array.from(card.querySelectorAll(".nbar-row")).map(row => {
          const name = row.querySelector(".nbar-label")?.textContent?.trim() || "-";
          const valueTxt = row.querySelector(".nbar-val")?.textContent?.trim() || "0";
          return { name, value: parseNum(valueTxt), valueTxt };
        });
        return { label, rows };
      });
      const nutrientMax = {};
      Object.keys(nutrientColors).forEach(n => {
        nutrientMax[n] = Math.max(1, ...cards.map(c => c.rows.find(r => r.name === n)?.value || 0));
      });
      let html = `<div style="font-size:10px;color:var(--text3);margin-bottom:10px;">Waffle di bawah ini dibuat dari angka nutrisi yang tampil di card (tiap baris = 30 sel skala relatif per nutrisi).</div>`;
      cards.forEach(card => {
        html += `<div style="margin-bottom:14px;">
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px;"><strong>${card.label}</strong></div>`;
        card.rows.forEach(r => {
          if (!nutrientColors[r.name]) return;
          const filled = Math.round((r.value / nutrientMax[r.name]) * 30);
          html += `<div style="display:grid;grid-template-columns:86px 1fr auto;gap:8px;align-items:center;margin-bottom:4px;">
            <span style="font-size:10px;color:var(--text2);">${r.name}</span>
            <div style="display:grid;grid-template-columns:repeat(30,1fr);gap:2px;max-width:220px;">
              ${Array.from({ length: 30 }).map((_, i) =>
                `<div class="waffle-cell" style="background:${nutrientColors[r.name]};opacity:${i < filled ? 1 : 0.16};"></div>`
              ).join("")}
            </div>
            <span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text2);">${r.valueTxt}</span>
          </div>`;
        });
        html += `</div>`;
      });
      nutCardWaffle.innerHTML = html;
    }

// Budget belanja: tampilkan banyak komoditas yang didapat dalam bar skala tetap 1 kg
const moneySlider = document.getElementById("money-budget");
const moneyLabel = document.getElementById("money-budget-label");
const moneyQtyWrap = document.getElementById("money-qty-wrap");

if (moneySlider && moneyLabel && moneyQtyWrap) {
  moneySlider.min = 10000;
  moneySlider.max = 150000;
  moneySlider.step = 5000;

  const base = [
    {
      key: "sapi",
      label: "Daging Sapi",
      color: "var(--sapi)",
      proteinColor: "var(--sage3)",
      price: Number(efficiency?.sapi?.pricePerKg) || 145000,
      protein100: Number(nutrisi?.sapi?.protein) || 18.8
    },
    {
      key: "ayam",
      label: "Daging Ayam",
      color: "var(--ayam)",
      proteinColor: "var(--gold3)",
      price: Number(efficiency?.ayam?.pricePerKg) || 42000,
      protein100: Number(nutrisi?.ayam?.protein) || 18.2
    },
    {
      key: "telur",
      label: "Telur Ayam",
      color: "var(--telur)",
      proteinColor: "var(--rust2)",
      price: Number(efficiency?.telur?.pricePerKg) || 33000,
      protein100: Number(nutrisi?.telur?.protein) || 12.4
    }
  ];

  const formatGram = value => Math.round(value).toLocaleString("id-ID");
  const formatProtein = value => value.toFixed(1).replace(".", ",");

  const updateMoney = () => {
    const money = Number(moneySlider.value || 50000);
    moneyLabel.textContent = "Rp " + money.toLocaleString("id-ID");

    const scaleMax = 1000; // fixed: 1 kg

    const computed = base.map(item => {
      const grams = (money / item.price) * 1000;
      const proteinGram = (grams / 100) * item.protein100;
      return { ...item, grams, proteinGram };
    });

    let html = `
      <div style="font-size:10px;color:var(--text3);margin-bottom:10px;line-height:1.5;"> 
        <br>Skala bar maksimal: <strong>1.000 g (1 kg)</strong>.
      </div>

      <div style="display:flex;gap:16px;font-size:10px;color:var(--text3);margin-bottom:14px;background:var(--white);padding:8px 12px;border-radius:6px;border:1px solid var(--line2);">
        <span style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:12px;height:12px;background:var(--cream);border:2px solid var(--text3);border-radius:3px;"></span>
          Porsi Protein
        </span>
        <span style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:12px;height:12px;background:var(--text3);border-radius:3px;"></span>
          Total Berat
        </span>
        <span style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:12px;height:12px;background:var(--cream2);border-radius:3px;"></span>
          Kapasitas
        </span>
      </div>
    `;

    computed.forEach(item => {
      const weightPct = Math.min((item.grams / scaleMax) * 100, 100);
      const proteinPct = Math.min((item.proteinGram / scaleMax) * 100, 100);
      
      // Indikator teks jika melebihi 1kg
      const overLimit = item.grams > scaleMax;
      const weightColor = overLimit ? "var(--rust)" : "var(--brown)";

      html += `
        <div style="border:1px solid var(--line2);border-radius:10px;padding:14px;background:var(--white);margin-bottom:12px;box-shadow:0 2px 6px rgba(92,61,30,0.03);">

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:12px;">
              <strong style="color:${item.color};">${item.label}</strong>
            </span>
            <span style="font-family:'DM Mono',monospace;font-size:11px;color:${weightColor};font-weight:600;">
              ${formatGram(item.grams)} g ${overLimit ? " ⚠️" : ""}
            </span>
          </div>

          <div style="position:relative;height:18px;border-radius:9px;overflow:hidden;background:var(--cream2);margin-bottom:10px;box-shadow:inset 0 1px 3px rgba(0,0,0,0.06);">
            
            <div style="
              position:absolute;
              left:0;
              top:0;
              height:100%;
              width:${weightPct}%;
              background:${item.color};
              transition:width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            "></div>

            <div style="
              position:absolute;
              left:0;
              top:0;
              height:100%;
              width:${proteinPct}%;
              background:${item.proteinColor};
              border-right:2.5px solid var(--white);
              transition:width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            "></div>

          </div>

          <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text3);line-height:1.6;margin-bottom:2px;">
            <span>Harga per kg: <strong style="font-family:'DM Mono',monospace;color:var(--text2);">Rp ${Math.round(item.price).toLocaleString("id-ID")}</strong></span>
            <span>Total Protein: <strong style="color:var(--brown);">${formatProtein(item.proteinGram)} g</strong></span>
          </div>

        </div>
      `;
    });

    moneyQtyWrap.innerHTML = html;
  };

  if (!moneySlider.dataset.bound) {
    moneySlider.addEventListener("input", updateMoney);
    moneySlider.dataset.bound = "1";
  }

  updateMoney();
}
    // "Chart 3 komoditas" -> waffle gabungan (komposisi efisiensi protein)
    const simWaffleEl = document.getElementById("sim-waffle-wrap");
    if (simWaffleEl) {
      const items = [
        { key: "sapi", label: "Daging Sapi", color: C.sapi, val: protPer1k.sapi },
        { key: "ayam", label: "Daging Ayam", color: C.ayam, val: protPer1k.ayam },
        { key: "telur", label: "Telur Ayam", color: C.telur, val: protPer1k.telur }
      ];
      const total = items.reduce((a, b) => a + (Number(b.val) || 0), 0) || 1;

      // 100 cells total (percentage composition)
      const parts = items.map(d => ({ ...d, count: Math.round((d.val / total) * 100) }))
        .sort((a, b) => b.val - a.val);
      let sum = parts.reduce((a, b) => a + b.count, 0);
      while (sum > 100) { parts[0].count -= 1; sum -= 1; }
      while (sum < 100) { parts[0].count += 1; sum += 1; }

      const cells = [];
      parts.forEach(p => { for (let i = 0; i < p.count; i++) cells.push(p); });
      while (cells.length < 100) cells.push({ label: "", color: "var(--cream3)" });
      cells.length = 100;

      simWaffleEl.innerHTML = `
        <div style="font-size:10px;color:var(--text3);margin-bottom:10px;">
          Proporsi warna = porsi <strong>efisiensi protein per Rp 1.000</strong> (baseline Apr 2026).
        </div>
        <div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:10px;">
          ${parts.map(p => `
            <span style="display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--text2);">
              <span style="width:9px;height:9px;border-radius:2px;background:${p.color};display:inline-block;"></span>
              ${p.label} <span style="font-family:'DM Mono',monospace;color:var(--text3);">(${p.count}%)</span>
            </span>
          `).join("")}
        </div>
        <div class="waffle-grid" style="max-width:260px;">
          ${cells.map(c => `<div class="waffle-cell" style="background:${c.color};opacity:0.95;" title="${c.label || ""}"></div>`).join("")}
        </div>
      `;
    }

    // Insight teks efisiensi
    const ratio = protPer1k.telur / protPer1k.sapi;
    const insightEl = document.getElementById('nut-rp-insight');
    if (insightEl) {
      insightEl.innerHTML = `Dengan harga Apr 2026, setiap Rp 1.000 untuk telur menghasilkan <strong>sekitar ${ratio.toFixed(1).replace('.',',')}x lebih banyak protein</strong> dibanding daging sapi, dan sekitar ${(protPer1k.telur/protPer1k.ayam).toFixed(1).replace('.',',')}x lebih banyak dari ayam.`;
    }
  }

  /* ─── SCENE 6: DAYA BELI ─── */
  function renderDayaBeli(scenes) {
    const C = COLORS;
    const tick = '#9A8060', fnt = 'DM Sans', grid = 'rgba(92,61,30,0.055)';
    const aff = scenes?.affordability?.rows || {};

    // Data top 10 provinsi (kembali ke versi sebelumnya)
    const affLabels = ['NTT','Jabar','Jateng','Maluku Ut.','DIY','Sulteng','Kalbar','Jatim','Gorontalo','Maluku'];
    const affVals   = [21.3, 20.2, 19.5, 18.8, 18.6, 18.4, 18.3, 18.3, 18.1, 18.1];
    const avgByCommodity = {
      sapi: mean((aff.sapi || []).map(d => d.percentUMP)) || 44.6,
      ayam: mean((aff.ayam || []).map(d => d.percentUMP)) || 13.5,
      telur: mean((aff.telur || []).map(d => d.percentUMP)) || 15.5
    };
    const sortedAvg = [
      { key: "sapi", label: "Daging Sapi", value: avgByCommodity.sapi, color: C.sapi },
      { key: "ayam", label: "Daging Ayam", value: avgByCommodity.ayam, color: C.ayam },
      { key: "telur", label: "Telur Ayam", value: avgByCommodity.telur, color: C.telur }
    ].sort((a, b) => b.value - a.value);

    // KPI cards -> beban protein per komoditas
    setText('afford-worst-val',   `${sortedAvg[0].value.toFixed(1).replace(".", ",")}%`);
    setText('afford-worst-unit',  `${sortedAvg[0].label} — rata-rata nasional`);
    setText('afford-natavg-val',  `${sortedAvg[1].value.toFixed(1).replace(".", ",")}%`);
    setText('afford-natavg-unit', `${sortedAvg[1].label} — rata-rata nasional`);
    setText('afford-best-val',    `${sortedAvg[2].value.toFixed(1).replace(".", ",")}%`);
    setText('afford-best-unit',   `${sortedAvg[2].label} — rata-rata nasional`);

    // Bar chart top 10 provinsi
    const c7a = document.getElementById('c7a');
    if (c7a && !chartInstances['c7a']) {
        
        const dataSapi = affLabels.map(prov => {
            const d = (aff.sapi || []).find(item => item.prov === prov);
            return d ? d.percentUMP : 44.6; 
        });

        const dataAyam = affLabels.map(prov => {
            const d = (aff.ayam || []).find(item => item.prov === prov);
            return d ? d.percentUMP : 13.5;
        });

        chartInstances['c7a'] = new Chart(c7a, {
        type: 'bar',
        data: {
            labels: affLabels,
            datasets: [{
                label: 'Telur Ayam',
                data: affVals,
                extraSapi: dataSapi,
                extraAyam: dataAyam,
                backgroundColor: 'rgba(201,149,42,0.75)',
                borderWidth: 0, 
                borderRadius: 4,
                barPercentage: 0.85,      
                categoryPercentage: 0.9,
            }]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(45, 36, 26, 0.95)',
                    padding: 12,
                    callbacks: {
                        title: (ctx) => `Prov. ${ctx[0].label}`,
                        label: (ctx) => {
                            // Ambil data asli (Telur)
                            const telurVal = ctx.parsed.y.toFixed(1);
                            // Ambil data extra dari dataset yang sama pakai index yang pas
                            const idx = ctx.dataIndex;
                            const sapiVal = ctx.dataset.extraSapi[idx].toFixed(1);
                            const ayamVal = ctx.dataset.extraAyam[idx].toFixed(1);

                            return [
                                `🥩 Daging Sapi: ${sapiVal}% UMP (Bandingan)`,
                                `🍗 Daging Ayam: ${ayamVal}% UMP (Bandingan)`,
                                `🥚 Telur Ayam: ${telurVal}% UMP`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: tick, font: { family: fnt, size: 9 } }, grid: { display: false }, border: { color: 'transparent' } },
                y: { ticks: { color: tick, font: { family: fnt, size: 9 }, callback: v => v + '%' }, grid: { color: grid }, border: { color: 'transparent' }, max: 25 }
            }
        }
    });
    } 
  }

  /* FORECAST */
  function renderForecast(scenes) {
    const monthly = scenes?.trend?.monthly || [];
    const C = COLORS;
    const tick = 'rgba(253,250,244,0.55)', fnt = 'DM Sans', grid = 'rgba(255,255,255,0.06)';

    const trendLabels = monthly.map(d => d.label);
    const sapiAct     = monthly.map(d => d.sapi);
    const telurAct    = monthly.map(d => d.telur);

    // Naive seasonal projection: last known seasonal index × trend
    // Use 8-month ahead projection already computed, or fallback to hardcoded
    const sapiPrj  = scenes?.forecast?.sapi  || [136671,136603,136618,136959,137101,137274,137351,137688];
    const telurPrj = scenes?.forecast?.telur || [30069,29749,29944,30379,30266,30994,31469,32338];

    // Scale projections by cumulative growth factor from actual data
    const sapiScale  = sapiAct.length  ? (sapiAct[sapiAct.length-1]   / (sapiPrj[0]  || 1)) : 1;
    const telurScale = telurAct.length ? (telurAct[telurAct.length-1]  / (telurPrj[0] || 1)) : 1;

    const projLabels = ['Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const allLabels  = [...trendLabels, ...projLabels];
    const n = sapiAct.length;

    const sapiActFull    = [...sapiAct,  ...Array(8).fill(null)];
    const sapiPrjFull    = [...Array(n).fill(null), ...sapiPrj.map(v => Math.round(v * sapiScale))];
    const telurActFull   = [...telurAct, ...Array(8).fill(null)];
    const telurPrjFull   = [...Array(n).fill(null), ...telurPrj.map(v => Math.round(v * telurScale))];

    const c8 = document.getElementById('c8');
    if (c8 && !chartInstances['c8']) {
      chartInstances['c8'] = new Chart(c8, {
        type: 'line',
        data: {
          labels: allLabels,
          datasets: [
            {data:sapiActFull,   borderColor:C.sapi,   borderWidth:1.8, pointRadius:0, tension:.3, spanGaps:false},
            {data:sapiPrjFull,   borderColor:C.sapi,   borderWidth:1.8, borderDash:[5,4], pointRadius:0, tension:.3, spanGaps:false, backgroundColor:'transparent'},
            {data:telurActFull,  borderColor:'#E07040', borderWidth:1.8, pointRadius:0, tension:.3, spanGaps:false},
            {data:telurPrjFull,  borderColor:'#E07040', borderWidth:1.8, borderDash:[5,4], pointRadius:0, tension:.3, spanGaps:false, backgroundColor:'transparent'}
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: {display:false},
            tooltip: {mode:'index', intersect:false, callbacks:{label:ctx=>{
              const names=['Sapi aktual','Sapi proyeksi','Telur aktual','Telur proyeksi'];
              if (ctx.parsed.y === null) return null;
              return (names[ctx.datasetIndex]||'')+': Rp'+ctx.parsed.y.toLocaleString('id-ID');
            }}}
          },
          scales: {
            x: {ticks:{color:tick,font:{family:fnt,size:8.5},maxTicksLimit:16,maxRotation:0}, grid:{color:grid}, border:{color:'transparent'}},
            y: {ticks:{color:tick,font:{family:fnt,size:8.5},callback:v=>'Rp'+(v/1000).toFixed(0)+'rb'}, grid:{color:grid}, border:{color:'transparent'}}
          }
        }
      });
    }
  }

  function renderAll(scenes) {
    console.log("Renderer jalan:", scenes);
    renderHeroKPIs(scenes);
    renderTrendKPIs(scenes);
    // renderLandscapeKPIs & renderLandscapeCallout diganti versi GeoJSON di renderLandscapeVisuals
    renderLandscapeVisuals(scenes);
    renderTrendScene(scenes);
    renderSeasonalHeatmap(scenes);
    renderKetimpangan(scenes);
    renderNutrisi(scenes);
    renderDayaBeli(scenes);
    renderForecast(scenes);
  }

  global.ProteinSceneRenderer = {
    renderAll,
    renderHeroKPIs,
    renderTrendKPIs,
    renderLandscapeKPIs,
    renderLandscapeVisuals,
    renderTrendScene,
    renderTrendEventListAuto,
    renderKetimpangan,
    renderKetimpanganByComodity,
    renderNutrisi,
    renderDayaBeli,
    renderForecast
  };
})(window);