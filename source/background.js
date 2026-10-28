const listReady = phdLoadList();

const BASE_HOSTS = ["pokemonshowdown.com", "psim.us"];
let rules;
let registered = null;

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

async function apply() {
  const { domains = [] } = await browser.storage.local.get("domains");
  const granted = [];
  for (const domain of domains) {
    if (await browser.permissions.contains({ origins: [`*://${domain}/*`] })) granted.push(domain);
  }
  configure(granted);
  browser.webRequest.onBeforeRequest.removeListener(onRequest);
  browser.webRequest.onBeforeRequest.addListener(onRequest, { urls: rules.urls, types: ["image", "imageset", "xmlhttprequest", "other"] }, ["blocking"]);
  if (registered) await registered.unregister();
  registered = granted.length
    ? await browser.contentScripts.register({ matches: granted.map((domain) => `*://${domain}/*`), js: [{ file: "config.js" }, { file: "loader.js" }], css: [{ file: "ui/panels.css" }], runAt: "document_start" })
    : null;
}

configure([]);
browser.webRequest.onBeforeRequest.addListener(onRequest, { urls: rules.urls, types: ["image", "imageset", "xmlhttprequest", "other"] }, ["blocking"]);
apply();
browser.storage.onChanged.addListener((changes) => changes.domains && apply());
browser.permissions.onAdded.addListener(apply);
browser.permissions.onRemoved.addListener(apply);

browser.browserAction.onClicked.addListener(() => browser.tabs.create({ url: browser.runtime.getURL("ui/settings.html") }));
