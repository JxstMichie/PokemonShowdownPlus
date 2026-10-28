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
  const $ = (id) => document.getElementById(id);
  const apply = (detail) => document.dispatchEvent(new CustomEvent("phd-settings", { detail: JSON.stringify(detail) }));
  const draw = () => {
    document.body.classList.toggle("dark", $("dark").checked);
    const base = { name: "Pikachu", level: 50, maxHP: 100, hp: +$("hp").value, gender: "male", mega: !$("dynamax").checked, dynamax: $("dynamax").checked, itemStyle: ITEM };
    $("p1").setState({ ...base, flushLeft: true }, { animate: false });
    $("p2").setState({ ...base, compact: true, status: "paralysis" }, { animate: false });
    $("e1").setState({ ...base, side: "enemy" }, { animate: false });
  };
  const saved = await storage.get(["megaStyle", "pauseColors", "showApngData"]);
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
  $("dark").oninput = $("dynamax").oninput = $("hp").oninput = draw;
  draw();
}
