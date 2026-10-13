# Zadání: stránka „Grafický strom“ (verze 1 – pouze prohlížení)

> **Stav: verze 1 je implementovaná** (13. 10. 2026). Zjištění z implementace a odchylky od původního zadání jsou v kapitole 10. Kód: `app/pages/graph.vue`, `app/components/FamilyTreeChart.vue`, `app/components/TreePersonCard.vue`, `utils/gedcom/treeGraph.ts`, kontroly `scripts/check-graph.mts`.

Nová stránka `/graph` vedle stávající stránky „Strom“ (`/tree`). Zobrazí rodokmen jako graf karet podobný MyHeritage: **předci nahoře, potomci dole**, manželé vedle sebe, mezi kartami spojnice. Ve verzi 1 se strom jen prohlíží, nic se v něm neupravuje.

Vzorový snímek obrazovky z MyHeritage má zadavatel. Není v repozitáři, protože obsahuje osobní údaje a cizí obsah. Vzhled se má *podobat*, ne kopírovat: nepoužívat loga, ikony ani texty MyHeritage.

Před prací si přečti [AGENTS.md](../AGENTS.md), hlavně kapitolu „Důležité pasti“.

## 1. Rozsah

**Ve verzi 1 ano**
- Nová stránka `/graph`, odkaz v hlavní navigaci (desktop i mobilní menu).
- Graf kolem zvolené kořenové osoby: její předci, potomci, partneři a sourozenci.
- Posun, přiblížení, přizpůsobení obrazovce, přepnutí kořene klepnutím na kartu nebo výběrem ze seznamu.
- Češtinu a angličtinu, světlý i tmavý režim, anonymní režim, telefon i tablet.

**Ve verzi 1 ne** (patří do dalších verzí, nic z toho nepřipravovat „napřed“)
- Úpravy (tužka, tlačítka „+“, přidání rodiče, partnera, dítěte).
- Fotografie osob. V datech žádné nejsou (`multimediaLinks` je všude prázdné), použije se silueta.
- Vodorovné uspořádání, export do obrázku nebo PDF, tisk, minimapa.
- Zaoblené spojnice (viz kapitola 3, volitelné).

## 2. Data a mapování

Zdrojem je `gedcomStore.state.value.file` (`GedcomFile`), stejně jako na stránkách Mapa a Strom. Když data chybí, stránka je načte stejným způsobem jako `tree.vue` (`refreshFromServer` v `onMounted`).

Skutečná data (stav k 13. 10. 2026): 203 osob, 88 rodin, u všech osob je pohlaví, 6 osob má dvě manželství, 1 rodina je bez manžela a 9 bez manželky, 12 rodin je bez dětí, žádná osoba nemá více jmen ani více rodin rodičů, žádný rozvod, žádné odkazy na neexistující osoby. Zadání ale musí zvládnout i data, která tyto vlastnosti nemají.

### Knihovna pro rozložení: `relatives-tree`

Ověřeno v npm: verze 3.2.2 (poslední vydání 16. 3. 2025), licence MIT, bez závislostí, asi 3 kB po kompresi. Přidat s přesnou verzí. Knihovna jen počítá pozice, nic nevykresluje.

```ts
import calcTree from 'relatives-tree'
const { nodes, connectors, canvas } = calcTree(inputNodes, { rootId })
```

- **Vstup `Node`:** `id`, `gender` (`'male' | 'female'`), `parents`, `children`, `siblings`, `spouses`; každé pole je seznam `{ id, type }`, kde `type` je `blood`, `married`, `divorced`, `adopted` nebo `half`.
- **Výstup:** `nodes` (každý s `left`, `top`, `hasSubTree`), `connectors` (seznam úseček `[x1, y1, x2, y2]`) a `canvas` (`width`, `height`).
- **Jednotky:** pozice jsou v polovinách velikosti karty. Přesný postup přepočtu na pixely je v dokumentaci knihovny (složka `docs` v repozitáři relatives-tree, příklad s canvasem). Implementátor ho musí před použitím ověřit, ne odhadnout.
- `hasSubTree` znamená, že osoba má další příbuzné mimo zobrazenou větev. Ty se zobrazí přepnutím kořene.

