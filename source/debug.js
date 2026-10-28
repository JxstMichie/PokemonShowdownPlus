(() => {
  const cfg = JSON.parse(document.currentScript.dataset.cfg);
  const NS = "http://www.w3.org/2000/svg";
  const YELLOW = "#ffdc00", RED = "#ff2828", GREEN = "#28ff50", CYAN = "#50c8ff";
  const overlays = new Map();
  let enabled = !!cfg.showApngData, announced = false;

  document.addEventListener("phd-settings", (event) => {
    const detail = JSON.parse(event.detail);
    if (typeof detail.showApngData === "boolean") enabled = detail.showApngData;
  });

  const parse = (text) => text.split(",").map(Number);

  function activeSprites() {
    const out = [];
    const battles = new Set();
    for (const room of [...Object.values((window.PS && PS.rooms) || {}), ...Object.values((window.app && app.rooms) || {})]) if (room && room.battle) battles.add(room.battle);
    for (const scene of window.__phdScenes || []) if (scene && scene.battle) battles.add(scene.battle);
    for (const battle of battles) {
      if (!battle.nearSide) continue;
      for (const side of [battle.nearSide, battle.farSide]) {
        for (const pokemon of (side && side.active) || []) {
          if (pokemon && pokemon.sprite && pokemon.sprite.$el && pokemon.sprite.$el[0]) out.push(pokemon.sprite);
        }
      }
    }
    return out;
  }

  function overlayOf(sprite, el) {
    let svg = overlays.get(sprite);
    if (svg && svg.parentNode === el.parentNode) return svg;
    if (svg) svg.remove();
    svg = document.createElementNS(NS, "svg");
    svg.style.cssText = "position:absolute;pointer-events:none;overflow:visible;z-index:9999";
    el.parentNode.appendChild(svg);
    overlays.set(sprite, svg);
    return svg;
  }

  function label(x, y, text, color) {
    return `<rect x="${x - 2}" y="${y - 11}" width="${text.length * 6.6 + 4}" height="14" fill="rgba(0,0,0,.65)"/><text x="${x}" y="${y}" fill="${color}" font-family="sans-serif" font-size="12">${text}</text>`;
  }

  function marks(place, width, height, aerial) {
    const at = (x, y) => [(x - place.x) / place.w * width, (y - place.y) / place.h * height];
    let out = `<rect x="1" y="1" width="${Math.max(0, width - 2)}" height="${Math.max(0, height - 2)}" fill="none" stroke="${YELLOW}" stroke-width="2"/>`;
    if (aerial) out += label(width + 6, 14, "aerial", YELLOW);
    const center = place.center && at(...parse(place.center));
    const top = place["tallest-point"] && at(...parse(place["tallest-point"]));
    if (center) {
      out += `<line x1="0" y1="${center[1]}" x2="${width}" y2="${center[1]}" stroke="${CYAN}"/>`;
      if (top) out += `<line x1="${center[0]}" y1="${center[1]}" x2="${center[0]}" y2="${top[1]}" stroke="${CYAN}"/>`;
      out += `<line x1="${center[0] - 4}" y1="${center[1]}" x2="${center[0] + 4}" y2="${center[1]}" stroke="${RED}" stroke-width="2"/><line x1="${center[0]}" y1="${center[1] - 4}" x2="${center[0]}" y2="${center[1] + 4}" stroke="${RED}" stroke-width="2"/>`;
      out += label(center[0] + 8, center[1] + 14, "middle point", RED);
    }
    if (top) out += `<circle cx="${top[0]}" cy="${top[1]}" r="3.5" fill="${GREEN}" stroke="#000"/>` + label(top[0] + 8, top[1] + 4, "highest point", GREEN);
    return out;
  }

  function draw(sprite) {
    const el = sprite.$el[0];
    const place = sprite.sp && window.__phdPlacementOf && window.__phdPlacementOf(sprite.sp);
    const svg = el.parentNode && place && overlayOf(sprite, el);
    if (!svg) return;
    const style = getComputedStyle(el);
    const width = parseFloat(el.style.width) || el.offsetWidth, height = parseFloat(el.style.height) || el.offsetHeight;
    const hidden = style.display === "none" || style.visibility === "hidden" || +style.opacity === 0 || !width || !height;
    svg.style.display = hidden ? "none" : "";
    if (hidden) return;
    svg.style.left = (parseFloat(el.style.left) || el.offsetLeft) + "px";
    svg.style.top = (parseFloat(el.style.top) || el.offsetTop) + "px";
    svg.style.width = width + "px";
    svg.style.height = height + "px";
    svg.innerHTML = marks(place, width, height, !!(window.__phdIsAerial && window.__phdIsAerial(sprite.sp)));
  }

  function clear() {
    for (const svg of overlays.values()) svg.remove();
    overlays.clear();
  }

  function tick() {
    try {
      if (!enabled) {
        if (overlays.size) clear();
      } else {
        const live = new Set(activeSprites());
        if (!announced && live.size) {
          announced = true;
          console.info("[phd] apng data overlay on", live.size, "sprites");
        }
        for (const [sprite, svg] of overlays) if (!live.has(sprite)) { svg.remove(); overlays.delete(sprite); }
        live.forEach(draw);
      }
    } catch (error) { console.warn("[phd] apng data", error); }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
