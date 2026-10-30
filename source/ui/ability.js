(() => {
  if (!window.customElements || customElements.get("pokemon-ability-panel")) return;

  const SIDES = ["left", "right"];

  class AbilityPanel extends HTMLElement {
    constructor() {
      super();
      this.states = {};
      this.attachShadow({ mode: "open" }).innerHTML = `
        <style>
          :host { position:absolute; inset:0; display:block; overflow:hidden; pointer-events:none; }
          .panel { --direction:1; position:absolute; left:0; top:43.52%; width:29.17%; height:12.96%; opacity:0; }
          .right { --direction:-1; left:auto; right:0; }
          .layers, .layer { position:absolute; inset:0; }
          .right .layers { transform:scaleX(-1); }
          .layer { clip-path:polygon(0 0,100% 0,90% 100%,0 100%); }
          .white { background:var(--phd-bg,#fff); }
          .gray { background:#8c8c8c; }
          .black { background:var(--phd-ink,#000); clip-path:polygon(94% 0,100% 0,90% 100%,84% 100%); }
          .gray { clip-path:polygon(94% 0,94% 0,84% 100%,84% 100%); }
          .text { position:absolute; inset:0 10% 0 5.35%; display:flex; flex-direction:column;
            justify-content:center; color:var(--phd-ink,#232323); font-family:ShieldRodin,sans-serif; container-type:inline-size; }
          .right .text { inset:0 5.35% 0 19%; }
          span { font-size:10cqw; line-height:1.08; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .enter { opacity:1; animation:slide-in .5s both; }
          .enter .black { animation:black-in .5s both; }
          .enter .gray { animation:gray-in .5s both; }
          .enter .text { animation:text-in .5s both; }
          .exit { animation:slide-out .467s both; }
          .exit .black { animation:black-out .467s both; }
          .exit .gray { animation:gray-out .467s both; }
          .exit .text { animation:text-out .467s both; }
          .change .gray { animation:change-wipe .667s both; }
          .change .text { animation:change-text .667s both; }
          @keyframes slide-in {
            0% { opacity:0; transform:translateX(calc(-39% * var(--direction))); }
            13.3% { transform:translateX(calc(9% * var(--direction))); }
            26.7% { opacity:1; } 40%,100% { transform:translateX(0); }
          }
          @keyframes black-in {
            0%,13.3% { clip-path:polygon(0 0,100% 0,90% 100%,0 100%); }
            46.7%,100% { clip-path:polygon(94% 0,100% 0,90% 100%,84% 100%); }
          }
          @keyframes gray-in {
            0%,20% { clip-path:polygon(0 0,94% 0,84% 100%,0 100%); }
            80%,100% { clip-path:polygon(94% 0,94% 0,84% 100%,84% 100%); }
          }
          @keyframes text-in {
            0%,26.7% { opacity:0; transform:translateX(calc(-100% * var(--direction))); }
            46.7% { opacity:1; } 60% { transform:translateX(calc(2.4% * var(--direction))); }
            73.3%,100% { opacity:1; transform:translateX(0); }
          }
          @keyframes slide-out {
            0%,35.7% { opacity:1; transform:translateX(0); }
            64.3% { opacity:1; } 92.9%,100% { opacity:0; transform:translateX(calc(-93% * var(--direction))); }
          }
          @keyframes black-out {
            0%,35.7% { clip-path:polygon(94% 0,100% 0,90% 100%,84% 100%); }
            64.3%,100% { clip-path:polygon(0 0,100% 0,90% 100%,0 100%); }
          }
          @keyframes gray-out {
            0%,28.6% { clip-path:polygon(94% 0,94% 0,84% 100%,84% 100%); }
            57.1%,100% { clip-path:polygon(0 0,94% 0,84% 100%,0 100%); }
          }
          @keyframes text-out {
            0%,28.6% { opacity:1; transform:translateX(0); }
            57.1%,100% { opacity:0; transform:translateX(calc(-100% * var(--direction))); }
          }
          @keyframes change-wipe {
            0%,20% { clip-path:polygon(94% 0,94% 0,84% 100%,84% 100%); }
            40% { clip-path:polygon(0 0,94% 0,84% 100%,0 100%); }
            75%,100% { clip-path:polygon(94% 0,94% 0,84% 100%,84% 100%); }
          }
          @keyframes change-text { 0%,35% { opacity:0; } 65%,100% { opacity:1; } }
          @media(prefers-reduced-motion:reduce) { .panel,.panel * { animation-duration:1ms !important; } }
        </style>
        ${SIDES.map((side) => `<div class="panel ${side}" role="status"><div class="layers" aria-hidden="true"><div class="layer white"></div></div><div class="text"><span></span><span></span></div><div class="layers" aria-hidden="true"><div class="layer gray"></div><div class="layer black"></div></div></div>`).join("")}`;
    }
    panel(side) {
      if (!SIDES.includes(side)) throw new Error("side must be left or right");
      return this.shadowRoot.querySelector("." + side);
    }
    play(side, animation) {
      const panel = this.panel(side);
      panel.className = "panel " + side;
      void panel.offsetWidth;
      panel.classList.add(animation);
      panel.style.opacity = animation === "change" ? "1" : "";
    }
    show({ side = "left", name = "", ability = "" } = {}) {
      this.states[side] = { name: String(name), ability: String(ability) };
      const text = this.panel(side).querySelector(".text");
      text.children[0].textContent = name + "'s";
      text.children[1].textContent = ability;
      this.play(side, "enter");
    }
    change(side, ability) {
      if (!this.states[side]) return;
      this.states[side].ability = String(ability);
      this.panel(side).querySelector(".text").children[1].textContent = ability;
      this.play(side, "change");
    }
    hide(side) {
      this.play(side, "exit");
      delete this.states[side];
    }
  }
  customElements.define("pokemon-ability-panel", AbilityPanel);
})();
