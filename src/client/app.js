/*jshint noempty:false*/

/*global $: false */
/*global math_device: false */
/*global assert: false */
/*global Z: false */

const local_storage = require('./local_storage.js');
const particle_data = require('./particle_data.js');

local_storage.storage_prefix = 'turbulenz-playground';
window.Z = window.Z || {};
Z.BACKGROUND = 0;
Z.SHIP = 5;
Z.ENEMY = 10;
Z.PARTICLES = 20;

const DEBUG = window.location.toString().indexOf('localhost') !== -1;

let app = exports;
// Virtual viewport for our game logic
export const game_width = 384;
export const game_height = 288;

const SHIP_W = 288;
const SHIP_H = 288;
const PANEL_W = 64;
const PANEL_H = 32;
const SHIP_X = 18; // (game_width - SHIP_W);
const SHIP_Y = 0;
const TICK_FIRST = DEBUG ? 1000 : 5000;
const TICK_EACH = DEBUG ? 1000 : 1000;

const ENEMY_SHIP_X0 = game_width + 32;
const ENEMY_SHIP_X1 = SHIP_X + SHIP_W + (game_width - SHIP_W - SHIP_X) / 2;
const ENEMY_SHIP_H = 64;
const ENEMY_SHIP_SPEED = 40 / 1000; // pixels / ms
const ENEMY_INITIAL_COUNTDOWN = DEBUG ? 0 : 5; // ticks

const HEAT_DELTA = [-5, 5, 20];

const SHIELD_DELTA = [-5, 10, 40];
const EVADE_DELTA = [-5/3, 10/3, 40/3];
const CHARGE_DELTA = [-5, 10, 40];
const OVERHEAT_DAMAGE = -5;

