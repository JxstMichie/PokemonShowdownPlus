const listReady = phdLoadList();

const HOSTS = ["*://pokemonshowdown.com", "*://*.pokemonshowdown.com", "*://psim.us", "*://*.psim.us"];
const HOST = "(?:[a-z0-9-]+\\.)*(?:pokemonshowdown\\.com|psim\\.us)";
const PATTERN = new RegExp(`^https?://${HOST}/sprites/(ani(?:-back)?(?:-shiny)?)/([a-z0-9-]+)\\.gif(?:[?#].*)?$`);
const BACKDROP = new RegExp(`^https?://${HOST}/sprites/gen6bgs/[^/?#]+$`);
const FX = new RegExp(`^https?://${HOST}/fx/weather-(mistyterrain|electricterrain|grassyterrain|psychicterrain|trickroom)\\.png(?:[?#].*)?$`);
const OVERLAYS = {
  mistyterrain: "bg_overlay/misty-terrain.png",
  electricterrain: "bg_overlay/electric-terrain.png",
  grassyterrain: "bg_overlay/grassy-terrain.png",
  psychicterrain: "bg_overlay/psycic-terrain.png",
  trickroom: "bg_overlay/trickroom.png"
};
const randomBackdrop = () => browser.runtime.getURL(PHD_BACKGROUNDS[Math.floor(Math.random() * PHD_BACKGROUNDS.length)]);

browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (BACKDROP.test(details.url)) return { redirectUrl: randomBackdrop() };
    const fx = FX.exec(details.url);
    if (fx) return { redirectUrl: browser.runtime.getURL(OVERLAYS[fx[1]]) };
    const match = PATTERN.exec(details.url);
    if (!match) return {};
    const url = phdRedirectUrl(await listReady, match[1], match[2]);
    return url ? { redirectUrl: url } : {};
  },
  {
    urls: HOSTS.flatMap((host) => [`${host}/sprites/*`, `${host}/fx/weather-*`]),
    types: ["image", "imageset", "xmlhttprequest", "other"]
  },
  ["blocking"]
);
