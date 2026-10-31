# Zadání: Fáze 1 – zdroj jako záznam a bezpečné ukládání změn

> **Stav: implementováno ve verzi 1.13.0** (31. 10. 2026), viz kapitola 11 (odchylky, zjištění, rozhodnutí otevřených otázek). Původní text návrhu: Vychází z toho, co se ukázalo při zapisování 35 zdrojů do stromu přes API: nálezy z matrik, sčítání lidu a katastru se do aplikace ukládají obtížně, přepis a překlad se píší do poznámek a změny přepisují celý strom. Zadání je fáze 1 ze tří (části A a C původního návrhu). Fáze 2 (varianty údajů, hypotézy, varianty jmen) a fáze 3 (deník hledání, domy, přehled „co chybí“) se zadají samostatně.

Cíl: aby se **každý nález z matriky** dal do aplikace uložit jako jeden přehledný záznam (archiv, kniha, snímek, přepis, překlad, obrázek, lidé v rolích) a aby šly změny **bezpečně navrhovat automaticky a schvalovat v aplikaci**, s historií a možností vrátit je zpět.

Před prací si přečti [AGENTS.md](../AGENTS.md), hlavně kapitolu „Důležité pasti“ (serializace `Map` a `Date`, `useGedcomStore()` jen ve stránkách, i18n, anonymizace, novinky a O aplikaci, `setFile` a `fileId`). Postup ověření je ve skillech `verify-change`, `add-api-endpoint` a `edit-store-data`.

## 1. Co dnes nejvíc překáží (z praxe)

| Problém | Příklad |
|---|---|
| Zdroj je jen odkaz a název (OBJE). Přepis a překlad se píší do poznámky u každého člověka zvlášť. | Sčítání lidu 1921 má 6 osob: stejný odkaz je připojen šestkrát ručně, přepis je v poznámkách. |
| Kmotři, svědci a členové domácnosti nejsou nikam napojeni. | Josef a Jan Huzlíkovi byli kmotry u obou dětí v Dešné č. 2, ve stromu o tom není nic. |
| Uložení přepíše celý strom (`POST /api/gedcom/save`). | Souběžná úprava v prohlížeči by přepsala nálezy, nebo naopak. |
| Žádná historie ani vrácení změn. | Opravy dat u sourozenců (např. úmrtí 5. 1. → 28. 1. 1920) nejdou jedním kliknutím vrátit. |
| Přihlášení jen heslem, relace 30 dní. | Pro automatické zápisy se heslo zadává znovu. |

## 2. Rozsah

**Ve fázi 1 ano**
- **A. Zdroj jako záznam**: nový typ záznamu s poli, přepisem a překladem, obrázky a rolemi lidí; zobrazení u osob; výběr existujícího zdroje při úpravě osoby.
- **C. Bezpečné ukládání**: dávky změn po osobách a rodinách místo přepsání stromu, kontrola verze, **čekající změny se schválením v aplikaci**, historie s vrácením zpět, **osobní přístupový klíč** pro automat.
- Ruční **převod** stávajícího odkazu (OBJE) na zdroj-záznam tlačítkem; stávající odkazy zůstávají funkční.

**Ve fázi 1 ne** (patří do dalších fází, nic z toho nepřipravovat „napřed“)
- Víc variant jednoho údaje a stupně jistoty u údajů, hypotézy, varianty jmen (fáze 2).
- Deník hledání, domy a místa, panel „co chybí“ (fáze 3).
- Hromadný import balíčku z externího projektu (jen to, co je v kapitole 5 jako formát dávky).

## 3. Datový model: zdroj jako záznam

