fetch("data.json").then((response) => response.json()).then((data) => {
  window.PokemonHPData = data;
  const script = document.createElement("script");
  script.src = "component.js";
  script.onload = start;
  document.head.append(script);
});

async function start() {
  const ITEM = "background:transparent url(https://play.pokemonshowdown.com/sprites/itemicons-sheet.png) no-repeat scroll -24px 0";
  const $ = (id) => document.getElementById(id);
  const apply = (megaStyle) => document.dispatchEvent(new CustomEvent("phd-settings", { detail: JSON.stringify({ megaStyle }) }));
  const draw = () => {
    document.body.classList.toggle("dark", $("dark").checked);
    const base = { name: "Pikachu", level: 50, maxHP: 100, hp: +$("hp").value, gender: "male", mega: true, itemStyle: ITEM };
    $("p1").setState({ ...base, flushLeft: true }, { animate: false });
    $("p2").setState({ ...base, compact: true, status: "paralysis" }, { animate: false });
    $("e1").setState({ ...base, side: "enemy" }, { animate: false });
  };
  const { megaStyle = "wobble" } = await browser.storage.local.get("megaStyle");
  document.querySelector(`[name=style][value=${megaStyle}]`).checked = true;
  apply(megaStyle);
  document.querySelectorAll("[name=style]").forEach((radio) => (radio.onchange = () => {
    browser.storage.local.set({ megaStyle: radio.value });
    apply(radio.value);
  }));
  $("dark").oninput = $("hp").oninput = draw;
  draw();
}
