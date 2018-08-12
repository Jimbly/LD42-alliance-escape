/*jshint noempty:false*/

/*global $: false */
/*global math_device: false */
/*global assert: false */
/*global Z: false */

const local_storage = require('./local_storage.js');
const particle_data = require('./particle_data.js');
const lodash = require('lodash');

local_storage.storage_prefix = 'turbulenz-LD42';
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

var tutorial = { shield: 1, overheat: true, o2: true };
const chapters = [
  null,
  { no_passengers : true},
  {},
  {},
  {replace_shield_40: true },
  {no_passengers: true },
  {},
  {},
  {},
  {},
  {},
  { win : true },
];

const SHIP_W = 288;
const SHIP_H = 288;
const PANEL_W = 64;
const PANEL_H = 32;
const SHIP_TRANSITION_TIME = 1000;
const SHIP_X_ENCOUNTER = 18;
const SHIP_X_MANAGE = (game_width - SHIP_W) + 18;
const SHIP_X_INTRO = (game_width - SHIP_W) / 3;
const SHIP_X_WIN = game_width - 18;
const SHIP_X_LOSE = game_width + 20;
const SHIP_X_SPECIAL = 0;
let ship_x_prev = SHIP_X_ENCOUNTER;
let ship_x_desired = SHIP_X_ENCOUNTER;
let SHIP_X = SHIP_X_ENCOUNTER;
let time_in_state = 0;
const SHIP_Y = 0;
const TICK = DEBUG ? 1000 : 1000;
const MAX_POWER = 2;

const ENEMY_SHIP_X0 = game_width + 64;
const ENEMY_SHIP_X1 = SHIP_X + SHIP_W + (game_width - SHIP_W - SHIP_X) / 2;
const ENEMY_SHIP_H = 64;
const ENEMY_SHIP_SPEED = 40 / 1000; // pixels / ms
const ENEMY_INITIAL_COUNTDOWN = (DEBUG ? 1 : 7) * TICK; // ticks
const ENEMY_FIRE_DURATION = 330;
const FIRE_DURATION = 250;
const WIN_COUNTDOWN = (DEBUG ? 5 : 5) * TICK; // ticks

const HEAT_DELTA = [-5, 5, 20];

const SHIELD_DELTA = [-5, 10, 40];
const EVADE_DELTA = [-5/3, 10/3, 40/3];
const CHARGE_DELTA = [-5, 10, 40];
const O2PROD_DELTA = [-25, 25];
const GEN_DELTA = [-0.5, 1];
const POWER_BASE = 3;
const OVERHEAT_DAMAGE = -5;
const AUTOCOOL_TIME = 5 * TICK;

const REPAIR_FACTOR = 5;
const REPAIR_SIZE = 5;

