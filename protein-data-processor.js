/* protein-data-processor.js
   Load Excel files, normalize them, and generate scene-ready data for Protein Maxxing.
   Required in browser:
   <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
*/

(function (global) {
  "use strict";

  const COMMODITIES = {
    sapi:  { label: "Daging Sapi",  priceField: "Daging_Sapi",  color: "#5A7A52", nutritionAliases: ["daging sapi", "sapi"] },
    ayam:  { label: "Daging Ayam",  priceField: "Daging_Ayam",  color: "#C9952A", nutritionAliases: ["daging ayam", "ayam"] },
    telur: { label: "Telur Ayam",   priceField: "Telur_Ayam",   color: "#C4522A", nutritionAliases: ["telur ayam", "telur"] }
  };

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  const PROVINCE_ALIASES = {
    "Dki Jakarta": "DKI Jakarta",
    "Di Yogyakarta": "DI Yogyakarta",
    "Di. Yogyakarta": "DI Yogyakarta",
    "D.I. Yogyakarta": "DI Yogyakarta",
    "Daerah Istimewa Yogyakarta": "DI Yogyakarta",
    "Kepulauan Bangka Belitung": "Bangka Belitung",
    "Bangka Belitung": "Bangka Belitung",
    "Kepulauan Riau": "Kepulauan Riau",
    "Nusa Tenggara Barat": "Nusa Tenggara Barat",
    "Nusa Tenggara Timur": "Nusa Tenggara Timur",
    "Papua Barat": "Papua Barat",
    "Maluku Utara": "Maluku Utara"
  };

  function titleCase(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, m => m.toUpperCase());
  }

  function normalizeProvince(s) {
    const t = titleCase(s);
    return PROVINCE_ALIASES[t] || t;
  }

  function toNumber(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const n = Number(String(v).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function excelDateToISO(v) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "number") {
      const d = XLSX.SSF.parse_date_code(v);
      if (!d) return null;
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    const s = String(v || "").trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toISOString().slice(0, 10);
  }

  function ym(iso) {
    return String(iso).slice(0, 7);
  }

  function monthIndex(iso) {
    return Number(String(iso).slice(5, 7)) - 1;
  }

  function mean(arr) {
    const clean = arr.map(toNumber).filter(v => v !== null);
    return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + (toNumber(b) || 0), 0);
  }

  function pctChange(current, previous) {
    if (!current || !previous) return null;
    return ((current - previous) / previous) * 100;
  }

  function groupBy(rows, keyFn) {
    const m = new Map();
    rows.forEach(r => {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return m;
  }

  function latestKey(keys) {
    return [...keys].sort().at(-1);
  }

  async function readWorkbookFromUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gagal membaca ${url}`);
    const buffer = await res.arrayBuffer();
    return XLSX.read(buffer, { type: "array", cellDates: true });
  }

  async function readWorkbookFromFile(file) {
    const buffer = await file.arrayBuffer();
    return XLSX.read(buffer, { type: "array", cellDates: true });
  }

  function sheetRows(wb, sheetName) {
    const name = sheetName || wb.SheetNames[0];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
  }

  function normalizeKomoditas(rows) {
    return rows.map(r => ({
      date: excelDateToISO(r.Date || r.Tanggal || r.date),
      month: ym(excelDateToISO(r.Date || r.Tanggal || r.date)),
      province: normalizeProvince(r.Province || r.Provinsi || r.province),
      harga: {
        sapi: toNumber(r.Daging_Sapi ?? r["Daging Sapi"]),
        ayam: toNumber(r.Daging_Ayam ?? r["Daging Ayam"]),
        telur: toNumber(r.Telur_Ayam ?? r["Telur Ayam"])
      }
    })).filter(r => r.date && r.province);
  }

  function normalizeUMP(rows) {
    const out = {};
    rows.forEach(r => {
      const province = normalizeProvince(r.Province || r.Provinsi || r.province);
      if (!province) return;
      out[province] = {};
      Object.keys(r).forEach(k => {
        const year = String(k).match(/\d{4}/)?.[0];
        if (year) out[province][year] = toNumber(r[k]);
      });
    });
    return out;
  }

  function normalizeNutrisi(rows) {
  const out = {};

  function pick(row, keys) {
    for (const k of Object.keys(row)) {
      for (const target of keys) {
        if (k.toLowerCase().includes(target)) {
          return toNumber(row[k]);
        }
      }
    }
    return null;
  }

  rows.forEach(r => {
    const bahan = String(r.Bahan || r.bahan || "").toLowerCase().trim();
    if (!bahan) return;

    const key = Object.keys(COMMODITIES).find(k =>
      COMMODITIES[k].nutritionAliases.some(a => bahan.includes(a))
    );
    if (!key) return;

    out[key] = {
      bahan: r.Bahan,
      kalori: pick(r, ["kalori", "energi"]),
      protein: pick(r, ["protein"]),
      lemak: pick(r, ["lemak", "fat"]),
      karbo: pick(r, ["karbo", "karbohidrat"]),
      kode: r.Kode || null,
      keterangan: r.Keterangan || "per 100 gram"
    };
  });

  return out;
}

  function normalizeKonsumsi(rows) {
    const targets = {
      sapi:  ["daging sapi", "sapi/kerbau", "sapi"],
      ayam:  ["daging ayam", "ayam ras", "ayam"],
      telur: ["telur ayam ras", "telur ayam"]
    };
    const out = {};
    rows.forEach(r => {
      const name = String(r["Jenis Bahan Makanan"] || "").toLowerCase().trim();
      if (!name) return;
      const key = Object.keys(targets).find(k => targets[k].some(t => name.includes(t)));
      if (!key || out[key]) return; // skip if not matched or already filled (take first match)
      out[key] = Object.keys(r)
        .filter(k => /^\d{4}$/.test(String(k)))
        .map(year => ({ year: Number(year), value: toNumber(r[year]), satuan: r.Satuan || null }))
        .filter(d => d.value !== null)
        .sort((a, b) => a.year - b.year);
    });
    return out;
  }

  function nationalMonthly(raw) {
    const byMonth = groupBy(raw.komoditas, r => r.month);
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => {
      const item = { month, label: formatMonth(month) };
      Object.keys(COMMODITIES).forEach(k => item[k] = Math.round(mean(rows.map(r => r.harga[k])) || 0));
      return item;
    });
  }

  function latestProvincePrices(raw, latestMonth) {
    const rows = raw.komoditas.filter(r => r.month === latestMonth);
    const byProvince = groupBy(rows, r => r.province);
    return [...byProvince.entries()].map(([province, rs]) => {
      const item = { province };
      Object.keys(COMMODITIES).forEach(k => item[k] = Math.round(mean(rs.map(r => r.harga[k])) || 0));
      return item;
    });
  }

  function formatMonth(month) {
    const [y, m] = month.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  }

  function topN(rows, commodity, n = 10, direction = "desc") {
    return [...rows]
      .filter(r => r[commodity])
      .sort((a, b) => direction === "desc" ? b[commodity] - a[commodity] : a[commodity] - b[commodity])
      .slice(0, n)
      .map((r, i) => ({ rank: i + 1, province: r.province, value: r[commodity] }));
  }

  function seasonal(raw) {
    const result = {};
    Object.keys(COMMODITIES).forEach(k => {
      result[k] = MONTH_NAMES.map((label, i) => {
        const values = raw.komoditas.filter(r => monthIndex(r.date) === i).map(r => r.harga[k]);
        return { month: i + 1, label, value: Math.round(mean(values) || 0) };
      });
    });
    return result;
  }

  function seasonalSummary(seasonalRows) {
    const out = {};
    Object.keys(seasonalRows).forEach(k => {
      const rows = seasonalRows[k].filter(r => r.value);
      const high = [...rows].sort((a, b) => b.value - a.value)[0];
      const low = [...rows].sort((a, b) => a.value - b.value)[0];
      out[k] = {
        peak: high,
        low,
        amplitudePct: high && low ? pctChange(high.value, low.value) : null
      };
    });
    return out;
  }

  function affordability(latestRows, raw, options) {
    const year = String(options.umpYear || 2025);
    const dailyProteinGoal = options.dailyProteinGoal || 60;
    const days = options.days || 30;
    const result = {};
    Object.keys(COMMODITIES).forEach(k => {
      const nutrition = raw.nutrisi[k];
      result[k] = latestRows.map(r => {
        const ump = raw.ump[r.province]?.[year] || null;
        const pricePerKg = r[k];
        const pricePer100g = pricePerKg / 10;
        const costPerDay = nutrition?.protein ? (dailyProteinGoal / nutrition.protein) * pricePer100g : null;
        const costPerMonth = costPerDay ? costPerDay * days : null;
        return {
          province: r.province,
          ump,
          pricePerKg,
          costPerDay,
          costPerMonth,
          percentUMP: ump && costPerMonth ? (costPerMonth / ump) * 100 : null
        };
      }).filter(r => r.percentUMP !== null).sort((a, b) => b.percentUMP - a.percentUMP);
    });
    return result;
  }

  function nutritionEfficiency(latestNational, raw) {
    const out = {};
    Object.keys(COMMODITIES).forEach(k => {
      const n = raw.nutrisi[k];
      const pricePerKg = latestNational[k];
      out[k] = {
        ...n,
        pricePerKg,
        proteinPerRp1000: n?.protein && pricePerKg ? (n.protein / (pricePerKg / 10)) * 1000 : null,
        cost60gProteinPerDay: n?.protein && pricePerKg ? (60 / n.protein) * (pricePerKg / 10) : null
      };
    });
    return out;
  }

  function trendEvents(monthly) {
    const out = {};
    Object.keys(COMMODITIES).forEach(k => {
      let maxJump = null;
      for (let i = 1; i < monthly.length; i++) {
        const jump = pctChange(monthly[i][k], monthly[i - 1][k]);
        if (jump !== null && (!maxJump || jump > maxJump.pct)) {
          maxJump = { from: monthly[i - 1].month, to: monthly[i].month, pct: jump, fromValue: monthly[i - 1][k], toValue: monthly[i][k] };
        }
      }
      const first = monthly[0]?.[k], last = monthly.at(-1)?.[k];
      out[k] = { maxMonthlyJump: maxJump, cumulativePct: pctChange(last, first), first, last };
    });
    return out;
  }

  function forecastNaiveSeasonal(monthly, monthsAhead = 8) {
    const out = {};
    Object.keys(COMMODITIES).forEach(k => {
      const series = monthly.map(r => ({ month: r.month, value: r[k] })).filter(r => r.value);
      if (series.length < 13) {
        out[k] = [];
        return;
      }
      const last = series.at(-1);
      const lastDate = new Date(`${last.month}-01T00:00:00`);
      const prevYearSameMonth = series.find(r => r.month === `${lastDate.getFullYear() - 1}-${String(lastDate.getMonth() + 1).padStart(2, "0")}`);
      const trendFactor = prevYearSameMonth ? last.value / prevYearSameMonth.value : 1;
      out[k] = [];
      for (let i = 1; i <= monthsAhead; i++) {
        const d = new Date(lastDate);
        d.setMonth(d.getMonth() + i);
        const futureMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const reference = `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const refRow = series.find(r => r.month === reference);
        out[k].push({
          month: futureMonth,
          label: formatMonth(futureMonth),
          value: refRow ? Math.round(refRow.value * trendFactor) : null,
          method: "naive seasonal × latest YoY factor"
        });
      }
    });
    return out;
  }

  function buildSceneData(raw, options = {}) {
    const monthly = nationalMonthly(raw);
    const latestMonth = options.latestMonth || latestKey(monthly.map(r => r.month));
    const latestNational = monthly.find(r => r.month === latestMonth);
    const sameMonthPrevYear = monthly.find(r => r.month === `${Number(latestMonth.slice(0, 4)) - 1}-${latestMonth.slice(5, 7)}`);
    const latestRows = latestProvincePrices(raw, latestMonth);
    const seasonalRows = seasonal(raw);
    const affordabilityRows = affordability(latestRows, raw, options);
    const efficiency = nutritionEfficiency(latestNational, raw);
    const trend = trendEvents(monthly);

    const hero = Object.keys(COMMODITIES).map(k => ({
      key: k,
      label: COMMODITIES[k].label,
      value: latestNational[k],
      unit: "Rp/kg",
      month: latestMonth,
      yoyPct: sameMonthPrevYear ? pctChange(latestNational[k], sameMonthPrevYear[k]) : null
    }));

    const landscape = {};
    Object.keys(COMMODITIES).forEach(k => {
      const sorted = [...latestRows].filter(r => r[k]).sort((a, b) => b[k] - a[k]);
      landscape[k] = {
        top10: topN(latestRows, k, 10, "desc"),
        bottom10: topN(latestRows, k, 10, "asc"),
        mostExpensive: sorted[0] || null,
        cheapest: sorted.at(-1) || null,
        gap: sorted[0] && sorted.at(-1) ? sorted[0][k] - sorted.at(-1)[k] : null,
        mapRows: latestRows.map(r => ({ province: r.province, value: r[k] }))
      };
    });

    const scatter = latestRows.map(r => ({
      province: r.province,
      ump: raw.ump[r.province]?.[String(options.umpYear || 2025)] || null,
      sapi: r.sapi,
      ayam: r.ayam,
      telur: r.telur
    })).filter(r => r.ump);

    return {
      meta: {
        generatedAt: new Date().toISOString(),
        latestMonth,
        latestLabel: formatMonth(latestMonth),
        umpYear: options.umpYear || 2025,
        dailyProteinGoal: options.dailyProteinGoal || 60
      },
      hero,
      landscape,
      trend: {
        monthly,
        events: trend,
        labels: monthly.map(r => r.label),
        datasets: Object.keys(COMMODITIES).map(k => ({
          key: k,
          label: COMMODITIES[k].label,
          data: monthly.map(r => r[k]),
          color: COMMODITIES[k].color
        }))
      },
      seasonal: {
        rows: seasonalRows,
        summary: seasonalSummary(seasonalRows),
        heatmap: Object.keys(COMMODITIES).map(k => ({
          key: k,
          label: COMMODITIES[k].label,
          data: seasonalRows[k]
        }))
      },
      inequality: {
        scatter,
        gap: Object.keys(COMMODITIES).map(k => {
          const sorted = [...latestRows].filter(r => r[k] > 0).sort((a, b) => b[k] - a[k]);
          return {
            key: k,
            label: COMMODITIES[k].label,
            value: landscape[k].gap,
            min: sorted.at(-1)?.[k] ?? null,
            minProvince: sorted.at(-1)?.province ?? null,
            max: sorted[0]?.[k] ?? null,
            maxProvince: sorted[0]?.province ?? null,
            color: COMMODITIES[k].color
          };
        })
      },
      nutrition: {
        raw: raw.nutrisi,
        efficiency,
        consumption: raw.konsumsi
      },
      affordability: {
        rows: affordabilityRows,
        top10Telur: affordabilityRows.telur.slice(0, 10),
        top10Ayam: affordabilityRows.ayam.slice(0, 10),
        top10Sapi: affordabilityRows.sapi.slice(0, 10)
      },
      forecast: forecastNaiveSeasonal(monthly, options.monthsAhead || 8)
    };
  }

  async function loadFromUrls(paths, options = {}) {
    const [komoditasWb, umpWb, nutrisiWb, konsumsiWb] = await Promise.all([
      readWorkbookFromUrl(paths.komoditas),
      readWorkbookFromUrl(paths.ump),
      readWorkbookFromUrl(paths.nutrisi),
      readWorkbookFromUrl(paths.konsumsi)
    ]);

    const raw = {
      komoditas: normalizeKomoditas(sheetRows(komoditasWb)),
      ump: normalizeUMP(sheetRows(umpWb)),
      nutrisi: normalizeNutrisi(sheetRows(nutrisiWb, paths.nutrisiSheet || "Sheet2")),
      konsumsi: normalizeKonsumsi(sheetRows(konsumsiWb))
    };

    return { raw, scenes: buildSceneData(raw, options) };
  }

  async function loadFromFiles(files, options = {}) {
    const [komoditasWb, umpWb, nutrisiWb, konsumsiWb] = await Promise.all([
      readWorkbookFromFile(files.komoditas),
      readWorkbookFromFile(files.ump),
      readWorkbookFromFile(files.nutrisi),
      readWorkbookFromFile(files.konsumsi)
    ]);

    const raw = {
      komoditas: normalizeKomoditas(sheetRows(komoditasWb)),
      ump: normalizeUMP(sheetRows(umpWb)),
      nutrisi: normalizeNutrisi(sheetRows(nutrisiWb, files.nutrisiSheet || "Sheet2")),
      konsumsi: normalizeKonsumsi(sheetRows(konsumsiWb))
    };

    return { raw, scenes: buildSceneData(raw, options) };
  }

  global.ProteinData = {
    COMMODITIES,
    MONTH_NAMES,
    loadFromUrls,
    loadFromFiles,
    buildSceneData,
    normalizeKomoditas,
    normalizeUMP,
    normalizeNutrisi,
    normalizeKonsumsi,
    utils: { toNumber, mean, pctChange, formatMonth, normalizeProvince }
  };
})(window);