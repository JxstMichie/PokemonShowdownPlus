const listReady = phdLoadList();

const HOSTS = ["*://pokemonshowdown.com", "*://*.pokemonshowdown.com", "*://psim.us", "*://*.psim.us"];
const HOST = "(?:[a-z0-9-]+\\.)*(?:pokemonshowdown\\.com|psim\\.us)";
const PATTERN = new RegExp(`^https?://${HOST}/sprites/(ani(?:-back)?(?:-shiny)?)/([a-z0-9-]+)\\.gif(?:[?#].*)?$`);
const BACKDROP = new RegExp(`^https?://${HOST}/sprites/gen6bgs/[^/?#]+$`);
const BACKDROP_URL = browser.runtime.getURL("bg/battle-stadium.png");

browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (BACKDROP.test(details.url)) return { redirectUrl: BACKDROP_URL };
    const match = PATTERN.exec(details.url);
    if (!match) return {};
    const url = phdRedirectUrl(await listReady, match[1], match[2]);
    return url ? { redirectUrl: url } : {};
  },
  {
    urls: HOSTS.map((host) => `${host}/sprites/*`),
    types: ["image", "imageset", "xmlhttprequest", "other"]
  },
  ["blocking"]
);