### Funkce `buildTreeNodes(file: GedcomFile)` v `utils/gedcom/treeGraph.ts`

Čistá funkce bez závislosti na Vue, aby šla testovat na skutečných datech (viz kapitola 6).

| Pole uzlu | Zdroj |
|---|---|
| `id` | `xrefId` osoby |
| `gender` | `sex`: `M` → `male`, `F` → `female`. Když chybí: podle role v rodině (`husband` → `male`, `wife` → `female`), jinak `male` s příznakem „neznámé pohlaví“, který karta vykreslí šedě a neutrální siluetou |
| `parents` | pro každou rodinu v `familiesAsChild`: `husband` a `wife`, typ `blood` |
| `children` | pro každou rodinu v `familiesAsSpouse`: její `children`, typ `blood` |
| `spouses` | pro každou rodinu v `familiesAsSpouse`: druhý partner; typ `divorced`, pokud rodina má `divorce`, jinak `married` |
| `siblings` | ostatní `children` rodin z `familiesAsChild`, typ `blood`; sourozenci, kteří sdílejí jen jednoho rodiče (jiná rodina), typ `half` |

Pravidla:
- Odkazy na neexistující osoby se zahodí (knihovna by spadla).
- Vztahy musí být oboustranné. Protože se všechny odvozují ze stejných rodin, jsou, ale funkce to má hlídat.
- `placeholders` zůstává vypnuté (prázdné sloty by patřily k tlačítkům „+“).
- Osoba bez příbuzných se zobrazí jako jediná karta.

## 3. Vzhled

| Prvek | Zadání |
|---|---|
| Plátno | Světle šedé pozadí (cca `#f2f2f2`), v tmavém režimu tmavě šedé. Žádný okraj kolem celé stránky. |
| Karta | Cca 200 × 76 px (konstanty na jednom místě), bílá, zaoblení 8 px, okraj 2 px. Muž azurová (cca `#22b8cf`), žena lososově růžová (cca `#ff8a8a`), neznámé pohlaví šedá. V tmavém režimu tmavá karta. |
| Kořenová osoba | Silnější okraj (3 px) a stín. |
| Avatar | Kruh cca 56 px vlevo, silueta muže nebo ženy jako vložené SVG. Žádné obrázky z cizích webů. |
| Jméno | Tučně, až 3 řádky, bez lomítek kolem příjmení (v datech je `Jan /Mikulik/`, na kartě má být `Jan Mikulik`). Jde přes `anon.name()`. |
| Roky | Pod jménem jemnější barvou, komponenta [`LifespanTips`](../roots-and-routes/app/components/LifespanTips.vue), takže bubliny s celým datem fungují i na kartě. |
| Pár | Manželé vedle sebe, mezi nimi spojnice a nad ní žluté kolečko s ikonou dvou prstenů (vlastní SVG). |
| Rodiče a děti | Svislá spojnice od páru dolů, vodorovná lišta a odbočky k dětem; stejně nahoru k rodičům. |
| Spojnice | Šedé, 1,5 px, pravoúhlé podle `connectors` z knihovny. Zaoblení rohů (jako na vzoru) je volitelné, až po dokončení všeho ostatního. |
| Indikátor `hasSubTree` | Malý symbol na kartě (například ⌄) ukazující, že osoba má další příbuzné. Jen indikace, ne tlačítko pro úpravy. |
| Zaměření | Karta má při zaostření viditelný rámeček. |

## 4. Chování

