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
| `composables/useSettings.ts` | Uživatelská nastavení (jazyk, mapa, strom, data, soukromí) v localStorage, ukládají se automaticky; `sanitizeSettings` je validuje |
| `composables/useT.ts`, `i18n/` | Překlady EN/CS: `const { t } = useT()`; zprávy jsou po stránkách v `i18n/<stránka>.ts`, `defineMessages(en, cs)` hlídá, že čeština má všechny klíče |
| `composables/useAnonymize.ts` | Anonymní režim: jen zobrazení (jména → iniciály, data → rok, místa skrytá) |
| `composables/useAdminAuth.ts`, `app/components/AdminLogin.vue` | Admin token a přihlášení |
| `server/utils/backups.ts`, `server/routes/api/admin/backups*` | Zálohy celého stromu v Blobu (`uploads/gedcom/backups/<id>.ged`), výpis, ruční vytvoření a obnova |
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
- **JSON z `Date` udělá string.** `deserializeGedcomFile` proto vrací zpět na `Date` pole `parsed`, `date1`, `date2`, `sortDate`, `earliestDate` a `latestDate`. Bez toho padá `convertToFamilyTree` / `convertToAppPerson` na `date.parsed.getFullYear is not a function`, takže `/tree` po načtení ze serveru nic nezobrazí. Kdo do typů přidá nové pole typu `Date`, musí ho doplnit do `DATE_KEYS` v `utils/gedcom/serialize.ts`.
- **`useGedcomStore()` vrací obyčejný objekt s `ComputedRef`.** Ani v šabloně se nerozbalí, takže piš `gedcomStore.hasData.value`, `gedcomStore.totalIndividuals.value` atd. Výraz `!gedcomStore.hasData` je vždycky `false`.
- Staré `parsed/*.json` z doby před opravou mají mapy uložené jako `{}`. `loadParsedGedcom` pro ně vrací `null`. `get.get.ts` při nekonzistenci (metadata > 0, mapa prázdná) zkusí znovu naparsovat originální `.ged`.
- `listUserFiles()` vypisuje celý prefix `uploads/gedcom`, tedy i `parsed/*.json`, `exports/*` a `known-locations.json`. Záložní větev v `get.get.ts` („nejnovější soubor“) proto může vybrat soubor, který není GEDCOM.
- **Výška mapy:** `.leaflet-container` v `assets/css/leaflet.css` nesmí mít `height`. Přebilo by `h-[70vh]` na `#map-container` a mapa by byla na telefonu a tabletu (jednosloupcové rozložení, rodič bez pevné výšky) vysoká 0 px. Na desktopu to nebylo vidět, protože mřížka roztáhne rodiče podle bočního panelu. Layout mapy ověřuj v emulaci mobilu (viewport 390×844 a 820×1180 s `mobile: true`), ne jen na desktopu.
- `nuxt.config.ts` prerenderuje `/`, `/map`, `/tree` a `/gedcom` a pro `/**` posílá `cache-control: public, max-age=3600`. Data se proto musí načítat až na klientu (`onMounted`), ne při SSR.
- **Všechny zápisy jsou jen pro admina.** `server/middleware/adminWrites.ts` vyžaduje `Authorization: Bearer <ADMIN_API_TOKEN>` u každého požadavku na `/api/**` kromě GET/HEAD/OPTIONS a u všeho pod `/api/admin/**`. Endpointy `import`, `save` a `delete` navíc samy volají `requireAdminToken`. Veřejné zůstává jen čtení (`/api/gedcom/get`, `/api/gedcom/export`). Na klientu drží token `composables/useAdminAuth.ts` (v localStorage, obnovuje se v `onMounted` v `app.vue`). Přihlášení řeší `app/components/AdminLogin.vue` (zámek v hlavičce) a ověřuje ho `GET /api/admin/verify`. Každá nová mutace ve storu musí volat `adminAuth.requireAdmin()` a posílat `adminAuth.authHeaders()`. Editační UI skrývej přes `adminAuth.isAdmin.value`.
- `server/middleware/auth.ts` vyžaduje token pro všechny routy, pokud je nastavené `API_TOKEN`. Admin lokalit používá zvlášť `ADMIN_API_TOKEN` (`server/utils/adminAuth.ts`).
- V kódu jsou záměrně ponechané `console.log` s prefixy `[GEDCOM]`, `[GEDCOM GET]`, `[STORAGE]`, které pomáhají při ladění na produkci (Vercel logy).

- **Nastavení a jazyk:** stránky nesmí mít natvrdo psaný text, ale `t('klíč')`. Nový klíč přidej do `i18n/<stránka>.ts` v obou jazycích. Nastavení se načte až v `onMounted` v `app.vue` (`useSettings().restore()`), protože stránky se prerenderují. Dělá-li stránka z nastavení počáteční hodnotu, musí si ji nastavit i po `appSettings.ready` (viz `tree.vue`, `map.vue`). Přepínač motivu nastavuje `colorMode.preference`, ne `colorMode.value`, jinak se volba neuloží.
- **Automatické ukládání vypnuté:** úpravy se jen označí `state.dirty` a na server jdou až přes `saveNow()` (tlačítko ve stromu). Dokud je `dirty`, `onMounted` ve storu nepřepisuje data ze serveru a `app.vue` varuje před zavřením stránky.
- **Import:** `POST /api/gedcom/import` má pole `mode` (`replace` | `merge`), `backupOnImport`, `backupCount`. Režim `merge` jen analyzuje soubor (lokality) a **nic neukládá**, sloučený strom ukládá klient až po schválení. Pole formuláře musí být ve `FormData` až **za** souborem.
- **`setFile` musí zachovat `fileId`.** Úpravy ho volají bez id. Kdyby ho vynuloval, `saveToServer` by se tiše přeskočil a změny by se po dalším načtení stránky ztratily.

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
