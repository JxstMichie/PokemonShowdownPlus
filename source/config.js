const PHD_RAW = "https://raw.githubusercontent.com/JxstMichie/PokemonHD_Gen";

const PHD_SETS = {
  "ani": "",
  "ani-shiny": "-shiny",
  "ani-back": "-back",
  "ani-back-shiny": "-back-shiny"
};
const PHD_VIEWS = ["", "-back", "-shiny", "-back-shiny"];
const PHD_KINDS = ["", "tap", "physical"];

const phdUrl = (path) => PHD_RAW + path.replace("/", "/main/");

function phdParseList(text) {
  const folders = Object.create(null), aliases = Object.create(null);
  for (const line of text.split("\n")) {
    const [head, ...items] = line.trim().split(/\s+/);
    if (head === "aliases:") {
      for (const item of items) {
        const [showdownName, folderName] = item.split("=");
        aliases[showdownName] = folderName;
      }
    } else if (/^gen\d:$/.test(head)) {
      for (const item of items) {
        const [directory, mask] = item.split(":");
        const name = directory.replace(/^\d{4}_/, "");
        folders[name] = { name, dir: `${head.slice(3, -1)}/${directory}`, mask: parseInt(mask, 16) };
      }
    }
  }
  return { folders, aliases };
}

async function phdLoadList() {
  const response = await fetch(browser.runtime.getURL("sprites.txt"));
  return phdParseList(await response.text());
}

const phdLookup = (list, name) => list.folders[name] || list.folders[list.aliases[name]];

const phdFind = (list, name) => phdLookup(list, name) || (name.endsWith("-f") && phdLookup(list, name.slice(0, -2))) || null;

const phdHasFile = (folder, kind, suffix) => Boolean(folder.mask & (1 << (PHD_KINDS.indexOf(kind) * 4 + PHD_VIEWS.indexOf(suffix))));

function phdSpriteUrl(list, name, kind, suffix) {
  for (const candidate of name.endsWith("-f") ? [name, name.slice(0, -2)] : [name]) {
    const folder = phdLookup(list, candidate);
    if (folder && phdHasFile(folder, kind, suffix)) return phdUrl(`${folder.dir}/${kind ? kind + "_" : ""}${folder.name}${suffix}.png`);
  }
  return null;
}

const phdRedirectUrl = (list, set, species) => (set in PHD_SETS ? phdSpriteUrl(list, species, "", PHD_SETS[set]) : null);
