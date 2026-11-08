(() => {
  const cfg = JSON.parse(document.currentScript.dataset.cfg);
  phdSetLocal(cfg.localSource);
  const FX_BASE = new URL("fx/", document.currentScript.src).href;
  const list = phdParseList(cfg.list);

  // Didn't want to screw around to figure out how to detect lunges dynamically so I opted for a list
  // feel free to change this
  const lunge = new Set(cfg.lunge);

  const durations = {};
  const pending = {};
  document.addEventListener("phd-duration", (e) => {
    const { url, ms } = JSON.parse(e.detail);
    durations[url] = ms;
    (pending[url] || []).forEach((resolve) => resolve(ms));
    delete pending[url];
  });
  const getDuration = (url) => {
    if (url in durations) return Promise.resolve(durations[url]);
    return new Promise((resolve) => {
      if (pending[url]) { pending[url].push(resolve); return; }
      pending[url] = [resolve];
      document.dispatchEvent(new CustomEvent("phd-duration-request", { detail: url }));
    });
  };

  const loaded = {};
  const decoded = {};
  const loadedImages = {};
  function preload(url) {
    if (!url) return Promise.resolve();
    if (!loaded[url]) {
      const img = new Image();
      loadedImages[url] = img;
      img.src = url;
      loaded[url] = img.decode().catch(() => {}).then(() => { decoded[url] = true; return img; });
    }
    return loaded[url];
  }

  //frees the saved copy of a sprite so the memory can be used again
  function dropPreloaded(url) {
    if (!loadedImages[url]) return;
    loadedImages[url].src = "";
    delete loadedImages[url];
    delete loaded[url];
    delete decoded[url];
  }

  //wait a little after an effect ends before freeing it
  const FX_RELEASE_DELAY = 1500;
  //if an effect never ends free it anyway after this long
  const FX_HOLD_MAX = 60000;
  //counts how many effects are using each image right now
  const fxUsers = {};
  //loads an effect only when it is needed and gives back a function to free it later
  function fxHold(url) {
    fxUsers[url] = (fxUsers[url] || 0) + 1;
    preload(url);
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      setTimeout(() => {
        if (--fxUsers[url] > 0) return;
        delete fxUsers[url];
        dropPreloaded(url);
      }, FX_RELEASE_DELAY);
    };
    setTimeout(release, FX_HOLD_MAX);
    return release;
  }

  function evictPreloaded() {
    //effects still playing must stay loaded
    const keep = new Set(Object.keys(fxUsers));
    document.querySelectorAll("img").forEach((el) => {
      const src = el.getAttribute("src");
      if (src) keep.add(src.split("#")[0]);
    });
    for (const url of Object.keys(loadedImages)) {
      if (keep.has(url)) continue;
      dropPreloaded(url);
    }
  }

  const PSHOWDOWN_SPRITE_URL = /\/sprites\/ani(-back)?(-shiny)?\/([a-z0-9-]+)\.gif/;

  function actionUrl(sprite, kind) {
    const sp = sprite.sp;
    if (!sp) return null;
    let cache = sp.__phdActions;
    if (!cache || cache.url !== sp.url) cache = sp.__phdActions = { url: sp.url, kinds: {} };
    if (kind in cache.kinds) return cache.kinds[kind];
    const m = PSHOWDOWN_SPRITE_URL.exec(sp.url || "");
    return (cache.kinds[kind] = m && phdSpriteUrl(list, m[3], kind, (m[1] || "") + (m[2] || "")));
  }

  function warm(sprite) {
    for (const kind of ["tap", "physical"]) {
      const url = actionUrl(sprite, kind);
      if (url) { preload(url); getDuration(url); }
    }
  }

  function play(sprite, kind, delay) {
    if (!sprite || !sprite.$el) return;
    const url = actionUrl(sprite, kind);
    if (!url) return;
    const token = (sprite.__phdToken = (sprite.__phdToken || 0) + 1);
    const ready = Promise.all([getDuration(url), preload(url)]);
    const start = (ms) => {
      const el = sprite.$el;
      if (sprite.__phdToken !== token || !el || !el[0].isConnected) return;
      sprite.__phdShown = token;

      el.attr("src", `${teraSkin(sprite, url)}#${token}-${Date.now()}`);
      setTimeout(() => {
        if (sprite.__phdShown !== token || sprite.$el !== el) return;
        sprite.__phdShown = 0;
        el.attr("src", teraIdle(sprite));
      }, ms);
    };
    if (url in durations && decoded[url]) {
      if (delay > 0) setTimeout(() => start(durations[url]), delay);
      else start(durations[url]);
    } else {
      setTimeout(async () => start((await ready)[0]), Math.max(0, delay || 0));
    }
  }

  const original = {};
  function sizeOf(view, key, entry) {
    const was = original[key] || (original[key] = { front: entry.front && { ...entry.front }, back: entry.back && { ...entry.back } });
    const o = was[view] || was[view === "front" ? "back" : "front"];
    if (!o || !o.w || !o.h) return cfg.size;
    const fit = { ref: 49, size: 165, exponent: 0.75, min: 60, back: 0.65, front: 0.8, max: 600 };
    const px = fit.size * Math.pow(Math.max(o.w, o.h) / fit.ref, fit.exponent) * (view === "back" ? fit.back : fit.front);
    return Math.round(Math.min(fit.max, Math.max(fit.min, px)));
  }

  const spriteNames = [...Object.keys(list.folders), ...Object.keys(list.aliases)];
  let patchedTable = null;
  function patchSizes() {
    const table = window.BattlePokemonSprites;
    if (!table || table === patchedTable) return;
    patchedTable = table;
    for (const name of spriteNames) {
      const folder = phdLookup(list, name);
      const key = name.replace(/-/g, "");
      for (const id of new Set([name, key, ...(table[key + "f"] || (key + "f") in table ? [key + "f"] : [])])) {
        const entry = table[id] || (table[id] = {});
        if (entry.__phdPatched) continue;
        const source = table[key] || entry;
        const front = sizeOf("front", key, source), back = sizeOf("back", key, source);
        if (phdHasFile(folder, "", "")) entry.front = { w: front, h: front };
        if (phdHasFile(folder, "", "-back")) entry.back = { w: back, h: back };
        entry.__phdPatched = true;
      }
    }
  }

  function patchBattle() {
    if (!window.Battle || !window.BattleScene || Battle.prototype.__phdPatched) return;
    Battle.prototype.__phdPatched = true;
    const S = BattleScene.prototype, B = Battle.prototype;

    const addPokemonSprite = S.addPokemonSprite;
    S.addPokemonSprite = function (pokemon) {
      const sprite = addPokemonSprite.apply(this, arguments);
      try {
        sprite.__phdPokemon = pokemon;
        hitboxOf(actionUrl(sprite, ""));
        warm(sprite);
      } catch (e) { console.warn("[phd]", e); }
      return sprite;
    };

    function holdForHitbox(name, run) {
      S[name] = function (pokemon) {
        const sprite = pokemon.sprite, scene = this, args = arguments;
        const hitUrl = sprite && sprite.sp && placementOf(sprite.sp) && actionUrl(sprite, "");
        if (hitUrl && this.animating && !hitboxDone.has(hitUrl)) {
          hitboxOf(hitUrl);
          gate(sprite);
          (hitboxWaiters[hitUrl] = hitboxWaiters[hitUrl] || []).push(() => run.apply(scene, args));
          return;
        }
        return run.apply(this, args);
      };
    }

    const animDragIn = S.animDragIn;
    holdForHitbox("animDragIn", animDragIn);

    const animSummon = S.animSummon;
    holdForHitbox("animSummon", function (pokemon, slot, instant) {
      const r = animSummon.apply(this, arguments);
      try {
        const sprite = pokemon.sprite;
        warm(sprite);
        if (this.animating && !instant && this.battle.seeking === null && sprite.$el) {
          sprite.$el.queue(function (next) { play(sprite, "tap", 0); next(); });
        }
      } catch (e) { console.warn("[phd]", e); }
      return r;
    });

    const runMinor = B.runMinor;
    B.runMinor = function (args) {
      const kind = args[0];
      let pending = null;
      const scene = this.scene;
      scene.__phdMorph = null;
      try {
        if (kind === "-terastallize") scene.__phdMorph = { kind: "terra", pokemon: this.getPokemon(args[1]) };
        else if (kind === "detailschange" && arguments[2] && arguments[2][0] === "-mega") scene.__phdMorph = { kind: "mega", pokemon: this.getPokemon(args[1]) };
        else if (kind === "detailschange" && /^Zygarde-Complete\b/.test(args[2] || "")) scene.__phdMorph = { kind: "zygarde", pokemon: this.getPokemon(args[1]) };
        if (kind === "-boost" || kind === "-unboost" || kind === "-setboost") {
          const target = this.getPokemon(args[1]);
          const stat = args[2];
          const amount = parseInt(args[3], 10);
          let change = kind === "-boost" ? amount : kind === "-unboost" ? -amount : amount - ((target && target.boosts && target.boosts[stat]) || 0);
          if (this.gen === 1 && kind !== "-setboost" && stat === "spd") change = 0;
          const type = change > 0 ? "good" : "bad";
          const seen = target && target.__phdFx;
          const used = seen && seen.turn === this.turn && seen[type];
          if (target && target.sprite && change && !used) pending = { pokemon: target, type };
        }
      } catch (e) { console.warn("[phd]", e); }
      scene.__phdStat = pending;
      try {
        return runMinor.apply(this, arguments);
      } finally {
        scene.__phdStat = null;
        scene.__phdMorph = null;
      }
    };

    const resultAnim = S.resultAnim;
    S.resultAnim = function (pokemon, result, type) {
      try {
        const pending = this.__phdStat;
        if (pending && pending.pokemon === pokemon && pending.type === type && this.animating && this.battle.seeking === null) {
          this.__phdStat = null;
          const seen = pokemon.__phdFx && pokemon.__phdFx.turn === this.battle.turn ? pokemon.__phdFx : (pokemon.__phdFx = { turn: this.battle.turn });
          seen[type] = true;
          playStatFx(this, pokemon.sprite, type);
        }
      } catch (e) { console.warn("[phd]", e); }
      return resultAnim.apply(this, arguments);
    };

    const runPrepareAnim = S.runPrepareAnim;
    S.runPrepareAnim = function (moveid, attacker) {
      try {
        if (this.animating && this.battle.seeking === null) play(attacker.sprite, "tap", this.timeOffset);
      } catch (e) { console.warn("[phd]", e); }
      return runPrepareAnim.apply(this, arguments);
    };

    const animateMove = B.animateMove;
    B.animateMove = function (pokemon, move, target, kwArgs) {
      try {
        const charge = kwArgs.prepare || kwArgs.anim === "prepare";
        if (this.seeking === null && this.scene.animating && !kwArgs.still && !kwArgs.notarget && !charge) {
          const category = this.dex.moves.get(move.id).category;
          const kind = category === "Status" ? "tap" : "physical";
          const url = actionUrl(pokemon.sprite, kind);
          if (url && !(url in durations)) document.dispatchEvent(new CustomEvent("phd-duration-request", { detail: url }));
          play(pokemon.sprite, kind, this.scene.timeOffset);
        }
      } catch (e) { console.warn("[phd]", e); }
      const sprite = pokemon.sprite;
      const missing = window.BattleMoveAnims && !BattleMoveAnims[move.id];
      if (!(sprite && sprite.anim && (lunge.has(move.id) || missing))) return animateMove.apply(this, arguments);
      const proto = sprite.anim;
      sprite.anim = function (end, transition) {
        const { x, y, z, ...rest } = end;
        return proto.call(this, rest, transition);
      };
      try {
        return animateMove.apply(this, arguments);
      } finally {
        delete sprite.anim;
      }
    };
  }

  let placementVersion = 0;
  function placementOf(sp) {
    if (!sp) return null;
    const cached = sp.__phdPlace;
    if (cached && cached.url === sp.url && cached.version === placementVersion) return cached.value;
    const m = PSHOWDOWN_SPRITE_URL.exec(sp.url || "");
    const folder = m && phdFind(list, m[3]);
    const rec = folder && cfg.placements[folder.name];
    const value = rec && rec[m[1] ? "back" : "front"] || null;
    sp.__phdPlace = { url: sp.url, version: placementVersion, value };
    return value;
  }
  function hashOf(sp) {
    const m = PSHOWDOWN_SPRITE_URL.exec((sp && sp.url) || "");
    const folder = m && phdFind(list, m[3]);
    const rec = folder && cfg.placements[folder.name];
    return (rec && rec.hash) || "";
  }
  window.__phdHashOf = hashOf;
  window.__phdList = list;
  window.__phdActionUrl = actionUrl;
  window.__phdPlacementOf = placementOf;

  // Some sprites get blocked by HP bar so we move them a bit upward (only Player side as opponent's hp bar can't obscure their pokemon)
  const SHORT_HEIGHT = 70;
  const SHORT_LIFT = 40;

  // Doubles needs a lot of space so sprites get shrunk slightly
  const MULTI_SCALE = 0.85;

  const STAGE_WIDTH = 640;
  const ICON_SCALE = 2, ICON_GAP = 10, ICON_W = 40, ICON_H = 30;
  const ICON_ROW_GAP = 16, STAGE_HEIGHT = 360;

  function iconRowSizes(count) {
    return [Math.ceil(count / 2), Math.floor(count / 2)].filter((size) => size > 0);
  }

  function iconPreview(scene) {
    const battle = scene.battle;
    if (!battle || !window.Dex || !Dex.getPokemonIcon) return false;
    let changed = false;
    for (let siden = 0; siden < 2; siden++) {
      const side = battle.sides[siden];
      const spriteIndex = +battle.viewpointSwitched ^ (siden % 2);
      const box = scene.$sprites && scene.$sprites[spriteIndex];
      const holder = box && box[0];
      if (!side || !holder) continue;
      const imgs = [...holder.children].filter((child) => child.tagName === "IMG");
      const labels = [...holder.children].filter((child) => child.tagName === "DIV");
      const count = imgs.length;
      if (count < 1 || count !== side.pokemon.length || labels.length !== count) continue;
      const w = ICON_W * ICON_SCALE, h = ICON_H * ICON_SCALE;
      const rowSizes = iconRowSizes(count);
      const rows = rowSizes.length;
      const pitch = h + ICON_ROW_GAP;
      const anchor = STAGE_HEIGHT * (spriteIndex === 0 ? 0.75 : 0.25);
      imgs.forEach((img, i) => {
        const pokemon = side.pokemon[i];
        let row = 0;
        let column = i;
        while (column >= rowSizes[row]) {
          column -= rowSizes[row];
          row++;
        }
        const inRow = rowSizes[row];
        const rowWidth = inRow * w + (inRow - 1) * ICON_GAP;
        const left = Math.round(STAGE_WIDTH / 2 - rowWidth / 2 + column * (w + ICON_GAP));
        const center = anchor + (row - (rows - 1) / 2) * pitch;
        const top = Math.round(center - h / 2);
        const icon = document.createElement("span");
        icon.setAttribute("style", `${Dex.getPokemonIcon(pokemon, !!spriteIndex)};position:absolute;display:block;width:${ICON_W}px;height:${ICON_H}px;left:${left}px;top:${top}px;transform:scale(${ICON_SCALE});transform-origin:0 0;image-rendering:pixelated`);
        icon.setAttribute("title", pokemon.speciesForme);
        icon.setAttribute("aria-label", pokemon.speciesForme);
        img.replaceWith(icon);
        labels[i].style.left = Math.round(left + w / 2 - 40) + "px";
        labels[i].style.top = Math.round(top + h) + "px";
      });
      changed = true;
    }
    return changed;
  }

  function patchPreviewScene() {
    if (!window.BattleScene || BattleScene.prototype.__phdPreview) return;
    BattleScene.prototype.__phdPreview = true;
    const original = BattleScene.prototype.teamPreview;
    BattleScene.prototype.teamPreview = function () {
      const result = original.apply(this, arguments);
      try {
        iconPreview(this);
      } catch (error) {
        console.warn("[phd] team preview icons", error);
      }
      return result;
    };
  }

  const MULTI_GAP = 8;
  const MULTI_SPAN = { back: [0, 440], front: [300, 636] };
  function multiLayout(scene, mine) {
    const battle = scene.battle;
    if (!battle) return null;
    for (const front of [false, true]) {
      const side = front ? battle.farSide : battle.nearSide;
      if (!side || !side.active || !side.active.some((pokemon) => pokemon && pokemon.sprite && pokemon.sprite.sp === mine)) continue;
      const row = [];
      side.active.forEach((pokemon, slot) => {
        const sp = pokemon && pokemon.sprite && pokemon.sprite.sp, place = sp && placementOf(sp);
        if (place) row.push({ sp, place, slot });
      });
      if (row.length < 2) return null;
      return fixedRow(row, front) || layoutRow(row, front);
    }
    return null;
  }
  function anchored(anchor, place) {
    const w = place.w * anchor.scale, h = place.h * anchor.scale;
    const origin = place.origin && pointOf(place.origin);
    if (!origin || !Number.isFinite(origin[0]) || !Number.isFinite(origin[1])) return { cx: anchor.cx, bottom: anchor.bottom, w, h, fixed: true };
    return {
      cx: anchor.cx + (place.x + place.w / 2 - origin[0]) * anchor.scale,
      bottom: anchor.bottom + (place.y + place.h - origin[1]) * anchor.scale,
      w, h, fixed: true,
    };
  }
  function fixedSlot(scene, sp, place) {
    const fixed = cfg.doubles;
    if (!fixed || !(scene.activeCount > 1) || sp.__phdSlot === undefined) return null;
    const anchor = fixed[`${sp.__phdFront ? "opponent" : "player"}${sp.__phdSlot ? "2" : ""}`];
    if (!anchor) return null;
    return anchored(anchor, place);
  }
  function fixedRow(row, front) {
    const fixed = cfg.doubles;
    if (!fixed) return null;
    const out = new Map();
    for (const { sp, place, slot } of row) {
      const anchor = fixed[`${front ? "opponent" : "player"}${slot ? "2" : ""}`];
      if (!anchor) return null;
      out.set(sp, anchored(anchor, place));
    }
    return out;
  }
  function layoutRow(row, front) {

    row.sort((p, q) => (front ? q.slot - p.slot : p.slot - q.slot));
    const [lo, hi] = MULTI_SPAN[front ? "front" : "back"];
    const sumW = row.reduce((t, e) => t + e.place.w, 0);
    const k = Math.min(MULTI_SCALE, (hi - lo - MULTI_GAP * (row.length - 1)) / sumW);
    let x = (lo + hi) / 2 - (sumW * k + MULTI_GAP * (row.length - 1)) / 2;
    const out = new Map();
    for (const e of row) {
      const w = e.place.w * k, h = e.place.h * k;
      out.set(e.sp, { cx: x + w / 2, bottom: e.place.y + e.place.h, w, h });
      x += w + MULTI_GAP;
    }
    return out;
  }
  const STATBAR_HEIGHT = 42;
  const STATBAR_HALF_WIDTH = 80;
  const SPRITE_FOLDER = /\/PokemonHD_Gen(\d)\/main\/(\d{4}_[^/]+)\//;
  const PATCH_TIMEOUT = 8000;
  const ISSUES_URL = "https://github.com/JxstMichie/PokemonShowdownPlus/issues";
  const patchWaiters = {};
  document.addEventListener("phd-patch", (event) => {
    const { name, entry } = JSON.parse(event.detail);
    if (entry) {
      cfg.placements[name] = entry;
      placementVersion++;
      console.info(`[phd] patched ${name} from data.json ${entry.hash}`);
    }
    const waiting = patchWaiters[name] || [];
    delete patchWaiters[name];
    waiting.forEach((resolve) => resolve(Boolean(entry)));
    if (entry) {
      for (const url of Object.keys(hitboxes)) {
        const match = SPRITE_FILE.exec(url);
        if (!match || match[1] !== name) continue;
        const box = precompiledHitbox(url);
        if (box) hitboxes[url] = box;
      }
      refresh();
    }
  });

  async function readHashTag(blob) {
    const view = new DataView(await blob.slice(0, 1024).arrayBuffer());
    let offset = 8;
    while (offset + 12 <= view.byteLength) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
      if (type === "IDAT" || type === "IEND") return null;
      if (type === "tEXt" && offset + 12 + length <= view.byteLength) {
        let text = "";
        for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(offset + 8 + i));
        const split = text.indexOf("\0");
        if (text.slice(0, split) === "HDh") return text.slice(split + 1);
      }
      offset += 12 + length;
    }
    return null;
  }

  function requestPlacementPatch(name, dir, tag) {
    return new Promise((resolve) => {
      const waiting = patchWaiters[name] || (patchWaiters[name] = []);
      let timer = null;
      const answer = (ok) => {
        clearTimeout(timer);
        resolve(ok);
      };
      waiting.push(answer);
      timer = setTimeout(() => {
        const index = waiting.indexOf(answer);
        if (index < 0) return;
        waiting.splice(index, 1);
        if (!waiting.length && patchWaiters[name] === waiting) delete patchWaiters[name];
        console.warn(`[phd] ${name} sprite data did not update within ${PATCH_TIMEOUT / 1000}s, keeping its bundled placement until it does`);
        resolve(false);
      }, PATCH_TIMEOUT);
      if (waiting.length > 1) return;
      document.dispatchEvent(new CustomEvent("phd-stale", { detail: JSON.stringify({ name, dir, tag }) }));
    });
  }

  async function checkSpriteHash(url, blob) {
    const match = SPRITE_FOLDER.exec(url);
    const name = match && match[2].slice(5);
    const entry = name && cfg.placements[name];
    if (!entry) return;
    const tag = await readHashTag(blob);
    if (!tag) {
      console.warn(`[phd] uh oh ${url.split("/").pop().replace(/\.png$/, "")} had no hash, please open a issue in github: ${ISSUES_URL}`);
      return;
    }
    if (tag === (entry.hash || "")) return;
    await requestPlacementPatch(name, `${match[1]}/${match[2]}`, tag);
  }

  const hitboxes = {};
  const hitboxDone = new Set();
  const hitboxWaiters = {};
  const statbarScenes = new Set();
  window.__phdScenes = statbarScenes;

  function refresh() {
    statbarScenes.forEach((scene) => { relayout(scene); placeStatbars(scene); gateScene(scene); });
  }

  const iconSprites = new Set();
  let iconLoop = 0;
  function dropIcon(sprite) {
    iconSprites.delete(sprite);
    if (!sprite.__phdIcon) return;
    sprite.__phdIcon.remove();
    sprite.__phdIcon = null;
  }
  function iconWanted(sprite) {
    const el = sprite.$el && sprite.$el[0];
    return !!(el && el.isConnected && sprite.scene && sprite.__phdPokemon && el.getAttribute("src") && el.complete && !el.naturalWidth);
  }
  function followIcon(sprite) {
    const el = sprite.$el[0];
    const icon = sprite.__phdIcon;
    if (icon.parentNode !== el.parentNode) el.parentNode.appendChild(icon);
    const left = parseFloat(el.style.left), top = parseFloat(el.style.top), width = parseFloat(el.style.width), height = parseFloat(el.style.height);
    if (![left, top, width, height].every(Number.isFinite) || el.style.display === "none") {
      icon.style.display = "none";
      return;
    }
    icon.style.left = Math.round(left + width / 2 - ICON_W * ICON_SCALE / 2) + "px";
    icon.style.top = Math.round(top + height - ICON_H * ICON_SCALE) + "px";
    icon.style.zIndex = el.style.zIndex;
    icon.style.opacity = el.style.opacity;
    icon.style.display = "block";
  }
  function iconTick() {
    iconLoop = 0;
    for (const sprite of [...iconSprites]) {
      if (iconWanted(sprite)) followIcon(sprite); else dropIcon(sprite);
    }
    if (iconSprites.size) iconLoop = requestAnimationFrame(iconTick);
  }
  function showIcon(sprite) {
    if (!iconWanted(sprite)) return dropIcon(sprite);
    const pokemon = sprite.__phdPokemon;
    if (!sprite.__phdIcon) {
      const icon = document.createElement("span");
      icon.setAttribute("style", `${Dex.getPokemonIcon(pokemon, !!sprite.isFrontSprite)};position:absolute;width:${ICON_W}px;height:${ICON_H}px;transform:scale(${ICON_SCALE});transform-origin:0 0;image-rendering:pixelated;pointer-events:none`);
      icon.setAttribute("title", pokemon.speciesForme);
      sprite.__phdIcon = icon;
    }
    iconSprites.add(sprite);
    followIcon(sprite);
    if (!iconLoop) iconLoop = requestAnimationFrame(iconTick);
  }
  function gate(sprite) {
    if (!sprite || !sprite.sp || !placementOf(sprite.sp)) return;
    const url = actionUrl(sprite, "");
    if (!url) return;
    hitboxOf(url);
    const fallback = iconWanted(sprite);
    const visibility = hitboxDone.has(url) ? "" : "hidden";
    if (sprite.$el) sprite.$el.css("visibility", fallback ? "hidden" : visibility);
    if (sprite.$statbar) sprite.$statbar.css("visibility", visibility);
    if (fallback) showIcon(sprite); else dropIcon(sprite);
  }
  document.addEventListener("error", (event) => {
    if (event.target instanceof HTMLImageElement && statbarScenes.size) refresh();
  }, true);
  document.addEventListener("load", (event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    for (const sprite of iconSprites) if (sprite.$el && sprite.$el[0] === event.target) return refresh();
  }, true);
  function gateScene(scene) {
    const battle = scene.battle;
    if (!battle) return;
    for (const side of [battle.nearSide, battle.farSide]) {
      for (const pokemon of (side && side.active) || []) gate(pokemon && pokemon.sprite);
    }
    for (const sprite of [...iconSprites]) if (sprite.scene === scene && !iconWanted(sprite)) dropIcon(sprite);
  }

  const SPRITE_FILE = /\/PokemonHD_Gen\d\/main\/\d{4}_([^/]+)\/(?:tap_|physical_)?[^/]+?(-back)?(?:-shiny)?\.png$/;

  function precompiledHitbox(url) {
    const match = SPRITE_FILE.exec(url);
    const entry = match && cfg.placements[match[1]];
    const view = entry && entry[match[2] ? "back" : "front"];
    const box = view && view.hitbox;
    if (!box || !(view.w > 0) || !(view.h > 0)) return null;
    return { x: (box[0] - view.x) / view.w, y: (box[1] - view.y) / view.h, w: (box[2] - box[0]) / view.w, h: (box[3] - box[1]) / view.h };
  }

  const SCAN_SIZE = 128;
  let scanCanvas = null;
  let scanContext = null;

  function scanHitbox(bitmap) {
    if (!scanCanvas) {
      scanCanvas = document.createElement("canvas");
      scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
    }
    const ratio = Math.min(1, SCAN_SIZE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    scanCanvas.width = width;
    scanCanvas.height = height;
    scanContext.drawImage(bitmap, 0, 0, width, height);
    const { data } = scanContext.getImageData(0, 0, width, height);
    scanCanvas.width = 1;
    scanCanvas.height = 1;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] <= 16) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return maxX >= 0 ? { x: minX / width, y: minY / height, w: (maxX + 1 - minX) / width, h: (maxY + 1 - minY) / height } : null;
  }

  const HITBOX_WAIT = 3000;
  function hitboxOf(url) {
    if (!url) return null;
    if (url in hitboxes) return hitboxes[url];
    hitboxes[url] = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      hitboxDone.add(url);
      const waiting = hitboxWaiters[url] || [];
      delete hitboxWaiters[url];
      waiting.forEach((run) => { try { run(); } catch (e) { console.warn("[phd]", e); } });
      refresh();
    };
    const precompiled = precompiledHitbox(url);
    if (precompiled) {
      hitboxes[url] = precompiled;
      Promise.resolve().then(finish);
    } else setTimeout(finish, HITBOX_WAIT);
    fetch(url).then((response) => (response.ok ? response.blob() : null)).then(async (blob) => {
      if (!blob) return;
      checkSpriteHash(url, blob).catch((e) => console.warn("[phd]", e));
      if (precompiledHitbox(url)) return;
      const bitmap = await createImageBitmap(blob);
      const box = scanHitbox(bitmap);
      bitmap.close();
      if (box) {
        hitboxes[url] = box;
        if (done) refresh();
      }
    }).catch((e) => console.warn("[phd]", e)).then(finish);
    return precompiled;
  }


  function spriteHitbox(sprite) {
    const content = hitboxOf(actionUrl(sprite, ""));
    if (!content || !sprite.sp || !sprite.sp.__phdBase) return null;
    const box = sprite.scene.pos({ x: sprite.x, y: sprite.y, z: sprite.z }, sprite.sp);
    return { left: box.left + content.x * box.width, top: box.top + content.y * box.height, width: content.w * box.width, height: content.h * box.height };
  }

  const STAT_FX = { good: { url: FX_BASE + "stats/stat-boost.apng", ratio: 640 / 768 }, bad: { url: FX_BASE + "stats/stat-drop.apng", ratio: 640 / 768 } };
  const STAT_SOUNDS = { good: FX_BASE + "stats/stat-boost.wav", bad: FX_BASE + "stats/stat-drop.wav", ability: FX_BASE + "stats/ability-activate.wav", terra: FX_BASE + "terra-transform/terra-time.wav", mega: FX_BASE + "mega-transform/its_mega_time.wav", zygarde: FX_BASE + "zygarde-transform/its_zygard_time.wav" };
  const soundBuffers = {};
  let audioContext = null;
  const contextOf = () => audioContext || (audioContext = new (window.AudioContext || window.webkitAudioContext)());
  for (const type in STAT_SOUNDS) {
    soundBuffers[type] = fetch(STAT_SOUNDS[type])
      .then((response) => response.arrayBuffer())
      .then((data) => contextOf().decodeAudioData(data))
      .catch((e) => { console.warn("[phd] stat sound load failed", type, e); return null; });
  }
  const AUDIO_RESUME_WAIT = 1000;
  async function playStatSound(type) {
    const sound = window.BattleSound;
    const volume = sound ? (sound.muted ? 0 : sound.effectVolume) : 50;
    if (!volume) return;
    const buffer = await soundBuffers[type];
    if (!buffer) return;
    const context = contextOf();
    if (context.state === "suspended") await Promise.race([context.resume().catch(() => {}), new Promise((resolve) => setTimeout(resolve, AUDIO_RESUME_WAIT))]);
    if (context.state !== "running") return null;
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume / 100));
    source.buffer = buffer;
    source.connect(gain).connect(context.destination);
    source.start();
    return source;
  }
  window.__phdPlaySound = playStatSound;
  const STAT_FX_GAP = 500;
  const STAT_FX_OPACITY = 1;
  const STAT_FX_SCALE = 2;
  const STAT_SOUND_DELAY = 33; //this is just to match the offset to Pokemon Sword/Shield

  //only get the length now and load the picture when it plays
  for (const type in STAT_FX) getDuration(STAT_FX[type].url);

  const pointOf = (text) => (text || "").split(",").map(Number);
  function fxFrame(scene, sprite) {
    const hit = drawnHitbox(sprite) || spriteHitbox(sprite);
    if (hit && hit.width > 0 && hit.height > 0) {
      const width = hit.width * STAT_FX_SCALE, height = hit.height * STAT_FX_SCALE;
      return { left: hit.left + hit.width / 2 - width / 2, top: hit.top + hit.height / 2 - height / 2, width, height };
    }
    const el = sprite.$el;
    const rect = el && { left: parseFloat(el.css("left")) || 0, top: parseFloat(el.css("top")) || 0, width: el.width(), height: el.height() };
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function playStatFx(scene, sprite, type) {
    const fx = STAT_FX[type];
    if (!fx || !sprite || !sprite.$el) return;
    const ms = durations[fx.url] || 2000;
    const releaseFx = fxHold(fx.url);
    const $img = $("<img>").css({ display: "none", position: "absolute", pointerEvents: "none", opacity: STAT_FX_OPACITY });
    scene.$fx.append($img);
    $img.delay(scene.timeOffset).queue(function (next) {
      const frame = scene.animating && scene.battle.seeking === null && fxFrame(scene, sprite);
      if (!frame) {
        $img.detach();
        $img.clearQueue();
        releaseFx();
        return next();
      }
      $img.attr("src", `${fx.url}#${Date.now()}`).css({
        display: "block",
        left: Math.round(frame.left),
        top: Math.round(frame.top),
        width: Math.round(frame.width),
        height: Math.round(frame.height)
      });
      setTimeout(() => playStatSound(type), STAT_SOUND_DELAY);
      next();
    }).delay(ms).queue(function (next) {
      $img.detach().removeAttr("src");
      releaseFx();
      next();
    }).delay(STAT_FX_GAP);
    scene.waitFor($img);
  }

  const MORPH_SHRINK = 250;
  const MORPH_GROW = 200;
  //mega and zygarde play the same way so they share one setup and only differ in the extras
  const orbFx = (dir, name, extra) => ({
    urls: { front: `${FX_BASE}${dir}/${name}.png`, back: `${FX_BASE}${dir}/${name}-back.png` },
    data: `${FX_BASE}${dir}/data.json`,
    shrinkAt: 400,
    reveal: 2800,
    length: 6367,
    between: true,
    anchor: "center",
    fxAnchor: "middle",
    swap: true,
    action: { at: 3600, kinds: ["special", "tap"], cry: true },
    ...extra
  });
  const MORPH_FX = {
    terra: {
      urls: { front: FX_BASE + "terra-transform/terra.apng", back: FX_BASE + "terra-transform/terra-back.apng" },
      data: FX_BASE + "terra-transform/data.json",
      shrinkAt: 1000,
      reveal: 2100,
      length: 4033,
      sound: "terra",
      hold: true
    },
    mega: orbFx("mega-transform", "effect_megaanimation", { sound: "mega", orb: { front: 62.5, back: 126 }, orbGrowth: 1.25 }),
    zygarde: orbFx("zygarde-transform", "effect_zygardetransformation", { sound: "zygarde" })
  };
  //gets the size of a picture then lets it go right away so it does not sit in memory
  const measureImage = (url) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = { w: img.naturalWidth, h: img.naturalHeight };
      img.src = "";
      resolve(size);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  for (const kind in MORPH_FX) {
    const fx = MORPH_FX[kind];
    fx.table = null;
    fetch(fx.data).then((response) => response.json()).then((data) => { fx.table = data; }).catch((e) => console.warn("[phd] transform data load failed", kind, e));
    fx.size = {};
    for (const view in fx.urls) {
      measureImage(fx.urls[view]).then((size) => { if (size) fx.size[view] = size; });
      getDuration(fx.urls[view]);
    }
  }

  function morphSound(fx, scene, $img) {
    const playing = playStatSound(fx.sound);
    const cut = () => !$img[0].isConnected || !scene.animating || scene.battle.seeking !== null;
    const watch = setInterval(() => {
      if (!cut()) return;
      clearInterval(watch);
      playing.then((source) => { if (source) try { source.stop(); } catch (e) {} });
    }, 50);
    playing.then((source) => { if (source) source.onended = () => clearInterval(watch); else clearInterval(watch); });
  }

  function morphReady(fx, sprite) {
    const view = sprite.isFrontSprite ? "front" : "back";
    return Boolean(fx.table && fx.table[view] && (!fx.fxAnchor || (fx.size && fx.size[view])) && sprite.$el && sprite.sp && placementOf(sprite.sp));
  }

  function spriteOrigin(scene, sprite, key = "origin") {
    const place = placementOf(sprite.sp);
    const box = scene.pos({ x: sprite.x, y: sprite.y, z: sprite.z }, sprite.sp);
    const scale = place.w ? box.width / place.w : 1;
    const own = place[key] && pointOf(place[key]);
    const hasOwn = own && Number.isFinite(own[0]) && Number.isFinite(own[1]);
    const fallbackY = key === "center" ? box.top + box.height / 2 : box.top + box.height;
    const content = hitboxOf(actionUrl(sprite, ""));
    return {
      scale,
      hit: content ? content.h * box.height : 0,
      ox: hasOwn ? box.left + (own[0] - place.x) * scale : box.left + box.width / 2,
      oy: hasOwn ? box.top + (own[1] - place.y) * scale : fallbackY
    };
  }

  function fxAnchor(fx, t, view) {
    const key = fx.fxAnchor || fx.anchor || "origin";
    const point = t[key];
    if (point && typeof point === "object") {
      const size = fx.size && fx.size[view];
      if (size && size.w && size.h) return [t.x + point.x * t.w / size.w, t.y + point.y * t.h / size.h];
    } else if (typeof point === "string") return pointOf(point);
    return pointOf(t.center || t.origin);
  }

  function morphFrame(fx, pivot, view) {
    const t = fx.table[view];
    const at = fxAnchor(fx, t, view);
    const orb = fx.orb && fx.orb[view];
    const scale = orb && pivot.hit > 0 && pivot.scale > 0 ? (fx.orbGrowth * pivot.hit) / orb : pivot.scale;
    return {
      left: Math.round(pivot.ox + (t.x - at[0]) * scale),
      top: Math.round(pivot.oy + (t.y - at[1]) * scale),
      width: Math.round(t.w * scale),
      height: Math.round(t.h * scale)
    };
  }

  function playMorphFx(scene, sprite, fx, pivot) {
    const view = sprite.isFrontSprite ? "front" : "back";
    const url = fx.urls[view];
    const el = sprite.$el;
    const ms = durations[url] || fx.length;
    const releaseFx = fxHold(url);
    const $img = $("<img>").css({ display: "none", position: "absolute", pointerEvents: "none" });
    if (fx.between && sprite.isFrontSprite && scene.$sprites && scene.$sprites[0] && scene.$sprites[0].parent().length) scene.$sprites[0].before($img);
    else scene.$fx.append($img);
    const release = () => {
      if (!sprite.__phdTeraHold) return;
      sprite.__phdTeraHold = false;
      try { if (window.__phdTera) window.__phdTera.update(scene); } catch (e) { console.warn("[phd]", e); }
    };
    if (fx.hold) {
      sprite.__phdTeraHold = true;
      setTimeout(release, scene.timeOffset + fx.reveal + 1500);
    }
    const hidden = { left: Math.round(pivot.ox), top: Math.round(pivot.oy), width: 0, height: 0, opacity: 0 };
    const shownOf = () => scene.pos({ x: sprite.x, y: sprite.y, z: sprite.z, opacity: 1 }, sprite.sp);
    const freshEl = (css) => {
      const sp = sprite.sp;
      const $new = $('<img src="' + sp.url + '" style="display:block;opacity:0;position:absolute"' + (sp.pixelated ? ' class="pixelated"' : "") + " />");
      $new.css(css);
      sprite.$el.replaceWith($new);
      sprite.$el = $new;
      return $new;
    };
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      sprite.__phdMorphHold = false;
      release();
    };
    const act = () => {
      if (!fx.action || cancelled || !$img[0].isConnected || !scene.animating || scene.battle.seeking !== null) return;
      const kind = fx.action.kinds.find((name) => actionUrl(sprite, name));
      if (kind) play(sprite, kind, 0);
      if (fx.action.cry && sprite.cryurl && window.BattleSound) window.BattleSound.playEffect(sprite.cryurl);
    };
    let cancelled = false;
    const settle = () => {
      if (fx.swap) freshEl(shownOf());
      else el.css(shownOf());
      reveal();
    };
    const step = (run) => function (next) {
      if (cancelled) return next();
      run(next);
    };
    const grow = ($target) => $target.delay(Math.max(0, fx.reveal - fx.shrinkAt - MORPH_SHRINK)).queue(function (next) {
      reveal();
      next();
    }).animate(shownOf(), MORPH_GROW);
    el.delay(scene.timeOffset).queue(function (next) {
      if (!(scene.animating && scene.battle.seeking === null)) {
        cancelled = true;
        $img.detach().removeAttr("src");
        releaseFx();
        settle();
        return next();
      }
      $img.attr("src", `${url}#${Date.now()}`).css({ display: "block", ...morphFrame(fx, pivot, view) });
      if (fx.sound) morphSound(fx, scene, $img);
      if (fx.action) setTimeout(act, fx.action.at);
      next();
    }).queue(step((next) => setTimeout(next, fx.shrinkAt))).queue(step((next) => {
      el.animate(hidden, { duration: MORPH_SHRINK, queue: false, complete: next });
    }));
    if (fx.swap) {
      el.queue(step((next) => {
        grow(freshEl(hidden));
        sprite.__phdMorphHold = false;
        next();
      }));
    } else {
      grow(el);
    }
    $img.delay(scene.timeOffset).delay(ms).queue(function (next) {
      $img.detach().removeAttr("src");
      releaseFx();
      next();
    });
    scene.waitFor($img);
    if (!fx.swap) scene.waitFor(el);
  }

  function placeStatbars(scene) {
    const mode = cfg.hpBars && cfg.hpBars.mode;
    const battle = scene.battle;
    if (!battle) return;
    const placeBars = mode === "team" || mode === "sprite";
    for (const side of [battle.nearSide, battle.farSide]) {
      const sprites = ((side && side.active) || []).filter((pokemon) => pokemon && pokemon.sprite && pokemon.sprite.sp).map((pokemon) => pokemon.sprite);
      const boxes = new Map(sprites.map((sprite) => [sprite, spriteHitbox(sprite)]));
      const tops = placeBars ? [...boxes.values()].filter(Boolean).map((box) => box.top) : [];
      for (const sprite of sprites) {
        const box = boxes.get(sprite);
        if (!box) continue;
        sprite.left = Math.round(box.left + box.width / 2);
        sprite.top = Math.round(box.top + box.height / 2);
        if (!placeBars) continue;
        const reference = mode === "team" ? Math.min(...tops) : box.top;
        sprite.statbarLeft = Math.round(box.left + box.width / 2 - STATBAR_HALF_WIDTH);
        sprite.statbarTop = Math.max(-4, Math.round(reference - STATBAR_HEIGHT));
        const bar = sprite.$statbar;
        if (bar && !bar.is(":animated") && bar.css("display") !== "none") bar.css({ left: sprite.statbarLeft, top: sprite.statbarTop });
      }
    }
  }

  let originalPos;
  function syncCoords(sprite) {
    const nat = sprite.__phdNatural, scene = sprite.scene;
    if (!nat) return;
    sprite.x = nat.x; sprite.y = nat.y; sprite.z = nat.z;
    if (sprite.sp && sprite.sp.__phdBase) sprite.sp.__phdBase = { x: nat.x, y: nat.y, z: nat.z };
    const place = sprite.sp && placementOf(sprite.sp);
    if (!place || !(scene.activeCount <= 1 || fixedSlot(scene, sprite.sp, place))) return;
    sprite.sp.__phdBase = { x: nat.x, y: nat.y, z: nat.z };
    const drawn = scene.pos(nat, sprite.sp), rest = originalPos.call(scene, nat, sprite.sp);
    const right = originalPos.call(scene, Object.assign({}, nat, { x: nat.x + 100 }), sprite.sp);
    const up = originalPos.call(scene, Object.assign({}, nat, { y: nat.y + 100 }), sprite.sp);
    const dx = drawn.left + drawn.width / 2 - rest.left - rest.width / 2;
    const dy = drawn.top + drawn.height / 2 - rest.top - rest.height / 2;
    const ux = (right.left - rest.left) / 100, uy = (rest.top - up.top) / 100;
    if (!(ux > 0 && uy > 0)) return;
    sprite.x = nat.x + dx / ux;
    sprite.y = nat.y - dy / uy;
    sprite.sp.__phdBase = { x: sprite.x, y: sprite.y, z: sprite.z };
  }
  function relayout(scene) {
    const battle = scene.battle;
    if (!battle) return;
    for (const side of [battle.nearSide, battle.farSide]) {
      for (const pokemon of (side && side.active) || []) {
        const sprite = pokemon && pokemon.sprite;
        if (!sprite || sprite.__phdMorphHold || !sprite.$el || !sprite.sp || !placementOf(sprite.sp) || !sprite.sp.__phdBase || sprite.$el.is(":animated")) continue;
        syncCoords(sprite);
        const { left, top, width, height } = scene.pos({ x: sprite.x, y: sprite.y, z: sprite.z }, sprite.sp);
        sprite.$el.css({ left, top, width, height });
      }
    }
  }
  function drawnHitbox(sprite) {
    const el = sprite.$el && sprite.$el[0];
    const content = hitboxOf(actionUrl(sprite, ""));
    if (!el || !content || !el.isConnected || el.style.display === "none") return null;
    const left = parseFloat(el.style.left), top = parseFloat(el.style.top), width = parseFloat(el.style.width), height = parseFloat(el.style.height);
    if (![left, top, width, height].every(Number.isFinite) || !width || !height) return null;
    return { left: left + content.x * width, top: top + content.y * height, width: content.w * width, height: content.h * height };
  }

  function placeTooltips(scene) {
    const battle = scene.battle;
    if (!battle || !scene.$tooltips || !scene.$tooltips[0].isConnected) return;
    for (const side of [battle.nearSide, battle.farSide]) {
      const prefix = side === battle.nearSide ? "p1" : "p2";
      ((side && side.active) || []).forEach((pokemon, index) => {
        const sprite = pokemon && pokemon.sprite;
        if (!sprite || !sprite.sp || !placementOf(sprite.sp)) return;
        const box = drawnHitbox(sprite);
        if (!box) return;
        let tip = sprite.__phdTip;
        if (!tip || !tip.isConnected || tip.parentNode !== scene.$tooltips[0]) tip = sprite.__phdTip = scene.$tooltips.children(`[data-id="${prefix}${"abc"[index]}"]`)[0];
        if (!tip) return;
        const left = Math.round(box.left), top = Math.round(box.top), width = Math.round(box.width), height = Math.round(box.height);
        if (tip.__phdLeft === left && tip.__phdTop === top && tip.__phdWidth === width && tip.__phdHeight === height) return;
        tip.__phdLeft = left; tip.__phdTop = top; tip.__phdWidth = width; tip.__phdHeight = height;
        Object.assign(tip.style, { left: left + "px", top: top + "px", width: width + "px", height: height + "px", zIndex: String(top + height) });
      });
    }
  }
  const teraSkin = (sprite, url) => (window.__phdTera ? window.__phdTera.skin(sprite, url) : url);
  const teraIdle = (sprite) => (window.__phdTera ? window.__phdTera.idle(sprite) : sprite.sp.url);

  const tooltipLoop = () => {
    statbarScenes.forEach((scene) => {
      try { placeTooltips(scene); } catch (e) { console.warn("[phd]", e); }
      try { if (window.__phdTera) window.__phdTera.update(scene); } catch (e) { console.warn("[phd]", e); }
    });
    requestAnimationFrame(tooltipLoop);
  };
  requestAnimationFrame(tooltipLoop);
  window.__phdHitboxOf = (sprite) => hitboxOf(actionUrl(sprite, ""));

  function patchPlacement() {
    if (!window.BattleScene || BattleScene.prototype.__phdPlaced) return;
    BattleScene.prototype.__phdPlaced = true;
    const destroyScene = BattleScene.prototype.destroy;
    BattleScene.prototype.destroy = function () {
      statbarScenes.delete(this);
      if (this.__phdRelayout) { clearTimeout(this.__phdRelayout); this.__phdRelayout = 0; }
      const r = destroyScene.apply(this, arguments);
      try { evictPreloaded(); } catch (e) { console.warn("[phd]", e); }
      try { if (window.__phdTera) window.__phdTera.evict(); } catch (e) { console.warn("[phd]", e); }
      return r;
    };
    const rebuildTooltips = BattleScene.prototype.rebuildTooltips;
    if (rebuildTooltips) {
      BattleScene.prototype.rebuildTooltips = function () {
        const r = rebuildTooltips.apply(this, arguments);
        try { placeTooltips(this); } catch (e) { console.warn("[phd]", e); }
        return r;
      };
    }
    const pos = BattleScene.prototype.pos;
    originalPos = pos;
    BattleScene.prototype.pos = function (loc, obj) {
      const css = pos.apply(this, arguments);
      try {
        const place = placementOf(obj);
        if (!place || !css || typeof css !== "object") return css;

        const base = obj.__phdBase || { x: loc.x, y: loc.y, z: loc.z };
        const rest = pos.call(this, Object.assign({}, loc, { x: base.x, y: base.y, z: base.z, xscale: 1, yscale: 1 }), obj);
        const grow = css.width / rest.width, tall = css.height / rest.height;
        const anim = { x: css.left + css.width / 2 - (rest.left + rest.width / 2), y: css.top + css.height / 2 - (rest.top + rest.height / 2) };
        const mine = fixedSlot(this, obj, place) || (this.activeCount > 1 && (multiLayout(this, obj) || new Map()).get(obj));
        let cx, cy, width, height;
        if (mine) {

          const single = pos.call(this, Object.assign({}, loc, { x: 0, y: 0, z: base.z, xscale: 1, yscale: 1 }), obj);
          const slotY = mine.fixed ? 0 : rest.top + rest.height / 2 - (single.top + single.height / 2);
          width = mine.w * grow; height = mine.h * tall;
          cx = mine.cx + anim.x;
          cy = mine.bottom + slotY - mine.h / 2 + anim.y;
        } else {
          width = place.w * grow; height = place.h * tall;
          cx = place.x + place.w / 2 + anim.x;
          cy = place.y + place.h / 2 + anim.y;
        }
        const content = obj.__phdFront === false ? hitboxes[actionUrl({ sp: obj }, "")] : null;
        if (content && content.h * height < SHORT_HEIGHT) cy -= SHORT_LIFT;
        return Object.assign({}, css, { left: Math.round(cx - width / 2), top: Math.round(cy - height / 2), width: Math.round(width), height: Math.round(height) });
      } catch (e) { console.warn("[phd]", e); return css; }
    };

    if (window.PokemonSprite && !PokemonSprite.prototype.__phdPlaced) {
      PokemonSprite.prototype.__phdPlaced = true;
      const recalculatePos = PokemonSprite.prototype.recalculatePos;
      PokemonSprite.prototype.recalculatePos = function (slot) {
        for (const sp of [this.sp, this.oldsp]) {
          if (!sp) continue;
          sp.__phdSlot = slot;
          sp.__phdFront = !!this.isFrontSprite;
        }
        const r = recalculatePos.apply(this, arguments);
        this.__phdNatural = { x: this.x, y: this.y, z: this.z };
        for (const sp of [this.sp, this.oldsp]) {
          if (sp) sp.__phdBase = { x: this.x, y: this.y, z: this.z };
        }
        if (this.sp) syncCoords(this);

        statbarScenes.add(this.scene);
        if (this.scene.activeCount > 1 && !this.scene.__phdRelayout) {
          const scene = this.scene;
          scene.__phdRelayout = setTimeout(() => { scene.__phdRelayout = 0; relayout(scene); placeStatbars(scene); gateScene(scene); }, 0);
        }
        placeStatbars(this.scene);
        gate(this);
        return r;
      };

      const resetSprite = PokemonSprite.prototype.reset;
      PokemonSprite.prototype.reset = function () {
        try { dropIcon(this); } catch (e) { console.warn("[phd]", e); }
        return resetSprite.apply(this, arguments);
      };

      const destroySprite = PokemonSprite.prototype.destroy;
      PokemonSprite.prototype.destroy = function () {
        try { dropIcon(this); } catch (e) { console.warn("[phd]", e); }
        return destroySprite.apply(this, arguments);
      };

      const adopt = (sprite, from) => {
        for (const sp of [sprite.sp, sprite.oldsp]) {
          if (!sp || !from) continue;
          for (const key of ["__phdSlot", "__phdFront", "__phdBase"]) if (sp[key] === undefined) sp[key] = from[key];
        }
        statbarScenes.add(sprite.scene);
        gate(sprite);
        relayout(sprite.scene);
        placeStatbars(sprite.scene);
      };

      const animTransform = PokemonSprite.prototype.animTransform;
      PokemonSprite.prototype.animTransform = function (pokemon, useSpeciesAnim, isPermanent) {
        const before = this.sp;
        const scene = this.scene;
        const morph = scene.__phdMorph;
        const fx = morph && morph.pokemon === pokemon && MORPH_FX[morph.kind];
        if (fx && scene.animating && scene.battle.seeking === null && morphReady(fx, this)) {
          scene.__phdMorph = null;
          let r;
          const pivot = spriteOrigin(scene, this, fx.anchor);
          try {
            const next = { sp: Dex.getSpriteData(pokemon, this.isFrontSprite, { gen: this.scene.gen, mod: this.scene.mod }) };
            hitboxOf(actionUrl(next, ""));
            warm(next);
            for (const name of (fx.action && fx.action.kinds) || []) {
              const url = actionUrl(next, name);
              if (url) { preload(url); getDuration(url); }
            }
          } catch (e) { console.warn("[phd]", e); }
          scene.animating = false;
          try { r = animTransform.call(this, pokemon, false, true); } finally { scene.animating = true; }
          try {
            this.__phdMorphHold = true;
            adopt(this, before);
            scene.updateSidebar(pokemon.side);
            playMorphFx(scene, this, fx, pivot);
          } catch (e) { this.__phdMorphHold = false; console.warn("[phd]", e); }
          return r;
        }
        try {
          const next = { sp: Dex.getSpriteData(pokemon, this.isFrontSprite, { gen: this.scene.gen, mod: this.scene.mod }) };
          hitboxOf(actionUrl(next, ""));
          warm(next);
        } catch (e) { console.warn("[phd]", e); }
        const r = animTransform.apply(this, arguments);
        try { adopt(this, before); } catch (e) { console.warn("[phd]", e); }
        return r;
      };

      const removeTransform = PokemonSprite.prototype.removeTransform;
      PokemonSprite.prototype.removeTransform = function () {
        const before = this.sp;
        const r = removeTransform.apply(this, arguments);
        try { adopt(this, before); } catch (e) { console.warn("[phd]", e); }
        return r;
      };
    }
  }

  function injectSettingsButton() {
    const link = document.querySelector('.mainmenu-left a[href="view-tournaments-all"]');
    const group = link && link.closest(".menugroup");
    if (!group || group.querySelector(".phd-settings-link")) return;
    const row = document.createElement("p");
    const button = document.createElement("a");
    button.className = "mainmenu4 mainmenu button phd-settings-link";
    button.href = "#";
    button.textContent = "Showdown+ Settings";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      document.dispatchEvent(new CustomEvent("phd-open-settings"));
    });
    row.append(button);
    group.append(row);
  }
  let menuQueued = false;
  new MutationObserver(() => {
    if (menuQueued) return;
    menuQueued = true;
    requestAnimationFrame(() => { menuQueued = false; injectSettingsButton(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  injectSettingsButton();

  console.info("[phd] page.js loaded (doubles layout)");

  patchSizes();
  patchBattle();
  patchPlacement();
  patchPreviewScene();
  setInterval(() => { patchSizes(); patchBattle(); patchPlacement(); patchPreviewScene(); }, 500);
  const fast = setInterval(() => {
    patchSizes(); patchBattle(); patchPlacement(); patchPreviewScene();
    if (window.Battle && window.BattleScene && window.PokemonSprite && window.Dex && Battle.prototype.__phdPatched && BattleScene.prototype.__phdPlaced && BattleScene.prototype.__phdPreview) clearInterval(fast);
  }, 20);
})();
