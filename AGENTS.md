# AGENTS.md – Roots & Routes (Naše kořeny)

Genealogická webová aplikace: import GEDCOM, zobrazení předků na mapě (Leaflet) a ve stromu, editace osob, slučování GEDCOM souborů, správa známých lokalit.

- **Produkce:** https://nase-koreny.mikulik.com (Vercel, region `iad1`)
- **Repo:** https://github.com/davidmikulik/roots-and-routes, větev `master`
- **Jazyk:** UI, commity i komunikace s uživatelem jsou česky; identifikátory v kódu anglicky.

## Struktura

Aplikace je v podsložce `roots-and-routes/`, ne v kořeni repa. Všechny `npm` příkazy spouštěj tam.

| Cesta | Obsah |
|---|---|
| `app/pages/` | `index`, `map`, `tree`, `gedcom` (import/merge), `settings`, `admin/locations` |
| `composables/useGedcomStore.ts` | Jediný klientský store (`useState('gedcom-store')`): načítání, merge, editace, ukládání |
| `utils/gedcom/parser.ts` | `parseGedcom`, `writeGedcom`, `convertToFamilyTree`, `createMapEventsFromFile` |
| `utils/gedcom/serialize.ts` | `serializeGedcomFile` / `deserializeGedcomFile` (Map ↔ pole entries) |
| `utils/gedcom/locations.ts` | Normalizace názvů míst, doplnění souřadnic ze známých lokalit |
| `server/routes/api/gedcom/` | `import.post`, `get.get`, `save.post`, `delete.post`, `export.get` |
| `server/routes/api/admin/locations.*` | Katalog známých lokalit (vyžaduje `ADMIN_API_TOKEN`) |
| `server/utils/storage.ts` | Vercel Blob: upload, čtení, `saveParsedGedcom` / `loadParsedGedcom` |
| `types/gedcom.ts` | Datový model (`GedcomFile`, `GedcomIndividual`, …) |

Nuxt config: `srcDir: 'app/'`. `composables/`, `utils/` a `types/` leží mimo `srcDir`, takže se importují přes `~~/…`.

## Stack

Nuxt 3 (SSR + Nitro, preset `vercel`), Vue 3, TypeScript strict, Tailwind, Leaflet 1.9 (načítaný z unpkg CDN v `app.head`), `@vercel/blob` (private access).

## Tok dat

1. **Import** (`/gedcom` → `POST /api/gedcom/import`): server soubor naparsuje, doplní souřadnice z `known-locations.json` a uloží:
   - originál jako `uploads/gedcom/current.ged`
   - naparsovaná data jako `uploads/gedcom/parsed/current.json`

   Aplikace je single-user: pevné `fileId = 'current'`.
2. **Načtení:** `useGedcomStore()` volá v `onMounted` **na každé stránce** `GET /api/gedcom/get` a přepíše jím store. Když server nic nevrátí, použije se záloha z IndexedDB (`roots-and-routes` / `gedcom` / `current`, uložený GEDCOM text).
3. **Editace / merge / smazání osoby:** store změní data lokálně, uloží GEDCOM text do IndexedDB a pošle `POST /api/gedcom/save`.

## ⚠️ Důležité pasti

- **`GedcomFile` obsahuje `Map`.** `JSON.stringify(new Map())` vrací `{}`. Kdykoli `GedcomFile` putuje přes JSON (Blob, API odpověď, request body), **musí** projít přes `serializeGedcomFile` / `deserializeGedcomFile` z `utils/gedcom/serialize.ts`. Když se to zapomene, projeví se to takto: hned po importu se data zobrazí (mapy vznikly v prohlížeči), ale po přepnutí stránky je store prázdný, i když `GET` vrací správné `metadata.totalIndividuals`.
- Staré `parsed/*.json` z doby před opravou mají mapy uložené jako `{}`. `loadParsedGedcom` pro ně vrací `null`. `get.get.ts` při nekonzistenci (metadata > 0, mapa prázdná) zkusí znovu naparsovat originální `.ged`.
- `listUserFiles()` vypisuje celý prefix `uploads/gedcom`, tedy i `parsed/*.json`, `exports/*` a `known-locations.json`. Záložní větev v `get.get.ts` („nejnovější soubor“) proto může vybrat soubor, který není GEDCOM.
- `nuxt.config.ts` prerenderuje `/`, `/map`, `/tree` a `/gedcom` a pro `/**` posílá `cache-control: public, max-age=3600`. Data se proto musí načítat až na klientu (`onMounted`), ne při SSR.
- `server/middleware/auth.ts` vyžaduje token pro všechny routy, pokud je nastavené `API_TOKEN`. Admin lokalit používá zvlášť `ADMIN_API_TOKEN` (`server/utils/adminAuth.ts`).
- V kódu jsou záměrně ponechané `console.log` s prefixy `[GEDCOM]`, `[GEDCOM GET]`, `[STORAGE]`, které pomáhají při ladění na produkci (Vercel logy).

## Příkazy (v `roots-and-routes/`)

```bash
npm run dev          # http://localhost:3000, vyžaduje .env s BLOB_READ_WRITE_TOKEN
npx vue-tsc --noEmit # typecheck (celý projekt má i starší chyby, filtruj změněné soubory)
npm run build        # nuxt build → .vercel/output; nejlepší rychlé ověření
npm run lint
npm run deploy       # vercel --prod (jen na výslovný pokyn uživatele)
```

Projekt nemá automatické testy. Změnu ověř buildem, typecheckem změněných souborů, případně ručně v `npm run dev`.

## Konvence

- Commit messages: krátké, buď česky, nebo ve tvaru `fix: …` / `improve: …`.
- Commituj, pushuj a deployuj jen na výslovný pokyn.
- Sdílenou logiku pro klienta i server dávej do `utils/` (auto-import přes `imports.dirs`). Server-only kód patří do `server/utils/`.
