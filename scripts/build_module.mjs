import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ClassicLevel } from "classic-level";
import { STARTER_SET_ACTORS, STORY_NPC_PAGES } from "./starter_set_support_data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "build");
const DATA_PATH = path.join(BUILD, "starter-set-data.json");
const MODULE_ID = "fallout-starter-set-commonwealth";
const TEMPLATE_PATH = path.join(ROOT, "Reference", "template.json");
const PACKS_DIR = path.join(ROOT, "packs");
const ADVENTURE_PACK = path.join(PACKS_DIR, "starter-set-adventure");
const ROLLTABLE_PACK = path.join(PACKS_DIR, "starter-set-rolltables");
const ACTOR_PACK = path.join(PACKS_DIR, "starter-set-actors");
const SYSTEM_TEMPLATES = JSON.parse(fs.readFileSync(TEMPLATE_PATH, "utf8"));

function runExtractor() {
  const result = spawnSync(process.platform === "win32" ? "python.exe" : "python", [path.join(ROOT, "scripts", "extract_sources.py")], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`Source extraction failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      target[key] = deepClone(value);
      continue;
    }
    if (isObject(value)) {
      if (!isObject(target[key])) {
        target[key] = {};
      }
      deepMerge(target[key], value);
      continue;
    }
    target[key] = value;
  }
  return target;
}

function composeActorSystem(type) {
  const actorTemplate = SYSTEM_TEMPLATES.Actor[type];
  const system = {};
  for (const templateName of actorTemplate.templates ?? []) {
    deepMerge(system, deepClone(SYSTEM_TEMPLATES.Actor.templates[templateName]));
  }
  deepMerge(system, deepClone(actorTemplate));
  return system;
}

function composeItemSystem(type) {
  const itemTemplate = SYSTEM_TEMPLATES.Item[type];
  const system = {};
  for (const templateName of itemTemplate.templates ?? []) {
    deepMerge(system, deepClone(SYSTEM_TEMPLATES.Item.templates[templateName]));
  }
  deepMerge(system, deepClone(itemTemplate));
  return system;
}

function randomId() {
  return crypto.randomBytes(8).toString("base64url").slice(0, 16);
}

function stats(documentType) {
  return {
    compendiumSource: null,
    duplicateSource: null,
    exportSource: null,
    coreVersion: "13.350",
    systemId: "fallout",
    systemVersion: "11.16.6",
    lastModifiedBy: null,
    createdTime: Date.now(),
    modifiedTime: Date.now(),
  };
}

function defaultPrototypeToken(img, actorName) {
  return {
    name: actorName,
    actorLink: false,
    displayName: 20,
    displayBars: 20,
    disposition: -1,
    lockRotation: false,
    rotation: 0,
    alpha: 1,
    bar1: { attribute: "health" },
    bar2: { attribute: null },
    texture: {
      src: img,
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      tint: "#ffffff",
      anchorX: 0.5,
      anchorY: 0.5,
      fit: "contain",
      alphaThreshold: 0.75,
    },
    width: 1,
    height: 1,
    sight: {
      enabled: false,
      range: 0,
      angle: 360,
      brightness: 1,
      visionMode: "basic",
      color: null,
      attenuation: 0.1,
      saturation: 0,
      contrast: 0,
    },
    detectionModes: [],
    light: {
      alpha: 0.5,
      angle: 360,
      bright: 0,
      coloration: 1,
      dim: 0,
      luminosity: 0.5,
      saturation: 0,
      contrast: 0,
      shadows: 0,
      animation: { speed: 5, intensity: 5, reverse: false, type: null },
      darkness: { min: 0, max: 1 },
      attenuation: 0.5,
      color: null,
      negative: false,
      priority: 0,
    },
    flags: {},
  };
}

function ensureCleanDir(target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
}

function pageImageSrc(pageNumber) {
  return `modules/${MODULE_ID}/assets/starter-set/pages/page-${String(pageNumber).padStart(3, "0")}.jpg`;
}

function makeTextPage(name, html, sort) {
  return {
    _id: randomId(),
    name,
    type: "text",
    title: { show: true, level: 2 },
    text: { format: 1, content: html },
    image: {},
    video: { controls: true, volume: 0.5 },
    src: null,
    system: {},
    sort,
    flags: {},
    _stats: stats("JournalEntryPage"),
    category: null,
    ownership: { default: -1 },
  };
}

function makeImagePage(name, src, sort, showTitle = false) {
  return {
    _id: randomId(),
    name,
    type: "image",
    src,
    title: { show: showTitle, level: 2 },
    image: {},
    text: { format: 1 },
    video: { controls: true, volume: 0.5 },
    system: {},
    sort,
    flags: {},
    _stats: stats("JournalEntryPage"),
    category: null,
    ownership: { default: -1 },
  };
}

function makeJournal(name, folder, pages, sort, img = "icons/sundries/books/book-red-exclamation.webp") {
  return {
    _id: randomId(),
    name,
    pages,
    folder,
    sort,
    flags: {},
    _stats: stats("JournalEntry"),
    categories: [],
    ownership: { default: 0 },
    img,
  };
}

function makeFolder(name, type, sort, folder = null, color = "#2f4f4f") {
  return {
    _id: randomId(),
    name,
    type,
    sorting: "a",
    sort,
    color,
    flags: {},
    folder,
    description: "",
    _stats: stats("Folder"),
  };
}

function setDamageType(system, damageType) {
  if (!damageType) return;
  if (Array.isArray(damageType)) {
    for (const kind of damageType) {
      system.damage.damageType[kind] = true;
      system.damage.originalDamageType[kind] = true;
    }
    return;
  }
  system.damage.damageType[damageType] = true;
  system.damage.originalDamageType[damageType] = true;
}

function setNamedFlags(container, keys = []) {
  for (const entry of keys) {
    if (typeof entry === "string") {
      if (container[entry]) container[entry].value = 1;
      continue;
    }
    if (container[entry.key]) {
      container[entry.key].value = entry.value;
      if ("rank" in container[entry.key]) container[entry.key].rank = entry.value;
    }
  }
}

function makeSkillItem(skill) {
  const system = composeItemSystem("skill");
  system.defaultAttribute = skill.defaultAttribute;
  system.value = skill.value;
  system.tag = Boolean(skill.tag);
  return {
    _id: randomId(),
    name: skill.name,
    type: "skill",
    img: "systems/fallout/assets/icons/items/skill.webp",
    system,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: stats("Item"),
  };
}

function makeAbilityItem(name, description) {
  const system = composeItemSystem("special_ability");
  system.description = description;
  return {
    _id: randomId(),
    name,
    type: "special_ability",
    img: "systems/fallout/assets/icons/items/special_ability.svg",
    system,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: stats("Item"),
  };
}

function makeApparelItem(item) {
  const system = composeItemSystem("apparel");
  system.description = item.description ?? "";
  system.equipped = item.equipped ?? true;
  system.resistance.physical = item.physical ?? 0;
  system.resistance.energy = item.energy ?? 0;
  system.resistance.radiation = item.radiation ?? 0;
  for (const location of item.locations ?? []) {
    if (system.location[location] !== undefined) {
      system.location[location] = true;
    }
  }
  return {
    _id: randomId(),
    name: item.name,
    type: "apparel",
    img: "systems/fallout/assets/icons/items/apparel.svg",
    system,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: stats("Item"),
  };
}

function makeWeaponItem(item, actorType) {
  const system = composeItemSystem("weapon");
  system.description = item.description ?? "";
  system.attribute = item.attribute ?? "";
  system.skill = item.skill ?? "";
  system.creatureAttribute = item.creatureAttribute ?? "";
  system.creatureSkill = item.creatureSkill ?? "";
  system.weaponType = item.weaponType ?? "smallGuns";
  system.range = item.range ?? "close";
  system.fireRate = item.fireRate ?? 0;
  system.melee = Boolean(item.melee);
  system.naturalWeapon = Boolean(item.natural);
  system.damage.rating = item.damage;
  system.damage.originalRating = item.damage;
  setDamageType(system, item.damageType);
  setNamedFlags(system.damage.weaponQuality, item.qualities ?? []);
  setNamedFlags(system.damage.damageEffect, item.damageEffects ?? []);
  if (actorType === "creature") {
    system.attribute = "";
    system.skill = "";
  }
  return {
    _id: randomId(),
    name: item.name,
    type: "weapon",
    img: "systems/fallout/assets/icons/items/weapon.svg",
    system,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: stats("Item"),
  };
}

function applyBodyResistance(bodyParts, resistanceMap = {}) {
  for (const [damageType, locations] of Object.entries(resistanceMap)) {
    for (const [location, value] of Object.entries(locations)) {
      if (bodyParts[location]?.resistance?.[damageType] !== undefined) {
        bodyParts[location].resistance[damageType] = value;
      }
    }
  }
}

function buildActorDocument(definition, folderId) {
  const system = composeActorSystem(definition.type);
  system.description = definition.summary ?? "";
  system.biography = definition.biography ?? "";
  system.level.value = definition.level;
  system.level.rewardXP = definition.xp;
  system.category = definition.category;

  if (definition.type === "creature") {
    system.body.value = definition.creature.body;
    system.body.max = definition.creature.body;
    system.mind.value = definition.creature.mind;
    system.mind.max = definition.creature.mind;
    system.melee.value = definition.creature.melee;
    system.melee.max = definition.creature.melee;
    system.guns.value = definition.creature.guns;
    system.guns.max = definition.creature.guns;
    system.other.value = definition.creature.other;
    system.other.max = definition.creature.other;
    system.health.value = definition.derived.hp;
    system.health.max = definition.derived.hp;
    system.initiative.value = definition.derived.initiative;
    system.initiative.max = definition.derived.initiative;
    system.defense.value = definition.derived.defense;
    system.defense.max = definition.derived.defense;
    system.resistance.physical.value = definition.creatureResist.physical ?? 0;
    system.resistance.energy.value = definition.creatureResist.energy ?? 0;
    system.resistance.radiation.value = definition.creatureResist.radiation ?? 0;
    system.resistance.poison.value = definition.creatureResist.poison ?? 0;
    if (definition.creatureLocationText) {
      if (definition.creatureLocationText.physical) system.resistance.physical.locations = definition.creatureLocationText.physical;
      if (definition.creatureLocationText.energy) system.resistance.energy.locations = definition.creatureLocationText.energy;
      if (definition.creatureLocationText.radiation) system.resistance.radiation.locations = definition.creatureLocationText.radiation;
      if (definition.creatureLocationText.poison) system.resistance.poison.locations = definition.creatureLocationText.poison;
    }
  } else {
    for (const [ability, value] of Object.entries(definition.special ?? {})) {
      system.attributes[ability].value = value;
    }
    system.health.value = definition.derived.hp;
    system.health.max = definition.derived.hp;
    system.initiative.value = definition.derived.initiative;
    system.initiative.max = definition.derived.initiative;
    system.defense.value = definition.derived.defense;
    system.defense.max = definition.derived.defense;
    system.carryWeight.value = definition.derived.carryWeight ?? 0;
    system.carryWeight.total = definition.derived.carryWeight ?? 0;
    system.carryWeight.base = definition.derived.carryWeight ?? 0;
    system.meleeDamage.value = definition.derived.meleeBonus ?? 0;
    system.luckPoints = definition.derived.luck ?? 0;
    system.wealth = definition.derived.wealth ?? system.wealth ?? 1;
    system.resistance.physical = Math.max(...Object.values(definition.bodyResist?.physical ?? { base: 0 }));
    system.resistance.energy = Math.max(...Object.values(definition.bodyResist?.energy ?? { base: 0 }));
    system.resistance.poison = definition.immunities?.poison ? 0 : (definition.derived.poisonDR ?? 0);
    system.resistance.radiation = definition.immunities?.radiation ? 0 : (definition.derived.radiationDR ?? 0);
  }

  if (system.body_parts) {
    applyBodyResistance(system.body_parts, definition.bodyResist);
  }
  if (system.body?.body_parts) {
    applyBodyResistance(system.body.body_parts, definition.bodyResist);
  }
  if (system.immunities) {
    if (definition.immunities?.poison) system.immunities.poison = true;
    if (definition.immunities?.radiation) system.immunities.radiation = true;
  }
  if (system.body?.immunities) {
    if (definition.immunities?.poison) system.body.immunities.poison = true;
    if (definition.immunities?.radiation) system.body.immunities.radiation = true;
  }

  const items = [];
  if (definition.type !== "creature") {
    for (const skill of definition.skills ?? []) {
      items.push(makeSkillItem(skill));
    }
  }
  for (const item of definition.items ?? []) {
    if (item.kind === "weapon") items.push(makeWeaponItem(item, definition.type));
    if (item.kind === "apparel") items.push(makeApparelItem(item));
    if (item.kind === "ability") items.push(makeAbilityItem(item.name, item.description));
  }

  return {
    _id: randomId(),
    name: definition.name,
    type: definition.type,
    img: definition.token,
    prototypeToken: defaultPrototypeToken(definition.token, definition.name),
    system,
    items,
    effects: [],
    folder: folderId,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: stats("Actor"),
  };
}

function makeRollTable(name, results, formula, folder, sort) {
  return {
    _id: randomId(),
    name,
    img: "icons/svg/d20-grey.svg",
    results: results.map((result, index) => ({
      _id: randomId(),
      type: "text",
      img: "icons/svg/d20-grey.svg",
      weight: result.range[1] - result.range[0] + 1,
      range: result.range,
      drawn: false,
      flags: {},
      _stats: stats("TableResult"),
      description: result.text,
      name: "",
    })),
    formula,
    replacement: true,
    displayRoll: true,
    folder,
    sort,
    flags: {},
    description: "",
    _stats: stats("RollTable"),
    ownership: { default: 0 },
  };
}

function writeModuleManifest() {
  const manifest = {
    id: MODULE_ID,
    title: "Fallout Starter Set: Once Upon a Time in the Commonwealth",
    description:
      "<p>A Foundry VTT starter-set module for the Fallout 2d20 system, built from the supplied starter booklet, core references, and the installed Fallout system data. It includes a ready-to-import adventure compendium, rendered booklet page art, and the starter loot tables as native Foundry RollTables.</p>",
    version: "0.1.0",
    compatibility: {
      minimum: "13",
      verified: "13",
    },
    authors: [
      {
        name: "OpenAI Codex",
        flags: {},
      },
    ],
    relationships: {
      systems: [
        {
          id: "fallout",
          type: "system",
          compatibility: {
            minimum: "11.16.6",
          },
        },
      ],
    },
    packs: [
      {
        name: "starter-set-adventure",
        label: "Starter Set Adventure",
        path: "packs/starter-set-adventure",
        type: "Adventure",
        system: "fallout",
        ownership: {
          PLAYER: "OBSERVER",
          ASSISTANT: "OWNER",
        },
        banner: pageImageSrc(1),
        flags: {},
      },
      {
        name: "starter-set-rolltables",
        label: "Starter Set Roll Tables",
        path: "packs/starter-set-rolltables",
        type: "RollTable",
        system: "fallout",
        ownership: {
          PLAYER: "OBSERVER",
          ASSISTANT: "OWNER",
        },
        flags: {},
      },
      {
        name: "starter-set-actors",
        label: "Starter Set Actors",
        path: "packs/starter-set-actors",
        type: "Actor",
        system: "fallout",
        ownership: {
          PLAYER: "OBSERVER",
          ASSISTANT: "OWNER",
        },
        flags: {},
      },
    ],
    packFolders: [
      {
        name: "Fallout Starter Set",
        sorting: "a",
        color: "#4d6a79",
        packs: ["starter-set-adventure", "starter-set-rolltables", "starter-set-actors"],
        folders: [],
      },
    ],
    media: [
      {
        type: "setup",
        caption: "Once Upon a Time in the Commonwealth",
        thumbnail: pageImageSrc(1),
      },
    ],
    manifest: "",
    download: "",
  };
  fs.writeFileSync(path.join(ROOT, "module.json"), JSON.stringify(manifest, null, 2));
}

async function writeAdventurePack(data) {
  ensureCleanDir(ADVENTURE_PACK);
  const db = new ClassicLevel(ADVENTURE_PACK, { valueEncoding: "json" });
  await db.open();

  const journalFolder = makeFolder("Adventure Journals", "JournalEntry", 100000, null, "#526653");
  const appendixFolder = makeFolder("Facsimile Pages", "JournalEntry", 200000, null, "#705e39");
  const embeddedTableFolder = makeFolder("Embedded Tables", "RollTable", 300000, null, "#5f4c79");
  const actorFolder = makeFolder("Starter Set Actors", "Actor", 400000, null, "#6a4f4f");

  const journals = [];
  let journalSort = 100000;
  for (const chapter of data.chapters) {
    const pages = [
      makeImagePage(`${chapter.title} Cover`, pageImageSrc(chapter.coverPage), 100000),
    ];
    let pageSort = 200000;
    for (const section of chapter.sections) {
      pages.push(makeTextPage(section.title, section.html, pageSort));
      pageSort += 100000;
    }
    journals.push(
      makeJournal(chapter.title, journalFolder._id, pages, journalSort)
    );
    journalSort += 100000;
  }

  const facsimilePages = data.pageImages.map((image, index) =>
    makeImagePage(image.name, image.src, (index + 1) * 100000, true)
  );
  journals.push(
    makeJournal(
      "Starter Booklet Facsimiles",
      appendixFolder._id,
      facsimilePages,
      journalSort,
      "icons/sundries/documents/document-sealed-red-tan.webp"
    )
  );
  journals.push(
    makeJournal(
      "GM Roster & Story NPCs",
      journalFolder._id,
      STORY_NPC_PAGES.map((page, index) => makeTextPage(page.title, page.html, (index + 1) * 100000)),
      journalSort + 100000,
      "icons/sundries/documents/blueprint-axe.webp"
    )
  );

  const embeddedTables = data.rollTables.map((table, index) =>
    makeRollTable(table.name, table.results, table.formula, embeddedTableFolder._id, (index + 1) * 100000)
  );
  const embeddedActors = STARTER_SET_ACTORS.map((actor) => buildActorDocument(actor, actorFolder._id));

  const adventure = {
    _id: randomId(),
    name: "Once Upon a Time in the Commonwealth",
    img: pageImageSrc(1),
    description:
      "<p>This starter adventure packages the supplied Fallout starter-set booklet into a Foundry-ready structure with chapter journals, full booklet facsimiles, and native roll tables for the random loot appendix.</p>",
    actors: embeddedActors,
    combats: [],
    items: [],
    scenes: [],
    journal: journals,
    tables: embeddedTables,
    macros: [],
    cards: [],
    playlists: [],
    folders: [journalFolder, appendixFolder, embeddedTableFolder, actorFolder],
    sort: 0,
    flags: {},
    caption: "Starter Set Adventure",
    _stats: stats("Adventure"),
    folder: null,
  };

  await db.put(`!adventures!${adventure._id}`, adventure);
  await db.close();
}

async function writeRolltablePack(data) {
  ensureCleanDir(ROLLTABLE_PACK);
  const db = new ClassicLevel(ROLLTABLE_PACK, { valueEncoding: "json" });
  await db.open();

  const folder = makeFolder("Starter Set Tables", "RollTable", 100000, null, "#5f4c79");
  await db.put(`!folders!${folder._id}`, folder);
  for (let index = 0; index < data.rollTables.length; index += 1) {
    const table = data.rollTables[index];
    const document = makeRollTable(table.name, table.results, table.formula, folder._id, (index + 1) * 100000);
    await db.put(`!tables!${document._id}`, document);
  }
  await db.close();
}

async function writeActorPack() {
  ensureCleanDir(ACTOR_PACK);
  const db = new ClassicLevel(ACTOR_PACK, { valueEncoding: "json" });
  await db.open();

  const humansFolder = makeFolder("Humans & Synths", "Actor", 100000, null, "#6a4f4f");
  const creaturesFolder = makeFolder("Creatures", "Actor", 200000, null, "#4f6a59");
  const robotsFolder = makeFolder("Robots", "Actor", 300000, null, "#4f5f79");
  for (const folder of [humansFolder, creaturesFolder, robotsFolder]) {
    await db.put(`!folders!${folder._id}`, folder);
  }

  for (const definition of STARTER_SET_ACTORS) {
    const folderId =
      definition.type === "creature"
        ? creaturesFolder._id
        : definition.type === "robot"
          ? robotsFolder._id
          : humansFolder._id;
    const document = buildActorDocument(definition, folderId);
    await db.put(`!actors!${document._id}`, document);
  }

  await db.close();
}

function updatePackageJson() {
  const packagePath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  pkg.type = "module";
  pkg.scripts = {
    build: "node scripts/build_module.mjs",
  };
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function writeReadme(data) {
  const readme = `# Fallout Starter Set Module

This workspace now builds a Foundry VTT module for the Fallout 2d20 system from the supplied starter-set references.

## What it generates

- \`module.json\` for the \`${MODULE_ID}\` package
- An \`Adventure\` compendium with chapter journals, booklet facsimiles, and embedded loot tables
- A separate \`RollTable\` compendium for the starter loot appendix
- A separate \`Actor\` compendium for starter-set threats, allies, and reusable NPC profiles
- Rendered booklet page art in \`assets/starter-set/pages/\`

## Source inputs

- \`Reference/FalloutStarterSet_Adventure_Booklet-20220228 conv.docx\`
- \`Reference/FalloutStarterSet_Adventure_Booklet-20220228.pdf\`
- Fallout system metadata under \`Reference/system.json\`

## Build

\`\`\`bash
npm run build
\`\`\`

## Notes

- The adventure content is generated from the converted DOCX for cleaner text sections.
- The page art is rendered directly from the PDF so the visual reference stays close to the printed booklet.
- The roll tables are recreated as native Foundry \`RollTable\` documents for quick use at the table.
- This pass now includes a starter-set actor roster for the named combatants, encounter creatures, robots, and reusable Diamond City support profiles.
- Pregenerated PCs are intentionally not bundled here; the module assumes you already have those sheets available.

## Generated chapter journals

${data.chapters.map((chapter) => `- ${chapter.title}`).join("\n")}
`;
  fs.writeFileSync(path.join(ROOT, "README.md"), readme);
}

async function main() {
  runExtractor();
  const data = readData();
  fs.mkdirSync(PACKS_DIR, { recursive: true });
  await writeAdventurePack(data);
  await writeRolltablePack(data);
  await writeActorPack();
  writeModuleManifest();
  updatePackageJson();
  writeReadme(data);
  console.log("Built Fallout starter set module.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
