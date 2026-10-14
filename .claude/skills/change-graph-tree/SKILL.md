---
name: change-graph-tree
description: Úpravy grafického stromu v Roots & Routes (/graph, utils/gedcom/treeGraph.ts, FamilyTreeChart, TreePersonCard, relatives-tree, d3-zoom). Použij při změně rozložení, karet, spojnic, posunu a přiblížení stromu.
---

# Grafický strom (`/graph`)

Zadání je v `docs/graficky-strom-zadani.md` (kořen repa).

## Vrstvy

| Soubor | Role |
|---|---|
| `utils/gedcom/treeGraph.ts` | Čistá data: GEDCOM → uzly `relatives-tree`, `computeLayout`, `limitGenerations`, rozměry karet. Žádné Vue. |
| `app/components/FamilyTreeChart.vue` | Plátno: spojnice, karty, posun a přiblížení (d3-zoom). |
| `app/components/TreePersonCard.vue` | Karta osoby (HTML). |
| `app/pages/graph.vue` | Výběr kořene (`?root=<id>`), nastavení, stav načítání. |

## Pasti

- `relatives-tree` počítá jen pozice a spojnice. Jeho ES moduly nemají přípony, proto je v `nuxt.config.ts` `build.transpile: ['relatives-tree']`. Ve skriptech mimo Nuxt používej `npx jiti`.
- Knihovna zobrazuje děti *páru*. Dítě s jedním známým rodičem by zmizelo, proto `buildTreeNodes` vymýšlí partnera `unknown-…`. Takový partner není v GEDCOM, karta píše „Osoba není zapsána“ (`isUnknownPartner`). Neukládej ho do souboru.
- Objekty d3 drž v proměnných mimo reaktivitu.
- Plátno musí reagovat na změnu kořene, i když se pozice nezmění, protože členové jedné rodiny mají stejné rozložení.
- Jména na kartách přes `anon.name`, roky přes `anon.date`.

## Ověření

```bash
cd roots-and-routes
curl -s https://nase-koreny.mikulik.com/api/gedcom/get -o <scratchpad>/get.json
npm run check:graph -- <scratchpad>/get.json   # každá osoba jako kořen; exit 1 = chyba
```
Bez argumentu se spustí jen syntetické případy. Potom skill `verify-change` a vizuálně skill `test-ui` (posun, přiblížení, telefon).
