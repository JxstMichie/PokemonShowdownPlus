(() => {
  const cfg = JSON.parse(document.currentScript.dataset.cfg);
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

  const TEAM_PREVIEW_SCALE = 0.3;
  function patchTeamPreview() {
    if (!window.Dex || Dex.__phdPatched) return;
    Dex.__phdPatched = true;
    const getSpriteData = Dex.getSpriteData;
    Dex.getSpriteData = function (pokemon, isFront, options) {
      const data = getSpriteData.apply(this, arguments);
      try {
        const m = options && options.noScale && PSHOWDOWN_SPRITE_URL.exec(data.url || "");
        if (!m) return data;
        const place = placementOf(data);
        const size = Math.max(data.w, data.h) * TEAM_PREVIEW_SCALE;
        if (place) {
          const k = size / Math.max(place.w, place.h);
          data.w = Math.round(place.w * k);
          data.h = Math.round(place.h * k);
        } else {
          data.w = data.h = Math.round(size);
        }
      } catch (e) { console.warn("[phd]", e); }
      return data;
    };
  }

  const MULTI_SCALE = 0.85, MULTI_GAP = 8;
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
  function anchored(anchor, place, sp) {
    const w = place.w * anchor.scale, h = place.h * anchor.scale;

    //anchor.bottom offset so images with alot of empty bottom space dont levitate like chien-pao
    const content = hitboxOf(actionUrl({ sp }, ""));
    if (!content) return { cx: anchor.cx, bottom: anchor.bottom, w, h, fixed: true };
    if (!Number.isFinite(anchor.left) || !Number.isFinite(anchor.feet)) {
      return { cx: anchor.cx, bottom: anchor.bottom + (1 - content.y - content.h) * h, w, h, fixed: true };
    }
    return { cx: anchor.left - content.x * w + w / 2, bottom: anchor.feet - (content.y + content.h) * h + h, w, h, fixed: true };
  }
  function fixedSlot(scene, sp, place) {
    const fixed = cfg.doubles;
    if (!fixed || !(scene.activeCount > 1) || sp.__phdSlot === undefined) return null;
    const anchor = fixed[`${sp.__phdFront ? "opponent" : "player"}${sp.__phdSlot ? "2" : ""}`];
    if (!anchor) return null;
    return anchored(anchor, place, sp);
  }
  function fixedRow(row, front) {
    const fixed = cfg.doubles;
    if (!fixed) return null;
    const out = new Map();
    for (const { sp, place, slot } of row) {
      const anchor = fixed[`${front ? "opponent" : "player"}${slot ? "2" : ""}`];
      if (!anchor) return null;
      out.set(sp, anchored(anchor, place, sp));
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
  const hitboxes = {};
  const hitboxDone = new Set();
  const hitboxWaiters = {};
  const statbarScenes = new Set();

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
    fetch(url).then((response) => response.blob()).then((blob) => createImageBitmap(blob)).then((bitmap) => {
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
      bitmap.close();
      if (maxX >= 0) hitboxes[url] = { x: minX / canvas.width, y: minY / canvas.height, w: (maxX + 1 - minX) / canvas.width, h: (maxY + 1 - minY) / canvas.height };
      finish();
    }).catch(finish);
    return null;
  }

  function spriteHitbox(sprite) {
    const content = hitboxOf(actionUrl(sprite, ""));
    if (!content || !sprite.sp || !sprite.sp.__phdBase) return null;
    const box = sprite.scene.pos({ x: sprite.x, y: sprite.y, z: sprite.z }, sprite.sp);
    return { left: box.left + content.x * box.width, top: box.top + content.y * box.height, width: content.w * box.width };
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
  function patchPlacement() {
    if (!window.BattleScene || BattleScene.prototype.__phdPlaced) return;
    BattleScene.prototype.__phdPlaced = true;
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
  patchTeamPreview();
  setInterval(() => { patchSizes(); patchBattle(); patchPlacement(); patchTeamPreview(); }, 500);
  const fast = setInterval(() => {
    patchSizes(); patchBattle(); patchPlacement(); patchTeamPreview();
    if (window.Battle && window.BattleScene && window.PokemonSprite && window.Dex && Battle.prototype.__phdPatched && BattleScene.prototype.__phdPlaced && Dex.__phdPatched) clearInterval(fast);
  }, 20);
})();