export function main(canvas)
{
  const glov_engine = require('./glov/engine.js');
  const glov_font = require('./glov/font.js');

  glov_engine.startup({
    canvas,
    game_width,
    game_height,
    pixely: true,
  });

  const sound_manager = glov_engine.sound_manager;
  // const glov_camera = glov_engine.glov_camera;
  const glov_input = glov_engine.glov_input;
  const glov_sprite = glov_engine.glov_sprite;
  const glov_ui = glov_engine.glov_ui;
  const draw_list = glov_engine.draw_list;
  const font = glov_engine.font;

  glov_ui.font_height = 8;
  glov_ui.button_img_size = glov_ui.button_height = 13;
  glov_ui.button_width = 60;
  glov_ui.modal_width = 200;
  glov_ui.modal_y0 = 80;
  glov_ui.modal_title_scale = 1.2;
  glov_ui.pad = 6;
  glov_ui.panel_pixel_scale = 16;
  glov_ui.color_panel = math_device.v4Build(1, 1, 1, 1);

  const loadTexture = glov_sprite.loadTexture.bind(glov_sprite);
  const createSprite = glov_sprite.createSprite.bind(glov_sprite);
  const createAnimation = glov_sprite.createAnimation.bind(glov_sprite);

  glov_ui.bindSounds(sound_manager, {
    button_click: 'button_click',
    rollover: 'rollover',
  });

  const pico8_colors = [
    math_device.v4Build(0, 0, 0, 1),
    math_device.v4Build(0.114, 0.169, 0.326, 1),
    math_device.v4Build(0.494, 0.145, 0.326, 1),
    math_device.v4Build(0.000, 0.529, 0.328, 1),
    math_device.v4Build(0.671, 0.322, 0.212, 1),
    math_device.v4Build(0.373, 0.341, 0.310, 1),
    math_device.v4Build(0.761, 0.765, 0.780, 1),
    math_device.v4Build(1.000, 0.945, 0.910, 1),
    math_device.v4Build(1.000, 0.000, 0.302, 1),
    math_device.v4Build(1.000, 0.639, 0.000, 1),
    math_device.v4Build(1.000, 0.925, 0.153, 1),
    math_device.v4Build(0.000, 0.894, 0.212, 1),
    math_device.v4Build(0.161, 0.678, 1.000, 1),
    math_device.v4Build(0.514, 0.463, 0.612, 1),
    math_device.v4Build(1.000, 0.467, 0.659, 1),
    math_device.v4Build(1.000, 0.800, 0.667, 1),
  ];

  const color_white = math_device.v4Build(1, 1, 1, 1);

  // Cache key_codes
  const key_codes = glov_input.key_codes;
  const pad_codes = glov_input.pad_codes;

  let value_defs = {
    'heat': {
      max: 100,
      label: 'HEAT',
    },
    'hp': {
      start: 100,
      max: 100,
      label: 'HP',
    },
    'evade': {
      max: 33,
      label: 'EVADE',
    },
    'shield': {
      max: 100,
      label: 'SHIELD',
    },
    'charge': {
      max: 100,
      label: 'CHARGE',
    },
  };
  let panel_types = {
    engine: {
      values: ['heat', 'evade', 'hp'],
    },
    shield: {
      values: ['heat', 'shield', 'hp'],
    },
    weapon: {
      values: ['heat', 'charge', 'hp'],
    },
  };

  let ship_slots = [
    { pos: [162, 32], start: 'weapon' },
    { pos: [194, 96], start: 'engine' },
    { pos: [66, 96], start: 'shield' },
    // { pos: [162, 96], start: 'gen' },
  ];

  let state;

  let sprites = {};
  function initGraphics() {
    if (sprites.white) {
      return;
    }

    // Preload all referenced particle textures
    for (let key in particle_data.defs) {
      let def = particle_data.defs[key];
      for (let part_name in def.particles) {
        let part_def = def.particles[part_name];
        loadTexture(part_def.texture);
      }
    }

    sound_manager.loadSound('test');

    const origin_0_0 = { origin: math_device.v2Build(0, 0) };

    function loadSprite(file, u, v, params) {
      params = params || {};
      return createSprite(file, {
        width: params.width || 1,
        height: params.height || 1,
        rotation: params.rotation || 0,
        color: params.color || color_white,
        origin: params.origin || undefined,
        u: u,
        v: v,
      });
    }


    sprites.ship = loadSprite('ship.png', SHIP_W, SHIP_H, origin_0_0);
    sprites.enemy_fighter = loadSprite('enemy_fighter.png', 64, 64);

    sprites.white = loadSprite('white', 1, 1, origin_0_0);

    sprites.toggles = loadSprite('toggles.png', [32, 32], [32, 32, 32, 32], origin_0_0);

    sprites.panel_bgs = {};
    for (let type in panel_types) {
      sprites.panel_bgs[type] = loadSprite('panel-' + type + '.png', PANEL_W, PANEL_H, origin_0_0);
    }
    sprites.panel_destroyed = loadSprite('panel-destroyed.png', PANEL_W, PANEL_H, origin_0_0);

    // sprites.test_animated = loadSprite('test_sprite.png', [13, 13], [13, 13]);
    // sprites.animation = createAnimation({
    //   idle: {
    //     frames: [0,1,2],
    //     times: 200,
    //   }
    // });
    // sprites.animation.setState('idle');

    sprites.game_bg = loadSprite('white', 1, 1, {
      width : game_width,
      height : game_height,
      origin: [0, 0],
    });
  }

  function doBlurEffect(src, dest) {
    glov_engine.effects.applyGaussianBlur({
      source: src,
      destination: dest,
      blurRadius: 5,
      blurTarget: glov_engine.getTemporaryTarget(),
    });
  }
  function doDesaturateEffect(src, dest) {
    let saturation = 0.1;

    // Perf note: do not allocate these each frame for better perf
    let xform = math_device.m43BuildIdentity();
    let tmp = math_device.m43BuildIdentity();

    math_device.m43BuildIdentity(xform);
    if (saturation !== 1) {
      glov_engine.effects.saturationMatrix(saturation, tmp);
      math_device.m43Mul(xform, tmp, xform);
    }
    // if ((hue % (Math.PI * 2)) !== 0) {
    //   glov_engine.effects.hueMatrix(hue, tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (contrast !== 1) {
    //   glov_engine.effects.contrastMatrix(contrast, tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (brightness !== 0) {
    //   glov_engine.effects.brightnessMatrix(brightness, tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (additiveRGB[0] !== 0 || additiveRGB[1] !== 0 || additiveRGB[2] !== 0) {
    //   glov_engine.effects.additiveMatrix(additiveRGB, tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (grayscale) {
    //   glov_engine.effects.grayScaleMatrix(tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (negative) {
    //   glov_engine.effects.negativeMatrix(tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (sepia) {
    //   glov_engine.effects.sepiaMatrix(tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    glov_engine.effects.applyColorMatrix({
      colorMatrix: xform,
      source: src,
      destination: dest,
    });
  }

  function colorFromTypeAndValue(type, value) {
    if (type === 'heat') {
      if (value > 0.875) {
        return pico8_colors[8 + (Math.round(glov_engine.getFrameTimestamp() / 150) % 2) * 2];
      }
      value = 1 - value;
    }
    return pico8_colors[8 + Math.min(Math.floor(value * 8), 3)];
  }

  let style_value = glov_font.style(null, {
    color: 0x000000ff,
    outline_width: 2,
    outline_color: 0xFFFFFF40,
    // glow_xoffs: 3.25,
    // glow_yoffs: 3.25,
    // glow_inner: -2.5,
    // glow_outer: 5,
    // glow_color: 0x000000ff,
  });

  let style_summary = glov_font.style(null, {
    color: 0x000000ff,
    // outline_width: 1.5,
    // outline_color: 0xFFFFFFff,
    // glow_xoffs: 3.25,
    // glow_yoffs: 3.25,
    // glow_inner: -2.5,
    // glow_outer: 5,
    // glow_color: 0x000000ff,
  });

  function log(msg) {
    state.messages.push(msg);
  }

  function calcShipStats() {
    let stats = {};
    for (let ii = 0; ii < state.slots.length; ++ii) {
      let slot = state.slots[ii];
      if (!slot.hp) {
        continue;
      }
      let slot_type_def = panel_types[slot.type];
      for (let jj = 0; jj < slot_type_def.values.length; ++jj) {
        let value_type = slot_type_def.values[jj];
        if (value_type) {
          let v = slot[value_type];
          stats[value_type] = (stats[value_type] || 0) + v;
        }
      }
    }
    return stats;
  }

  function hasHP(elem) {
    return elem.hp > 0;
  }

  function doTick() {
    if (!state.wave.ships.filter(hasHP).length) {
      // we've won!
      log('Encounter won!');
      for (let ii = 0; ii < state.slots.length; ++ii) {
        let slot = state.slots[ii];
        slot.fire_at = null;
        if (slot.heat) {
          slot.heat = Math.min(slot.heat, value_defs.heat.max / 2);
        }
      }
      return;
    }

    for (let ii = 0; ii < state.slots.length; ++ii) {
      let slot = state.slots[ii];
      if (!slot.hp) {
        continue;
      }
      if (slot.heat !== undefined) {
        slot.heat += HEAT_DELTA[slot.power];
        slot.heat = Math.min(Math.max(slot.heat, 0), value_defs.heat.max);
        if (slot.heat === value_defs.heat.max) {
          slot.hp = Math.max(slot.hp + OVERHEAT_DAMAGE, 0);
          if (!slot.hp) {
            log(slot.type.toUpperCase() + ' destroyed by HEAT');
            continue;
          }
        }
      }
      switch (slot.type) {
        case 'shield':
          slot.shield = Math.min(Math.max(slot.shield + SHIELD_DELTA[slot.power], 0), value_defs.shield.max);
          break;
        case 'engine':
          slot.evade = Math.min(Math.max(slot.evade + EVADE_DELTA[slot.power], 0), value_defs.evade.max);
          break;
        case 'weapon':
          slot.fire_at = null;
          if (slot.charge === value_defs.charge.max) {
            // fire at enemy!
            slot.charge = 0;
            let targets = state.wave.ships.filter(hasHP);
            if (targets.length) {
              let ship = targets[Math.floor(Math.random() * targets.length)];
              ship.hp = 0;
              slot.fire_at = [ship.x, ship.y];
            }
          } else {
            slot.charge = Math.min(Math.max(slot.charge + CHARGE_DELTA[slot.power], 0), value_defs.charge.max);
          }
          break;
      }
    }
    // Do enemy waves
    let ship_stats = calcShipStats();
    let evade = (ship_stats.evade || 0) / 100;
    for (let ii = 0; ii < state.wave.ships.length; ++ii) {
      let ship = state.wave.ships[ii];
      ship.fire_at = null;
      if (!ship.hp) {
        continue;
      }
      if (ship.fire_countdown) {
        --ship.fire_countdown;
        continue;
      }
      // Fire!
      // check vs evade
      let damage = state.wave.damage;
      if (Math.random() < evade) {
        // miss!
        log('Enemy misses!');
        damage = 0;
        ship.fire_at = [SHIP_W, SHIP_H / 2];
      }
      // if any damage left and there's a shield generator, target it
      for (let jj = 0; damage && jj < state.slots.length; ++jj) {
        let slot = state.slots[jj];
        if (!slot.hp || slot.type !== 'shield' || !slot.shield) {
          continue;
        }
        if (!ship.fire_at) {
          ship.fire_at = [ship_slots[jj].pos[0] + PANEL_W / 2, ship_slots[jj].pos[1] + PANEL_H / 2];
        }
        if (damage >= slot.shield) {
          damage -= slot.shield;
          slot.shield = 0;
        } else {
          slot.shield -= damage;
          damage = 0;
        }
      }
      // if any damage remaining, target a random system
      if (damage) {
        // TODO: Maybe can target slots with no HP too, to make it easier?
        let targets = state.slots.filter(hasHP);
        if (!targets.length) {
          // TODO
          log('Ship destroyed');
        } else {
          let slot = targets[Math.floor(Math.random() * targets.length)];
          ship.fire_at = [ship_slots[slot.idx].pos[0] + PANEL_W / 2, ship_slots[slot.idx].pos[1] + PANEL_H / 2];
          assert(slot.hp);
          if (damage >= slot.hp) {
            log(slot.type.toUpperCase() + ' destroyed by ENEMY');
            slot.hp = 0;
          } else {
            slot.hp -= damage;
          }
        }
      }

      ship.fire_countdown = 2 + Math.floor(Math.random() * 2);
    }
  }

  function drawFire(is_player, x0, y0, x1, y1) {
    for (let ii = 0; ii < 4; ++ii) {
      glov_ui.drawLine(
        x0,
        y0 + Math.random() * 4 - 2,
        x1 + Math.random() * 16 - 4,
        y1 + Math.random() * 8 - 4,
        Z.ENEMY + 1, 2, 0.95, pico8_colors[8 + Math.floor(Math.random() * 2) + (is_player ? 3 : 0)]
      );
    }
  }

  function drawSlots(dt) {
    for (let ii = 0; ii < state.slots.length; ++ii) {
      let slot = state.slots[ii];
      let pos = ship_slots[ii].pos;
      let slot_type_def = panel_types[slot.type];
      let x = SHIP_X + pos[0];
      let y = SHIP_Y + pos[1];
      sprites.panel_bgs[slot.type].draw({
        x, y, z: Z.SHIP + 1,
        size: [PANEL_W, PANEL_H],
        frame: 0,
      });
      if (slot.hp) {
        let button_rect = {
          x, y, w: PANEL_W, h: PANEL_H
        };
        let over = 0;
        if (glov_input.clickHit(button_rect)) {
          slot.power = (slot.power + 1) % 3;
          over = 1;
        } else if (glov_input.isMouseOver(button_rect)) {
          over = 1;
        }
        sprites.toggles.draw({
          x, y, z: Z.SHIP + 2,
          size: [PANEL_H, PANEL_H],
          frame: slot.power * 2 + over,
        });
        for (let jj = 0; jj < slot_type_def.values.length; ++jj) {
          let value_type = slot_type_def.values[jj];
          if (value_type) {
            let v = slot[value_type];
            let max = value_defs[value_type].max;
            let label = value_defs[value_type].label;
            let bar_x = x + 25;
            let bar_y = y + 8 * jj + 7;
            let bar_w = 36 * v / max;
            let bar_h = 7;
            let color = colorFromTypeAndValue(value_type, v / max);
            if (bar_w) {
              glov_ui.drawRect(bar_x, bar_y, bar_x + bar_w, bar_y + bar_h, Z.SHIP + 3, color);
            }
            glov_ui.print(style_value, bar_x + 1, bar_y - 1, Z.SHIP + 4, label);
          }
        }
        if (slot.fire_at) {
          // TODO: display guns
          drawFire(true, x + 40, y + PANEL_H / 2, slot.fire_at[0], slot.fire_at[1]);
        }
      } else {
        // no HP
        sprites.panel_destroyed.draw({
          x, y, z: Z.SHIP + 2,
          size: [PANEL_W, PANEL_H],
          frame: 0,
        });
      }
    }
  }

  function drawWave(dt) {
    for (let ii = 0; ii < state.wave.ships.length; ++ii) {
      let ship = state.wave.ships[ii];
      if (!ship.hp) {
        continue;
      }
      let dist = ENEMY_SHIP_SPEED * dt;
      if (ship.x > ENEMY_SHIP_X1) {
        ship.x = Math.max(ship.x - dist, ENEMY_SHIP_X1);
      }
      sprites.enemy_fighter.draw({
        x: ship.x, y: ship.y, z: Z.ENEMY,
        size: [-ENEMY_SHIP_H, ENEMY_SHIP_H],
        frame: 0,
      });

      if (ship.fire_at) {
        drawFire(false, ship.x - ENEMY_SHIP_H / 2 + 2, ship.y,
          SHIP_X + ship.fire_at[0], SHIP_Y + ship.fire_at[1]);
      }
    }
  }

  function drawShipSummary(dt) {
    let x0 = 6;
    let y0 = 2;
    let x = x0;
    let y = y0;
    let size = 16;
    let y_adv = 15;

    font.drawSized(style_summary, x, y, Z.UI + 1, size, 'SHIP SUMMARY');
    x += size;
    y += y_adv;
    let stats = calcShipStats();
    font.drawSized(style_summary, x, y, Z.UI + 1, size, `${stats.cargo || 0} Refugees`);
    y += y_adv;
    font.drawSized(style_summary, x, y, Z.UI + 1, size, `${stats.shield || 0} Shield`);
    y += y_adv;
    font.drawSized(style_summary, x, y, Z.UI + 1, size, `${(stats.evade || 0).toFixed(0)}% Evade`);
    y += y_adv;

    y += 4;
    for (let ii = Math.max(0, state.messages.length - 2); ii < state.messages.length; ++ii) {
      glov_ui.print(style_summary, x0, y, Z.UI + 1, state.messages[ii]);
      y += glov_ui.font_height;
    }

    glov_ui.panel({
      x: 0,
      y: 0,
      w: 140,
      h: y + 3,
    });
  }

  function drawWaveSummary(dt) {
    let x0 = 6;
    let y0 = game_height - 49;
    let x = x0;
    let y = y0;
    let size = 16;
    let y_adv = 15;

    font.drawSized(style_summary, x, y, Z.UI + 1, size, 'WAVE SUMMARY');
    x += size;
    y += y_adv;
    let num_alive = 0;
    for (let ii = 0; ii < state.wave.ships.length; ++ii) {
      if (state.wave.ships[ii].hp) {
        num_alive++;
      }
    }
    font.drawSized(style_summary, x, y, Z.UI + 1, size, `${num_alive} / ${state.wave.num_ships} left`);
    y += y_adv;
    font.drawSized(style_summary, x, y, Z.UI + 1, size, `${state.wave.damage} Damage`);
    y += y_adv;

    glov_ui.panel({
      x: 0,
      y: y0 - 2,
      w: 140,
      h: y - y0 + 6,
    });
  }

  function encounter(dt) {
    if (glov_ui.modal_dialog) {
      // Testing effects
      glov_engine.queueFrameEffect(Z.MODAL - 2, doBlurEffect);
      glov_engine.queueFrameEffect(Z.MODAL - 1, doDesaturateEffect);
    }

    if (dt >= state.tick_countdown) {
      doTick();
      state.tick_countdown = Math.max(TICK_EACH / 2, TICK_EACH - (dt - state.tick_countdown));
    } else {
      state.tick_countdown -= dt;
    }

    draw_list.queue(sprites.game_bg, 0, 0, Z.BACKGROUND, pico8_colors[2]);
    sprites.ship.draw({
      x: SHIP_X, y: SHIP_Y, z: Z.SHIP,
      size: [SHIP_W, SHIP_H],
      frame: 0,
    });

    drawSlots(dt);

    drawWave(dt);

    drawShipSummary(dt);

    drawWaveSummary(dt);


    // if (glov_ui.buttonText({ x: 100, y: 100, text: 'Button!'})) {
    //   glov_ui.modalDialog({
    //     title: 'Modal Dialog',
    //     text: 'This is a modal dialog!',
    //     buttons: {
    //       'OK': function () {
    //         console.log('OK pushed!');
    //       },
    //       'Cancel': null, // no callback
    //     },
    //   });
    // }

  }

  function nextWave() {
    let num_ships = 6;
    let max_hp = 4;
    let damage = 5;
    state.wave = {
      num_ships,
      max_hp,
      damage,
      ships: [],
    };
    for (let ii = 0; ii < num_ships; ++ii) {
      let ship = {
        x: ENEMY_SHIP_X0 - Math.random() * 10,
        y: ENEMY_SHIP_H + Math.random() * (game_height - ENEMY_SHIP_H * 2),
        hp: max_hp,
        fire_countdown: ENEMY_INITIAL_COUNTDOWN + Math.floor(Math.random() * 3), // in ticks
      };
      state.wave.ships.push(ship);
    }
  }

  function initState() {
    state = {
      tick_countdown: TICK_FIRST,
      slots: [],
      messages: [],
    };
    for (let ii = 0; ii < ship_slots.length; ++ii) {
      let slot = {
        type: ship_slots[ii].start,
        power: 0, // 0/1/2 = off/on/over
        heat: 0,
        hp: 100,
        idx: ii,
      };
      let slot_type_def = panel_types[slot.type];
      for (let jj = 0; jj < slot_type_def.values.length; ++jj) {
        slot[slot_type_def.values[jj]] = value_defs[slot_type_def.values[jj]].start || 0;
      }
      state.slots.push(slot);
    }
    nextWave();
  }

  function encounterInit(dt) {
    initState();
    $('.screen').hide();
    $('#title').show();
    app.game_state = encounter;
    encounter(dt);
  }

  function loading() {
    let load_count = glov_sprite.loading() + sound_manager.loading();
    $('#loading').text(`Loading (${load_count})...`);
    if (!load_count) {
      app.game_state = encounterInit;
    }
  }

  function loadingInit() {
    initGraphics();
    $('.screen').hide();
    $('#title').show();
    app.game_state = loading;
    loading();
  }

  app.game_state = loadingInit;

  function tick(dt) {
    app.game_state(dt);
  }

  loadingInit();
  glov_engine.go(tick);
}
