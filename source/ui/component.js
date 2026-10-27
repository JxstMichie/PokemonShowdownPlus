(function (global) {
  "use strict";

  //currentScript only works while the script first runs so it is read right away
  const script = global.document && global.document.currentScript;
  const D = global.PokemonHPData || JSON.parse(script.dataset.cfg).ui;
  const { view, shapes, layout, colors, bar, sheet, draw, statusLabels, fonts } = D;
  const NAME = D.name;
  const ASSETS = script ? new URL("assets/", script.src).href : "assets/";
  const SHEET_URL = ASSETS + "battle-sprites.png";

  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escapeXML = (value) => String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);

  //doubles: the second player panel uses the trimmed shape
  const shapeOf = (state) => {
    if (state.side === "enemy") return shapes.enemy;
    return state.compact && !state.flushLeft ? shapes.playerTrimmed : shapes.playerFull;
  };

  //a nested svg whose viewBox is one picture's rectangle crops that picture out of the sheet
  function sprite(key, x, y, width, height) {
    const [left, top, w, h] = sheet.icons[key] || [...sheet.positions[key], ...("Lv.".includes(key) ? sheet.label : sheet.digit)];
    return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${left} ${top} ${w} ${h}" preserveAspectRatio="none" overflow="hidden"><image href="${SHEET_URL}" width="${sheet.size[0]}" height="${sheet.size[1]}"/></svg>`;
  }

  //with align right x is where the text ends and otherwise where it starts
  function bitmapText(text, font, x, y, [width, height], alignRight) {
    const scale = width / sheet[font === "numbers" ? "digit" : "label"][0];
    let cursor = x - (alignRight ? Array.from(text).reduce((total, c) => total + (fonts[font][c] ? fonts[font][c][0] : 0) * scale, 0) : 0);
    return Array.from(text).map((c) => {
      const metric = fonts[font][c];
      if (!metric) return "";
      const picture = sprite(c, cursor + metric[1] * scale, y, width, height);
      cursor += metric[0] * scale;
      return picture;
    }).join("");
  }

  function normalize(input) {
    const state = { ...input };
    state.maxHP = Math.max(1, Math.round(Number(state.maxHP) || 1));
    state.hp = clamp(Math.round(Number(state.hp) || 0), 0, state.maxHP);
    state.level = Math.max(1, Math.round(Number(state.level) || 1));
    state.duration = Math.max(0, Number(state.duration ?? 400) || 0);
    state.name = String(state.name ?? "");
    state.side = state.side === "enemy" ? "enemy" : "player";
    state.gender = state.gender === "male" || state.gender === "female" ? state.gender : "none";
    state.status = statusLabels[state.status] ? state.status : "none";
    state.compact = !!state.compact;
    state.flushLeft = !!state.flushLeft;
    return state;
  }

  const colorOf = (ratio) => colors[ratio <= D.redAt ? "red" : ratio <= D.yellowAt ? "yellow" : "green"];
  const hpNumbers = (hp, maxHP) => bitmapText(Math.round(hp) + "/" + maxHP, "numbers", draw.hp.x, draw.hp.y, draw.digit);

  const SHADOW_CSS = "@keyframes shield-status{0%{opacity:1;animation-timing-function:cubic-bezier(.333333,0,.666667,.390657275)}37.5%{opacity:0}50%{opacity:0;animation-timing-function:cubic-bezier(.333333,.333333,.666667,1)}75%,100%{opacity:1}}@media (prefers-reduced-motion:reduce){[data-status]{animation:none!important;opacity:1!important}}";

  //scale(.8 1) squeezes the text and textLength is set later by fit()
  const drawName = (state, at) => `<text x="${at.name.x / NAME.squeeze}" y="${at.name.y}" font-size="${NAME.fontSize}" transform="scale(${NAME.squeeze} 1)" lengthAdjust="spacingAndGlyphs">${escapeXML(state.name)}</text>`;

  function drawLevel(state, at) {
    const level = String(state.level);
    const numberWidth = Array.from(level).reduce((total, c) => total + (fonts.numbers[c][0] * draw.digit[0]) / sheet.digit[0], 0);
    const labelEnd = at.level.x - numberWidth - draw.gapAfterLabel;
    return `<g class="ink">` + bitmapText("Lv.", "label", labelEnd, at.labelY, draw.label, true) + bitmapText(level, "numbers", at.level.x, at.level.y, draw.digit, true) + "</g>";
  }

  function drawStatus(state, at) {
    if (state.status === "none") return "";
    return `<g data-status="${state.status}" aria-label="${statusLabels[state.status]}" style="animation:shield-status ${80 / 30}s linear infinite">${sprite(state.status, at.status.x, at.status.y, ...draw.status)}</g>`;
  }

  function drawBar(at, ratio) {
    const x = at.bar.x - bar.width / 2;
    const y = at.bar.y - bar.height / 2;
    return `<rect x="${x}" y="${y}" width="${bar.width}" height="${bar.height}" fill="${colors.track}"/><rect data-fill="" x="${x}" y="${y}" width="${bar.width * ratio}" height="${bar.height}" fill="${colorOf(ratio)}"/>`;
  }

  //shownHP differs from state.hp while the bar is sliding
  function renderSVG(input, shownHP) {
    const state = normalize(input);
    const hp = shownHP === undefined ? state.hp : shownHP;
    const at = layout[state.side];
    const points = shapeOf(state).map(([x, y]) => x + "," + y).join(" ");
    //the enemy only has a percent so no numbers are shown
    const numbers = state.side === "enemy" ? "" : `<g data-numbers="" class="ink">${hpNumbers(hp, state.maxHP)}</g>`;
    const description = `${state.name}, level ${state.level}, HP ${state.hp} of ${state.maxHP}${state.status === "none" ? "" : ", " + statusLabels[state.status]}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.left} ${view.top} ${view.width} ${view.height}" role="img" aria-label="${escapeXML(description)}"><style>${SHADOW_CSS}text{font-family:ShieldRodin,sans-serif;fill:var(--phd-ink,#000)}polygon{fill:var(--phd-bg,#fff)}.ink{filter:var(--phd-ink-filter,none)}</style>` +
      `<polygon points="${points}" fill-opacity=".902"/>` + drawName(state, at) + drawLevel(state, at) + drawStatus(state, at) + drawBar(at, clamp(hp / state.maxHP, 0, 1)) + numbers + "</svg>";
  }

  //an empty class lets tests load the file outside a browser
  class PokemonHPPanel extends (global.HTMLElement || class {}) {
    constructor() {
      super();
      this._state = normalize({});
      this._shownHP = this._state.hp;
      this._frame = 0;
      if (this.attachShadow) this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
      this._draw(this._shownHP);
      document.fonts.load(`${NAME.fontSize}px ShieldRodin`).then(() => this._fit());
    }

    disconnectedCallback() {
      this._stop();
    }

    get state() {
      return { ...this._state };
    }

    _stop() {
      if (this._frame) global.cancelAnimationFrame(this._frame);
      this._frame = 0;
    }

    _draw(shownHP) {
      this._shownHP = shownHP;
      //overflow visible must only hit the outer svg because a plain svg rule would also stop the sprite svgs from cropping
      this.shadowRoot.innerHTML = `<style>:host{display:inline-block;width:464px;max-width:100%;vertical-align:middle;contain:layout style}:host>svg{display:block;width:100%;height:auto;overflow:visible}</style>${renderSVG(this._state, shownHP)}`;
      //restarting a css animation on every redraw would replay the status fade so all animations are pinned to the page timeline
      this.shadowRoot.getAnimations().forEach((animation) => (animation.startTime = 0));
      this._fit();
    }

    //the browser measures the name so long names are squeezed to fit and the gender icon follows the real text end
    _fit() {
      const root = this.shadowRoot;
      const text = root.querySelector("text");
      if (!text) return;
      const { gender, status, side } = this._state;
      root.querySelectorAll("[data-gender]").forEach((node) => node.remove());
      text.removeAttribute("textLength");
      const limit = status === "none" ? NAME.maxWidth : NAME.maxWidthWithStatus;
      let width = text.getComputedTextLength() * NAME.squeeze;
      if (width > limit) {
        width = limit;
        text.setAttribute("textLength", limit / NAME.squeeze);
      }
      const at = layout[side];
      if (gender !== "none") root.querySelector("svg").insertAdjacentHTML("beforeend", `<g data-gender="">${sprite(gender, at.name.x + width + NAME.gapBeforeGender, at.genderY, draw.gender, draw.gender)}</g>`);
    }

    //options.animate false jumps hp instantly so a new pokemon does not look healed
    setState(patch = {}, options = {}) {
      const next = normalize({ ...this._state, ...patch });
      const duration = options.duration === undefined ? next.duration : Math.max(0, Number(options.duration) || 0);
      const from = clamp(this._shownHP, 0, next.maxHP);
      const reducedMotion = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const animate = options.animate !== false && duration > 0 && !reducedMotion && this.isConnected && from !== next.hp;

      this._stop();
      this._state = next;
      this._draw(animate ? from : next.hp);
      if (!animate) return;

      //only the bar and numbers change per frame so the svg is not redrawn
      const fill = this.shadowRoot.querySelector("[data-fill]");
      const numbers = this.shadowRoot.querySelector("[data-numbers]");
      let start = null;
      const step = (time) => {
        start ??= time;
        const progress = clamp((time - start) / duration, 0, 1);
        this._shownHP = from + (next.hp - from) * progress;
        const ratio = this._shownHP / next.maxHP;
        fill.setAttribute("width", String(bar.width * ratio));
        fill.setAttribute("fill", colorOf(ratio));
        if (numbers) numbers.innerHTML = hpNumbers(this._shownHP, next.maxHP);
        this._frame = progress < 1 ? global.requestAnimationFrame(step) : 0;
      };
      this._frame = global.requestAnimationFrame(step);
    }
  }

  global.PokemonHP = { data: D, renderSVG, shapeOf };
  if (global.customElements && !global.customElements.get("pokemon-hp")) global.customElements.define("pokemon-hp", PokemonHPPanel);
})(globalThis);