Aplikace už má v modelu (`types/gedcom.ts`) **`GedcomSource`** (`title`, `author`, `publication`, `repository`, `text`, `type`, `multimediaLinks`, `notes`), **`GedcomSourceCitation`** (`xref`, `page`, `text`, `confidence` 0–3, `notes`) a **`GedcomRepository`**. Parser citace `SOUR` pod událostmi čte do `GedcomEvent.sourceCitations` (**implementátor ověří, že se při zápisu GEDCOM a při uložení zachovají**). Editor je ale nepoužívá: zdrojem údaje je dnes vždy odkaz (OBJE). **Navrhované řešení využívá to, co v modelu je**, a nevymýšlí paralelní strukturu, aby se zdroje zachovaly při exportu a importu GEDCOM.

| Údaj | Kam v GEDCOM / modelu |
|---|---|
| Název zdroje (např. „Křest 11. 6. 1826, N Všemina 1785–1839, snímek 129“) | `SOUR.TITL` |
| Archiv a portál | záznam `REPO` (`name` = Moravský zemský archiv v Brně; `web` = adresa) a `SOUR.REPO` |
| Kniha a signatura | `SOUR.PUBL` (např. „N Všemina 1785–1839, č. knihy 4974“) |
| Snímek a číslo zápisu | `citation.page` (např. „snímek 129, zápis č. 7“) |
| **Přepis originálu** | `SOUR.TEXT` (nebo `citation.text` pro jeden zápis na stránce) |
| **Český překlad** | `NOTE` zdroje; v UI vlastní pole „Překlad“ |
| Jazyk zápisu | vlastní značka `_LANG` (`cs`, `de`, `la`) v `userData.extraTags` |
| Odkaz do archivu | `OBJE` s `FORM url`, zachovat stávající mechanismus odkazů |
| Obrázek (výřez) | `OBJE` s přílohou, zachovat `POST /api/media/copy` a `upload` |
| Jistota | `citation.confidence`: 3 doloženo přímo v zápisu, 2 pravděpodobné, 1 od rodiny, 0 z cizího zdroje |
| Kdo a kdy ověřil | vlastní značky `_VERIFIED_BY`, `_VERIFIED_AT` v `userData.extraTags` |

### Role lidí ve zdroji
Zdroj nese seznam **účastníků**: osoba + role (`křtěnec`, `otec`, `matka`, `kmotr`, `svědek`, `ženich`, `nevěsta`, `zemřelý`, `člen domácnosti`, `jiné`) a volitelně věk a poznámka (např. „59 (?) let“). Uložení: vlastní značka `_PART` v `userData.extraTags` (`@I500085@`, podřízené `ROLE`). **Implementátor ověří, že `extraTags` zvládají podřízené řádky**, jinak použije podřízenou strukturu přímo v `GedcomSource`.

Navíc se z rolí `kmotr` a `svědek` vytvoří **vazba `ASSO`** (`RELA godparent` / `witness`) na příslušné osoby. `GedcomIndividual.associations` v modelu už je.

### Co se stane u osoby
- Údaje osoby (jméno, narození, úmrtí, sňatek) mohou **citovat zdroj** (`sourceCitations` s `page` a `confidence`) a navíc zůstává stávající odkaz (OBJE) – oba způsoby se zobrazí společně a nesmí se duplicitně počítat.
- Detail osoby ukáže **seznam zdrojů** (název, jistota, role osoby) s rozbalitelným přepisem a překladem, obrázkem a tlačítkem „Otevřít v archivu“.
- Anonymní kopie pro návštěvníky zdroje, přepisy a překlady **neobsahuje** (to už platí pro zdroje a poznámky, nové pole nesmí tuto kontrolu obejít; viz `server/utils/anonymizeGedcom.ts`).

## 4. Uživatelské rozhraní