export function main(canvas)
{
  const glov_engine = require('./glov/engine.js');
  const glov_font = require('./glov/font.js');
  const util = require('./glov/util.js');
  const score_system = require('./score.js');

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

  // higher score is "better"
  const score_mod1 = 10000;
  const score_mod2 = 10000;
  const deaths_inv = 9999;
  function scoreToValue(score) {
    return score.level * score_mod1 * score_mod2 + score.cargo * score_mod1 + (deaths_inv - score.deaths);
  }
  function valueToScore(score) {
    let deaths = deaths_inv - score % score_mod1;
    score = Math.floor(score / score_mod1);
    let cargo = score % score_mod2;
    score = Math.floor(score / score_mod2);
    let level = score;
    return { level, cargo, deaths };
  }
  score_system.init(scoreToValue, valueToScore, { all: { name: 'all' }}, 'LD42');
  score_system.getScore('all');


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
      port: 0,
      max: 100,
      label: 'HEAT',
    },
    'hp': {
      start: 100,
      max: 100,
      label: 'HP',
    },
    'evade': {
      port: 0,
      max: 33,
      label: 'EVADE',
    },
    'shield': {
      start: 0,
      port: 0,
      max: 100,
      label: 'SHIELD',
    },
    'charge': {
      port: 0,
      max: 100,
      label: 'CHARGE',
    },
    'gen': {
      port: 0,
      max: 6,
      label: 'PWR',
    },
    'o2': {
      port: 0,
      max: 100,
      label: 'O2 PROD'
    },
    'cargo': {
      start: 0,
      max: 20,
    },
  };
  let panel_types = {
    engine: {
      values: ['heat', 'evade', 'hp'],
      name: 'an ENGINE',
    },
    shield: {
      values: ['heat', 'shield', 'hp'],
      name: 'a SHIELD GENERATOR',
    },
    weapon: {
      values: ['heat', 'charge', 'hp'],
      name: 'a WEAPON',
    },
    gen: {
      values: ['heat', 'gen', 'hp'],
      vert: true,
      name: 'a POWER GENERATOR',
    },
    repair: {
      values: [null, 'hp', null],
      vert: true,
      name: 'the REPAIR DRONE',
    },
    life: {
      values: ['heat', 'o2', 'hp'],
      name: 'the LIFE SUPPORT',
    },
    cargo: {
      values: ['cargo'],
    },
  };

  let ship_slots;
  if (DEBUG && false) {
    ship_slots = [
      { pos: [162 - 4, 32 - 8], start: 'weapon' },
      { pos: [162, 64 - 8], start: 'cargo' }, //'weapon' },
      { pos: [162, 192 + 8], start: 'weapon' },
      { pos: [162 - 4, 224 + 8], start: 'cargo' }, //'weapon' },
      { pos: [194, 96], start: 'engine' },
      { pos: [194, 128], start: 'cargo' }, // 'engine' },
      { pos: [194, 160], start: 'engine' },
      { pos: [66, 96], start: 'shield' },
      { pos: [66, 128], start: 'cargo' },
      { pos: [66, 160], start: 'cargo' }, // 'shield' },
      { pos: [162, 96], start: 'gen' },
      { pos: [130, 96], start: 'repair' },
      { pos: [34, 112], start: 'gen' },
      { pos: [130, 160], start: 'life' },
    ];
  } else {
    ship_slots = [
      { pos: [162 - 4, 32 - 8], start: 'weapon' },
      { pos: [162, 64 - 8], start: 'weapon' },
      { pos: [162, 192 + 8], start: 'weapon' },
      { pos: [162 - 4, 224 + 8], start: 'weapon' },
      { pos: [194, 96], start: 'engine' },
      { pos: [194, 128], start: 'engine' },
      { pos: [194, 160], start: 'engine' },
      { pos: [66, 96], start: 'shield' },
      { pos: [66, 128], start: 'cargo' },
      { pos: [66, 160], start: 'shield' },
      { pos: [162, 96], start: 'gen' },
      { pos: [130, 96], start: 'repair' },
      { pos: [34, 112], start: 'gen' },
      { pos: [130, 160], start: 'life' },
    ];
  }

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

    sprites.engine = loadSprite('engine.png', 24, 20, origin_0_0);

    sprites.toggles = loadSprite('toggles.png', [32, 32], [32, 32, 32, 32], origin_0_0);

    sprites.panel_bgs = {};
    sprites.panel_help = {};
    for (let type in panel_types) {
      sprites.panel_bgs[type] = loadSprite('panel-' + type + '.png', panel_types[type].vert ? PANEL_H : PANEL_W, panel_types[type].vert ? PANEL_W : PANEL_H, origin_0_0);
      sprites.panel_help[type] = loadSprite('panel-' + type + '-help.png', panel_types[type].vert ? PANEL_H : PANEL_W, panel_types[type].vert ? PANEL_W : PANEL_H, origin_0_0);
    }
    sprites.panel_bgs['cargo-empty'] = loadSprite('panel-cargo-empty.png', PANEL_W, PANEL_H, origin_0_0);
    sprites.panel_bgs['cargo-vert'] = loadSprite('panel-cargo-vert.png', PANEL_H, PANEL_W, origin_0_0);
    sprites.panel_help['cargo-vert'] = loadSprite('panel-cargo-vert-help.png', PANEL_H, PANEL_W, origin_0_0);
    sprites.panel_help.engine2 = loadSprite('panel-engine-help2.png', PANEL_W, PANEL_H, origin_0_0);

    sprites.panel_destroyed = loadSprite('panel-destroyed.png', PANEL_W, PANEL_H, origin_0_0);
    sprites.panel_destroyed_vert = loadSprite('panel-destroyed-vert.png', PANEL_H, PANEL_W, origin_0_0);

    sprites.panel_load = loadSprite('panel-load.png', PANEL_W, PANEL_H, origin_0_0);
    sprites.panel_load_vert = loadSprite('panel-load-vert.png', PANEL_H, PANEL_W, origin_0_0);

    sprites.gun_top = loadSprite('gun-top.png', 32, 13, origin_0_0);
    sprites.gun_bot = loadSprite('gun-bot.png', 32, 13, origin_0_0);

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

  // 0 = green
  // 1 = yellow
  // 2 = orage
  // 3 = red
  // 4 = flashing red
  function colorIndex(idx) {
    if (idx === 4) {
      return 8 + (Math.round(glov_engine.getFrameTimestamp() / 150) % 2) * 2;
    }
    return 11 - idx;
  }

  function colorFromTypeAndValue(slot, type, value) {
    if (type === 'heat') {
      if (value > 0.875 && !state.wave.won && slot.power) {
        return pico8_colors[colorIndex(4)];
      }
      value = 1 - value;
    }
    return pico8_colors[colorIndex(3 - Math.min(Math.floor(value * 8), 3))];
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
    // outline_color: 0xFFF1E8ff,
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
    stats.gen = POWER_BASE;
    stats.power = 0;
    stats.o2 = 0;
    for (let ii = 0; ii < state.slots.length; ++ii) {
      let slot = state.slots[ii];
      if (!slot.hp) {
        continue;
      }
      if (slot.type !== 'gen' && slot.power) {
        stats.power += slot.power;
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
    stats.gen = Math.floor(stats.gen);
    return stats;
  }

  function hasHP(elem) {
    //return elem.type === 'cargo' ? elem.cargo > 0 : elem.hp > 0;
    return elem.hp > 0;
  }
  function isActiveShield(slot) {
    return slot.hp && slot.type === 'shield' && slot.shield;
  }

  function triggerWin() {
    log('Encounter won!');
    state.wave.won = true;
    state.wave.win_countdown = WIN_COUNTDOWN;
    for (let ii = 0; ii < state.slots.length; ++ii) {
      let slot = state.slots[ii];
      slot.power = 0;
    }
  }

  function doTick(dt) {
    let D = dt / TICK;
    if (glov_ui.modal_dialog) {
      return;
    }
    if (state.wave.won) {
      state.wave.win_countdown -= dt;
      if (state.wave.win_countdown < 0) {
        app.game_state = specialInit;
      }
      for (let ii = 0; ii < state.slots.length; ++ii) {
        let slot = state.slots[ii];
        if (slot.type === 'weapon' && slot.firing) {
          slot.firing -= dt;
          if (slot.firing <= 0) {
            slot.firing = 0;
            slot.fire_at = null;
          }
        }
      }
      return;
    }
    if (!state.wave.ships.filter(hasHP).length) {
      // we've won!
      triggerWin();
      return;
    }

    for (let ii = 0; ii < state.slots.length; ++ii) {
      let slot = state.slots[ii];
      if (!slot.hp) {
        continue;
      }
      if (slot.heat !== undefined) {
        slot.heat += D * HEAT_DELTA[slot.power] * (slot.heat_scale || 1);
        slot.heat = Math.max(slot.heat, 0);
        if (tutorial.overheat && slot.heat >= value_defs.heat.max * 0.9) {
          tutorial.overheat = false;
          glov_ui.modalDialog({
            title: 'TUTORIAL',
            text: 'When equipment is on, it generates heat. When its heat capacity' +
              ' is full, it will take damage.\n\nRight now, ' +
              panel_types[slot.type].name + ' is overheating! Quickly turn it off' +
              ' to prevent further damage.' +
              (slot.type === 'shield' ? '\n\nYou may then want to turn on your other ' +
                'SHIELD GENERATOR so you are protected while this one cools down.' : '')
              ,
            buttons: {
              'Okay': null,
            },
          });
        }
        if (slot.heat > value_defs.heat.max) {
          let extra = slot.heat - value_defs.heat.max; // TODO: scale damage?
          slot.heat = value_defs.heat.max;
          slot.hp = Math.max(slot.hp + D * OVERHEAT_DAMAGE, 0);
          slot.damage_at = glov_engine.getFrameTimestamp();
          if (!slot.hp) {
            log(slot.type.toUpperCase() + ' destroyed by HEAT');
            continue;
          }
          slot.heat_damage += dt;
          if (slot.heat_damage >= AUTOCOOL_TIME) {
            slot.power = 0;
            slot.autocool = true;
          }
        } else {
          slot.heat_damage = 0;
          if (slot.autocool && slot.heat < value_defs.heat.max / 2) {
            slot.autocool = false;
          }
        }
      }
      switch (slot.type) {
        case 'shield':
          slot.shield = Math.min(Math.max(slot.shield + D * SHIELD_DELTA[slot.power], 0), value_defs.shield.max);
          break;
        case 'engine':
          slot.evade = Math.min(Math.max(slot.evade + D * EVADE_DELTA[slot.power] * (state.engine_factor || 1), 0), value_defs.evade.max);
          break;
        case 'life':
          slot.o2 = Math.min(Math.max(slot.o2 + D * O2PROD_DELTA[slot.power], 0), value_defs.o2.max);
          break;
        case 'repair':
          if (slot.power && slot.hp) {
            let repair_spend = Math.min(slot.hp, REPAIR_SIZE);
            // Look for other slot that is damaged
            let targets = state.slots.filter(function (slot) {
              return slot.type !== 'repair' && slot.hp && slot.hp < value_defs.hp.max - REPAIR_FACTOR * repair_spend;
            });
            if (targets.length) {
              let target_slot = targets[Math.floor(Math.random() * targets.length)];
              slot.hp -= repair_spend;
              target_slot.hp += repair_spend * REPAIR_FACTOR;
            }
          }
          break;
        case 'gen':
          slot.gen = Math.min(Math.max(slot.gen + D * GEN_DELTA[slot.power], 0), value_defs.gen.max);
          break;

        case 'weapon':
          if (slot.firing) {
            slot.firing -= dt;
            if (slot.firing <= 0) {
              slot.firing = 0;
              slot.fire_at = null;
            }
          }
          if (slot.charge >= value_defs.charge.max) {
            // fire at enemy!
            slot.charge = 0;
            let targets = state.wave.ships.filter(hasHP);
            if (targets.length) {
              let ship = targets[Math.floor(Math.random() * targets.length)];
              ship.hp = 0;
              slot.fire_at = [ship.x, ship.y];
              slot.firing = FIRE_DURATION;
            }
          } else {
            slot.charge = Math.min(Math.max(slot.charge + D * CHARGE_DELTA[slot.power], 0), value_defs.charge.max);
          }
          break;
      }
    }

    let ship_stats = calcShipStats();

    if (state.chapter === 1) {
      if (tutorial.weapon && ship_stats.charge > 20) {
        tutorial.weapon = false;
        glov_ui.modalDialog({
          title: 'TUTORIAL',
          text: 'Great! The WEAPON will fire, destroying one Alliance Fighter once its CHARGE is full.',
          buttons: {
            'Okay': null,
          },
        });
      }
    }

    while (ship_stats.power > ship_stats.gen) {
      let idx = state.on_priority.pop();
      let slot = state.slots[idx];
      assert(slot.power);
      ship_stats.power -= slot.power;
      slot.power = 0;
      slot.autooff = true;
    }

    if (ship_stats.power < ship_stats.gen) {
      for (let ii = 0; ii < state.slots.length; ++ii) {
        let slot = state.slots[ii];
        if (slot.autooff) {
          slot.autooff = false;
          slot.power = 1;
          ship_stats.power++;
          state.on_priority.push(ii);
          if (ship_stats.power >= ship_stats.gen) {
            break;
          }
        }
      }
    }

    const O2_CONSUMPTION = 2;
    const O2_PROD_FACTOR = O2_CONSUMPTION * 4 / 100;
    state.o2 = (state.o2 - D * O2_CONSUMPTION) + ship_stats.o2 * D * O2_PROD_FACTOR;
    state.o2 = Math.min(state.o2, 100);
    if (tutorial.o2 && state.o2 < 5) {
      tutorial.o2 = false;
      glov_ui.modalDialog({
        title: 'TUTORIAL',
        text: 'Your ship\'s oxygen supply is dangerously low!\n\nTurn ON your' +
        ' LIFE SUPPORT to replenish it, or your passengers will start dying!',
        buttons: {
          'Okay': null,
        },
      });
    }
    if (state.o2 < -O2_CONSUMPTION) {
      state.o2 = 0;
      // pick a random slot, kill a passenger
      let targets = state.slots.filter(hasHP);
      if (targets.length) {
        let slot = targets[Math.floor(Math.random() * targets.length)];
        if (slot.cargo) {
          // TODO: log (and combine with previous log)
          --slot.cargo;
          state.deaths++;
        }
      }
    }

    // Do enemy waves
    let evade = (ship_stats.evade || 0) / 100;
    for (let ii = 0; ii < state.wave.ships.length; ++ii) {
      let ship = state.wave.ships[ii];
      if (!ship.hp) {
        continue;
      }
      if (ship.firing) {
        ship.firing -= dt;
        if (ship.firing <= 0) {
          ship.firing = 0;
          ship.fire_at = null;
        }
        continue;
      }
      if (ship.fire_countdown > 0) {
        ship.fire_countdown -= dt;
        continue;
      }
      if (tutorial.shield === 1) {
        tutorial.shield = 2;
        glov_ui.modalDialog({
          title: 'TUTORIAL',
          text: 'The enemy is about to start firing. Raise your shields by clicking to turn ON one SHIELD GENERATOR.',
          buttons: {
            'Okay': null,
          },
        });
      }
      if (tutorial.shield === 2) {
        // check if shields have been raised
        if (ship_stats.shield > 20) {
          glov_ui.modalDialog({
            title: 'TUTORIAL',
            text: 'Good! The Shield will prevent all damage, and the SHIELD GENERATOR will continue to replenish your Shield until it is turned off, or starts overheating.\n\n' +
              'Next, you want to turn ON one WEAPON to start firing back',
            buttons: {
              'Okay': null,
            },
          });
          tutorial.shield = false;
          tutorial.weapon = true;
        }
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
        ship.fire_at_vert = true;
      }
      // if any damage left and there's a shield generator, target it
      let shields = state.slots.filter(isActiveShield);
      for (let jj = 0; jj < shields.length - 1; ++jj) {
        let idx = Math.floor(Math.random() * (shields.length - jj));
        let temp = shields[idx];
        shields[idx] = shields[jj];
        shields[jj] = temp;
      }
      for (let jj = 0; damage && jj < shields.length; ++jj) {
        let slot = shields[jj];
        if (!slot.hp || slot.type !== 'shield' || !slot.shield) {
          continue;
        }
        if (!ship.fire_at) {
          ship.fire_at = [
            ship_slots[slot.idx].pos[0] + (panel_types[slot.type].vert ? PANEL_H : PANEL_W) / 2,
            ship_slots[slot.idx].pos[1] + (panel_types[slot.type].vert ? PANEL_W : PANEL_H) / 2
          ];
          ship.fire_at_vert = panel_types[slot.type].vert;
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
          log('Ship destroyed');
          app.game_state = loseInit;
          break;
        } else {
          let slot = targets[Math.floor(Math.random() * targets.length)];
          ship.fire_at = [
            ship_slots[slot.idx].pos[0] + (panel_types[slot.type].vert ? PANEL_H : PANEL_W) / 2,
            ship_slots[slot.idx].pos[1] + (panel_types[slot.type].vert ? PANEL_W : PANEL_H) / 2
          ];
          ship.fire_at_vert = panel_types[slot.type].vert;
          assert(slot.hp);
          if (slot.type === 'cargo') {
            let deaths = Math.min(slot.cargo, Math.ceil(damage / 5));
            state.deaths += deaths;
            slot.cargo = Math.max(0, slot.cargo - deaths);
            if (slot.cargo === 0) {
              // if no people left, then damage to HP
              if (damage >= slot.hp) {
                log(slot.type.toUpperCase() + ' destroyed by ENEMY');
                slot.hp = 0;
                slot.damage_at = glov_engine.getFrameTimestamp();
              } else {
                slot.hp -= damage;
                slot.damage_at = glov_engine.getFrameTimestamp();
              }
            }
          } else if (damage >= slot.hp) {
            log(slot.type.toUpperCase() + ' destroyed by ENEMY');
            slot.hp = 0;
            slot.damage_at = glov_engine.getFrameTimestamp();
          } else {
            slot.hp -= damage;
            slot.damage_at = glov_engine.getFrameTimestamp();
          }
        }
      }
      ship.firing = ENEMY_FIRE_DURATION;
      ship.fire_countdown = (2 + Math.random() * 2) * TICK;
    }
  }

  function drawFire(is_player, is_vert, x0, y0, x1, y1, scale) {
    for (let ii = 0; ii < 4; ++ii) {
      glov_ui.drawLine(
        x0,
        y0 + (Math.random() * 4 - 2) * scale,
        x1 + (Math.random() * (is_vert ? 8 : 16) - 4) * scale,
        y1 + (Math.random() * (is_vert ? 16 : 8) - 4) * scale,
        Z.ENEMY + 1, 2 * scale, 0.95, pico8_colors[8 + Math.floor(Math.random() * 2) + (is_player ? 3 : 0)]
      );
    }
  }

  function drawSlots(dt, is_manage) {
    let stats = calcShipStats();
    for (let ii = 0; ii < state.slots.length; ++ii) {
      let slot = state.slots[ii];
      let pos = ship_slots[ii].pos;
      let slot_type_def = panel_types[slot.type];
      let x = SHIP_X + pos[0];
      let y = SHIP_Y + pos[1];
      let vert = slot_type_def.vert; // TODO : get right value for cargo replacing vertical slot
      let slot_type_img = slot.type;
      if (slot.type === 'cargo' && panel_types[ship_slots[ii].start].vert) {
        vert = true;
        slot_type_img = 'cargo-vert';
      }
      if (slot.type === 'cargo' && state.chapter === 1) {
        slot_type_img = 'cargo-empty';
      }
      if (slot.hp) {
        sprites.panel_bgs[slot_type_img].draw({
          x, y, z: Z.SHIP + 1,
          size: [vert ? PANEL_H : PANEL_W, vert ? PANEL_W : PANEL_H],
          frame: 0,
        });
        if (slot.type === 'weapon') {
          sprites[pos[1] < SHIP_H / 2 ? 'gun_top' : 'gun_bot'].draw({
            x: x - 31, y: y + 9, z: Z.SHIP + 1.5,
            size: [32, 13],
            frame: 0,
          });
        } else if (slot.type === 'engine') {
          sprites.engine.draw({
            x: x + 63, y: y + 6, z: Z.SHIP + 1.5,
            size: [24, 20],
            frame: 0,
          });
        }
      } else {
        sprites['panel_destroyed' + (vert ? '_vert' : '')].draw({
          x, y, z: Z.SHIP + 2,
          size: [vert ? PANEL_H : PANEL_W, vert ? PANEL_W : PANEL_H],
          frame: 0,
        });
      }
      if (slot.type === 'cargo') {
        if (state.chapter !== 1 && slot.hp) {
          // TODO: draw people moving around
          font.drawSizedAligned(style_value, x, y, Z.SHIP + 4, glov_ui.font_height,
            glov_font.ALIGN.HVCENTER, vert ? PANEL_H : PANEL_W, vert ? PANEL_W : PANEL_H,
            slot.cargo.toString());
        }
        continue;
      }
      if (slot.hp) {
        let button_rect = {
          x, y, w: PANEL_W, h: PANEL_H
        };
        if (vert) {
          button_rect.w = PANEL_H;
          button_rect.h = PANEL_W;
        }
        let over = 0;
        if (is_manage) {
          let clicked = false;
          if (state.chapter !== 1 && glov_input.clickHit(button_rect)) {
            over = 1;
            clicked = true;
          } else if (glov_input.isMouseOver(button_rect)) {
            over = 1;
          }
          if (clicked) {
            state.remove_slot = ii;
          }
          if (state.remove_slot === ii) {
            sprites['panel_load' + (vert ? '_vert' : '')].draw({
              x, y, z: Z.SHIP + 5,
              size: [vert ? PANEL_H : PANEL_W, vert ? PANEL_W : PANEL_H],
              frame: 0,
            });
          } else if (over) {
            let img = slot_type_img;
            if (img === 'engine' && state.engine_factor > 1) {
              img = 'engine2';
            }
            sprites.panel_help[img].draw({
              x, y, z: Z.SHIP + 5,
              size: [vert ? PANEL_H : PANEL_W, vert ? PANEL_W : PANEL_H],
              frame: 0,
            });
          }
        } else if (state.wave.won) {
          // draw nothing, not interactable
        } else {
          let disabled = !slot.power && stats.power >= stats.gen && slot.type !== 'gen' && !slot.autooff;
          if (slot.autocool) {
            // not interactable
          } else {
            let clicked = false;
            if (!disabled && glov_input.clickHit(button_rect)) {
              if (slot.autooff) {
                slot.autooff = false;
                slot.power = 0;
              } else {
                slot.power = (slot.power + 1) % MAX_POWER;
              }
              over = 1;
              clicked = true;
            } else if (!disabled && glov_input.clickHit(lodash.merge({ button: 1 }, button_rect))) {
              slot.power = (slot.power -1 + MAX_POWER) % MAX_POWER;
              over = 1;
              clicked = true;
            } else if (glov_input.isMouseOver(button_rect)) {
              over = 1;
            }
            if (clicked) {
              let idx = state.on_priority.indexOf(ii);
              if (idx !== -1) {
                state.on_priority.splice(idx, 1);
              }
              if (slot.power) {
                state.on_priority.push(ii);
              }
            }
          }
          sprites.toggles.draw({
            x: x + (vert ? 2 : 0),
            y: y + (vert ? 32 : 0),
            z: Z.SHIP + 2,
            size: [PANEL_H, PANEL_H],
            frame: slot.autooff || disabled && over ? 7 : slot.autocool ? 6 : (slot.power * 2 + over),
          });
        }
        // Draw values
        for (let jj = 0; jj < slot_type_def.values.length; ++jj) {
          let value_type = slot_type_def.values[jj];
          if (value_type) {
            let v = slot[value_type];
            let max = value_defs[value_type].max;
            let label = value_defs[value_type].label;
            let bar_x = vert ? x + jj * 8 + 4 : x + 25;
            let bar_y = vert ? y + 39 : y + 8 * jj + 7;
            let bar_w = (vert ? 31 : 36) * v / max;
            let bar_h = 7;
            let color = colorFromTypeAndValue(slot, value_type, v / max);
            const FLASH_TIME = 100;
            if (value_type === 'hp' && slot.damage_at) {
              let dt = glov_engine.getFrameTimestamp() - slot.damage_at;
              if (dt < FLASH_TIME) {
                color = pico8_colors[8];
              } else if (dt < FLASH_TIME * 2) {
                color = pico8_colors[10];
              } else if (dt < FLASH_TIME * 3) {
                color = pico8_colors[8];
              }
            }
            if (bar_w) {
              if (vert) {
                glov_ui.drawRect(bar_x, bar_y, bar_x + bar_h, bar_y - bar_w, Z.SHIP + 3, color);
              } else {
                glov_ui.drawRect(bar_x, bar_y, bar_x + bar_w, bar_y + bar_h, Z.SHIP + 3, color);
              }
            }
            if (vert) {
              font.drawSizedAligned(style_value, x + 4, bar_y - (3 - jj) * 10, Z.SHIP + 4, glov_ui.font_height,
                [glov_font.ALIGN.HLEFT, glov_font.ALIGN.HCENTER, glov_font.ALIGN.HRIGHT][jj],
                24, 0,
                label);
            } else {
              glov_ui.print(style_value, bar_x + 1, bar_y - 1, Z.SHIP + 4, label);
            }
          }
        }
        if (slot.fire_at) {
          drawFire(true, false, x - 29, y + PANEL_H / 2 + 1 + (y < SHIP_H / 2 ? -3 : 0), slot.fire_at[0], slot.fire_at[1], 1);
        }
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
        size: [-ENEMY_SHIP_H * state.wave.scale, ENEMY_SHIP_H * state.wave.scale],
        frame: 0,
      });

      if (ship.fire_at) {
        drawFire(false, ship.fire_at_vert, ship.x - ENEMY_SHIP_H * state.wave.scale / 2 + 2, ship.y,
          SHIP_X + ship.fire_at[0], SHIP_Y + ship.fire_at[1], state.wave.scale);
      }
    }
  }

  function drawBar(x, y, w, h, value, bg_color, bar_color) {
    value = Math.min(value, 1);
    glov_ui.drawRect(x, y, x + w, y + h, Z.UI + 1, pico8_colors[bg_color]);
    glov_ui.drawRect(x, y, x + w * value, y + h, Z.UI + 2, pico8_colors[bar_color]);
  }

  function drawShipSummary(dt, is_manage) {
    let x0 = 6;
    let y0 = 2;
    let x = x0;
    let y = y0;
    let size = 16 * 0.75;
    let y_adv = 15 * 0.75;
    let bar_x = x + size - 4;
    let bar_y_offs = 2 * 0.75;
    let bar_h = 14 * 0.75;
    let bar_w = 100;
    let z_text = Z.UI + 3;

    font.drawSized(style_summary, x, y, z_text, size, 'SHIP SUMMARY');
    x += size;
    y += y_adv;
    let stats = calcShipStats();
    if (!is_manage) {
      font.drawSized(style_summary, x, y, z_text, size, `${stats.power} / ${stats.gen} PWR`);
      drawBar(bar_x, y + bar_y_offs, bar_w, bar_h, stats.power / stats.gen, 1, colorIndex(Math.max(0, 3 - (stats.gen - stats.power))));
      y += y_adv;
      font.drawSized(style_summary, x, y, z_text, size, `${Math.max(0, state.o2).toFixed(0)}% O2 SUPPLY`);
      drawBar(bar_x, y + bar_y_offs, bar_w, bar_h, Math.max(0, state.o2) / 100, (state.o2 >= 4 * 6) ? 1 : colorIndex(4 - Math.min(4, Math.floor(Math.max(0, state.o2) / 6))), 11);
      y += y_adv;
      font.drawSized(style_summary, x, y, z_text, size, `${(stats.shield || 0).toFixed(0)} Shield`);
      drawBar(bar_x, y + bar_y_offs, bar_w, bar_h, stats.shield / (state.wave.num_ships * state.wave.damage * 2),
        stats.shield <= state.wave.damage ? 8 : 1, 12);
      y += y_adv;
      font.drawSized(style_summary, x, y, z_text, size, `${(stats.evade || 0).toFixed(0)}% Evade`);
      drawBar(bar_x, y + bar_y_offs, bar_w, bar_h, stats.evade / 100,
        1, 11);
      y += y_adv;
    }
    font.drawSized(style_summary, x, y, z_text, size, `${stats.cargo || 0} Refugees`);
    y += y_adv;

    y += 4;
    if (!is_manage) {
      if (state.messages.length > 2) {
        state.messages = state.messages.slice(-2);
      }
      for (let ii = Math.max(0, state.messages.length - 2); ii < state.messages.length; ++ii) {
        glov_ui.print(style_summary, x0, y, z_text, state.messages[ii]);
        y += glov_ui.font_height;
      }
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
    let y0 = game_height - 38;
    let x = x0;
    let y = y0;
    let size = 16 * 0.75;
    let y_adv = 15 * 0.75;

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

  function drawShipBG(dt) {
    time_in_state += dt;
    if (time_in_state >= SHIP_TRANSITION_TIME) {
      SHIP_X = ship_x_desired;
    } else {
      SHIP_X = util.lerp(util.easeInOut(time_in_state / SHIP_TRANSITION_TIME, 2),
        ship_x_prev, ship_x_desired);
    }
    draw_list.queue(sprites.game_bg, 0, 0, Z.BACKGROUND, pico8_colors[2]);
    sprites.ship.draw({
      x: SHIP_X, y: SHIP_Y, z: Z.SHIP,
      size: [SHIP_W, SHIP_H],
      frame: 0,
    });
  }

  function encounter(dt) {
    if (DEBUG) {
      if (glov_input.keyDownHit(key_codes.W) && !state.wave.won) {
        triggerWin();
      }
    }
    doTick(dt);

    drawShipBG(dt);
    drawSlots(dt);
    drawWave(dt);
    drawShipSummary(dt);
    drawWaveSummary(dt);
  }

  function drawManageInstructions(dt) {
    let x0 = 6;
    let y0 = state.chapter === 1 ? 8 : 34;
    let x = x0;
    let y = y0;
    let size = 8;
    let y_adv = 7;
    let z_text = Z.UI + 3;

    y += 2;
    font.drawSized(style_summary, x, y, z_text, size, 'DOCKED AT PORT');
    x += size;
    y += y_adv;
    let text = (chapters[state.chapter].no_passengers && state.chapter !== 1) ? '' : 'Here there are many fleeing the oppression of the Alliance.\n\n';

    if (state.chapter === 1) {
      text += 'You hope they\'ll find a way off this rock, but for now you' +
        ' review your equipment and head into battle to stop The Alliance.';
    } else {
      if (chapters[state.chapter].no_passengers) {
        text += 'You see no one around who wants to board.';
      } else if (state.recent_pickup) {
        text += `Seeing empty${state.chapter === 2 ? ' space in your cargo hold' : ', if slightly bunrt, seats'}, ${state.recent_pickup}` +
          ` fearless refugee${state.recent_pickup === 1 ? '' : 's'} quickly scramble aboard filling your ${state.chapter === 2 ? 'empty' : 'recently vacated'}` +
          ' hold.\n\n';
      } else {
        text += 'Your passengers celebrate that every one of them survived the last leg of their harrowing journey.\n\n';
      }
      if (!chapters[state.chapter].no_passengers) {
        text +=
          'You feel you have more than enough equipment, so choose one' +
          ' to jettison in order to fit some more refugees onto your ship.';
      }
    }
    y += font.drawSizedWrapped(style_summary, x, y, z_text,
      120, 0,
      size, text);

    if (state.chapter !== 1) {
      x -= size;
      y += 8;
      font.drawSized(style_summary, x, y, z_text, size, 'SENSORS REPORT');
      x += size;
      y += y_adv + 2;
      y += font.drawSizedWrapped(style_summary, x, y, z_text,
        120, 0, size,
        `${waves[state.chapter][0]} ${waves[state.chapter][1] < 5 ? 'Light ' : waves[state.chapter][1] > 5 ? 'Heavy ' : ''}Fighters\n` +
        `(${waves[state.chapter][1]} Damage Each)\n`
      );
    }

    glov_ui.panel({
      x: 0,
      y: y0,
      w: 140,
      h: y - y0 + 5,
    });
  }

  function manage(dt) {
    drawShipBG(dt);
    if (state.chapter !== 1) {
      drawShipSummary(dt, true);
    }
    drawSlots(dt, true);
    drawManageInstructions(dt);

    if (state.chapter === 1) {
      glov_ui.print(style_summary, 6, game_height - 50, Z.UI + 1,
        'Tap or mouse over each kind of');
      glov_ui.print(style_summary, 6, game_height - 50 + 8, Z.UI + 1,
        'equipment to see what it does.');
      if (glov_ui.buttonText({ x: 26, y: game_height - 18, text: 'To battle!'})) {
        app.game_state = encounterInit;
      }
    } else {
      if (state.remove_slot === -1) {
        glov_ui.print(style_summary, 6, game_height - 50, Z.UI + 1,
          'Click equipment to remove');
      } else {
        glov_ui.print(style_summary, 6, game_height - 50, Z.UI + 1,
          `Remove ${panel_types[state.slots[state.remove_slot].type].name} and`);
        let saved = 20;

        if (state.slots[state.remove_slot].type === 'shield' && chapters[state.chapter].replace_shield_40) {
          saved = 40;
        }
        if (glov_ui.buttonText({ x: 8, y: game_height - 18 - 22,
          w: 84,
          text: chapters[state.chapter].no_passengers ? 'Save 0 refugees?' : `Save ${saved} refugees`}))
        {
          state.slots[state.remove_slot] = {
            type: 'cargo',
            power: 0,
            heat_damage: 0,
            hp: 100,
            idx: state.remove_slot,
            cargo: saved,
          };
          state.picked_up[state.chapter] = true;
          app.game_state = encounterInit;
          if (chapters[state.chapter].no_passengers) {
            glov_ui.modalDialog({
              title: 'THE INVISIBLE MAN',
              text: 'As you rise through the stratosphere, you hear a voice from thin air say "Thank you."' +
                '\n\nYour Comms Officer helps the man and his family of 19 get settled in to the empty cargo hold.',
              buttons: {
                'Odd...': null
              },
            });
          }
        }
      }
      glov_ui.print(style_summary, 6, game_height - 18 + 3, Z.UI + 1,
        'or...');
      if (glov_ui.buttonText({ x: 26, y: game_height - 18, text: chapters[state.chapter].no_passengers ? 'Continue...' : 'Take no one'})) {
        if (chapters[state.chapter].no_passengers) {
          app.game_state = encounterInit;
        } else {
          glov_ui.modalDialog({
            title: 'Heartlessness!',
            text: 'Their lives will surely be miserable under The Alliance. Are you sure you want to take on no additional passengers?',
            buttons: {
              'Yes': function () {
                app.game_state = encounterInit;
              },
              'Back': null, // no callback
            },
          });
        }
      }
    }

    glov_ui.panel({
      x: 0,
      y: game_height - 54,
      w: 160,
      h: 54,
    });
  }

  function intro(dt) {
    drawShipBG(dt);

    let x0 = game_width / 6;
    let w = game_width / 1.5;
    let y0 = game_height / 10;
    let h = 100;
    let x = x0;
    let y = y0;
    let size = glov_ui.font_height;

    y += 8;
    font.drawSizedAligned(style_summary, x, y, Z.UI + 1, size * 2,
      glov_font.ALIGN.HCENTER, w, 0, 'Escape From The Alliance');
    y += size * 2 + 4;
    font.drawSizedAligned(style_summary, x, y, Z.UI + 1, size,
      glov_font.ALIGN.HCENTER, w, 0, 'By Jimb Esser');
    y += size;
    font.drawSizedAligned(style_summary, x, y, Z.UI + 1, size,
      glov_font.ALIGN.HCENTER, w, 0, 'Made in 48hrs for Ludum Dare 42');
    y += size * 2;
    y += font.drawSizedWrapped(style_summary, x + 8, y, Z.UI + 1,
      w - 16, 0, size,
      'You are Captain Ben of the starship Lighting Bug. The evil Alliance is' +
      ' cramping the style of independents like yourself so you finish gearing' +
      ' up your ship before heading into battle...');
    y += 8;

    let button_w = 160;
    if (glov_ui.buttonText({ x: game_width / 2 - button_w/2, y,
      w: button_w,
      text: 'Dock at port one last time...'}))
    {
      app.game_state = manageInit;
    }

    glov_ui.panel({
      x: x0,
      y: y0,
      w: w,
      h: h,
    });

    if (glov_ui.buttonText({ x: 8, y: game_height - 16 - 8,
      text: 'High Scores'}))
    {
      app.game_state = scoresInit;
    }

  }

  function win(dt) {
    drawShipBG(dt);

    let x0 = game_width / 6;
    let w = game_width / 1.5;
    let y0 = game_height / 10;
    let h = 156;
    let x = x0;
    let y = y0;
    let size = glov_ui.font_height;

    y += 8;
    font.drawSizedAligned(style_summary, x, y, Z.UI + 1, size * 2,
      glov_font.ALIGN.HCENTER, w, 0, 'Escape From The Alliance');
    y += size * 2 + 4;
    font.drawSizedAligned(style_summary, x, y, Z.UI + 1, size,
      glov_font.ALIGN.HCENTER, w, 0, 'By Jimb Esser');
    y += size;
    font.drawSizedAligned(style_summary, x, y, Z.UI + 1, size,
      glov_font.ALIGN.HCENTER, w, 0, 'Made in 48hrs for Ludum Dare 42');
    y += size * 2;

    let ship_stats = calcShipStats();
    y += font.drawSizedWrapped(style_summary, x + 8, y, Z.UI + 1,
      w - 16, 0, size,
      `You ship carried ${ship_stats.cargo} refugees to their freedom`);
    y += 8;
    y += font.drawSizedWrapped(style_summary, x + 8, y, Z.UI + 1,
      w - 16, 0, size,
      `You ship carried ${state.deaths} refugees to their death`);
    y += 8;

    y += font.drawSizedWrapped(style_summary, x + 8, y, Z.UI + 1,
      w - 16, 0, size,
      'Thanks for playing!');
    y += 8;

    let button_w = 160;

    if (glov_ui.buttonText({ x: game_width / 2 - button_w/2, y,
      w: button_w,
      text: 'View High Scores'}))
    {
      app.game_state = scoresInit;
    }
    y += 20;

    if (glov_ui.buttonText({ x: game_width / 2 - button_w/2, y,
      w: button_w,
      text: 'Check out Splody on Steam and PS4!'}))
    {
      window.location = 'http://www.splody.com';
    }
    y += 20;

    if (glov_ui.buttonText({ x: game_width / 2 - button_w/2, y,
      w: button_w,
      text: 'Replay'}))
    {
      window.location.reload();
    }
    y += 20;

    glov_ui.panel({
      x: x0,
      y: y0,
      w: w,
      h: h,
    });
  }

  function lose(dt) {
    drawShipBG(dt);

    let x0 = game_width / 6;
    let w = game_width / 1.5;
    let y0 = game_height / 6;
    let h = 130;
    let x = x0;
    let y = y0;
    let size = glov_ui.font_height;

    y += 8;
    font.drawSizedAligned(style_summary, x, y, Z.UI + 1, size * 2,
      glov_font.ALIGN.HCENTER, w, 0, 'GAME OVER');
    y += size * 2 + 4;

    y += font.drawSizedWrapped(style_summary, x + 8, y, Z.UI + 1,
      w - 16, 0, size,
      `You ship carried ${state.deaths} refugees to their death`);
    y += 18;

    y += font.drawSizedWrapped(style_summary, x + 8, y, Z.UI + 1,
      w - 16, 0, size,
      'Thanks for playing, try again?');
    y += 18;

    let button_w = 160;

    if (glov_ui.buttonText({ x: game_width / 2 - button_w/2, y,
      w: button_w,
      text: 'View High Scores'}))
    {
      app.game_state = scoresInit;
    }
    y += 20;

    if (glov_ui.buttonText({ x: game_width / 2 - button_w/2, y,
      w: button_w,
      text: 'Replay'}))
    {
      window.location.reload();
    }
    y += 20;

    glov_ui.panel({
      x: x0,
      y: y0,
      w: w,
      h: h,
    });
  }

  let scores_edit_box;
  function scores(dt) {
    /* jshint bitwise:false */
    if (!have_scores) {
      return;
    }
    let x = game_width / 4;
    let y = 8;
    let size = 8;
    let width = game_width / 2;
    font.drawSizedAligned(null, x, y, Z.UI, size * 2, glov_font.ALIGN.HCENTERFIT, width, 0, 'HIGH SCORES');
    y += size * 2 + 2;
    let scores = score_system.high_scores.all;
    let widths = [8, 40, 15, 24, 20];
    let widths_total = 0;
    for (let ii = 0; ii < widths.length; ++ii) {
      widths_total += widths[ii];
    }
    let set_pad = 4;
    for (let ii = 0; ii < widths.length; ++ii) {
      widths[ii] *= (width - set_pad * (widths.length - 1)) / widths_total;
    }
    let align = [
      glov_font.ALIGN.HFIT | glov_font.ALIGN.HRIGHT,
      glov_font.ALIGN.HFIT,
      glov_font.ALIGN.HFIT | glov_font.ALIGN.HCENTER,
      glov_font.ALIGN.HFIT | glov_font.ALIGN.HCENTER,
      glov_font.ALIGN.HFIT | glov_font.ALIGN.HCENTER,
    ];
    function drawSet(arr, style) {
      let xx = x;
      for (let ii = 0; ii < arr.length; ++ii) {
        font.drawSizedAligned(style, xx, y, Z.UI, size, align[ii], widths[ii], 0, '' + arr[ii]);
        xx += widths[ii] + set_pad;
      }
      y += size;
    }
    drawSet(['', 'Name', 'Chapter', 'Passengers', 'Deaths'], glov_font.styleColored(null, 0xC2C3C7ff));
    y += 4;
    let score_style = glov_font.styleColored(null, 0xFFF1E8ff);
    let found_me = false;
    for (let ii = 0; ii < scores.length; ++ii) {
      let s = scores[ii];
      let style = score_style;
      let drawme = false;
      if (s.name === score_system.player_name) {
        style = glov_font.styleColored(null, 0x00E436ff);
        found_me = true;
        drawme = true;
      }
      if (ii < 15 || drawme) {
        drawSet([`#${ii+1}`, score_system.formatName(s), s.score.level, s.score.cargo, s.score.deaths], style);
      }
    }
    y += 4;
    if (found_me && score_system.player_name.indexOf('Anonymous') === 0) {
      if (!scores_edit_box) {
        scores_edit_box = glov_ui.createEditBox({
          x: 100,
          y: game_height - 16,
          w: 100,
        });
        scores_edit_box.setText(score_system.player_name);
      }

      if (scores_edit_box.run({
        x,
        y,
      }) === scores_edit_box.SUBMIT || glov_ui.buttonText({
        x: x + scores_edit_box.w + size,
        y,
        w: size * 9,
        h: glov_ui.button_height / 2,
        font_height: glov_ui.font_height * 0.75,
        text: 'Update Player Name'
      })) {
        // scores_edit_box.text
        if (scores_edit_box.text) {
          score_system.updatePlayerName(scores_edit_box.text);
        }
      }
    }

    if (glov_ui.buttonText({ x: 8, y: game_height - 16 - 8,
      text: 'Restart'}))
    {
      window.location.reload();
    }
  }

  function special(dt) {
    drawShipBG(dt);

    let x0 = game_width / 6;
    let w = game_width / 1.5;
    let y0 = game_height / 10;
    let x = x0;
    let y = y0;
    let size = glov_ui.font_height;

    y += 8;
    font.drawSizedAligned(style_summary, x, y, Z.UI + 1, size * 2,
      glov_font.ALIGN.HCENTER, w, 0, 'Escape From The Alliance');
    y += size * 2 + 4;
    font.drawSizedAligned(style_summary, x, y, Z.UI + 1, size,
      glov_font.ALIGN.HCENTER, w, 0, `Chapter ${state.chapter + 1}`);
    y += size * 2;
    let text = 'MISSING_TEXT';
    let button = 'Dock at another port...';
    if (state.chapter === 1) {
      text = 'Okay, well, that fight was not so bad. However,' +
        ' your sensors show The Alliance armada is way bigger than' +
        ' you thought.\n\n' +
        'Perhaps it would be nobler to get to a planet beyond the rim, beyond' +
        ' Alliance control, and take as many refugees with' +
        ' you as you can. Your ship is just about out of space though...';
      button = 'Back to port to pick up refugees';
    } else if (state.chapter === 2) {
      text = 'That last bunch of passengers was an odd group, like an old joke,' +
        ' "A rabbi, a cop, and a doctor walk into a bar...", but at least the' +
        ' skilled doctor can fix up your crew\'s injuries.\n\nHer younger brother is weird though,' +
        ' just stares at you blankly and says things like "Ben, good... in the Latin".';
    } else if (state.chapter === 3) {
      text = 'As you approach Planet Utopius, you are hailed by a group of 40 Etherians, a rare race of energy beings.' +
        '\n\nBeing somewhat incorporeal, they can all fit into a single cargo hold, but require energy hook-ups that can' +
        ' only be found if you remove one of your shields.';
      button = 'In to port...';
    } else if (state.chapter === 4) {
      text = 'Port Griffin is eerily empty, you see no one anywhere...';
      button = 'Let\'s not dally long...';
    } else if (state.chapter === 5) {
      // marked as state.picked_up[6]
      text = 'For some reason this *entire planet* is a desert. Weird. Luckily its full of' +
        ' rather resourceful people, so if you make room in your ship for more refugees' +
        ' some of them promise to tinker with your engines a bit.';
      button = 'This can\'t possibly go wrong';
    } else if (state.chapter === 6) {
      let shields = state.slots.filter(function(slot) {
        return slot.type === 'shield' && slot.hp;
      });
      if (shields.length === 2) {
        text = 'Sure is nice having 2 SHIELD GENERATORS. You wonder if the Etherians' +
          ' are being converted into living batteries by The Alliance right about now...';
        button = 'Glad I\'m out of there';
      } else if (state.slots.filter(function (slot) {
        return slot.cargo > 20;
      }).length && shields.length) {
        // have the shield guys from earlier!
        text = 'The Etherians you picked up earlier have been tinkering with your' +
          ' remaining shield and have dramatically improved its heat dissipation!';
        shields[0].heat_scale = 0.5;
      } else {
        text = 'A shiver runs down your spine.';
      }
    } else if (state.chapter === 7) {
      let engines = state.slots.filter(function (slot) {
        return slot.type === 'engine';
      });
      if (state.picked_up[6] && engines.length) {
        text = 'Some spunky kid from that desert planet adjusted the fuel intake' +
          ` on your engine${engines.length === 1 ? '' : 's'} to mix in something called` +
          ' "metaclorians", doubling its evasion!';
        button = 'Mesa like dis';
        state.engine_factor = 2;
      } else {
        text = 'Another desert planet.  Who settles on these?';
        button = 'Not me.';
      }
    } else if (state.chapter === 8) {
      text = 'You\'re far enough away now that only the smaller, lighter Alliance fighters' +
        ' seem to be able to catch up to you.';
      button = 'Thank God.';
    } else if (state.chapter === 9) {
      text = 'As you start to land on this world which is seemingly entirely one giant jungle,' +
        ' some refugees from the desert world start going on about how implausible it is that' +
        ' an entire world would be just one biome.';
      button = 'Like they can talk...';
    } else if (state.chapter === 10) {
      text = 'You\'re getting really far away from The Alliance, they\'ve all but' +
        ' given up chasing you, it seems. Sensors show only one squadron still chasing you.';
    } else if (state.chapter === 11) {
      text = 'Beyond the rim. You made it.' +
        '\n\nThere\'s no sign of The Alliance anywhere.'+
        '\n\nYou think it\'s time to find a new home.';
      button = 'FTW';
    }
    y += font.drawSizedWrapped(style_summary, x + 8, y, Z.UI + 1,
      w - 16, 0, size,
      text);
    y += 8;

    let button_w = 160;
    if (glov_ui.buttonText({ x: game_width / 2 - button_w/2, y,
      w: button_w,
      text: button}))
    {
      if (chapters[state.chapter].win) {
        app.game_state = winInit;
      } else {
        app.game_state = manageInit;
      }
    }

    if (state.chapter === 1) {
      y += 14;
      if (glov_ui.buttonText({ x: game_width / 2 - button_w/2, y,
        w: button_w,
        text: 'Charge the armada, go out in glory!'}))
      {
        glov_ui.modalDialog({
          title: 'You can\'t take the sky from me!',
          text: 'You fly straight towards the oncoming armada, your guns gloriously, if foolishly,' +
            ' blazing. You die, knowing you will be remembered.\n\nNo one remembers you, all of your' +
            ' comrades on the previously free planets are dead.\n\nIn an alternate universe,' +
            ' however, you chose to go back to port and save who you can instead...',
          buttons: {
            'Port': function () {
              app.game_state = manageInit;
            }
          },
        });
      }
    }

    glov_ui.panel({
      x: x0,
      y: y0,
      w: w,
      h: y - y0 + 8,
    });

  }

  const waves = [
    // num ships, damage, scale
    null,
    [4, 5], // 1 - tutorial, then remove something
    [8, 5], // 2
    [15, 1, 0.5], // 3, then remove shields
    [2, 20, 1.5], // 4
    [8, 5], // 5
    [10, 3, 0.75], // 6, then better shields
    [8, 5], // 7, then better engines
    [2, 30, 1.5], // 8
    [6, 5], // 9
    [5, 5], // 10
    [8, 5], // 11
    [4, 5], // 12
  ];
  function nextWave() {
    let max_hp = 1;
    let num_ships = waves[state.chapter][0];
    let damage = waves[state.chapter][1];
    let scale = waves[state.chapter][2] || 1;
    state.wave = {
      num_ships,
      max_hp,
      damage,
      scale,
      ships: [],
    };
    state.messages = [];
    for (let ii = 0; ii < num_ships; ++ii) {
      let ship = {
        x: ENEMY_SHIP_X0 + Math.random() * 10,
        y: ENEMY_SHIP_H + Math.random() * (game_height - ENEMY_SHIP_H * 2),
        hp: max_hp,
        fire_countdown: ENEMY_INITIAL_COUNTDOWN + Math.random() * 3 * TICK,
        firing: 0,
      };
      state.wave.ships.push(ship);
    }
  }

  function initState() {
    state = {
      deaths: 0,
      slots: [],
      messages: [],
      on_priority: [],
      chapter: 0,
      picked_up: {}, // which chapters we picked up people
    };
    for (let ii = 0; ii < ship_slots.length; ++ii) {
      let slot = {
        type: ship_slots[ii].start,
        power: 0, // 0/1/2 = off/on/over
        heat_damage: 0,
        hp: 100,
        idx: ii,
      };
      let slot_type_def = panel_types[slot.type];
      for (let jj = 0; jj < slot_type_def.values.length; ++jj) {
        if (slot_type_def.values[jj]) {
          slot[slot_type_def.values[jj]] = value_defs[slot_type_def.values[jj]].start || 0;
        }
      }
      state.slots.push(slot);
    }
  }

  function encounterInit(dt) {
    nextWave();
    app.game_state = encounter;
    time_in_state = 0;
    state.o2 = 80;
    ship_x_prev = SHIP_X;
    ship_x_desired = SHIP_X_ENCOUNTER;
    encounter(dt);
  }

  function manageInit(dt) {
    app.game_state = manage;
    state.chapter++;
    time_in_state = 0;
    ship_x_prev = SHIP_X;
    ship_x_desired = SHIP_X_MANAGE;
    state.recent_pickup = 0;
    state.remove_slot = -1;
    for (let ii = 0; ii < state.slots.length; ++ii) {
      let slot = state.slots[ii];
      if (slot.type === 'cargo' && slot.cargo < value_defs.cargo.max && !chapters[state.chapter].no_passengers) {
        state.recent_pickup += value_defs.cargo.max - slot.cargo;
        slot.cargo = value_defs.cargo.max;
      }
      let slot_type_def = panel_types[slot.type];
      for (let jj = 0; jj < slot_type_def.values.length; ++jj) {
        if (slot_type_def.values[jj] && value_defs[slot_type_def.values[jj]].port !== undefined) {
          slot[slot_type_def.values[jj]] = value_defs[slot_type_def.values[jj]].port;
        }
      }
      slot.autooff = false;
      slot.autocool = false;
      slot.power = 0;
      slot.fire_at = null;
    }
    state.on_priority = [];
    manage(dt);
  }

  let have_scores = false;
  function specialInit(dt) {
    score_system.setScore('all', { level: state.chapter, cargo: calcShipStats().cargo, deaths: state.deaths }, function () {
      have_scores = true;
    });
    app.game_state = special;
    time_in_state = 0;
    ship_x_prev = SHIP_X;
    ship_x_desired = SHIP_X_SPECIAL;
    special(dt);
  }

  function introInit(dt) {
    score_system.updateHighScores(function () {
      have_scores = true;
    });
    app.game_state = intro;
    time_in_state = 0;
    ship_x_prev = game_width;
    ship_x_desired = SHIP_X_INTRO;
    intro(dt);
  }

  function winInit(dt) {
    app.game_state = win;
    time_in_state = 0;
    ship_x_prev = SHIP_X;
    ship_x_desired = SHIP_X_WIN;
    win(dt);
  }

  function loseInit(dt) {
    app.game_state = lose;
    time_in_state = 0;
    ship_x_prev = SHIP_X;
    ship_x_desired = SHIP_X_LOSE;
    lose(dt);
  }

  function scoresInit(dt) {
    score_system.updateHighScores(function () {
      have_scores = true;
    });
    app.game_state = scores;
    scores(dt);
  }

  function loading() {
    let load_count = glov_sprite.loading() + sound_manager.loading();
    $('#loading').text(`Loading (${load_count})...`);
    if (!load_count) {
      $('.screen').hide();
      initState();
      if (DEBUG) {
        tutorial = {};
        state.chapter = 4;
      }
      app.game_state = DEBUG ? encounterInit : introInit;
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
    if (glov_ui.modal_dialog) {
      // Testing effects
      glov_engine.queueFrameEffect(Z.MODAL - 2, doBlurEffect);
      glov_engine.queueFrameEffect(Z.MODAL - 1, doDesaturateEffect);
    }
    app.game_state(dt);
  }

  loadingInit();
  glov_engine.go(tick);
}
