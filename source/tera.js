(() => {
  const cfg = JSON.parse(document.currentScript.dataset.cfg);
  const list = window.__phdList, actionUrl = window.__phdActionUrl, hashOf = window.__phdHashOf;
  const PSHOWDOWN_SPRITE_URL = /\/sprites\/ani(-back)?(-shiny)?\/([a-z0-9-]+)\.gif/;

  const TERA_COLORS = { //Feel free to suggest better colors
    Bug: "#889818", Dark: "#483828", Dragon: "#7868d8", Electric: "#f8b828", Fairy: "#f0a8f0", Fighting: "#783828",
    Fire: "#c82808", Flying: "#98a8e8", Ghost: "#686898", Grass: "#78b848", Ground: "#895129", Ice: "#78d8f8",
    Normal: "#c8c8b8", Poison: "#884888", Psychic: "#e84878", Rock: "#C4A484", Steel: "#b8b8c8", Water: "#3898e8"
  };
  let teraEnabled = cfg.teraEffect !== false;
  document.addEventListener("phd-settings", (event) => {
    const detail = JSON.parse(event.detail);
    if (typeof detail.teraEffect === "boolean") teraEnabled = detail.teraEffect;
    if (typeof detail.teraCache === "boolean") teraCacheOn = detail.teraCache;
    if (detail.teraCacheSize !== undefined) teraCacheSize = clampCacheSize(detail.teraCacheSize);
    if (detail.teraCacheClear) clearTeraCache(detail.teraCacheClear);
    else if (teraCacheOn) pruneTeraCache().catch(() => {});
  });
  const teraBakes = {};
  const workerJobs = new Map();
  let worker = null, workerFailed = false, jobId = 0;

  function failWorker() {
    workerFailed = true;
    if (worker) worker.terminate();
    worker = null;
    const pending = [...workerJobs.values()];
    workerJobs.clear();
    for (const job of pending) window.__phdBake(job.job).then(job.resolve, job.reject);
  }

  function getWorker() {
    if (worker || workerFailed || !cfg.bakeSource) return worker;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([cfg.bakeSource], { type: "text/javascript" })));
      worker.onmessage = (event) => {
        const { id, blob, error } = event.data;
        const job = workerJobs.get(id);
        if (!job) return;
        workerJobs.delete(id);
        if (error) job.reject(new Error(error));
        else job.resolve(blob);
      };
      worker.onerror = () => failWorker();
    } catch (error) {
      failWorker();
    }
    return worker;
  }

  function bakeTera(url, type) {
    const job = { url, color: TERA_COLORS[type] || null, texture: cfg.teraTexture };
    const active = getWorker();
    if (!active) return window.__phdBake(job);
    return new Promise((resolve, reject) => {
      const id = ++jobId;
      workerJobs.set(id, { job, resolve, reject });
      active.postMessage({ id, ...job });
    });
  }

  const TERA_KINDS = ["", "tap", "physical"];
  const clampCacheSize = (value) => Math.max(6, Math.min(30, Math.round(Number(value)) || 12));
  let teraCacheOn = cfg.teraCache !== false;
  let teraCacheSize = clampCacheSize(cfg.teraCacheSize);
  let teraDbPromise = null;

  function teraDb() {
    if (!teraDbPromise) {
      teraDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open("phd-tera", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("forms", { keyPath: "key" });
          request.result.createObjectStore("meta", { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return teraDbPromise;
  }
  function teraTx(mode, run) {
    return teraDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(["forms", "meta"], mode);
      const result = run(tx.objectStore("forms"), tx.objectStore("meta"));
      tx.oncomplete = () => resolve(result && result.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  async function publishTeraIndex() {
    const metas = await teraTx("readonly", (forms, meta) => meta.getAll());
    const entries = metas.sort((p, q) => q.time - p.time).map((item) => ({ key: item.key, name: item.name || item.key, bytes: item.bytes || 0 }));
    document.dispatchEvent(new CustomEvent("phd-cache-index", { detail: JSON.stringify({ section: "tera", entries }) }));
  }

  const CLEARED_KEY = "phd-tera-cleared";
  const readCleared = () => { try { return Number(localStorage.getItem(CLEARED_KEY)) || 0; } catch (error) { return 0; } };

  async function clearTeraCache(token) {
    try { localStorage.setItem(CLEARED_KEY, String(token)); } catch (error) {}
    try {
      await teraTx("readwrite", (forms, meta) => {
        forms.clear();
        meta.clear();
      });
      await publishTeraIndex();
    } catch (error) {
      console.warn("[phd] tera cache clear", error);
    }
  }

  const startupClear = cfg.teraCacheClear && cfg.teraCacheClear > readCleared() ? clearTeraCache(cfg.teraCacheClear) : Promise.resolve();

  async function pruneTeraCache() {
    if (!teraCacheOn) return;
    const metas = await teraTx("readonly", (forms, meta) => meta.getAll());
    const extra = metas.sort((p, q) => q.time - p.time).slice(teraCacheSize);
    if (extra.length) {
      await teraTx("readwrite", (forms, meta) => {
        for (const item of extra) {
          forms.delete(item.key);
          meta.delete(item.key);
        }
      });
    }
    await publishTeraIndex();
  }

  function teraFormOf(sprite, type) {
    const match = PSHOWDOWN_SPRITE_URL.exec((sprite.sp && sprite.sp.url) || "");
    const folder = match && match[1] && phdFind(list, match[3]);
    if (!folder) return null;
    const title = (word) => word.charAt(0).toUpperCase() + word.slice(1);
    const name = [...folder.name.split("-").map(title), ...(match[2] ? ["Shiny"] : []), title(type)].join("-");
    return { key: `${folder.name}-${type.toLowerCase()}-back${match[2] ? "-shiny" : ""}`, name, hash: hashOf(sprite.sp) };
  }

  function requestTera(url, type) {
    const key = `${type}|${url}`;
    if (!teraBakes[key]) {
      const entry = (teraBakes[key] = { url: null, blob: null, promise: null });
      entry.promise = bakeTera(url, type)
        .then((blob) => {
          entry.blob = blob;
          entry.url = URL.createObjectURL(blob);
        })
        .catch((e) => console.warn("[phd] tera bake failed", url, e));
    }
    return teraBakes[key];
  }

  async function restoreTeraForm(form, urls, type) {
    const record = await teraTx("readonly", (forms) => forms.get(form.key));
    const kinds = Object.keys(urls);
    if (!record || record.hash !== form.hash || !kinds.every((kind) => record.files[kind] instanceof Blob)) return false;
    for (const kind of kinds) {
      const key = `${type}|${urls[kind]}`;
      if (teraBakes[key] && teraBakes[key].url) continue;
      teraBakes[key] = { url: URL.createObjectURL(record.files[kind]), blob: record.files[kind], promise: Promise.resolve() };
    }
    const bytes = kinds.reduce((total, kind) => total + record.files[kind].size, 0);
    await teraTx("readwrite", (forms, meta) => meta.put({ key: form.key, time: Date.now(), name: form.name, bytes }));
    publishTeraIndex().catch(() => {});
    return true;
  }

  async function bakeInOrder(urls, type) {
    const entries = [];
    for (const kind of TERA_KINDS) {
      if (!urls[kind]) continue;
      const entry = requestTera(urls[kind], type);
      await entry.promise;
      entries.push(entry);
    }
    return entries;
  }

  async function saveTeraForm(form, urls, type) {
    const kinds = TERA_KINDS.filter((kind) => urls[kind]);
    const entries = await bakeInOrder(urls, type);
    if (!teraCacheOn || !entries.every((entry) => entry.blob)) return;
    const files = {};
    kinds.forEach((kind, index) => { files[kind] = entries[index].blob; });
    await teraTx("readwrite", (forms, meta) => {
      forms.put({ key: form.key, hash: form.hash, files });
      meta.put({ key: form.key, time: Date.now(), name: form.name, bytes: entries.reduce((total, entry) => total + entry.blob.size, 0) });
    });
    await pruneTeraCache();
  }

  if (teraCacheOn) setTimeout(() => publishTeraIndex().catch(() => {}), 1000);

  /*
  Spectating & random battles disable Terra caching, as the whole point is to cache teams you use
  */
  async function prepareTera(sprite, type) {
    await startupClear;
    const urls = {};
    for (const kind of TERA_KINDS) {
      const url = actionUrl(sprite, kind);
      if (url) urls[kind] = url;
    }
    if (!urls[""]) return;
    const battle = sprite.__phdPokemon && sprite.__phdPokemon.side && sprite.__phdPokemon.side.battle;
    const random = battle && /random/i.test(`${battle.tier || ""} ${battle.id || ""}`);
    const room = battle && window.PS && PS.rooms && PS.rooms[battle.id];
    const spectating = Boolean(room && room.battle === battle && !room.side);
    const reason = random ? "random battles" : spectating ? "spectating" : null;
    if (reason && teraCacheOn && !battle.__phdCacheLogged) {
      battle.__phdCacheLogged = true;
      console.info(`[phd] ${reason}, disabled caching`);
    }
    const form = teraCacheOn && !reason && teraFormOf(sprite, type);
    try {
      if (form && await restoreTeraForm(form, urls, type)) return;
      if (form) await saveTeraForm(form, urls, type);
      else await bakeInOrder(urls, type);
    } catch (e) {
      console.warn("[phd] tera cache", e);
      await bakeInOrder(urls, type);
    }
  }

  function teraTypeOf(sprite) {
    const pokemon = sprite && sprite.__phdPokemon;
    const type = teraEnabled && pokemon && pokemon.terastallized;
    return type && (type in TERA_COLORS || type === "Stellar") ? type : null;
  }
  function teraSkin(sprite, url) {
    const type = url && !sprite.__phdTeraHold && teraTypeOf(sprite);
    return (type && teraBakes[`${type}|${url}`] && teraBakes[`${type}|${url}`].url) || url;
  }
  function teraIdle(sprite) {
    return teraSkin(sprite, actionUrl(sprite, "")) !== actionUrl(sprite, "") ? teraSkin(sprite, actionUrl(sprite, "")) : sprite.sp.url;
  }

  function updateTera(sprite) {
    const el = sprite && sprite.$el && sprite.$el[0];
    if (!el || !sprite.sp) return;
    const type = teraTypeOf(sprite);
    const current = el.getAttribute("src") || "";
    if (!type) {
      if (sprite.__phdTeraIdle && current.startsWith(sprite.__phdTeraIdle)) el.setAttribute("src", sprite.sp.url);
      sprite.__phdTeraIdle = null;
      return;
    }
    const state = sprite.__phdTeraState;
    if (!state || state.type !== type || state.url !== sprite.sp.url) {
      sprite.__phdTeraState = { type, url: sprite.sp.url };
      prepareTera(sprite, type);
    }
    if (sprite.__phdTeraHold) return;
    const idle = teraSkin(sprite, actionUrl(sprite, ""));
    if (idle && idle.startsWith("blob:") && current === sprite.sp.url) {
      el.setAttribute("src", idle);
      sprite.__phdTeraIdle = idle;
    }
  }

  function updateTeras(scene) {
    const battle = scene.battle;
    if (!battle) return;
    for (const side of [battle.nearSide, battle.farSide]) {
      for (const pokemon of (side && side.active) || []) {
        if (pokemon && pokemon.sprite) updateTera(pokemon.sprite);
      }
    }
  }

  window.__phdTera = { skin: teraSkin, idle: teraIdle, update: updateTeras };
})();