1. **Stránka „Zdroje“** (odkaz v `allNavLinks` v `app/app.vue`, jen pro ty, kdo smí číst vybranou základnu): seznam zdrojů s hledáním (název, kniha, osoba) a filtrem podle jistoty a archivu.
2. **Detail zdroje**: pole z kapitoly 3, obrázek, překlad, seznam účastníků s rolemi (klepnutí otevře osobu), tlačítko „Otevřít v archivu“, historie změn zdroje.
3. **Úprava osoby** (`PersonEditor.vue`): ve `SourcePicker` vedle „nový odkaz“ volba **„Zdroj-záznam“**: vybrat existující, nebo založit nový (otevře krátký formulář). Při volbě se osoba doplní jako účastník s rolí podle místa použití (narození → křtěnec, úmrtí → zemřelý, sňatek → ženich/nevěsta).
4. **Převod odkazu**: u stávajícího odkazu tlačítko „Převést na zdroj“; předvyplní název a adresu z odkazu, obrázek zachová.
5. **Stránka „Čekající změny“** (od oprávnění `edit`): seznam dávek od klíčů typu „navrhovatel“ (kdo, kdy, kolik změn), u každé **přehled změn** (osoba → údaj → bylo → bude, nové osoby a rodiny, nové zdroje) a tlačítka **Schválit vše**, **Schválit vybrané**, **Zamítnout**.
6. **Stránka „Historie“** (od `edit`): seznam použitých dávek (kdo, kdy, co) a u každé tlačítko **Vrátit zpět**.
7. **Můj účet → Přístupové klíče**: vytvořit klíč (název, typ, strom, platnost), klíč se ukáže **jednou**, seznam klíčů s posledním použitím a tlačítkem Zrušit.

Všechny texty přes `t('klíč')` v `i18n/<stránka>.ts` česky i anglicky (`defineMessages`). Světlý i tmavý režim, telefon i tablet.

## 5. Bezpečné ukládání změn

### 5.1 Verze stromu
Ke stromu každé základny se ukládá **číslo revize** (celé číslo, roste s každou uloženou změnou). Vrací ho `GET /api/gedcom/get` v poli `data.revision`. Každý zápis posílá `baseRevision`; když se strom mezitím změnil, server **odmítne** (409) a řekne, která osoba se změnila.

### 5.2 Dávka změn
`POST /api/gedcom/changes` (od `edit`, nebo klíč typu „navrhovatel“):

```json
{
  "baseRevision": 123,
  "title": "Úmrtí Jana Mikulíka 1924 a 1945",
  "dryRun": true,
  "ops": [
    { "op": "addSource", "tempId": "s1", "title": "Úmrtí 11. 11. 1924 – Z Všemina 1879–1944, snímek 181",
      "repository": "Moravský zemský archiv v Brně", "publication": "Z Všemina 1879–1944, č. knihy 4983",
      "page": "snímek 181", "language": "cs", "transcript": "…", "translation": "…",
      "url": "https://www.mza.cz/actapublica/matrika/detail/11530?image=…", "image": "<id nahraného souboru>",
      "participants": [ { "person": "I500086", "role": "zemřelý", "age": "68" } ] },
    { "op": "setFact", "person": "I500086", "fact": "death",
      "value": { "date": "11 NOV 1924", "place": "Dešná č.2", "cause": "mrtvice", "age": "68" },
      "sources": [ { "source": "s1", "page": "snímek 181", "confidence": 3 } ] },
    { "op": "addNote", "person": "I500086", "text": "Dřívější údaj 2. 11. 1924 byl chybný." }
  ]
}
```

Podporované operace ve fázi 1: `addSource`, `updateSource`, `setFact` (jméno, pohlaví, narození, úmrtí, sňatek, ostatní události), `addNote`, `createPerson`, `createFamily`, `linkChild`, `linkSpouse`, `setName`, `attachSource` (zdroj → osoba/údaj/role), `removeFact` (jen s výslovným příznakem, nikdy samo od sebe).

