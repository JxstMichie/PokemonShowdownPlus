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
  const RANGES = { amp: [0, 100, 1], freq: [0.02, 0.12, 0.001], speed: [0.5, 20, 0.5], thickness: [0, 40, 1], glow: [0, 30, 1] };
  const defaults = PokemonHP.defaults;
  const draw = () => {
    document.body.classList.toggle("dark", $("dark").checked);
    const base = { name: "Pikachu", level: 50, maxHP: 100, hp: +$("hp").value, gender: "male", mega: true, itemStyle: ITEM };
    $("p1").setState({ ...base, flushLeft: true }, { animate: false });
    $("p2").setState({ ...base, compact: true, status: "paralysis" }, { animate: false });
    $("e1").setState({ ...base, side: "enemy" }, { animate: false });
  };
  const saved = await storage.get(["megaStyle", "wobble"]);
  const megaStyle = saved.megaStyle || "wobble";
  const wobble = { ...defaults, ...saved.wobble };
  document.querySelector(`[name=style][value=${megaStyle}]`).checked = true;
  $("tuning").innerHTML = Object.entries(RANGES).map(([name, [min, max, step]]) => `<div><label>${name} <input type="range" data-p="${name}" min="${min}" max="${max}" step="${step}" value="${wobble[name]}"> <output>${wobble[name]}</output></label></div>`).join("");
  const show = () => document.querySelectorAll("[data-p]").forEach((input) => { input.nextElementSibling.value = input.value; });
  const push = () => {
    const values = Object.fromEntries([...document.querySelectorAll("[data-p]")].map((input) => [input.dataset.p, +input.value]));
    storage.set({ wobble: values });
    apply({ megaStyle: document.querySelector("[name=style]:checked").value, wobble: values });
    show();
  };
  $("tuning").oninput = push;
  $("reset").onclick = () => {
    document.querySelectorAll("[data-p]").forEach((input) => (input.value = defaults[input.dataset.p]));
    push();
  };
  apply({ megaStyle, wobble });
  document.querySelectorAll("[name=style]").forEach((radio) => (radio.onchange = () => {
    storage.set({ megaStyle: radio.value });
    apply({ megaStyle: radio.value });
  }));
  $("dark").oninput = $("hp").oninput = draw;
  draw();
}
