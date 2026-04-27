console.log("APP LOADED");
function pickNumber(row, possibleKeys, fallback = 0) {
  for (const key of possibleKeys) {
    const foundKey = Object.keys(row).find(k =>
      k.trim().toLowerCase() === key.trim().toLowerCase()
    );
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== "") {
      return Number(String(row[foundKey]).replace(",", ".")) || fallback;
    }
  }
  return fallback;
}



document.addEventListener("DOMContentLoaded", async () => {
  const files = {
    komoditas: "./data/dataset_komoditas.xlsx",
    ump: "./data/dataset_ump.xlsx",
    nutrisi: "./data/dataset_nutrisi.xlsx",
    konsumsi: "./data/dataset_rataankonsumsi.xlsx"
  };

  try {
    console.log("Cek file Excel...");

    for (const [name, url] of Object.entries(files)) {
      const res = await fetch(url);
      console.log(name, url, res.status, res.ok);

      if (!res.ok) {
        throw new Error(`${name} tidak ketemu di ${url}`);
      }
    }

    console.log("Semua file ketemu. Mulai proses data...");

    const { scenes, raw } = await ProteinData.loadFromUrls({
      ...files,
      nutrisiSheet: "Sheet2"
    }, {
      umpYear: 2025,
      dailyProteinGoal: 60,
      monthsAhead: 8
    });

    window.PROTEIN_RAW_DATA = raw;
    window.PROTEIN_SCENE_DATA = scenes;
    console.log("SCENES:", scenes);

    ProteinSceneRenderer.renderAll(scenes);

    // Fix map size for hidden tabs: invalidate after all maps finish loading
    setTimeout(() => {
      const maps = window.leafletMaps || {};
      const bounds = window.leafletBounds || {};
      ["sapi", "ayam", "telur"].forEach(key => {
        if (maps[key] && bounds[key]) {
          maps[key].invalidateSize(false);
          maps[key].fitBounds(bounds[key], { padding: [8, 8], animate: false });
        }
      });
    }, 2500);

    console.log("Berhasil render:", scenes);

  } catch (err) {
    console.error("ERROR DETAIL:", err);

    const msg = document.createElement("div");
    msg.style.cssText = `
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 99999;
      background: #5C3D1E;
      color: #FDFAF4;
      padding: 18px 24px;
      font-family: sans-serif;
      font-size: 16px;
      font-weight: 600;
    `;
    msg.textContent = "Error detail: " + err.message;
    document.body.appendChild(msg);
  }
});