Chování:
- `dryRun: true` nic neuloží, vrátí **přehled změn** (pro stránku Čekající změny a pro automat).
- Bez `dryRun` provede změnu **jen pokud je volající plnoprávný** (`edit`, `admin`). Klíč typu „navrhovatel“ dávku **uloží jako čekající** (`uploads/…/pending/<id>.json`) a vrátí její `id`. Teprve schválení v aplikaci ji provede.
- Operace jsou **atomické**: když jedna selže, neprovede se žádná.
- Operace dodržují stávající pravidla: vazby `family.husband/wife/children ↔ person.familiesAsSpouse/familiesAsChild` oběma směry, `metadata` počty, `Map` a `Date` serializace (`serializeGedcomFile`, `DATE_KEYS`), `X-Database`.
- Existující údaje se nikdy nemažou mlčky. Přepsání hodnoty bez příznaku je v přehledu viditelné a vyžaduje potvrzení (v klientovi i serveru).

### 5.3 Historie a vrácení
Každá provedená dávka se uloží do `uploads/…/history/<revize>.json` (kdo, kdy, název, operace a **inverzní operace**). `GET /api/gedcom/history` vrací seznam, `POST /api/gedcom/history/<id>/revert` provede inverzi (se stejnou kontrolou verze). Zálohy celého stromu (`server/utils/backups.ts`) zůstávají beze změny a historie je doplňuje.

### 5.4 Osobní přístupové klíče
- V `server/utils/accounts.ts` pole `apiTokens`: `{ id, name, hash, kind: 'proposer' | 'editor', databaseId, createdAt, expiresAt?, lastUsedAt }`. Ukládá se jen **hash** (jako u hesel), nikdy klíč samotný.
- Klíč je dlouhý náhodný řetězec s předponou `rr_`. Posílá se jako `Authorization: Bearer rr_…`, `actorFromToken` v `server/utils/access.ts` ho rozpozná a nastaví omezené oprávnění (`proposer` smí jen číst a posílat čekající dávky, `editor` navíc zapisovat přímo).
- Platí **jen pro jednu datovou základnu**, nikdy nedává právo spravovat uživatele ani zálohy. Jde kdykoli zrušit.
- Pokus o použití zrušeného nebo cizího klíče vrací 401 a nic neprozradí.
- `loginForWrites.ts` přijímá klíč stejně jako relaci; ostatní kontroly zůstávají v endpointech.

## 6. Příklady z našich nálezů (testovací data)

1. **Jeden zápis, jedna osoba:** křest Jana Mikulíka 11. 6. 1826 (N Všemina 1785–1839, č. knihy 4974, snímek 129). Přepis a překlad dodá zadavatel (data nejsou v repozitáři, obsahují osobní údaje).
2. **Jeden zápis, víc lidí:** sčítání lidu 1921, Dešná č. 2 – šest členů domácnosti, roli `člen domácnosti`, u každého věk.
3. **Kmotři jako vazba:** křty z let 1917 a 1918, kmotři Jan Huzlík a Josefa Huzlíková; po schválení musí být vidět u obou dětí i u obou kmotrů.
4. **Oprava údaje:** úmrtí Františky 1920 – ze „strom: 5. 1. 1920“ na „28. 1. 1920“. Dávka musí ukázat bylo / bude a po schválení šlo vrátit zpět.
5. **Nová osoba s rodinou:** sňatek 6. 2. 1849 – vznik rodičů Jana Halžíka (Josef Halžík, Anna Plischlab (?)) a manželky Josefa Mrkvánka (Barbora Kra… (?)).

## 7. Kontroly a ověření

Projekt nemá automatické testy, proto:
- **Skript `scripts/check-sources.mts`** (podobně jako `check-graph.mts`): načte export `get.json` a ověří, že každý zdroj má název a archiv, že každý účastník odkazuje na existující osobu, že kolečko **načíst → zapsat GEDCOM → načíst** zachová zdroje, citace, účastníky a `ASSO`. Spouští se `npm run check:sources -- get.json`.
- **Kontrola dávek:** skript, který pošle dávku s `dryRun`, ověří přehled změn a následně dávku použije a vrátí zpět na testovací základně; po vrácení musí být export stromu **stejný jako před dávkou** (kromě čísla revize a času úpravy).
- Ruční test (podle `verify-change`): import GEDCOM → nový zdroj → osoba ho cituje → reload → export GEDCOM → import do čistého stromu → zdroje zůstaly.
- Test oprávnění: návštěvník a `demo` zdroje nevidí, `read` je vidí, klíč `proposer` nemůže změnu provést, jen navrhnout, zrušený klíč nic nesmí.
- Souběh: dvě dávky se stejnou `baseRevision` → druhá musí skončit 409 a nic nepřepsat.
- Typecheck změněných souborů a `npm run build`.

