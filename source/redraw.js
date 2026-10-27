document.getElementById("go").onclick = async () => {
  const tabs = await browser.tabs.query({ url: ["*://*.pokemonshowdown.com/*", "*://*.psim.us/*"] });
  tabs.forEach((tab) => browser.tabs.reload(tab.id, { bypassCache: true }));
};
