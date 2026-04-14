# Fallout Starter Set Module

This workspace now builds a Foundry VTT module for the Fallout 2d20 system from the supplied starter-set references.

## What it generates

- `module.json` for the `fallout-starter-set-commonwealth` package
- An `Adventure` compendium with chapter journals, booklet facsimiles, and embedded loot tables
- A separate `RollTable` compendium for the starter loot appendix
- Rendered booklet page art in `assets/starter-set/pages/`

## Source inputs

- `Reference/FalloutStarterSet_Adventure_Booklet-20220228 conv.docx`
- `Reference/FalloutStarterSet_Adventure_Booklet-20220228.pdf`
- Fallout system metadata under `Reference/system.json`

## Build

```bash
npm run build
```

## Notes

- The adventure content is generated from the converted DOCX for cleaner text sections.
- The page art is rendered directly from the PDF so the visual reference stays close to the printed booklet.
- The roll tables are recreated as native Foundry `RollTable` documents for quick use at the table.
- This first pass focuses on journals, page art, and tables. It leaves room for later expansion into pregenerated actors, scenes, and map-driven encounter setup.

## Generated chapter journals

- Introduction
- Into Vault 95
- The Boston Ruins
- The Promised Land
- Loot Tables