## 8. Povinné doplňky při dokončení

- Položka v `utils/releaseNotes.ts` (česky i anglicky) a stejná verze v `package.json`, `npm run check:release`.
- Seznam funkcí a technologií v O aplikaci (`settings.about.*` v `i18n/settings.ts`).
- Aktualizace AGENTS.md: nový typ zdroje, tok dávek a historie, past „klíč a čekající dávky“, popis `check:sources`.
- Aktualizace tohoto zadání: stav, odchylky od návrhu, zjištění z implementace.

## 9. Pořadí implementace (doporučené)

1. Datový model: zdroj-záznam, účastníci, `ASSO`, round-trip v `parser.ts` / `serialize.ts`, kontrolní skript. **Bez UI.**
2. Zobrazení: stránka Zdroje a detail, zdroje v detailu osoby, anonymizace.
3. Editace: výběr a vytvoření zdroje v editoru osoby, převod odkazu.
4. Revize stromu a `POST /api/gedcom/changes` s `dryRun`.
5. Čekající změny a historie s vrácením zpět.
6. Osobní přístupové klíče.
7. Kontrola celého řetězce na kopii skutečného stromu.

Každý krok se nasazuje samostatně a **nesmí rozbít stávající odkazy ani editor** (zpětná kompatibilita).

## 10. Otevřené otázky pro zadavatele

1. Mají mít klíče typu „navrhovatel“ možnost zakládat osoby a rodiny, nebo jen údaje a zdroje? (Navrženo: i osoby, vždy ke schválení.)
2. Kdo smí schvalovat čekající změny: jen vlastník základny, nebo každý s `edit`?
3. Jak dlouho se uchovává historie (navrženo: bez omezení, ukládá se jen rozdíl)?
4. Má se přepis a překlad ukazovat i uživatelům s oprávněním `read`, nebo jen `edit`?
5. Chce zadavatel zachovat stávající odkazy (OBJE) i pro nové údaje, nebo po nasazení jen zdroje-záznamy?


## 11. Implementace (verze 1.13.0)

Hotové jsou všechny kroky z kapitoly 9. Kód: `utils/gedcom/sources.ts`, `utils/gedcom/sourceRoles.ts`, `utils/gedcom/changes.ts`, `server/utils/treeStore.ts`, `server/utils/pendingChanges.ts`, `server/middleware/apiTokenScope.ts`, stránky `/sources`, `/changes`, `/history`, sekce Přístupové klíče v Mém účtu. Popis pro vývojáře je v AGENTS.md (pasti „Zdroje-záznamy“, „Revize, historie a dávky“, „Klíč a čekající dávky“).

### Odchylky od návrhu

