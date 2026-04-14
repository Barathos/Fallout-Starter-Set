# Fallout Starter Set Module

This workspace now builds a Foundry VTT module for the Fallout 2d20 system from the supplied starter-set references.

## What it generates

- `module.json` for the `fallout-starter-set-commonwealth` package
- An `Adventure` compendium with chapter journals, booklet facsimiles, and embedded loot tables
- A separate `RollTable` compendium for the starter loot appendix
- A separate `Actor` compendium for starter-set threats, allies, and reusable NPC profiles
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
- This pass now includes a starter-set actor roster for the named combatants, encounter creatures, robots, and reusable Diamond City support profiles.
- Pregenerated PCs are intentionally not bundled here; the module assumes you already have those sheets available.

## Generated chapter journals

- Introduction
- Into Vault 95
- The Boston Ruins
- The Promised Land
- Loot Tables
