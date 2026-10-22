(async () => {
  const runtime = browser.runtime;

  const backdrop = document.createElement("style");
  backdrop.textContent = `.backdrop[style*="sprites/gen6bgs/"] { top: 0 !important; left: 0 !important; width: 640px !important; height: 360px !important; background-size: cover !important; background-position: center !important; }
    .mistyterrainweather, .electricterrainweather, .grassyterrainweather, .psychicterrainweather, .trickroomweather { background-color: transparent !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }`;
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

  const [list, sizes, placements, layout, moves] = await Promise.all([
    fetch(runtime.getURL("sprites.txt")).then((response) => response.text()),
    fetch(runtime.getURL("sizes.json")).then((response) => response.json()),
    fetch(runtime.getURL("placements.json")).then((response) => response.json()),
    fetch(runtime.getURL("doubles.json")).then((response) => response.json()).then((data) => ({ doubles: data.doubles || null, hpBars: data.hpBars || null })).catch(() => null),
    fetch(runtime.getURL("move.json")).then((response) => response.json()).catch(() => null), //Might have some errors, should be a temp solution 
  ]);
  const send = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(detail) }));

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

  for (const file of ["config.js", "page.js"]) {
    const script = document.createElement("script");
    script.src = runtime.getURL(file);
    script.async = false;
    script.dataset.cfg = JSON.stringify({ size: 192, list, sizes, placements, doubles: layout && layout.doubles, hpBars: layout && layout.hpBars, lunge: moves && moves.lunge || [] });
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }
})();
