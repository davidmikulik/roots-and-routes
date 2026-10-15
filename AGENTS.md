# AGENTS.md – Roots & Routes (Naše kořeny)

Genealogická webová aplikace: import GEDCOM, zobrazení předků na mapě (Leaflet) a ve stromu, editace osob, slučování GEDCOM souborů, správa známých lokalit.

- **Produkce:** https://nase-koreny.mikulik.com (Vercel, region `iad1`). Vercel nasazuje automaticky po každém pushi do `master` (Git integrace).
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
| `server/utils/backups.ts`, `server/routes/api/admin/backups*` | Zálohy celého stromu v Blobu (`uploads/gedcom/backups/<id>.ged` + přílohy v `backups/<id>/media/`), výpis, ruční vytvoření a obnova |
| `server/utils/media.ts`, `server/routes/api/media/*` | Kopie obrázků a dokumentů z odkazů osob v Blobu (`uploads/gedcom/media/<uuid>.<ext>`): `POST /api/media/copy` stáhne soubor z odkazu, `POST /api/media/upload` uloží soubor ze schránky, `GET /api/media/<name>` ho vrátí. Obojí jen pro admina |
| `app/pages/graph.vue`, `app/components/FamilyTreeChart.vue`, `TreePersonCard.vue` | Grafický strom (`/graph`): stránka s výběrem osoby, plátno s posunem a přiblížením (d3-zoom), karta osoby. Zadání: `docs/graficky-strom-zadani.md` |
| `utils/gedcom/treeGraph.ts` | Čistá datová vrstva grafického stromu: GEDCOM → vstup `relatives-tree`, rozložení, rozměry karet. Kontroly: `npm run check:graph -- get.json` (stažený s admin tokenem, viz skill `change-graph-tree`) |
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
- **Anonymní režim je pro nepřihlášené vždy zapnutý** (`useAnonymize`: `!isAdmin || nastavení`). Nepřihlášený navíc dostává ze serveru jen anonymní kopii dat (viz další bod), takže `useAnonymize` u něj maskuje už anonymní data a pro přihlášeného admina slouží jako volitelné zobrazení (např. při promítání). Nové místo, které zobrazuje jméno, datum nebo místo, musí projít přes `anon.name/date/place`.
- **Anonymní data ze serveru:** `GET /api/gedcom/get` bez platného admin tokenu vrací kopii z `server/utils/anonymizeGedcom.ts` (iniciály, jen rok, bez míst, souřadnic, poznámek, zdrojů, adres a médií; zůstávají id, pohlaví, rodiny a typy událostí) a v odpovědi `data.anonymized: true`. Mapa je proto pro nepřihlášené prázdná. Odpověď má `cache-control: private, no-store` a `vary: Authorization`. Store si to pamatuje ve `state.anonymized`: na anonymních datech nejde editovat, ukládat ani exportovat (`requireEditable`), jinak by se skutečný strom přepsal iniciálami. Po přihlášení nebo odhlášení store data sám znovu načte (jeden odpojený watcher na `isAdmin`), `refreshFromServer` si předem obnoví token z localStorage a starší odpověď nepřepíše novější. Nové pole v typech, které nese osobní údaj, přidej do anonymizace (výchozí je vynechat ho).
- **Bubliny (`app/components/HoverTip.vue`):** zobrazují se při najetí i při fokusu (klepnutí na telefonu) a hlídají okraj obrazovky. Bez `text` se vykreslí jen obsah. Roky života (celé datum) řeší `app/components/LifespanTips.vue`, použitá v tabulce i v detailu osoby; zeměpisné události (místo) se zobrazují jen v detailu; v anonymním režimu datum bublinu nemá a místo je nahrazeno textem „Skryto v anonymním režimu“. Datum se formátuje z textu GEDCOM (`utils/gedcom/dates.ts`), ne z `Date`, který se mezi časovými pásmy posouvá. Při testování v headless Chrome používej `scrollIntoView({ behavior: 'instant' })`, protože `html` má `scroll-behavior: smooth`.
- **Grafický strom (`/graph`):** rozložení počítá `relatives-tree` (jen pozice a spojnice), karty jsou naše HTML. Balíček má ES moduly bez přípon v importech, proto je v `nuxt.config.ts` `build.transpile: ['relatives-tree']` (bez toho spadne prerender a Node ho nenačte, ve skriptech použij `npx jiti`). Knihovna zobrazí děti *páru*: dítě s jedním známým rodičem by u rodiče s dalším partnerem zmizelo, proto `buildTreeNodes` vymýšlí neznámého partnera (`unknown-…`, není v souboru GEDCOM, na kartě „Osoba není zapsána“). Půlsourozenci se u kořene nezobrazují a druhý partner může být umístěn na okraji skupiny sourozenců. Objekty d3 jsou v proměnných mimo reaktivitu. Plátno sleduje změnu kořene i bez změny pozic (členové jedné rodiny mají stejné rozložení). Při změně `treeGraph.ts` spusť `npm run check:graph -- <get.json>` (stáhni `GET /api/gedcom/get` s admin tokenem; bez něj přijdou anonymní data, kterým chybí místa a celá data).
- **Jména:** `names[].full` je jméno pro zobrazení **bez lomítek** (`Jan Mikulik`). Rozklad řádku GEDCOM `NAME` i zpětný zápis s lomítky (`Jan /Mikulik/`) řeší `utils/gedcom/names.ts` (`parseGedcomName`, `nameToGedcom`), parser i export ho používají. Data uložená před touto opravou se čistí při načtení v `deserializeGedcomFile`. Lomítka do zobrazovaných jmen nikdy neskládej.
- **Číslo a čas buildu:** `nuxt.config.ts` je při každém buildu (i při startu dev serveru) spočítá do `runtimeConfig.public.build`: `number` je čas buildu v UTC ve tvaru `YYYYMMDD.HHMM`, `commit` je z `VERCEL_GIT_COMMIT_SHA` (na Vercelu) nebo z gitu, `version` z `package.json`. Zobrazuje se v Nastavení → O aplikaci. Čas se vykresluje až v prohlížeči, protože server neví, v jakém časovém pásmu je návštěvník (jinak by Vue hlásilo nesoulad při hydrataci).
- **Značky na mapě (`assets/css/leaflet.css`):** Leaflet umisťuje značku přes `transform` na prvku `.custom-marker-icon`. Na tento prvek nikdy nedávej `transform` ani `transition` (ani v `:hover`), jinak značka při najetí myší skočí do levého horního rohu mapy a nejde na ni kliknout. Zvětšení a styl patří na vnitřní `div` (`makeIcon`). Totéž platí pro `.marker-cluster`.
- **Mapa a detail osoby:** klepnutí na značku neotevírá Leaflet popup, ale panel `MapPersonPanel.vue` (na telefonu spodní panel, od `sm` karta vpravo nahoře, protože mapa je vyšší než okno). Vybraná značka se zvýrazní (`makeIcon` + `setIcon`), `revealMarker` posune mapu, aby značku panel nezakrýval, a klepnutí do prázdné mapy nebo Esc detail zavře. Příbuzný v panelu přepne výběr na jeho značku (`goToEvent`, u shluků přes `zoomToShowLayer`). Panel zobrazuje jen události, které prošly filtry mapy (`eventsByPerson`). Značky držíme v `Map` mimo reaktivitu. Mapa je vyšší než okno a na telefonu začíná pod okrajem obrazovky: výběr značky proto stránku doroluje, aby byla mapa vidět celá, a panel se drží viditelné části mapy (CSS proměnné `--panel-top/bottom/max` z `updatePanelInset`).
- **`useGedcomStore()` volej jen ve stránkách, ne v komponentách.** Každé volání registruje `onMounted`, který znovu stáhne strom ze serveru a přepíše store. V komponentě (např. panel na mapě) to znamená nové stažení při každém zobrazení a mapa pak přestaví všechny značky. Komponentám předávej data přes props.
- **Navigace:** odkazy jsou jednou v poli `navLinks` v `app/app.vue` a používá je desktopové i mobilní menu (pod 768 px, tlačítko ☰). Nová stránka se přidá jen tam a do `i18n/common.ts`.
- **Výška mapy:** `.leaflet-container` v `assets/css/leaflet.css` nesmí mít `height`. Přebilo by `h-[70vh]` na `#map-container` a mapa by byla na telefonu a tabletu (jednosloupcové rozložení, rodič bez pevné výšky) vysoká 0 px. Na desktopu to nebylo vidět, protože mřížka roztáhne rodiče podle bočního panelu. Layout mapy ověřuj v emulaci mobilu (viewport 390×844 a 820×1180 s `mobile: true`), ne jen na desktopu.
- `nuxt.config.ts` prerenderuje `/`, `/map`, `/tree` a `/gedcom` a pro `/**` posílá `cache-control: public, max-age=3600`. Data se proto musí načítat až na klientu (`onMounted`), ne při SSR.
- **Všechny zápisy jsou jen pro admina.** `server/middleware/adminWrites.ts` vyžaduje `Authorization: Bearer <ADMIN_API_TOKEN>` u každého požadavku na `/api/**` kromě GET/HEAD/OPTIONS a u všeho pod `/api/admin/**`. Endpointy `import`, `save` a `delete` navíc samy volají `requireAdminToken`. `/api/gedcom/export` je jen pro admina. Veřejné zůstává jen `/api/gedcom/get`, a to s anonymními daty. Na klientu drží token `composables/useAdminAuth.ts` (v localStorage, obnovuje se v `onMounted` v `app.vue`). Přihlášení řeší `app/components/AdminLogin.vue` (zámek v hlavičce) a ověřuje ho `GET /api/admin/verify`. Každá nová mutace ve storu musí volat `requireEditable()` (admin + data nejsou anonymní) a posílat `adminAuth.authHeaders()`. Editační UI skrývej přes `adminAuth.isAdmin.value`.
- `server/middleware/auth.ts` vyžaduje token pro všechny routy, pokud je nastavené `API_TOKEN`. Admin lokalit používá zvlášť `ADMIN_API_TOKEN` (`server/utils/adminAuth.ts`).
- V kódu jsou záměrně ponechané `console.log` s prefixy `[GEDCOM]`, `[GEDCOM GET]`, `[STORAGE]`, které pomáhají při ladění na produkci (Vercel logy).

