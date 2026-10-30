import argparse
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
ANI = HERE / "ani"
DATA = HERE / "data"
COVERAGE = HERE / "scripts" / "test" / "ani-coverage"

"""
Matches / reassigns our sprites to showdown and generates an alias dictionary 
"""
ALIASES = [
    (r"^(gourgeist|pumpkaboo)-(small|large)$", r"\g<1>"),
    (r"^xerneas-neutral$", r"xerneas"),
    (r"^nidoran$", r"nidoranm"),
    (r"^basculegion-f$", r"basculegion-female"),
    (r"^minior-meteor$", r"minior-bluemeteor"),
    (r"^necrozma-(dawn|dusk)(wings|mane)$", r"necrozma-\g<1>"),
    (r"^(groudon|kyogre)-primal$", r"\g<1>-mega"),
    (r"^camperupt-mega$", r"camerupt-mega"),
    (r"^shapedo-mega$", r"sharpedo-mega"),
    (r"^(.+)-(alola|busted)totem$", r"\g<1>-\g<2>"),
    (r"^(.+)-totem-a$", r"\g<1>-alola"),
    (r"^(.+)-totem$", r"\g<1>"),
    (r"^alcremie-([a-z]+)-(cream|swirl)(-[a-z]+)?$", r"alcremie-\g<1>\g<2>\g<3>"),
    (r"^meowstic-[fm]mega$", r"meowstic-mega"),
    (r"^pikachu-(belle|cosplay|libre|phd|pop-?star|rockstar|starter(-f)?|world)$", r"pikachu"),
    (r"^pichu-spikyeared$", r"pichu"),
    (r"^ogerpon-tealtera$", r"ogerpon"),
    (r"^ogerpon-(wellspring|hearthflame|cornerstone)tera$", r"ogerpon-\g<1>"),
    (r"^terapagos-stellar$", r"terapagos-terastal"),
    (r"^eevee-starter(-f)?$", r"eevee"),
    (r"^rotom-([fhmsw])$", lambda m: "rotom-" + {"f": "frost", "h": "heat", "m": "mow", "s": "fan", "w": "wash"}[m[1]]),
    (r"^pikachu-(alola|hoenn|kalos|original|partner|sinnoh|unova)$", r"pikachu-\g<1>cap"),
]


def resolve_alias(name, available):
    """Return an existing exact name or the first available regex fallback."""
    if name in available:
        return name
    for pattern, replacement in ALIASES:
        if re.fullmatch(pattern, name):
            target = re.sub(pattern, replacement, name)
            if target in available:
                return target
    return None


def compile_sprites(names):
    folders = [(g.name, d, re.sub(r"^\d{4}_", "", d.name))
               for g in sorted(ANI.glob("gen[1-9]"))
               for d in sorted(g.glob("[0-9][0-9][0-9][0-9]_*")) if d.is_dir()]
    if not folders:
        raise ValueError(f"No local Pokemon asset folders found in {ANI}")
    known = sorted({name for _, _, name in folders})
    available = set(known)
    aliases = {}
    for name in names:
        target = resolve_alias(name, available)
        if target is not None and target != name:
            aliases[name] = target
    gens = {}
    for gen, folder, name in folders:
        have = {f.name for f in folder.glob("*.png")}
        mask = sum(1 << (k * 4 + v)
                   for k, kind in enumerate(("", "tap_", "physical_"))
                   for v, view in enumerate(("", "-back", "-shiny", "-back-shiny"))
                   if f"{kind}{name}{view}.png" in have)
        gens.setdefault(gen, []).append(f"{folder.name}:{mask:03x}")
    sprites = "".join(f"{g}: {' '.join(items)}\n" for g, items in gens.items())
    sprites += "aliases: " + " ".join(f"{k}={v}" for k, v in sorted(aliases.items())) + "\n"
    return known, sprites


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--showdown", type=Path, default=COVERAGE / "Showdown.txt")
    args = parser.parse_args()
    names = args.showdown.read_text(encoding="utf-8").split()
    known, sprites = compile_sprites(names)
    COVERAGE.mkdir(parents=True, exist_ok=True)
    (COVERAGE / "PlusRenders.txt").write_text("\n".join(known) + "\n", encoding="utf-8")
    (DATA / "sprites.txt").write_text(sprites, encoding="utf-8")
    folders = [(g.name, d, re.sub(r"^\d{4}_", "", d.name))
               for g in sorted(ANI.glob("gen[1-9]"))
               for d in sorted(g.glob("[0-9][0-9][0-9][0-9]_*")) if d.is_dir()]
    metadata_path = DATA / "render_metadata.json"
    previous = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.exists() else {}
    placements = {}
    for gen, d, name in folders:
        if (d / "data.json").exists():
            raw = (d / "data.json").read_bytes()
            data = json.loads(raw.decode("utf-8"))
            boxes = {v: {**{k: round(data[v][k], 1) for k in "xywh"}, **{k: data[v][k] for k in ("center", "origin", "tallest-point") if k in data[v]}} for v in ("front", "back") if v in data}
            if boxes:
                if data.get("aerial", previous.get(name, {}).get("aerial", False)):
                    boxes["aerial"] = True
                boxes["hash"] = hashlib.sha256(raw.replace(b"\r", b"")).hexdigest()[:8]
                placements[name] = boxes
    metadata_path.write_text(json.dumps(placements, separators=(",", ":")), encoding="utf-8")
    print(f"Precompiled {len(known)} local names and {len(placements)} placements", flush=True)


if __name__ == "__main__":
    main()
