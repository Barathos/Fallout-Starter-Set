import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ClassicLevel } from "classic-level";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "build");
const DATA_PATH = path.join(BUILD, "starter-set-data.json");
const MODULE_ID = "fallout-starter-set-commonwealth";
const PACKS_DIR = path.join(ROOT, "packs");
const ADVENTURE_PACK = path.join(PACKS_DIR, "starter-set-adventure");
const ROLLTABLE_PACK = path.join(PACKS_DIR, "starter-set-rolltables");

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
    ],
    packFolders: [
      {
        name: "Fallout Starter Set",
        sorting: "a",
        color: "#4d6a79",
        packs: ["starter-set-adventure", "starter-set-rolltables"],
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

  const embeddedTables = data.rollTables.map((table, index) =>
    makeRollTable(table.name, table.results, table.formula, embeddedTableFolder._id, (index + 1) * 100000)
  );

  const adventure = {
    _id: randomId(),
    name: "Once Upon a Time in the Commonwealth",
    img: pageImageSrc(1),
    description:
      "<p>This starter adventure packages the supplied Fallout starter-set booklet into a Foundry-ready structure with chapter journals, full booklet facsimiles, and native roll tables for the random loot appendix.</p>",
    actors: [],
    combats: [],
    items: [],
    scenes: [],
    journal: journals,
    tables: embeddedTables,
    macros: [],
    cards: [],
    playlists: [],
    folders: [journalFolder, appendixFolder, embeddedTableFolder],
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
- This first pass focuses on journals, page art, and tables. It leaves room for later expansion into pregenerated actors, scenes, and map-driven encounter setup.

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
  writeModuleManifest();
  updatePackageJson();
  writeReadme(data);
  console.log("Built Fallout starter set module.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
