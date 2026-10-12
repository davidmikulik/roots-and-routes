---
name: debug-gedcom-data
description: Diagnostika, když se v Roots & Routes nezobrazují data rodokmenu (prázdná mapa/strom, data mizí po přepnutí stránky, chyby při ukládání). Použij při hlášení typu "data jsou prázdná", "po importu se nic nezobrazí", "úpravy se neuloží".
---

# Diagnostika chybějících GEDCOM dat

Aplikace je v `roots-and-routes/`. Architekturu popisuje `AGENTS.md` v kořeni repa.

## 1. Urči, kde se data ztrácejí

| Příznak | Nejpravděpodobnější příčina |
|---|---|
| Hned po importu OK, po přepnutí stránky prázdno | Odpověď `GET /api/gedcom/get` přišla s `Map` → `{}`. Chybí `serializeGedcomFile` na serveru nebo `deserializeGedcomFile` v `loadFromServer` (`composables/useGedcomStore.ts`). |
| `GET` vrací `success: false` | `parsed/current.json` v Blobu chybí nebo je ve starém formátu a `loadParsedGedcom` vrátil `null`. Ověř, že existuje `uploads/gedcom/current.ged` pro re-parse. |
| Úpravy osob se po reloadu ztratí | `POST /api/gedcom/save` padá. Body musí být `serializeGedcomFile(file)` a server musí volat `deserializeGedcomFile`. |
| Funguje jen na jednom zařízení | Data jsou jen v IndexedDB (fallback), server je nemá. Zkontroluj, jestli proběhl import přes server. |
| 401 na všech API | Je nastavené `API_TOKEN`, takže `server/middleware/auth.ts` blokuje všechny routy. |

## 2. Ověř odpověď serveru

V odpovědi `GET /api/gedcom/get` musí být `data.file.individuals` **pole dvojic** `[["@I1@", {...}], ...]`. Pokud je to objekt `{}`, je rozbitá serializace.

V konzoli prohlížeče:
```js
const r = await $fetch('/api/gedcom/get'); console.log(r.data.file.metadata, Array.isArray(r.data.file.individuals), r.data.file.individuals.length)
```

Ve Vercel logech hledej prefixy `[GEDCOM GET]` a `[STORAGE]`, hlavně hlášku `Corrupted parsed data detected`.

## 3. Pravidlo pro opravy

Každé místo, kde `GedcomFile` prochází přes JSON, musí používat `utils/gedcom/serialize.ts`. Hledej:
```bash
grep -rn "fileData\|data\.file\|JSON.stringify" roots-and-routes/server roots-and-routes/composables
```

## 4. Ověření

```bash
cd roots-and-routes && npx vue-tsc --noEmit 2>&1 | grep -E "<změněné soubory>" ; npm run build
```
Pak ručně: import → `/map` → `/tree` → reload. Data musí zůstat.