- **Kořenová osoba:** z adresy `?root=<xrefId>`, jinak první osoba v datech (jako stránka Strom). Neexistující `root` se tiše nahradí první osobou.
- **Klepnutí na kartu** (pohyb pod 5 px, jinak jde o tažení) přepne kořen: adresa se změní přes `router.push` (tlačítko Zpět pak vrací na předchozí osobu), rozložení se přepočítá a pohled se plynule vycentruje na novou osobu (cca 300 ms). Při `prefers-reduced-motion` bez animace.
- **Pohled po načtení:** když se celý strom vejde na obrazovku při čitelném přiblížení (1× na počítači, 0,7× na telefonu), zobrazí se celý. Jinak se zobrazí kořenová osoba uprostřed v tomto čitelném přiblížení a celek ukáže tlačítko „Přizpůsobit obrazovce“. Rozsah přiblížení 0,05× až 2×.
- **Ovládání myší:** tažení posouvá, kolečko přibližuje kolem ukazatele.
- **Ovládání dotykem:** jeden prst posouvá, dva prsty přibližují. Plátno má `touch-action: none`, stránka za ním se nesmí při tažení posouvat.
- **Lišta nad plátnem:** výběr kořenové osoby (pole s hledáním, jména v anonymním režimu jako iniciály), tlačítka přiblížit, oddálit a přizpůsobit obrazovce, všechna s `aria-label`.
- **Klávesnice:** karty jsou zaostřitelné (`tabindex="0"`), Enter nebo mezerník přepne kořen.
- **Stavy:** bez dat zpráva s odkazem na import (pro správce), během načítání indikátor, výběr osoby bez příbuzných ukáže jednu kartu.
- **Výška plátna:** nastavit třídami Tailwindu přímo na prvku (např. `h-[70vh]`, minimálně 300 px). Nepřidávat `height` do globálních stylů (viz chyba s mapou v AGENTS.md).
- **Nastavení Strom → „Maximální počet generací“:** *měl by* platit. Omezí se počet generací předků i potomků od kořene tím, že se před voláním `calcTree` odříznou vzdálenější osoby a jejich vztahy. Pokud se to nestihne, napsat do AGENTS.md, že se nastavení na této stránce neuplatňuje.

## 5. Technické řešení

### Nové soubory
- `app/pages/graph.vue`: stránka (data, kořen, lišta).
- `app/components/FamilyTreeChart.vue`: plátno s posunem a přiblížením, vykreslení karet a spojnic.
- `app/components/TreePersonCard.vue`: jedna karta.
- `utils/gedcom/treeGraph.ts`: `buildTreeNodes` (kapitola 2) a případně ořez podle počtu generací.
- `i18n/graph.ts`: překlady, zaregistrovat v `i18n/index.ts`.

### Úpravy
- `app/app.vue`: položka v `navLinks` (mezi Strom a GEDCOM) a název stránky v `pageTitle`.
- `i18n/common.ts`: `nav.graph` (cs „Grafický strom“, en „Graphical tree“) a `title.graph`.
- `nuxt.config.ts`: přidat `/graph` do `nitro.prerender.routes`.
- `package.json`: `relatives-tree` (přesná verze), `d3-zoom` a `d3-selection` (verze 3, licence ISC) pro posun a přiblížení včetně dotyku. Vlastní implementace přes Pointer Events je přípustná, jen když `d3-zoom` nepůjde použít.
- [AGENTS.md](../AGENTS.md): řádek v tabulce struktury a případné nové pasti.

### Vykreslení
Karty jsou HTML prvky (`position: absolute`) na vypočítaných pozicích, spojnice jedna SVG vrstva pod nimi. Obojí v jedné vrstvě s CSS `transform: translate() scale()`, kterou řídí posun a přiblížení. HTML karty (ne SVG) kvůli Tailwindu, překladům, bublinám a přístupnosti.

