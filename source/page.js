(() => {
  const cfg = JSON.parse(document.currentScript.dataset.cfg);
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
      (pending[url] = pending[url] || []).push(resolve);
      document.dispatchEvent(new CustomEvent("phd-duration-request", { detail: url }));
    });
  };

  const loaded = {};
  const decoded = {};
  function preload(url) {
    if (!url) return Promise.resolve();
    if (!loaded[url]) {
      const img = new Image();
      img.src = url;
      loaded[url] = img.decode().catch(() => {}).then(() => { decoded[url] = true; return img; });
    }
    return loaded[url];
  }

  const PSHOWDOWN_SPRITE_URL = /\/sprites\/ani(-back)?(-shiny)?\/([a-z0-9-]+)\.gif/;

  function actionUrl(sprite, kind) {
    const m = PSHOWDOWN_SPRITE_URL.exec((sprite.sp && sprite.sp.url) || "");
    return m && phdSpriteUrl(list, m[3], kind, (m[1] || "") + (m[2] || ""));
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

      el.attr("src", `${url}#${token}-${Date.now()}`);
      setTimeout(() => {
        if (sprite.__phdShown !== token || sprite.$el !== el) return;
        sprite.__phdShown = 0;
        el.attr("src", sprite.sp.url);
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
  function patchSizes() {
    const table = window.BattlePokemonSprites;
    if (!table) return;
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
      try {
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
      const scene = this.scene;
      scene.__phdStat = pending;
      try {
        return runMinor.apply(this, arguments);
      } finally {
        scene.__phdStat = null;
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

  function placementOf(sp) {
    const m = PSHOWDOWN_SPRITE_URL.exec((sp && sp.url) || "");
    const folder = m && phdFind(list, m[3]);
    const rec = folder && cfg.placements[folder.name];
    return rec && rec[m[1] ? "back" : "front"] || null;
  }
  function hashOf(sp) {
    const m = PSHOWDOWN_SPRITE_URL.exec((sp && sp.url) || "");
    const folder = m && phdFind(list, m[3]);
    const rec = folder && cfg.placements[folder.name];
    return (rec && rec.hash) || "";
  }
  window.__phdHashOf = hashOf;
  window.__phdPlacementOf = placementOf;

  // Some sprites get blocked by HP bar so we move them a bit upward (only Player side as opponent's hp bar can't obscure their pokemon)
  const SHORT_HEIGHT = 70;
  const SHORT_LIFT = 40;

  // Doubles needs a lot of space so sprites get shrunk slightly
  const MULTI_SCALE = 0.85;

  const STAGE_WIDTH = 640;
  const ICON_SCALE = 2, ICON_GAP = 10, ICON_W = 40, ICON_H = 30;
  const ICON_LAYOUT = "half", ICON_COLUMNS = 3, ICON_ROW_GAP = 16, ICON_STACK = "center", STAGE_HEIGHT = 360;

  // TODO: Custom battle preview screen
  // I can't figure out how to make regular team preview look good, it looks terrible
  function iconRowSizes(count) {
    if (ICON_LAYOUT === "half") return [Math.ceil(count / 2), Math.floor(count / 2)].filter((size) => size > 0);
    const sizes = [];
    for (let left = count; left > 0; left -= ICON_COLUMNS) sizes.push(Math.min(ICON_COLUMNS, left));
    return sizes;
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
      const inward = spriteIndex === 0 ? -1 : 1;
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
        let center = anchor;
        if (ICON_STACK === "center") center = anchor + (row - (rows - 1) / 2) * pitch;
        else if (ICON_STACK === "inward") center = anchor + inward * row * pitch;
        else center = anchor - inward * row * pitch;
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
  const PATCH_TIMEOUT = 2000;
  const ISSUES_URL = "https://github.com/JxstMichie/PokemonShowdownPlus/issues";
  const patchWaiters = {};
  document.addEventListener("phd-patch", (event) => {
    const { name, entry } = JSON.parse(event.detail);
    if (entry) {
      cfg.placements[name] = entry;
      console.info(`[phd] patched ${name} from data.json ${entry.hash}`);
    }
    const waiting = patchWaiters[name] || [];
    delete patchWaiters[name];
    waiting.forEach((resolve) => resolve(Boolean(entry)));
    if (entry) refresh();
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
      waiting.push(resolve);
      setTimeout(() => {
        const index = waiting.indexOf(resolve);
        if (index >= 0) waiting.splice(index, 1);
        if (!waiting.length && patchWaiters[name] === waiting) delete patchWaiters[name];
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
  function gate(sprite) {
    if (!sprite || !sprite.sp || !placementOf(sprite.sp)) return;
    const url = actionUrl(sprite, "");
    if (!url) return;
    hitboxOf(url);
    const visibility = hitboxDone.has(url) ? "" : "hidden";
    if (sprite.$el) sprite.$el.css("visibility", visibility);
    if (sprite.$statbar) sprite.$statbar.css("visibility", visibility);
  }
  function gateScene(scene) {
    const battle = scene.battle;
    if (!battle) return;
    for (const side of [battle.nearSide, battle.farSide]) {
      for (const pokemon of (side && side.active) || []) gate(pokemon && pokemon.sprite);
    }
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

  function scanHitbox(bitmap) {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] <= 16) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return maxX >= 0 ? { x: minX / canvas.width, y: minY / canvas.height, w: (maxX + 1 - minX) / canvas.width, h: (maxY + 1 - minY) / canvas.height } : null;
  }

  function hitboxOf(url) {
    if (!url) return null;
    if (url in hitboxes) return hitboxes[url];
    hitboxes[url] = null;
    const finish = () => {
      hitboxDone.add(url);
      const waiting = hitboxWaiters[url] || [];
      delete hitboxWaiters[url];
      waiting.forEach((run) => { try { run(); } catch (e) { console.warn("[phd]", e); } });
      refresh();
    };
    const precompiled = precompiledHitbox(url);
    fetch(url).then((response) => response.blob()).then(async (blob) => {
      try { await checkSpriteHash(url, blob); } catch (e) { console.warn("[phd]", e); }
      const current = precompiledHitbox(url);
      if (current) {
        hitboxes[url] = current;
        return null;
      }
      return createImageBitmap(blob);
    }).then((bitmap) => {
      if (bitmap) {
        const box = scanHitbox(bitmap);
        bitmap.close();
        if (box) hitboxes[url] = box;
      }
      finish();
    }).catch(finish);
    if (precompiled) hitboxes[url] = precompiled;
    return precompiled;
  }

  function spriteHitbox(sprite) {
    const content = hitboxOf(actionUrl(sprite, ""));
    if (!content || !sprite.sp || !sprite.sp.__phdBase) return null;
    const box = sprite.scene.pos({ x: sprite.x, y: sprite.y, z: sprite.z }, sprite.sp);
    return { left: box.left + content.x * box.width, top: box.top + content.y * box.height, width: content.w * box.width, height: content.h * box.height };
  }

  const STAT_FX = { good: { url: FX_BASE + "stat-boost.apng", ratio: 640 / 768 }, bad: { url: FX_BASE + "stat-drop.apng", ratio: 640 / 768 } };
  const STAT_SOUNDS = { good: FX_BASE + "stat-boost.wav", bad: FX_BASE + "stat-drop.wav", ability: FX_BASE + "ability-activate.wav" };
  const soundBuffers = {};
  let audioContext = null;
  const contextOf = () => audioContext || (audioContext = new (window.AudioContext || window.webkitAudioContext)());
  for (const type in STAT_SOUNDS) {
    soundBuffers[type] = fetch(STAT_SOUNDS[type])
      .then((response) => response.arrayBuffer())
      .then((data) => contextOf().decodeAudioData(data))
      .catch((e) => { console.warn("[phd] stat sound load failed", type, e); return null; });
  }
  async function playStatSound(type) {
    const sound = window.BattleSound;
    const volume = sound ? (sound.muted ? 0 : sound.effectVolume) : 50;
    if (!volume) return;
    const buffer = await soundBuffers[type];
    if (!buffer) return;
    const context = contextOf();
    if (context.state === "suspended") await context.resume().catch(() => {});
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume / 100));
    source.buffer = buffer;
    source.connect(gain).connect(context.destination);
    source.start();
  }
  window.__phdPlaySound = playStatSound;
  const STAT_FX_GAP = 500;
  const STAT_FX_OPACITY = 1;
  const STAT_FX_SCALE = 2;
  const STAT_SOUND_DELAY = 33; //this is just to match the offset to Pokemon Sword/Shield

  for (const type in STAT_FX) { preload(STAT_FX[type].url); getDuration(STAT_FX[type].url); }

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
    const $img = $("<img>").css({ display: "none", position: "absolute", pointerEvents: "none", opacity: STAT_FX_OPACITY });
    scene.$fx.append($img);
    $img.delay(scene.timeOffset).queue(function (next) {
      const frame = scene.animating && scene.battle.seeking === null && fxFrame(scene, sprite);
      if (!frame) {
        $img.detach();
        $img.clearQueue();
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
      $img.detach();
      next();
    }).delay(STAT_FX_GAP);
    scene.waitFor($img);
  }

  function placeStatbars(scene) {
    const mode = cfg.hpBars && cfg.hpBars.mode;
    const battle = scene.battle;
    if ((mode !== "team" && mode !== "sprite") || !battle) return;
    for (const side of [battle.nearSide, battle.farSide]) {
      const sprites = ((side && side.active) || []).filter((pokemon) => pokemon && pokemon.sprite && pokemon.sprite.sp).map((pokemon) => pokemon.sprite);
      const boxes = new Map(sprites.map((sprite) => [sprite, spriteHitbox(sprite)]));
      const tops = [...boxes.values()].filter(Boolean).map((box) => box.top);
      for (const sprite of sprites) {
        const box = boxes.get(sprite);
        if (!box) continue;
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
        if (!sprite || !sprite.$el || !sprite.sp || !placementOf(sprite.sp) || !sprite.sp.__phdBase || sprite.$el.is(":animated")) continue;
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
        const tip = box && scene.$tooltips.children(`[data-id="${prefix}${"abc"[index]}"]`)[0];
        if (!tip) return;
        const next = [box.left, box.top, box.width, box.height].map(Math.round);
        const key = next.join();
        if (tip.__phdKey === key) return;
        tip.__phdKey = key;
        Object.assign(tip.style, { left: next[0] + "px", top: next[1] + "px", width: next[2] + "px", height: next[3] + "px", zIndex: String(next[1] + next[3]) });
      });
    }
  }
  const tooltipLoop = () => {
    statbarScenes.forEach((scene) => { try { placeTooltips(scene); } catch (e) { console.warn("[phd]", e); } });
    requestAnimationFrame(tooltipLoop);
  };
  requestAnimationFrame(tooltipLoop);
  window.__phdHitboxOf = (sprite) => hitboxOf(actionUrl(sprite, ""));

  function patchPlacement() {
    if (!window.BattleScene || BattleScene.prototype.__phdPlaced) return;
    BattleScene.prototype.__phdPlaced = true;
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
      PokemonSprite.prototype.animTransform = function (pokemon) {
        const before = this.sp;
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
