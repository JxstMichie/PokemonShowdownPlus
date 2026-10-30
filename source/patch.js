async function phdShortHash(buffer) {
  const bytes = new Uint8Array(buffer).filter((byte) => byte !== 13);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.slice(0, 4), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function phdRoundToTenth(value) {
  const scaled = value * 10;
  const floor = Math.floor(scaled);
  const rounded = scaled - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(scaled);
  return rounded / 10;
}

function phdPlacementFromData(data, tag) {
  const entry = {};
  for (const view of ["front", "back"]) {
    const source = data && data[view];
    if (!source) continue;
    const box = {};
    for (const key of ["x", "y", "w", "h"]) {
      if (!Number.isFinite(source[key])) return null;
      box[key] = phdRoundToTenth(source[key]);
    }
    for (const key of ["center", "origin", "tallest-point"]) {
      if (typeof source[key] === "string") box[key] = source[key];
    }
    const hitbox = source.hitbox;
    if (Array.isArray(hitbox) && hitbox.length === 4 && hitbox.every(Number.isFinite)) box.hitbox = hitbox;
    entry[view] = box;
  }
  if (!entry.front && !entry.back) return null;
  entry.hash = tag;
  return entry;
}

async function phdFetchPlacement(dir, tag) {
  const url = phdUrl(`${dir}/data.json`);
  for (const cache of ["default", "reload"]) {
    const response = await fetch(url, { cache });
    if (!response.ok) continue;
    const buffer = await response.arrayBuffer();
    if ((await phdShortHash(buffer)) !== tag) continue;
    return phdPlacementFromData(JSON.parse(new TextDecoder().decode(buffer)), tag);
  }
  return null;
}