- **Nastavení a jazyk:** stránky nesmí mít natvrdo psaný text, ale `t('klíč')`. Nový klíč přidej do `i18n/<stránka>.ts` v obou jazycích. Nastavení se načte až v `onMounted` v `app.vue` (`useSettings().restore()`), protože stránky se prerenderují. Dělá-li stránka z nastavení počáteční hodnotu, musí si ji nastavit i po `appSettings.ready` (viz `tree.vue`, `map.vue`). Přepínač motivu nastavuje `colorMode.preference`, ne `colorMode.value`, jinak se volba neuloží.
- **Automatické ukládání vypnuté:** úpravy se jen označí `state.dirty` a na server jdou až přes `saveNow()` (tlačítko ve stromu). Dokud je `dirty`, `onMounted` ve storu nepřepisuje data ze serveru a `app.vue` varuje před zavřením stránky.
- **Import:** `POST /api/gedcom/import` má pole `mode` (`replace` | `merge`), `backupOnImport`, `backupCount`. Režim `merge` jen analyzuje soubor (lokality) a **nic neukládá**, sloučený strom ukládá klient až po schválení. Pole formuláře musí být ve `FormData` až **za** souborem.
- **Export GEDCOM v UI** dělá `downloadGedcom()` ve storu: soubor sestaví v prohlížeči přes `writeGedcom` (celý strom včetně neuložených změn) a nabízí se jen přihlášenému adminovi (tlačítko v `/tree` → Zobrazení seznamu a v `/gedcom` po importu). Endpoint `/api/gedcom/export` je také jen pro admina.
- **Odkazy osoby (editor v `/tree`):** libovolný počet, každý s povinnou adresou i popisem (`saveLinks` ve storu jinak uložení odmítne). V GEDCOM je každý odkaz záznam `0 @M1@ OBJE` (`1 FILE`, pod ním `2 FORM` a `2 TITL`) a osoba na něj odkazuje `1 OBJE @M1@`. Obyčejný odkaz má `FILE` = webová adresa a `FORM url`. Tlačítko **Zkopírovat** pošle adresu na `POST /api/media/copy`: server soubor stáhne (jen `http(s)`, žádné adresy soukromých sítí ani po přesměrování, max. 20 MB, jen obrázky JPG/PNG/GIF/WEBP a dokumenty PDF/TXT/RTF/DOC(X)/ODT/XLS(X)/ODS podle `Content-Type`, případně přípony) a uloží ho do Blobu. Záznam pak má `FILE media/<uuid>.<ext>`, `FORM` podle typu a původní adresu ve vlastní značce `1 _URL`. Kopie jsou soukromé, prohlížeč je stahuje s tokenem. V detailu osoby se přílohy zobrazují stejně jako webové odkazy (`<a target="_blank">` se stejnou třídou): `tree.vue` je stáhne, když detail přílohy ukazuje (`fetchStoredMedia`), a odkáže na ně `blob:` URL. Obrázky, PDF a TXT se otevřou na nové kartě, ostatní dokumenty se stáhnou s názvem podle popisu (`download`). Při změně osoby nebo odchodu ze stránky se URL uvolní. V editoru „Otevřít kopii“ používá `openStoredMedia`. **Vložit ze schránky** (a Ctrl+V, když je kurzor v řádku odkazu) pošle soubor na `POST /api/media/upload` (tělo = soubor, typ v `Content-Type`, původní jméno v `?name=`). Tlačítko přes `navigator.clipboard.read()` umí jen obrázek, protože prohlížeče jiné soubory schránkovému API nedají. Dokument zkopírovaný v průzkumníku souborů projde jen přes Ctrl+V (`clipboardData.files`). Vercel přijme v jednom požadavku nejvýš 4,5 MB, proto je limit 4 MB: větší obrázek klient převede na JPEG (`shrinkImage`, případně ho zmenší), větší dokument odmítne. Odkaz s uloženým souborem nepotřebuje adresu, popis je povinný vždy. Změna adresy zruší vazbu na kopii jen tehdy, když byla kopie stažená z původní adresy (`copiedFrom`). Soubor vložený ze schránky zůstane. Odebraný odkaz smaže záznam `OBJE`, pokud ho nepoužívá nikdo jiný, ale soubor v Blobu zůstane (nemazat dřív, než se změna uloží). **Zálohy** (`server/utils/backups.ts`) ukládají k `<id>.ged` i kopie všech příloh, na které strom odkazuje, do `backups/<id>/media/<name>`. Kopíruje se přes `copy()` přímo v Blobu, nic se nestahuje. Chybějící příloha zálohu nezastaví, jen se zaloguje. Obnova vrátí do `media/` přílohy, které tam chybí. Promazání starých záloh maže i jejich přílohy. `listBackups` vrací i počet příloh (`attachments`) a velikost včetně nich. `list()` z Blobu vrací max. 1000 položek na stránku, proto `listAll` stránkuje. **Export** (`downloadGedcom`) je bez příloh obyčejný `.ged`, s přílohami ZIP ve struktuře GEDZIP (GEDCOM 7): `gedcom.ged` + `media/<name>`. Sestavuje ho prohlížeč přes `fflate` (načítá se až při exportu), přílohy stahuje s tokenem a ty, které se stáhnout nepodaří, ohlásí. Serverový `/api/gedcom/export` přílohy neobsahuje. Anonymní data pro návštěvníky odkazy nemají. V detailu osoby se jako odkaz vykreslí jen `http(s)` adresa, jinak text (kvůli `javascript:` z importu).
- **`setFile` musí zachovat `fileId`.** Úpravy ho volají bez id. Kdyby ho vynuloval, `saveToServer` by se tiše přeskočil a změny by se po dalším načtení stránky ztratily.