### Pravidla projektu, která se tu týkají
1. **Texty:** všechno přes `t('graph.…')`, klíče v angličtině i češtině. Typová kontrola hlídá, že čeština má všechny klíče.
2. **Anonymní režim:** všechna jména přes `useAnonymize` (`anon.name`). Pro nepřihlášené je zapnutý vždy. Je to jen zobrazení, API vrací plná data (viz AGENTS.md).
3. **Objekty třetích stran** (chování `d3-zoom`, výběr `d3-selection`) patří do `shallowRef` nebo do obyčejné proměnné, ne do hlubokého `ref`. Hluboký `ref` zabalí objekt do proxy a knihovna přestane fungovat (stejná chyba jako u clusterů na mapě).
4. **Store** vrací `ComputedRef`, takže `.value` i v šabloně (`gedcomStore.hasData.value`).
5. **Prerender:** stránka se vykreslí bez dat. Rozložení se počítá až po načtení dat na klientu, `d3-zoom` se napojí v `onMounted`.
6. **Třídy Tailwindu** musí být v souborech pod `app/` zapsané celé, ne skládané z částí.
7. **Tmavý režim:** `isDark` z `useColorMode`, stejně jako ostatní stránky.
8. **Data:** `Date` pole jsou po načtení ze serveru obnovená (`deserializeGedcomFile`). Roky života vykresluje `LifespanTips`, vlastní formátování data nepsat.

## 6. Kritéria přijetí a ověření

Automatické ověření na skutečných datech (stáhnout `GET /api/gedcom/get`, deserializovat, spustit přes `npx jiti`, jako při ladění stromu):

1. **Každá osoba jako kořen:** pro všech 203 osob proběhne `buildTreeNodes` + `calcTree` bez chyby, do 200 ms, žádné dvě karty nemají stejné místo ani se nepřekrývají.
2. **Úplnost:** každá osoba, která je podle zadání v zobrazené množině (předci, potomci, partneři, sourozenci kořene), má kartu a každá dvojice rodič–dítě v ní je spojená spojnicí.
3. **Orientace:** rodiče kořene mají menší `top` než kořen, děti větší, partner stejný.
4. **Okrajové případy:** osoby se dvěma manželstvími (6 v datech), rodina bez manžela (1) a bez manželky (9) se vykreslí bez překryvu a bez přerušených spojnic.
5. **Syntetická data:** jednotkový test funkce `buildTreeNodes` na malých ručně sestavených souborech: chybějící pohlaví, odkaz na neexistující osobu, rozvod, polorodí sourozenci, osoba bez příbuzných. V projektu není test runner, stačí skript spustitelný přes `npx jiti`.

Ověření v prohlížeči (headless Chrome přes CDP, `GET /api/gedcom/get` podstrčený skutečnými daty, postup viz dřívější testy; v testech používat `scrollIntoView({ behavior: 'instant' })`, protože `html` má `scroll-behavior: smooth`):

6. Viewporty 390×844 a 360×740 (telefon, `mobile: true`), 820×1180 (tablet), 1280×900 (desktop): stránka se nerozšiřuje do stran, plátno je vysoké aspoň 300 px a je v něm vidět kořenová karta.
7. Posun myší i dotykem, přiblížení kolečkem i dvěma prsty, tlačítka přiblížit/oddálit/přizpůsobit, klepnutí na kartu přepne kořen a změní adresu; tažení kartu nepřepne.
8. Nepřihlášený: v DOM není žádné příjmení a žádné místo. Správce s vypnutým anonymním režimem: skutečná jména.
9. Přepnutí jazyka přeloží celou stránku včetně lišty a popisků. Tmavý režim je čitelný. Bubliny s datem u roků fungují i na kartách.
10. `vue-tsc` bez chyb v nových souborech, `npm run build` projde, AGENTS.md je aktualizovaný.
11. Odevzdat snímky obrazovky 1280×900 a 390×844 se skutečnými daty, aby zadavatel mohl vzhled porovnat s MyHeritage.

## 7. Doporučený postup

