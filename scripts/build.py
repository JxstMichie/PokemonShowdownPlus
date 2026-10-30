import shutil
import subprocess
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SOURCE = HERE / "source"
DATA = HERE / "data"
OUT = HERE / "dist" / "firefox" / "pokemon-showdown-hd.xpi"
CODE = ["manifest.json", "config.js", "patch.js", "background.js", "loader.js", "page.js", "debug.js", "ui/component.js", "ui/ability.js", "ui/panels.js", "ui/panels.css", "ui/data.json", "ui/settings.html", "ui/settings.js"]
JSON = ["doubles.json", "move.json", "sprites.txt", "render_metadata.json"]

MINIFY = ["ui/component.js", "ui/panels.js"]


def shipped(name):
    path = SOURCE / name
    if name not in MINIFY or not shutil.which("terser"):
        return path.read_bytes()
    result = subprocess.run(["terser", str(path), "-c", "passes=2", "-m", "-f", "ascii_only=true"], capture_output=True)
    if result.returncode != 0:
        raise SystemExit(f"terser failed on {name}: {result.stderr.decode()}")
    return result.stdout


OUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for name in CODE:
        z.writestr(name, shipped(name))
    for name in JSON:
        z.write(DATA / name, name)
    z.write(HERE / "assets" / "icon.png", "icon.png")
    for p in sorted((HERE / "assets" / "ui").glob("*")):
        z.write(p, f"ui/assets/{p.name}")
    for p in sorted((HERE / "assets" / "fx").glob("*")):
        z.write(p, f"fx/{p.name}")
    for folder in ("bg", "bg_overlay"):
        for p in sorted((HERE / "assets" / folder).glob("*.png")):
            z.write(p, f"{folder}/{p.name}")
print(f"Built {OUT}")