## Příkazy (v `roots-and-routes/`)

```bash
npm run dev          # http://localhost:3000, vyžaduje .env s BLOB_READ_WRITE_TOKEN
npx vue-tsc --noEmit # typecheck (celý projekt má i starší chyby, filtruj změněné soubory)
npm run build        # nuxt build → .vercel/output; nejlepší rychlé ověření
npm run lint
npm run deploy       # vercel --prod; jen když automatický deploy po pushi neproběhl a uživatel ho výslovně vyžádá
```

Projekt nemá automatické testy. Změnu ověř buildem, typecheckem změněných souborů, případně ručně v `npm run dev`.

## Konvence

- Commit messages: krátké, buď česky, nebo ve tvaru `fix: …` / `improve: …`.
- Commituj a pushuj jen na výslovný pokyn. Push do `master` = nasazení na produkci (Vercel ho spustí sám), proto po pushi ověř, že produkce běží na novém commitu (Nastavení → O aplikaci). Ruční `npm run deploy` jen na výslovný pokyn, když automatický deploy neproběhl. Složka `roots-and-routes/` není propojená přes `vercel link`, takže se CLI zeptá na nastavení projektu: neodpovídej za uživatele a ověř s ním, který projekt vybrat.
- Sdílenou logiku pro klienta i server dávej do `utils/` (auto-import přes `imports.dirs`). Server-only kód patří do `server/utils/`.