- **Jazyk, ověření a účastníci nejsou v `userData.extraTags`.** `extraTags` podřízené řádky neumí (`{ tag, value }`, parser je u osoby přeskakuje), proto jsou to typovaná pole `GedcomSource.language`, `verifiedBy`, `verifiedAt` a `participants`. V GEDCOM se zapisují přesně podle návrhu (`_LANG`, `_VERIFIED_BY`, `_VERIFIED_AT`, `_PART @I1@` + `2 ROLE`, `2 AGE`, `2 NOTE`).
- **Role mají anglické kódy** (`baptized`, `godparent`, `household`…). Dávky i import přijímají i české názvy z kapitoly 3 (`kmotr`, `člen domácnosti`…), převádí je `normalizeSourceRole`.
- **Ukládání z aplikace** posílá jen změněné záznamy (osoby, rodiny, zdroje…) s `baseRevision`. Server ho na starší revizi odmítne (409 se jmény osob) jen tehdy, když se mezitím měnily *stejné* záznamy; změny jiných osob spojí a aplikace si strom znovu načte. Návrh v 5.1 počítal s odmítnutím při jakékoli změně. Dávky (`/api/gedcom/changes`), schválení i vrácení vyžadují přesnou revizi, jak je v návrhu.
- **Historie ukládá místo „inverzních operací“ záznamy před a po.** Vrácení vrátí záznamy do stavu „před“, ale jen když jsou všechny pořád ve stavu „po“ (jinak 409 se seznamem). Funguje stejně pro dávky i pro běžné úpravy v aplikaci. Import a obnova zálohy jsou v historii, ale vrátit je nejde (na to jsou zálohy); nad 3000 změněných záznamů se kopie neukládají.
- **Hash klíče je SHA-256**, ne scrypt jako u hesel: tajemství je 32 náhodných bajtů, pomalý hash by jen zdržoval každý požadavek.
- **Klíč na cizí základnu** (hlavička `X-Database`) vrací 401 jako neplatný klíč. Endpoint, který klíč nesmí, vrací 403.
- **Navrhovatel smí nahrát obrázek** (`/api/media/upload`, `/api/media/copy`), aby dávka mohla poslat `image`. Soubor leží v příloze základny i před schválením.
- **„Schválit vybrané“** provede vybrané operace a zbytek dávky zahodí (odkazy na `tempId` by jinak nemusely platit).
- **`addNote` na zdroj není**: první poznámka zdroje je překlad, k zápisu poznámek slouží `updateSource` s `translation`.
- **Převod odkazu** je na stránce Zdroje (oddíl „Odkazy, ze kterých jde udělat zdroj“), ne přímo v editoru osoby: převod mění víc osob najednou a editor drží rozpracovaný koncept jedné osoby. Odkaz se přesune z odkazů osoby do zdroje.

### Zjištění z implementace

- Zápis GEDCOM dřív **nezapisoval záznamy `REPO`, vazby `ASSO`, `TEXT`/`NOTE`/`OBJE` zdroje ani `QUAY` a `DATA/TEXT` citací**; po exportu a novém importu se ztratily. Parser četl `ASSO` bez `RELA`, `2 PAGE` pod osobní citací dával do `attributes.PAGE` a `2 SOUR` pod jménem považoval za citaci osoby. `resolveXrefs` přepisoval text citace názvem zdroje. Všechno je opravené a hlídá to `check:sources`.
- Vercel Blob umí podmíněný zápis (`put` s `ifMatch`, ETag z `get`), takže kontrola revize nemá okno pro souběh.
- Serverové endpointy jsou ověřené proti napodobenině Blobu v paměti (42 kontrol: rozdílové uložení, souběh, potvrzení přepisu, atomické dávky, historie a vrácení, klíče navrhovatele a editora, odmítnutí cizí základny a zrušeného klíče, návštěvník bez zdrojů). UI je prohlédnuté v Chrome na šířce 1280 a 390 px.

### Rozhodnutí otevřených otázek (kapitola 10)

Rozhodl jsem podle návrhu nebo podle toho, co aplikace už dělá; každé jde změnit.

1. Navrhovatel smí zakládat osoby i rodiny, vždy jen ke schválení.
2. Schvalovat smí každý s oprávněním `edit` na základně.
3. Historie se uchovává bez omezení; ukládají se jen změněné záznamy.
4. Přepis a překlad vidí každý s oprávněním `read` (stejně jako ostatní plná data). Anonymní režim a návštěvníci je nevidí.
5. Stávající odkazy (OBJE) zůstávají a jdou použít i pro nové údaje vedle zdrojů-záznamů.
