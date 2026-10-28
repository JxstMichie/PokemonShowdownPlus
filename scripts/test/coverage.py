#!/usr/bin/env python3
"""List Showdown species/forms, including those without sprite images.

Pull Showdown names, scan our local assets, generate sprites.txt, then run coverage.

Run from the project root:
    python3 scripts/test/coverage.py
    python3 scripts/test/coverage.py --output fresh-renders.txt
"""

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.error import URLError
from urllib.request import Request, urlopen


HERE = Path(__file__).resolve().parents[2]
COVERAGE = Path(__file__).resolve().parent / "ani-coverage"
sys.path.insert(0, str(HERE / "scripts"))
from precompile import resolve_alias

POKEDEX = "https://play.pokemonshowdown.com/data/pokedex.json"


def to_id(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def form_names(pokedex):
    names = set()
    for entry in pokedex.values():
        base = entry.get("baseSpecies", entry["name"])
        # Normalize the base and form separately, e.g. Raichu-Mega-X
        # becomes raichu-megax, matching Showdown's sprite naming style.
        name = entry["name"]
        if name.startswith(base + "-"):
            names.add(to_id(base) + "-" + to_id(name[len(base) + 1:]))
        else:
            names.add(to_id(name))
    return names


def fetch(url):
    request = Request(url, headers={"User-Agent": "ShowdownRendersList/1.0"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-o", "--output", type=Path,
        default=COVERAGE / "Showdown.txt",
        help="destination (default: scripts/test/ani-coverage/Showdown.txt; replaces existing file)",
    )
    args = parser.parse_args()

    try:
        pokedex = json.loads(fetch(POKEDEX))
        if not isinstance(pokedex, dict) or not pokedex:
            raise ValueError("Pokedex data is empty or invalid")
        names = form_names(pokedex)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text("\n".join(sorted(names)) + "\n", encoding="utf-8")
        print(f"Saved {len(names)} Showdown names", flush=True)
        subprocess.run([sys.executable, str(HERE / "scripts" / "precompile.py"),
                        "--showdown", str(args.output.resolve())], check=True)
        available = set((COVERAGE / "PlusRenders.txt").read_text(encoding="utf-8").split())
        ignored = set((COVERAGE / ".ignore-coverage").read_text(encoding="utf-8").split())
        missing = sorted(name for name in names
                         if name not in ignored and resolve_alias(name, available) is None)
        output = COVERAGE / "missing-coverage.txt"
        output.write_text("".join(name + "\n" for name in missing), encoding="utf-8")
        print(f"{len(missing)} Showdown names missing coverage: {output}")
        if missing:
            print("\n".join(missing))
    except (OSError, URLError, UnicodeError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Could not generate lists and coverage: {error}\n")



if __name__ == "__main__":
    main()
