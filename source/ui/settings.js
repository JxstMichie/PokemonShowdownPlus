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

  const saved = await storage.get(["megaStyle", "pauseColors", "showApngData", "apngFields", "hpStyle", "preview"]);
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
