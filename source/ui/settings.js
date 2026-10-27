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
    const base = { name: "Pikachu", level: 50, maxHP: 100, hp: +$("hp").value, gender: "male", mega: true, itemStyle: ITEM };
    $("p1").setState({ ...base, flushLeft: true }, { animate: false });
    $("p2").setState({ ...base, compact: true, status: "paralysis" }, { animate: false });
    $("e1").setState({ ...base, side: "enemy" }, { animate: false });
  };
  const saved = await storage.get(["megaStyle", "pauseColors"]);
  const megaStyle = saved.megaStyle || "wobble";
  document.querySelector(`[name=style][value=${megaStyle}]`).checked = true;
  $("pause").checked = !!saved.pauseColors;
  $("pause").onchange = () => {
    storage.set({ pauseColors: $("pause").checked });
    apply({ pauseColors: $("pause").checked });
  };
  apply({ megaStyle, pauseColors: $("pause").checked });
  document.querySelectorAll("[name=style]").forEach((radio) => (radio.onchange = () => {
    storage.set({ megaStyle: radio.value });
    apply({ megaStyle: radio.value });
  }));
  $("dark").oninput = $("hp").oninput = draw;
  draw();
}
