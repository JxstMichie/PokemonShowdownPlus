fetch("data.json").then((response) => response.json()).then((data) => {
  window.PokemonHPData = data;
  const script = document.createElement("script");
  script.src = "component.js";
  script.onload = start;
  document.head.append(script);
});

const storage = typeof browser !== "undefined" ? browser.storage.local : {
  get: async () => JSON.parse(localStorage.getItem("phd") || "{}"),
  set: async (values) => localStorage.setItem("phd", JSON.stringify({ ...JSON.parse(localStorage.getItem("phd") || "{}"), ...values }))
};

async function start() {
  const ITEM = "background:transparent url(https://play.pokemonshowdown.com/sprites/itemicons-sheet.png) no-repeat scroll -24px 0";
  const STATUSES = ["none", "paralysis", "poison", "toxic", "burn", "sleep", "freeze", "fainted"];
  const $ = (id) => document.getElementById(id);
  const apply = (detail) => document.dispatchEvent(new CustomEvent("phd-settings", { detail: JSON.stringify(detail) }));

  const { data: { view, shapes, panel: P } } = PokemonHP;
  const unit = P.width / view.width;
  const toY = (y) => (y - view.top) * unit;
  const layer = $("layer");
  const vars = {
    panel: P.width, chip: P.chip.width, gap: P.chip.gap, row: P.chip.rowHeight,
    box: P.chip.perRow * P.chip.width + (P.chip.perRow - 1) * P.chip.gap,
    overhang: (view.left + view.width - shapes.enemy[2][0]) * unit,
    "enemy-top": P.topGap - toY(shapes.enemy[0][1]),
    "player-bottom": P.bottomGap + P.chip.rowsReserved * P.chip.rowHeight + P.chipsGap - (view.top + view.height - shapes.playerFull[2][1]) * unit,
    "mirror-overhang": (view.left + view.width - shapes.playerFull[1][0]) * unit
  };
  for (const name in vars) layer.style.setProperty("--" + name, vars[name] + "px");

  const sides = { enemy: [], player: [] };
  const rows = {};
  let hpStyle = "standard";
  for (const side in sides) layer.append((rows[side] = Object.assign(document.createElement("div"), { className: "phd-row " + side })));

  let loaded = false;
  const draw = () => {
    document.body.classList.toggle("dark", $("dark").checked);
    for (const side in sides) {
      const mons = sides[side], enemy = side === "enemy";
      const spread = !enemy && hpStyle === "compact" && mons.length === 2;
      rows[side].classList.toggle("phd-spread", spread);
      const slim = mons.length > 3, fit = slim && PokemonHP.slimRow(mons.length, 640, enemy);
      rows[side].style.setProperty("--pad", slim ? fit.pad + "px" : "");
      rows[side].style.setProperty("--slim-w", slim ? fit.width + "px" : "");
      rows[side].style.setProperty(enemy ? "--overhang" : "--mirror-overhang", slim ? fit.overhang + "px" : "");
      while (rows[side].children.length > mons.length) rows[side].lastChild.remove();
      mons.forEach((mon, slot) => {
        const panel = rows[side].children[slot] || rows[side].appendChild(document.createElement("pokemon-hp"));
        const mirror = !enemy && (spread && slot === 1 || slim && slot === mons.length - 1);
        panel.style.order = slot;
        panel.classList.toggle("phd-mirror", mirror);
        panel.classList.toggle("phd-slim", slim);
        panel.setState({ side, compact: mons.length > 1, flushLeft: !enemy && !slot, mirror, slim, name: "Pokemon " + (slot + 1), level: 50, maxHP: 100, hp: mon.status === "fainted" ? 0 : 70, gender: "male", status: mon.status, mega: mon.mega, dynamax: mon.dynamax, itemStyle: ITEM }, { animate: false });
      });
    }
    if (loaded) storage.set({ preview: { sides, dark: $("dark").checked } });
  };

  const fit = () => $("stage").style.setProperty("--zoom", Math.min(1, ($("stage").parentElement.clientWidth - 24) / 640));
  window.addEventListener("resize", fit);

  const controls = $("sides");
  const render = (side) => {
    const box = controls.querySelector(`[data-side=${side}]`);
    box.innerHTML = `<div class="head">${side} <input type="number" min="0" max="4" value="${sides[side].length}" data-count></div>` + sides[side].map((mon, slot) =>
      `<div class="slot" data-slot="${slot}"><b>${slot + 1}</b><select>${STATUSES.map((status) => `<option${status === mon.status ? " selected" : ""}>${status}</option>`).join("")}</select><label><input type="checkbox" data-mega${mon.mega ? " checked" : ""}> mega</label><label><input type="checkbox" data-dynamax${mon.dynamax ? " checked" : ""}> dynamax</label></div>`).join("");
  };
  controls.onchange = (event) => {
    const box = event.target.closest("[data-side]"), side = box.dataset.side, mons = sides[side], target = event.target;
    if (target.matches("[data-count]")) {
      const count = Math.min(4, Math.max(0, Math.floor(+target.value) || 0));
      while (mons.length < count) mons.push({ status: "none", mega: false, dynamax: false });
      mons.length = count;
    } else {
      const mon = mons[+target.closest(".slot").dataset.slot];
      if (target.matches("select")) mon.status = target.value;
      else {
        mon.mega = target.matches("[data-mega]") && target.checked;
        mon.dynamax = target.matches("[data-dynamax]") && target.checked;
      }
    }
    render(side);
    draw();
  };
  for (const side in sides) {
    sides[side].push({ status: "none", mega: false, dynamax: false });
    if (side === "player") sides[side].push({ status: "none", mega: false, dynamax: false });
    render(side);
  }

  const saved = await storage.get(["megaStyle", "pauseColors", "showApngData", "apngFields", "hpStyle", "teraEffect", "teraCache", "teraCacheSize", "showCacheMenu", "preview", "localSourceOn", "localSourceUrl"]);
  const preview = saved.preview;
  if (preview) {
    for (const side in sides) if (Array.isArray(preview.sides && preview.sides[side])) sides[side] = preview.sides[side].slice(0, 4);
    $("dark").checked = !!preview.dark;
    for (const side in sides) render(side);
  }
  loaded = true;
  const megaStyle = saved.megaStyle || "wobble";
  document.querySelector(`[name=style][value=${megaStyle}]`).checked = true;
  $("pause").checked = !!saved.pauseColors;
  $("pause").onchange = () => {
    storage.set({ pauseColors: $("pause").checked });
    apply({ pauseColors: $("pause").checked });
  };
  $("tera").checked = saved.teraEffect !== false;
  $("tera").onchange = () => {
    storage.set({ teraEffect: $("tera").checked });
    apply({ teraEffect: $("tera").checked });
  };
  const clampCache = (value) => Math.max(6, Math.min(30, Math.round(Number(value)) || 12));
  $("teracache").checked = saved.teraCache !== false;
  $("teracachesize").value = clampCache(saved.teraCacheSize);
  $("teracachesize").disabled = !$("teracache").checked;
  $("teracache").onchange = () => {
    $("teracachesize").disabled = !$("teracache").checked;
    storage.set({ teraCache: $("teracache").checked });
    apply({ teraCache: $("teracache").checked });
  };
  $("teracachesize").onchange = () => {
    const teraCacheSize = clampCache($("teracachesize").value);
    $("teracachesize").value = teraCacheSize;
    storage.set({ teraCacheSize });
    apply({ teraCacheSize });
  };
  $("localon").checked = !!saved.localSourceOn;
  $("localurl").value = saved.localSourceUrl || "http://localhost:8765";
  const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
  const localOrigin = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" && LOCAL_HOSTS.includes(url.hostname) ? `http://${url.hostname}/*` : null;
    } catch (error) {
      return null;
    }
  };
  const canAsk = typeof browser !== "undefined" && browser.permissions;
  const saveLocal = async () => {
    const url = $("localurl").value.trim();
    let on = $("localon").checked;
    const origin = localOrigin(url);
    if (on && (!origin || (canAsk && !(await browser.permissions.request({ origins: [origin] }))))) {
      on = false;
      $("localon").checked = false;
    }
    await storage.set({ localSourceOn: on, localSourceUrl: url });
    if (!on && canAsk) {
      const previous = localOrigin(saved.localSourceUrl || "");
      if (previous) browser.permissions.remove({ origins: [previous] }).catch(() => {});
    }
    saved.localSourceUrl = url;
  };
  $("localon").onchange = saveLocal;
  $("localurl").onchange = saveLocal;
  const CACHE_SECTIONS = [{ id: "tera", title: "Terra cache" }];
  const formatSize = (bytes) => {
    const mb = bytes / 1048576;
    return (mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10) + "MB";
  };
  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const renderCaches = async () => {
    const shown = $("cachemenu").checked;
    $("cachebox").hidden = !shown;
    if (!shown) return;
    const index = (await storage.get("cacheIndex")).cacheIndex || {};
    $("caches").innerHTML = CACHE_SECTIONS.map((section) => {
      const entries = Array.isArray(index[section.id]) ? index[section.id] : [];
      const total = entries.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
      const rows = entries.map((entry) => `<li>${escapeHtml(entry.name)} ${formatSize(entry.bytes || 0)}</li>`).join("") || "<li>Empty</li>";
      return `<div class="cachesection"><h3>${section.title} (${entries.length}, ${formatSize(total)}) <button data-clear="${section.id}"${entries.length ? "" : " disabled"}>Clear</button></h3><ul>${rows}</ul></div>`;
    }).join("");
  };
  $("caches").onclick = async (event) => {
    const section = event.target.dataset && event.target.dataset.clear;
    if (!section) return;
    const index = (await storage.get("cacheIndex")).cacheIndex || {};
    const token = Date.now();
    await storage.set({ cacheIndex: { ...index, [section]: [] }, teraCacheClear: token });
    apply({ teraCacheClear: token });
    renderCaches();
  };
  $("cachemenu").checked = !!saved.showCacheMenu;
  $("cachemenu").onchange = () => {
    storage.set({ showCacheMenu: $("cachemenu").checked });
    renderCaches();
  };
  renderCaches();
  if (typeof browser !== "undefined" && browser.storage && browser.storage.onChanged) browser.storage.onChanged.addListener((changes) => changes.cacheIndex && renderCaches());
  $("apngdata").checked = !!saved.showApngData;
  $("apngdata").onchange = () => {
    storage.set({ showApngData: $("apngdata").checked });
    apply({ showApngData: $("apngdata").checked });
  };
  hpStyle = saved.hpStyle || "standard";
  document.querySelector(`[name=hpstyle][value=${hpStyle}]`).checked = true;
  document.querySelectorAll("[name=hpstyle]").forEach((radio) => (radio.onchange = () => {
    hpStyle = radio.value;
    storage.set({ hpStyle });
    apply({ hpStyle });
    draw();
  }));
  const fieldBoxes = [...document.querySelectorAll("#apngfields input")];
  const chosen = Array.isArray(saved.apngFields) ? saved.apngFields : fieldBoxes.map((box) => box.value);
  fieldBoxes.forEach((box) => {
    box.checked = chosen.includes(box.value);
    box.onchange = () => {
      const apngFields = fieldBoxes.filter((item) => item.checked).map((item) => item.value);
      storage.set({ apngFields });
      apply({ apngFields });
    };
  });
  const debugFiles = { images: new Map(), data: null };
  const dbgNS = "http://www.w3.org/2000/svg";
  const readPoint = (text) => (text || "").split(",").map(Number);
  const dbgImageSize = (url) => new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight });
    probe.onerror = () => resolve({ w: 0, h: 0 });
    probe.src = url;
  });
  async function renderDebugView() {
    const name = $("dbgimage").value;
    const image = debugFiles.images.get(name);
    const svg = $("dbgsvg");
    svg.replaceChildren();
    if (!image) { $("dbginfo").textContent = "No image loaded"; return; }
    const sideChoice = $("dbgside").value;
    const side = sideChoice === "auto" ? (/back/i.test(name) ? "back" : "front") : sideChoice;
    const place = debugFiles.data && (debugFiles.data[side] || debugFiles.data[side === "front" ? "back" : "front"]);
    const size = await dbgImageSize(image.url);
    const showStage = $("dbgstage").checked;
    const rect = place ? { x: place.x, y: place.y, w: place.w, h: place.h } : { x: 0, y: 0, w: size.w, h: size.h };
    const left = showStage ? Math.min(0, rect.x) : rect.x, top = showStage ? Math.min(0, rect.y) : rect.y;
    const right = showStage ? Math.max(640, rect.x + rect.w) : rect.x + rect.w, bottom = showStage ? Math.max(360, rect.y + rect.h) : rect.y + rect.h;
    const pad = 12;
    svg.setAttribute("viewBox", `${left - pad} ${top - pad} ${right - left + pad * 2} ${bottom - top + pad * 2}`);
    const add = (tag, attrs, text) => {
      const node = document.createElementNS(dbgNS, tag);
      for (const key in attrs) node.setAttribute(key, attrs[key]);
      if (text) node.textContent = text;
      svg.append(node);
      return node;
    };
    const chosen = new Set(fieldBoxes.filter((box) => box.checked).map((box) => box.value));
    if (showStage) add("rect", { x: 0, y: 0, width: 640, height: 360, fill: "none", stroke: "#3a7bd5", "stroke-width": 2, "stroke-dasharray": "8 5" });
    add("image", { href: image.url, x: rect.x, y: rect.y, width: rect.w, height: rect.h });
    const label = (x, y, text, color) => {
      add("rect", { x: x - 2, y: y - 11, width: text.length * 6.6 + 4, height: 14, fill: "rgba(0,0,0,.65)" });
      add("text", { x, y, fill: color, "font-family": "sans-serif", "font-size": 12 }, text);
    };
    const notes = [`image ${name} ${size.w}x${size.h}px`, place ? `data side: ${side}` : "no data.json loaded (showing raw image)"];
    if (place) {
      if (chosen.has("box")) add("rect", { x: rect.x, y: rect.y, width: rect.w, height: rect.h, fill: "none", stroke: "#ffdc00", "stroke-width": 1.5 });
      const mid = place.middle && typeof place.middle === "object" && size.w && size.h ? [rect.x + place.middle.x * rect.w / size.w, rect.y + place.middle.y * rect.h / size.h] : null;
      const center = mid || (typeof place.middle === "string" && readPoint(place.middle)) || (place.center && readPoint(place.center)), origin = place.origin && readPoint(place.origin), top = place["tallest-point"] && readPoint(place["tallest-point"]);
      if (chosen.has("center") && center) {
        add("line", { x1: rect.x, y1: center[1], x2: rect.x + rect.w, y2: center[1], stroke: "#50c8ff" });
        add("line", { x1: center[0] - 5, y1: center[1], x2: center[0] + 5, y2: center[1], stroke: "#ff2828", "stroke-width": 2 });
        add("line", { x1: center[0], y1: center[1] - 5, x2: center[0], y2: center[1] + 5, stroke: "#ff2828", "stroke-width": 2 });
        label(center[0] + 8, center[1] + 14, "middle point", "#ff2828");
      }
      if (chosen.has("origin") && origin) {
        add("circle", { cx: origin[0], cy: origin[1], r: 4, fill: "#ff2828", stroke: "#000" });
        label(origin[0] + 8, origin[1] + 4, "origin", "#ff2828");
      }
      if (chosen.has("highest") && top) {
        add("circle", { cx: top[0], cy: top[1], r: 3.5, fill: "#28ff50", stroke: "#000" });
        label(top[0] + 8, top[1] + 4, "highest point", "#28ff50");
      }
      if (chosen.has("hitbox") && place.hitbox && typeof place.hitbox === "object") {
        const hit = place.hitbox;
        add("rect", { x: rect.x + hit.x * rect.w, y: rect.y + hit.y * rect.h, width: hit.w * rect.w, height: hit.h * rect.h, fill: "rgba(255,77,255,.12)", stroke: "#ff4dff", "stroke-width": 1.5, "stroke-dasharray": "6 3" });
      }
      notes.push(`placement x=${place.x} y=${place.y} w=${place.w} h=${place.h}`, `origin ${place.origin || "-"} | middle ${place.middle ? (typeof place.middle === "object" ? `${place.middle.x},${place.middle.y} px` : place.middle) : place.center || "-"} | tallest ${place["tallest-point"] || "-"}`);
      if (size.w) notes.push(`image scale vs data: ${(size.w / place.w).toFixed(3)}x`);
    }
    $("dbginfo").textContent = notes.join("\n");
  }
  async function loadDebugFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    for (const entry of debugFiles.images.values()) URL.revokeObjectURL(entry.url);
    debugFiles.images.clear();
    debugFiles.data = null;
    for (const file of files) {
      if (/\.json$/i.test(file.name)) {
        if (debugFiles.data && file.name !== "data.json") continue;
        try { debugFiles.data = JSON.parse(await file.text()); } catch (error) { console.warn("[phd] debug data", error); }
      } else if (/\.(png|apng|gif|webp)$/i.test(file.name)) {
        debugFiles.images.set(file.name, { url: URL.createObjectURL(file) });
      }
    }
    $("dbgimage").replaceChildren(...[...debugFiles.images.keys()].map((name) => Object.assign(document.createElement("option"), { value: name, textContent: name })));
    $("dbgview").showModal();
    renderDebugView();
  }
  $("dbgfiles").onchange = () => { loadDebugFiles($("dbgfiles").files); $("dbgfiles").value = ""; };
  $("dbgdir").onchange = () => { loadDebugFiles($("dbgdir").files); $("dbgdir").value = ""; };
  $("dbgclose").onclick = () => $("dbgview").close();
  for (const id of ["dbgimage", "dbgside", "dbgstage"]) $(id).onchange = renderDebugView;
  fieldBoxes.forEach((box) => box.addEventListener("change", () => $("dbgview").open && renderDebugView()));
  apply({ megaStyle, pauseColors: $("pause").checked });
  document.querySelectorAll("[name=style]").forEach((radio) => (radio.onchange = () => {
    storage.set({ megaStyle: radio.value });
    apply({ megaStyle: radio.value });
  }));
  const canManage = typeof browser !== "undefined" && browser.permissions;
  $("domainbox").hidden = !canManage;
  const renderDomains = (domains) => {
    $("domains").innerHTML = domains.map((domain) => `<li>${domain} <button data-domain="${domain}">Remove</button></li>`).join("");
  };
  if (canManage) {
    renderDomains((await storage.get("domains")).domains || []);
    $("add").onclick = async () => {
      let host;
      try { host = new URL($("domain").value.includes("://") ? $("domain").value : "http://" + $("domain").value).hostname; } catch (error) { return; }
      if (!host || !(await browser.permissions.request({ origins: [`*://${host}/*`] }))) return;
      const domains = [...new Set([...((await storage.get("domains")).domains || []), host])];
      await storage.set({ domains });
      renderDomains(domains);
      $("domain").value = "";
    };
    $("domains").onclick = async (event) => {
      const host = event.target.dataset.domain;
      if (!host) return;
      const domains = ((await storage.get("domains")).domains || []).filter((domain) => domain !== host);
      await storage.set({ domains });
      await browser.permissions.remove({ origins: [`*://${host}/*`] });
      renderDomains(domains);
    };
  }
  $("dark").oninput = draw;
  fit();
  draw();
}
