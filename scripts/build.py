import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SOURCE = HERE / "source"
DATA = HERE / "data"
OUT = HERE / "dist" / "firefox" / "pokemon-showdown-hd.xpi"
CODE = ["manifest.json", "config.js", "background.js", "loader.js", "page.js", "exceptions.js"]
JSON = ["doubles.json", "move.json", "sprites.txt", "placements.json"]

OUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for name in CODE:
        z.write(SOURCE / name, name)
    for name in JSON:
        z.write(DATA / name, name)
    z.write(HERE / "assets" / "icon.png", "icon.png")
    for folder in ("bg", "bg_overlay"):
        for p in sorted((HERE / "assets" / folder).glob("*.png")):
            z.write(p, f"{folder}/{p.name}")
print(f"Built {OUT}")
