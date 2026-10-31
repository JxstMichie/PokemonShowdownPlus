(() => {
  if (!window.PokemonHP) return;

  let hpStyle = "standard";
  try { hpStyle = JSON.parse(document.currentScript.dataset.cfg).hpStyle || "standard"; } catch (error) {}

  const { data: { view, shapes, panel: P }, shapeOf, viewOf, slimRow } = PokemonHP;
  const STATUS = { brn: "burn", par: "paralysis", psn: "poison", tox: "toxic", slp: "sleep", frz: "freeze" };
  const GENDER = { M: "male", F: "female" };

  const unit = P.width / view.width;
  const toY = (y) => (y - view.top) * unit;
  const topMiddle = (shape) => (shape[0][0] + shape[1][0]) / 2;
  const boxWidth = P.chip.perRow * P.chip.width + (P.chip.perRow - 1) * P.chip.gap;

  //the enemy shape slants on the right edge so the panel is pushed until the bottom right corner sits on the border
  //the clipped layer then cuts the edge flat instead of showing a sharp corner
  const enemyOverhang = (view.left + view.width - shapes.enemy[2][0]) * unit;
  const enemyTop = P.topGap - toY(shapes.enemy[0][1]);

  //room for every chip row is reserved under the player panel so panels never move when chips appear
  const spaceBelowShape = (view.top + view.height - shapes.playerFull[2][1]) * unit;
  const playerBottom = P.bottomGap + P.chip.rowsReserved * P.chip.rowHeight + P.chipsGap - spaceBelowShape;

  const mirrorOverhang = (view.left + view.width - shapes.playerFull[1][0]) * unit;

  const make = (tag, className, parent) => {
    const node = document.createElement(tag);
    node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  };

  //built elements are stored on the client's own objects under __phd keys so they are created once
  const owned = (owner, key, build) => {
    if (!owner[key] || !owner[key].isConnected) owner[key] = build();
    return owner[key];
  };

  //later elements draw on top so the layer goes before the turn badge and message bar
  const layerOf = (scene) => !scene ? null : owned(scene, "__phdLayer", () => {
    const stage = scene.$battle && scene.$battle[0];
    if (!stage) return null;
    stage.classList.add("phd-on");
    const layer = make("div", "phd-layer");
    const vars = { panel: P.width, chip: P.chip.width, gap: P.chip.gap, row: P.chip.rowHeight, box: boxWidth, overhang: enemyOverhang, "enemy-top": enemyTop, "mirror-overhang": mirrorOverhang, "player-bottom": playerBottom };
    for (const name in vars) layer.style.setProperty("--" + name, vars[name] + "px");
    stage.insertBefore(layer, [...stage.children].find((child) => child.matches(".messagebar, .turn") || child.querySelector(".turn")) || null);
    return layer;
  });

  const rowOf = (scene, enemy) => owned((scene.__phdRows = scene.__phdRows || {}), enemy, () => {
    const layer = layerOf(scene);
    return layer && make("div", "phd-row " + (enemy ? "enemy" : "player"), layer);
  });

  //panels belong to a slot and not to a sprite so a hidden panel keeps its place and the other slot never slides over
  const panelOf = (sprite, slot) => {
    const row = rowOf(sprite.scene, sprite.isFrontSprite);
    if (!row) return null;
    const panel = owned((row.__phdPanels = row.__phdPanels || {}), slot, () => make("pokemon-hp", "", row));
    panel.__phdSprite = sprite;
    sprite.__phdPanel = panel;
    return panel;
  };

  const chipsBoxOf = (sprite) => owned(sprite, "__phdChips", () => {
    const layer = layerOf(sprite.scene);
    if (!layer) return null;
    const box = make("div", "statbar phd-chips", layer);
    make("div", "status", box);
    return box;
  });

  //the client already draws boost chips inside its hidden status line and only they contain a times sign
  //the line also holds volatile effects like confusion
  function drawChips(sprite, panel) {
    const box = chipsBoxOf(sprite);
    if (!box) return;
    const status = sprite.$statbar[0].querySelector(".status");
    const chips = status ? [...status.children].filter((chip) => chip.tagName === "SPAN" && chip.textContent.includes("×")) : [];
    const html = chips.map((chip) => chip.outerHTML).join("");
    if (box.__phdHtml !== html) {
      box.__phdHtml = html;
      box.firstChild.innerHTML = html;
    }
    box.style.display = chips.length ? "block" : "none";

    //centered on the panel but kept inside the window because the enemy panel hugs the right border
    const shape = shapeOf(panel.state);
    const stageWidth = box.parentElement.clientWidth || 640;
    const row = panel.offsetParent;
    if (!row) {
      box.style.display = "none";
      return;
    }
    const left = Math.max(2, Math.min(stageWidth - boxWidth - 2, row.offsetLeft + panel.offsetLeft + (topMiddle(shape) - viewOf(panel.state).left) * panel.offsetWidth / viewOf(panel.state).width - boxWidth / 2));
    box.style.left = Math.round(left) + "px";
    box.style.top = Math.round(row.offsetTop + panel.offsetTop + toY(shape[2][1]) + P.chipsGap) + "px";
  }

  function applySlim(row, count, enemy) {
    const fit = count > 3 ? slimRow(count, row.parentElement.clientWidth || 640, enemy) : null;
    row.style.setProperty("--pad", fit ? fit.pad + "px" : "");
    row.style.setProperty("--slim-w", fit ? fit.width + "px" : "");
    row.style.setProperty(enemy ? "--overhang" : "--mirror-overhang", fit ? fit.overhang + "px" : "");
    return !!fit;
  }

  const sidesOf = (battle) => [[battle.nearSide, false], [battle.farSide, true]];

  //own items come from the battle request and enemy items show only once the client knows them
  const slotHtml = (side, enemy, request) => Array.from({ length: side.totalPokemon || side.pokemon.length || 6 }, (_, index) => {
    const mon = side.pokemon[index];
    if (!mon) return '<div class="phd-slot unknown"></div>';
    let item = enemy ? mon.item : (request.find((entry) => entry.ident === mon.ident) || mon).item;
    if (item === "(mail)") item = "";
    const label = BattleLog.escapeHTML(mon.speciesForme) + (mon.fainted ? " (fainted)" : "");
    //has-tooltip with data-tooltip makes the client show the pokemon tooltip on hover
    return `<div class="phd-slot${mon.fainted ? " dead" : ""}"><span class="picon has-tooltip" style="${Dex.getPokemonIcon(mon, enemy)}" data-tooltip="pokemon|${side.n}|${index}" aria-label="${label}"></span>` +
      (item ? `<span class="item"><i style="${Dex.getItemIcon(item)}"></i></span>` : "") + "</div>";
  }).join("");

  function updateTeams(scene) {
    const room = window.PS && PS.rooms && PS.rooms[scene.battle.id];
    const request = room && room.request && room.request.side ? room.request.side.pokemon : [];
    for (const [side, enemy] of sidesOf(scene.battle)) {
      const layer = side && layerOf(scene);
      if (!layer) continue;
      const column = owned((scene.__phdTeams = scene.__phdTeams || {}), enemy ? "enemy" : "player", () => make("div", "phd-team " + (enemy ? "enemy" : "player"), layer));
      const html = slotHtml(side, enemy, request);
      if (column.__phdHtml !== html) {
        column.__phdHtml = html;
        column.innerHTML = html;
      }
    }
  }

  function arrange(scene) {
    if (!scene.battle) return;
    const spread = hpStyle === "compact" && scene.activeCount === 2;
    for (const [side, enemy] of sidesOf(scene.battle)) {
      const row = scene.__phdRows && scene.__phdRows[enemy];
      const panels = (row && row.__phdPanels) || {};
      if (row) {
        row.classList.toggle("phd-spread", !enemy && spread);
        applySlim(row, Object.keys(panels).length, enemy);
      }
      for (const slot in panels) {
        const panel = panels[slot];
        const flushLeft = !enemy && +slot === 0;
        const count = Object.keys(panels).length, slim = count > 3;
        const mirror = !enemy && (spread && +slot === 1 || slim && +slot === count - 1);
        panel.classList.toggle("phd-slim", slim);
        panel.classList.toggle("phd-mirror", mirror);
        panel.style.order = slot;
        if (panel.state.flushLeft !== flushLeft || panel.state.mirror !== mirror || panel.state.slim !== slim) panel.setState({ flushLeft, mirror, slim });
        if (panel.style.visibility !== "hidden" && panel.__phdSprite && panel.__phdSprite.scene) drawChips(panel.__phdSprite, panel);
      }
    }
    updateTeams(scene);
  }

  const ABILITY_HOLD = 1800;
  const ABILITY_EXIT = 467;
  const TEAM_SLIDE = 300;

  function slideTeamBar(scene, edge, show) {
    const column = scene.__phdTeams && scene.__phdTeams[edge === "right" ? "enemy" : "player"];
    if (!column) return;
    column.__phdAway = Math.max(0, (column.__phdAway || 0) + (show ? -1 : 1));
    column.classList.toggle("away", column.__phdAway > 0);
  }

  function abilityEdge(pokemon) {
    const side = pokemon.side, battle = side.battle;
    const count = side.active.length;
    const visual = side === battle.nearSide ? pokemon.slot : count - 1 - pokemon.slot;
    return count > 1 && visual === count - 1 ? "right" : "left";
  }

  function installAbility() {
    if (!window.BattleScene || BattleScene.prototype.__phdAbility || !customElements.get("pokemon-ability-panel")) return;
    BattleScene.prototype.__phdAbility = true;
    const original = BattleScene.prototype.abilityActivateAnim;
    BattleScene.prototype.abilityActivateAnim = function (pokemon, result) {
      if (!this.animating) return;
      const layer = layerOf(this);
      if (!layer || !pokemon.sprite) return original.apply(this, arguments);
      const scene = this, edge = abilityEdge(pokemon);
      const panel = owned(this, "__phdAbility", () => make("pokemon-ability-panel", "", layer));
      const $timer = $("<div>").delay(this.timeOffset)
        .queue((next) => { slideTeamBar(scene, edge, false); if (window.__phdPlaySound) window.__phdPlaySound("ability"); next(); })
        .delay(TEAM_SLIDE)
        .queue((next) => { panel.show({ side: edge, name: pokemon.name, ability: result }); next(); })
        .delay(ABILITY_HOLD)
        .queue((next) => { panel.hide(edge); next(); })
        .delay(ABILITY_EXIT)
        .queue((next) => { slideTeamBar(scene, edge, true); next(); })
        .delay(TEAM_SLIDE);
      this.wait(100);
      pokemon.sprite.updateStatbar(pokemon);
      if (this.acceleration < 3) this.waitFor($timer);
    };
  }

  function itemStyleOf(sprite, mon) {
    let item = mon.item;
    if (!sprite.isFrontSprite) {
      const room = window.PS && PS.rooms && PS.rooms[sprite.scene.battle.id];
      const side = room && room.request && room.request.side ? room.request.side.pokemon : [];
      item = (side.find((entry) => entry.ident === mon.ident) || mon).item;
    }
    return item && item !== "(mail)" ? Dex.getItemIcon(item) : "";
  }

  function sync(sprite, mon) {
    if (!sprite.scene) return;
    const panel = panelOf(sprite, Math.max(0, mon.side.active.indexOf(mon)));
    if (!panel || !panel.setState) return;
    //a new pokemon or a panel that was hidden shows hp instantly so the bar does not slide up like a heal
    const isNew = panel.__phdIdent !== mon.ident || panel.style.visibility === "hidden";
    panel.__phdIdent = mon.ident;
    panel.style.visibility = "";
    panel.setState({
      side: sprite.isFrontSprite ? "enemy" : "player",
      compact: sprite.scene.activeCount > 1,
      name: mon.name,
      level: mon.level,
      maxHP: mon.maxhp || 100, //hp is a %
      hp: mon.fainted ? 0 : mon.hp,
      gender: GENDER[mon.gender] || "none",
      status: mon.fainted ? "fainted" : STATUS[mon.status] || "none",
      itemStyle: itemStyleOf(sprite, mon),
      dynamax: !!(mon.volatiles && mon.volatiles.dynamax),
      tera: mon.terastallized || "",
      mega: !!(window.Dex && (s => s.isMega || s.isPrimal)(Dex.species.get(mon.speciesForme || "")))
    }, { animate: !isNew });
    arrange(sprite.scene);
  }

  function release(sprite, mon) {
    const panel = sprite.__phdPanel;
    if (!panel || !sprite.scene) return;
    if (panel.__phdIdent === mon.ident) panel.style.visibility = "hidden";
    if (sprite.__phdChips) sprite.__phdChips.style.display = "none";
    arrange(sprite.scene);
  }

  //damage and healing only call updateHPText and never updateStatbar so both are wrapped
  //returns false while the client has not defined PokemonSprite yet
  function install() {
    if (!window.PokemonSprite || PokemonSprite.prototype.__phdInstalled) return false;
    PokemonSprite.prototype.__phdInstalled = true;
    for (const name of ["updateStatbar", "updateHPText"]) {
      const original = PokemonSprite.prototype[name];
      PokemonSprite.prototype[name] = function (mon) {
        const result = original.apply(this, arguments);
        try {
          if (!this.scene) {
            return result;
          } else if (this.$statbar && mon.isActive()) {
            sync(this, mon);
          } else {
            release(this, mon);
          }
        } catch (error) {
          console.warn("[phd-hp]", error); //a bug here must never break the game
        }
        return result;
      };
    }
    for (const name of ["animUnsummon", "animFaint"]) {
      const original = PokemonSprite.prototype[name];
      PokemonSprite.prototype[name] = function (mon) {
        const result = original.apply(this, arguments);
        try {
          if (!mon.isActive()) release(this, mon);
        } catch (error) {
          console.warn("[phd-hp]", error);
        }
        return result;
      };
    }
    const animTransform = PokemonSprite.prototype.animTransform;
    PokemonSprite.prototype.animTransform = function (mon) {
      const result = animTransform.apply(this, arguments);
      try {
        if (this.scene && this.$statbar && this.__phdPanel && mon.isActive()) sync(this, mon);
      } catch (error) {
        console.warn("[phd-hp]", error);
      }
      return result;
    };
    installAbility();
    return true;
  }

  document.addEventListener("phd-settings", (event) => {
    const detail = JSON.parse(event.detail);
    if (typeof detail.hpStyle !== "string") return;
    hpStyle = detail.hpStyle;
    (window.__phdScenes || new Set()).forEach((scene) => { try { arrange(scene); } catch (error) { console.warn("[phd-hp]", error); } });
  });

  const timer = install() ? 0 : setInterval(() => install() && clearInterval(timer), 50);
})();
