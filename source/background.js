const listReady = phdLoadList();

const PATCH_RETRY_MS = 2000;
const patchTasks = new Map();
let patchSaving = Promise.resolve();

const isStaleMessage = (message) =>
  message && message.type === "phd-stale" &&
  /^[a-z0-9-]+$/.test(message.name) && /^[1-9]\/\d{4}_[a-z0-9-]+$/.test(message.dir) &&
  /^[0-9a-f]{8}$/.test(message.tag) && /^[0-9a-f]{0,8}$/.test(message.base);

function storeOverwrite(name, base, entry) {
  patchSaving = patchSaving.catch(() => {}).then(async () => {
    const stored = await browser.storage.local.get(PHD_OVERWRITE);
    const overwrite = stored[PHD_OVERWRITE] || {};
    overwrite[name] = { ...entry, base };
    await browser.storage.local.set({ [PHD_OVERWRITE]: overwrite });
  });
  return patchSaving;
}

function syncOverwrites(message) {
  patchSaving = patchSaving.catch(() => {}).then(async () => {
    const stored = await browser.storage.local.get(PHD_OVERWRITE);
    const overwrite = stored[PHD_OVERWRITE] || {};
    for (const name of message.dropped) delete overwrite[name];
    for (const name of Object.keys(message.added)) if (!(name in overwrite)) overwrite[name] = message.added[name];
    await browser.storage.local.set({ [PHD_OVERWRITE]: overwrite });
    if (message.removals.length) await browser.storage.local.remove(message.removals);
  });
  return patchSaving;
}

const isSyncMessage = (message) =>
  message && message.type === "phd-sync" && Array.isArray(message.dropped) && Array.isArray(message.removals) &&
  message.added && typeof message.added === "object" &&
  message.removals.every((key) => typeof key === "string" && (key === "phdPatches" || key.startsWith(PHD_FRAGMENT)));

function fetchAndStorePatch(message) {
  const key = `${message.name}:${message.tag}`;
  if (!patchTasks.has(key)) {
    const task = phdFetchPlacement(message.dir, message.tag)
      .then(async (entry) => {
        if (entry) await storeOverwrite(message.name, message.base, entry).catch(() => {});
        return entry;
      })
      .catch(() => null);
    patchTasks.set(key, task);
    task.then((entry) => { if (!entry) setTimeout(() => patchTasks.delete(key), PATCH_RETRY_MS); });
  }
  return patchTasks.get(key);
}

browser.runtime.onMessage.addListener((message) => {
  if (isStaleMessage(message)) return fetchAndStorePatch(message);
  if (isSyncMessage(message)) return syncOverwrites(message).then(() => true, () => false);
  return undefined;
});

const BASE_HOSTS = ["pokemonshowdown.com", "psim.us"];
let rules;
let registered = null;
let applying = Promise.resolve();

function configure(extra) {
  const alternation = [...BASE_HOSTS, ...extra].map((host) => host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const HOST = `(?:[a-z0-9-]+\\.)*(?:${alternation})(?::\\d+)?`;
  const hosts = [...BASE_HOSTS.flatMap((host) => [host, `*.${host}`]), ...extra];
  rules = {
    PATTERN: new RegExp(`^https?://${HOST}/sprites/(ani(?:-back)?(?:-shiny)?)/([a-z0-9-]+)\\.gif(?:[?#].*)?$`),
    BACKDROP: new RegExp(`^https?://${HOST}/sprites/gen6bgs/[^/?#]+$`),
    FX: new RegExp(`^https?://${HOST}/fx/weather-(mistyterrain|electricterrain|grassyterrain|psychicterrain|trickroom|magicroom|wonderroom)\\.png(?:[?#].*)?$`),
    urls: hosts.flatMap((host) => [`*://${host}/sprites/*`, `*://${host}/fx/weather-*`])
  };
}
const OVERLAYS = {
  mistyterrain: "bg_overlay/misty-terrain.png",
  electricterrain: "bg_overlay/electric-terrain.png",
  grassyterrain: "bg_overlay/grassy-terrain.png",
  psychicterrain: "bg_overlay/psycic-terrain.png",
  trickroom: "bg_overlay/trickroom.png",
  magicroom: "bg_overlay/magicroom.png",
  wonderroom: "bg_overlay/wonderroom.png"
};
const BACKGROUNDS = ["bg/battle-stadium.png", "bg/final-stadium.png", "bg/new-save.png"];
const randomBackdrop = () => browser.runtime.getURL(BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)]);

async function onRequest(details) {
  if (rules.BACKDROP.test(details.url)) return { redirectUrl: randomBackdrop() };
  const fx = rules.FX.exec(details.url);
  if (fx) return { redirectUrl: browser.runtime.getURL(OVERLAYS[fx[1]]) };
  const match = rules.PATTERN.exec(details.url);
  if (!match) return {};
  const url = phdRedirectUrl(await listReady, match[1], match[2]);
  return url ? { redirectUrl: url } : {};
}

function apply() {
  applying = applying.then(applyDomains, applyDomains);
  return applying;
}

const coveredByManifest = (domain) => BASE_HOSTS.some((host) => domain === host || domain.endsWith(`.${host}`));

async function applyDomains() {
  const { domains = [] } = await browser.storage.local.get("domains");
  const granted = [];
  for (const domain of domains) {
    if (await browser.permissions.contains({ origins: [`*://${domain}/*`] })) granted.push(domain);
  }
  configure(granted);
  browser.webRequest.onBeforeRequest.removeListener(onRequest);
  browser.webRequest.onBeforeRequest.addListener(onRequest, { urls: rules.urls, types: ["image", "imageset", "xmlhttprequest", "other"] }, ["blocking"]);
  if (registered) await registered.unregister();
  const injected = granted.filter((domain) => !coveredByManifest(domain));
  registered = injected.length
    ? await browser.contentScripts.register({ matches: injected.map((domain) => `*://${domain}/*`), js: [{ file: "config.js" }, { file: "loader.js" }], css: [{ file: "ui/panels.css" }], runAt: "document_start" })
    : null;
}

configure([]);
browser.webRequest.onBeforeRequest.addListener(onRequest, { urls: rules.urls, types: ["image", "imageset", "xmlhttprequest", "other"] }, ["blocking"]);
apply();
browser.storage.onChanged.addListener((changes) => changes.domains && apply());
browser.permissions.onAdded.addListener(apply);
browser.permissions.onRemoved.addListener(apply);

browser.browserAction.onClicked.addListener(() => browser.tabs.create({ url: browser.runtime.getURL("ui/settings.html") }));