1. **Data a rozložení:** `treeGraph.ts` a skript s kritérii 1 až 5. Zatím bez UI.
2. **Statické vykreslení:** stránka, karty a spojnice, bez posunu. První snímek obrazovky ke kontrole vzhledu.
3. **Ovládání:** posun, přiblížení, přizpůsobení, přepnutí kořene, výběr osoby, klávesnice, dotyk.
4. **Dolaďování vzhledu:** barvy, prsteny, indikátor, tmavý režim, případně zaoblené spojnice.
5. **Dokončení:** překlady, telefon a tablet, omezení generací, dokumentace, kritéria 6 až 11.

## 8. Rizika

- `relatives-tree` se naposledy vydávala v březnu 2025. Je malá (pár souborů), takže ji lze v případě potřeby převzít do projektu.
- Složité rodiny (několik manželství najednou, propletené větve) mohou v rozložení vyjít nepřehledně. Kritérium 1 až 4 to má odhalit na skutečných datech.
- Strom se zobrazí celý bez omezení, pokud se nestihne omezení generací. Při 203 osobách to nevadí, u mnohem větších souborů by bylo potřeba zobrazit jen část.

## 9. Do dalších verzí

Úpravy (tužka, „+“ s přidáním rodiče, partnera a dítěte; vyžaduje vyčlenění editoru z `tree.vue` do sdílené komponenty), fotografie z GEDCOM odkazů, zaoblené spojnice, export do obrázku, minimapa, hledání se zvýrazněním.

## 10. Zjištění z implementace (verze 1)

**Chování knihovny `relatives-tree`, které zadání nepředvídalo:**
- **Zobrazí děti páru, ne všech vztahů.** Dítě, u kterého je znám jen jeden rodič, by u kořene s jiným partnerem zmizelo. `buildTreeNodes` proto pro rodinu s jedním známým rodičem vytvoří neznámého partnera (`unknown-<id rodiny>`), když má rodič další rodinu. V grafu je to čárkovaná karta „Osoba není zapsána“, není klikací a v datech neexistuje. Rodič jen s jednou rodinou žádného neznámého partnera nedostane.
- **Půlsourozenci** (sdílejí jen jednoho rodiče) se u kořene nezobrazí, protože patří k jinému páru. Zobrazí se po přepnutí na rodiče nebo na ně.
- **Druhé manželství:** v 3 z 5 případů ve skutečných datech knihovna umístí druhého partnera na okraj skupiny sourozenců, ne vedle kořene, a spojí ho dlouhou čárou. Rozložení jsme neměnili. Svatební odznak je v takovém případě na pravém okraji levé karty páru. Pořadí dětí rodičů ani pořadí vstupu to neovlivní (vyzkoušeno).
- Knihovna je jako balíček ES modulů s importy bez přípon, které čisté Node nenačte. V Nuxtu to řeší `build.transpile: ['relatives-tree']`, ve skriptech `jiti`.
- Jednotka rozložení je buňka 2×2 s kartou uprostřed, spojnice vedou do středu buňky (karta je překrývá) a „sběrnice“ leží na hranici buněk. Z toho plyne `UNIT_X`, `UNIT_Y`, `PAD_X`, `PAD_Y` v `treeGraph.ts`.

**Odchylky od zadání:**
- Přepnutí kořene je `router.push`, ne `replace` (viz kapitola 4).
- Úvodní přiblížení a minimální přiblížení viz kapitola 4.
- Nastavení „Maximální počet generací“ **platí** (`limitGenerations`).
- Komponenta `LifespanTips` dostala vlastnosti `focusable` a `hideEmpty` a `HoverTip` vlastnost `focusable`, aby šly použít uvnitř karty, která je sama zaostřitelná.
- Karty mají atributy `data-person-id` a `data-root` pro testy.

**Ověření:** `npm run check:graph -- get.json` (kritéria 1 až 5), testy v headless Chrome (kritéria 6 až 9, včetně dotyku a stisku dvěma prsty) a vše znovu na produkčním buildu (`NITRO_PRESET=node-server`).

