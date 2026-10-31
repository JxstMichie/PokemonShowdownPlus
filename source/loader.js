(async () => {
  if (globalThis.__phdLoader) return;
  globalThis.__phdLoader = true;
  const runtime = browser.runtime;

  const backdrop = document.createElement("style");
  backdrop.textContent = `.backdrop[style*="sprites/gen6bgs/"] { top: 0 !important; left: 0 !important; width: 640px !important; height: 360px !important; background-size: cover !important; background-position: center !important; }
    .mistyterrainweather, .electricterrainweather, .grassyterrainweather, .psychicterrainweather, .trickroomweather, .magicroomweather, .wonderroomweather { background-color: transparent !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }`;
  (document.head || document.documentElement).appendChild(backdrop);

  // ImageDecoder is not avaialble on older browsers
  function apngDuration(buffer) {
    const view = new DataView(buffer);
    let offset = 8, totalMs = 0;
    while (offset + 8 <= view.byteLength) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
      if (type === "fcTL") {
        const delayNumerator = view.getUint16(offset + 8 + 20);
        const delayDenominator = view.getUint16(offset + 8 + 22) || 100;
        totalMs += (delayNumerator / delayDenominator) * 1000;
      } else if (type === "IEND") break;
      offset += 12 + length;
    }
    return Math.round(totalMs) || 2000;
  }

  const [list, placements, layout, moves, ui, settings, teraTexture, bakeSource] = await Promise.all([
    fetch(runtime.getURL("sprites.txt")).then((response) => response.text()),
    fetch(runtime.getURL("render_metadata.json")).then((response) => response.json()),
    fetch(runtime.getURL("doubles.json")).then((response) => response.json()).then((data) => ({ doubles: data.doubles || null, hpBars: data.hpBars || null })).catch(() => null),
    fetch(runtime.getURL("move.json")).then((response) => response.json()).catch(() => null), //Might have some errors, should be a temp solution
    fetch(runtime.getURL("ui/data.json")).then((response) => response.json()),
    browser.storage.local.get(null).catch(() => ({})),
    fetch(runtime.getURL("fx/terra-transform/terra_texture.png")).then((response) => response.blob()).then((blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    })).catch(() => null),
    fetch(runtime.getURL("tera-bake.js")).then((response) => response.text()).catch(() => null),
  ]);
  const { tags: baselineTags, dropped, added, removals } = phdApplyOverwrites(placements, settings || {});
  if (dropped.length || removals.length || Object.keys(added).length) runtime.sendMessage({ type: "phd-sync", dropped, added, removals }).catch(() => {});

  const send = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(detail) }));

  browser.storage.onChanged.addListener((changes) => {
    if (!changes.megaStyle && !changes.pauseColors && !changes.showApngData && !changes.apngFields && !changes.hpStyle && !changes.teraEffect && !changes.teraCache && !changes.teraCacheSize && !changes.teraCacheClear) return;
    send("phd-settings", { megaStyle: changes.megaStyle && changes.megaStyle.newValue, pauseColors: changes.pauseColors && changes.pauseColors.newValue, showApngData: changes.showApngData && changes.showApngData.newValue, apngFields: changes.apngFields && changes.apngFields.newValue, hpStyle: changes.hpStyle && changes.hpStyle.newValue, teraEffect: changes.teraEffect && changes.teraEffect.newValue, teraCache: changes.teraCache && changes.teraCache.newValue, teraCacheSize: changes.teraCacheSize && changes.teraCacheSize.newValue, teraCacheClear: changes.teraCacheClear && changes.teraCacheClear.newValue });
  });

  document.addEventListener("phd-open-settings", () => runtime.sendMessage({ type: "phd-open-settings" }).catch(() => {}));

  document.addEventListener("phd-cache-index", async (event) => {
    let detail;
    try { detail = JSON.parse(String(event.detail)); } catch (error) { return; }
    if (!detail || typeof detail.section !== "string" || !Array.isArray(detail.entries)) return;
    try {
      const stored = await browser.storage.local.get("cacheIndex");
      await browser.storage.local.set({ cacheIndex: { ...(stored.cacheIndex || {}), [detail.section]: detail.entries } });
    } catch (error) {}
  });

  document.addEventListener("phd-stale", async (event) => {
    let request;
    try { request = JSON.parse(String(event.detail)); } catch (error) { return; }
    const { name, dir, tag } = request;
    let entry = null;
    try {
      entry = await runtime.sendMessage({ type: "phd-stale", name, dir, tag, base: baselineTags[name] || "" });
    } catch (error) { entry = null; }
    if (entry) placements[name] = entry;
    send("phd-patch", { name, entry: entry || null });
  });

  const durations = {};
  document.addEventListener("phd-duration-request", async (event) => {
    const url = String(event.detail);
    if (!(url in durations)) {
      try {
        durations[url] = apngDuration(await (await fetch(url)).arrayBuffer());
      } catch (error) { durations[url] = 2000; }
    }
    send("phd-duration", { url, ms: durations[url] });
  });

  const configs = {
    "ui/component.js": { ui, megaStyle: settings && settings.megaStyle, pauseColors: settings && settings.pauseColors },
    "ui/panels.js": { hpStyle: settings && settings.hpStyle },
    "page.js": { size: 192, list, placements, doubles: layout && layout.doubles, hpBars: layout && layout.hpBars, lunge: moves && moves.lunge || [] },
    "tera.js": { teraTexture, bakeSource, teraEffect: !settings || settings.teraEffect !== false, teraCache: !settings || settings.teraCache !== false, teraCacheSize: settings && settings.teraCacheSize, teraCacheClear: settings && settings.teraCacheClear },
    "debug.js": { showApngData: settings && settings.showApngData, apngFields: settings && settings.apngFields }
  };

  for (const file of ["config.js", "ui/component.js", "ui/ability.js", "page.js", "tera-bake.js", "tera.js", "ui/panels.js", "debug.js"]) {
    const script = document.createElement("script");
    script.src = runtime.getURL(file);
    script.async = false;
    if (configs[file]) script.dataset.cfg = JSON.stringify(configs[file]);
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }
})();
