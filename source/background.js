const listReady = phdLoadList();

const PATTERN = /^https?:\/\/play\.pokemonshowdown\.com\/sprites\/(ani(?:-back)?(?:-shiny)?)\/([a-z0-9-]+)\.gif(?:[?#].*)?$/;

browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const match = PATTERN.exec(details.url);
    if (!match) return {};
    const url = phdRedirectUrl(await listReady, match[1], match[2]);
    return url ? { redirectUrl: url } : {};
  },
  {
    urls: ["*://play.pokemonshowdown.com/sprites/*"],
    types: ["image", "imageset", "xmlhttprequest", "other"]
  },
  ["blocking"]
);
