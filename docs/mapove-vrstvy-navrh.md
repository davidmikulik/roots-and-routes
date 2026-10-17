# Návrh: další mapové vrstvy (císařské otisky a další) a alternativa k Leafletu

Stav k 17. 10. 2026. **Implementováno:** přechod na OpenLayers a přepínač vrstev (OSM, ZTM, ortofoto, II. a III. vojenské mapování, jihočeské císařské otisky, historické názvy), viz `app/components/EventMap.client.vue` a `utils/map/layers.ts`. Doplněno 17. 10. 2026: císařské otisky JČ, JMK a MSK jako jedna volba (každý kraj se kreslí jen tam, kde má data), historická ortofotomapa z 50. let (CENIA, WMTS 5514, CC BY 4.0), podklad OpenTopoMap a překryvy katastrální mapa (WMS `services.cuzk.gov.cz/wms/wms.asp`, vrstva `KN`) a RÚIAN (budovy a čísla popisná, `StavebniObjekt,AdresniMisto`). Jako veřejnou službu se nepodařilo najít I. vojenské mapování, SMO-5 ani císařské otisky dalších krajů. Georeferencování zakoupených listů **hotové** (nahrání k místu v Admin → Známá místa, umístění na mapu afinní transformací z kontrolních bodů, zobrazení volbou „Vlastní nahrané listy“). Zbývá: vestavěná záložní mapa (úroveň A) a vlastní podklady PMTiles (B, C). Adresy služeb, souřadnicové systémy a podmínky jsou ověřené dotazy na služby ten den (viz [Zdroje](#zdroje)). Služby se mění, před implementací je ověř znovu.

## 1. Výchozí stav

- Mapa (`app/pages/map.vue`) používá **Leaflet 1.9.4** z CDN, shlukování `leaflet.markercluster` a jediný podklad **OpenStreetMap** (`https://{s}.tile.openstreetmap.org/…`).
- Data mapy: 90 míst se souřadnicemi, 83 z nich v ČR. Zhruba 14 leží v jižních Čechách a 15 na Moravě a ve Slezsku, zbytek ve středních, západních a severních Čechách.
- Aplikace je celá závislá na dostupnosti dlaždicového serveru OSM. Když nejede, mapa je prázdná.

## 2. Hlavní technický problém: S-JTSK × Web Mercator

Leaflet, MapLibre i všechny běžné podklady (OSM, Google, Mapy.com) pracují ve **Web Mercatoru (EPSG:3857)**. Většina českých historických map se ale publikuje v **S-JTSK (EPSG:5514)**.

| Situace | Leaflet | OpenLayers | MapLibre GL JS |
|---|---|---|---|
| Služba umí EPSG:3857 (ČÚZK ZTM, ortofoto, historická jména) | ano | ano | ano |
| ArcGIS MapServer v 5514, který umí `export` s `imageSR=3857` (Jihočeský kraj) | ano, přes vlastní vrstvu nebo `esri-leaflet` (pomalejší, obrázek se kreslí na serveru) | ano | ano (`{bbox-epsg-3857}` v URL dlaždice) |
| Služba **jen** v 5514 (CENIA II. a III. vojenské mapování) | **ne**, jen celou mapu přepnout do 5514 (Proj4Leaflet) a přijít o OSM | **ano**, přepočet rastrů v prohlížeči (`proj4` + `register`) | **ne**, jen přes vlastní převodní server |

Tohle je nejsilnější argument pro změnu knihovny (kapitola 6).

## 3. Katalog vrstev

### 3.1 Historické vrstvy

| Vrstva | Období | Pokrytí | Služba | Souřadnice | Podmínky | Použitelnost |
|---|---|---|---|---|---|---|
| **Císařské otisky spojené** (ČÚZK, ÚAZK) | 1824–1843 | celá ČR, postupně doplňováno | ArcGIS MapServer `ags.cuzk.gov.cz/arcgis4/rest/services/Archiv/archiv_spojene_cisarske_otisky` | ? | **vyžaduje token** (`Token Required`). Archiválie nespadají pod otevřená data ČÚZK (CC BY 4.0) | jen po dohodě s ÚAZK (viz 7.1) |
| **Originální mapy stabilního katastru spojené** (ČÚZK) | 1824–1843 | hlavně středy velkých měst | `…/Archiv/archiv_spojene_originalni_mapy` | ? | token | po dohodě |
| **Císařské otisky – Jihočeský kraj** | 1824–1843 | jen Jihočeský kraj, chybějící listy nahrazené originálními mapami | WMTS `https://gis.kraj-jihocesky.cz/arcgis/rest/services/podkladove/cisarske_otisky/MapServer/WMTS/1.0.0/WMTSCapabilities.xml`, MapServer `…/MapServer/export` | dlaždice 5514; `export` s `bboxSR=3857&imageSR=3857` funguje | „veřejná prohlížecí služba“, ochranné znaky © ČÚZK, komerční využití omezeno | **hned**, ale pokryje jen asi 14 z 83 míst |
| **Císařské otisky – Jihomoravský kraj** | 1824–1836 | jen JMK (Brno, Znojmo…) | WMTS `https://mapy1.jmk.cz/erdas-iws/ogc/wmts/JMK_CO` (vrstva `Cisarske_otisky`, sada `JTSK:epsg:5514`, umí i 3857) | 5514 / 3857 | veřejná služba, CORS `*` | **implementováno** |
| **Císařské otisky – Moravskoslezský kraj** | 1830–1836 | jen MSK (skeny ÚAZK) | WMTS `https://gis2.msk.cz/arcgis/rest/services/podklad/podklad_cis_otisky/MapServer/WMTS` (počátek mřížky ArcGIS −33 699 800 / 33 699 800) | 5514 | veřejná služba | **implementováno** |
| **Zlínský kraj** | – | – | servery kraje (`gis.kr-zlinsky.cz`, `dtm.zlinskykraj.cz`) při ověřování neodpovídaly, služba s otisky nenalezena | – | – | dotaz na kraj |
| **Stabilní katastr NPÚ** | 1824–1843 | ? | `geoportal.npu.cz/arcgis/rest/services/Polohopisy/StabKat/MapServer` | ? | **token** | ne |
| **II. vojenské (Františkovo) mapování** (CENIA) | 1836–1852 | celá ČR | WMS/WMTS `https://gis.cenia.cz/mapcache/II_vojenske_mapovani/wmts` (a `/wms`) | **jen 5514** (požadavek v 3857 vrací chybu) | INSPIRE „bez podmínek přístupu a užití“, licence neuvedená | v OpenLayers hned, v Leafletu ne |
| **III. vojenské mapování** (CENIA) | 1876–1880 | celá ČR | `https://gis.cenia.cz/mapcache/III_vojenske_mapovani/wmts` | jen 5514 | dtto | dtto |
| **Historická jména** (ČÚZK GEONAMES) | – | celá ČR | WMS `https://ags.cuzk.gov.cz/arcgis/services/GEONAMES/HistorickaJmena/MapServer/WMSServer` | 3857 (102100), 5514, 4326 | ČÚZK | **hned**, užitečné pro vyhledání starých (např. německých) názvů |
| **Archivní ortofoto** (ČÚZK) | od 50. let | celá ČR | WMS (metadata `CZ-CUZK-WMS-ORTOARCHIV`) | **neověřeno**, služba neodpověděla | archiválie, ověřit | později |
| **Mapire / Arcanum** (Habsburská monarchie, katastr a vojenská mapování) | 18.–19. st. | Rakousko-Uhersko | WMTS | 3857 | **komerční**, licence neověřená | jen pokud nestačí české zdroje |

### 3.2 Současné podklady (otevřená data)

| Vrstva | Služba | Souřadnice | Podmínky |
|---|---|---|---|
| OpenStreetMap (stávající) | `tile.openstreetmap.org` | 3857 | ODbL a [zásady užití dlaždic](https://operations.osmfoundation.org/policies/tiles/). Subdomény `{s}.` jsou zastaralé, použít `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| ZTM ČR (Základní topografické mapy) | dlaždice `https://ags.cuzk.gov.cz/arcgis1/rest/services/ZTM_WM/MapServer/tile/{z}/{y}/{x}` | 3857 | CC BY 4.0 (otevřená data ČÚZK od 7/2023) |
| Ortofoto ČR | dlaždice `https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}` (24 úrovní) | 3857 | CC BY 4.0 |

### 3.3 Jednotlivé listy z archivu ČÚZK (implementováno: odkazy u známých míst)

- Prohlížeč archivu ČÚZK zobrazí jeden list, např. císařský otisk Desné `https://ags.cuzk.cz/archiv/openmap.html?typ=ciom&idrastru=B2_a_6MS_427-1_1` nebo originální mapu `…?typ=orm&idrastru=B2_a_4M_2984_1`.
- Data listů (`Archiv/archiv_nespojene_stable/ImageServer`) jsou za **tokenem**, prohlížeč si ho vyžádá sám. Strojové stahování by obcházelo prodej: skeny jsou placený produkt ÚAZK, podle [ceníku ÚAZK](https://cuzk.gov.cz/Urady/Zememericky-urad/Dalsi-informace/UAZK/Cenik-UAZK.aspx) stojí dříve vyhotovený sken celého mapového listu 25 Kč.
- Prohlížeč posílá `X-Frame-Options: SAMEORIGIN`, takže ho nejde vložit do `<iframe>` na našem webu, i když to nápověda aplikace zmiňuje.
- **Zveřejnění reprodukce archiválie ÚAZK je zdarma a bez souhlasu**, ale s citací zdroje (aspoň název archivu, ideálně druh mapy a signatura).
- Implementováno: odkazy na listy u známých míst, zobrazené s citací zdroje v detailu osoby na mapě a ve stromu.
- Další krok: **zakoupené skeny nahrát k místu a georeferencovat** na současnou mapu. Admin klikne na stejné body na listu a na mapě (aspoň 3), z nich se spočítá afinní transformace ve Web Mercatoru a list se zobrazí jako natočený překryv s nastavitelnou průhledností a citací. Skeny mají desítky MB a do Vercel funkce jde poslat nejvýš 4,5 MB. Nahrávání proto musí jít přímo do Blobu (klientské nahrávání) nebo se list v prohlížeči rozřeže na dlaždice či PMTiles.

## 4. Vrstva nezávislá na online službách

Požadavek: aspoň jedna vrstva musí fungovat, i když externí mapové služby nejedou. Navrhuji tři úrovně, každá stojí na předchozí:

### Úroveň A: vestavěná záložní mapa (povinná, malá)
- Vektorová data přímo v aplikaci (GeoJSON v `public/`, desítky až stovky kB): hranice ČR, krajů a okresů, velké řeky, obce s názvem.
- Zdroj: ČÚZK Data250 nebo RÚIAN (CC BY 4.0), případně Natural Earth (volné dílo).
- Vykreslí se vždy, i offline. Když se nenačte žádný dlaždicový podklad (timeout nebo chyba), mapa na ni přepne sama a zobrazí upozornění.

### Úroveň B: vlastní vektorový podklad PMTiles (doporučená hlavní vrstva)
- **PMTiles** je jeden soubor se všemi dlaždicemi. Čte se po kouscích přes HTTP Range, bez dlaždicového serveru.
- Výřez ČR z denního sestavení Protomaps (data OSM, ODbL): `pmtiles extract https://build.protomaps.com/<datum>.pmtiles cz.pmtiles --bbox=12.09,48.55,18.86,51.06 --maxzoom=15`. Velikost je potřeba změřit, řádově stovky MB.
- Hosting ve vlastním úložišti s podporou Range a CORS, například veřejný Vercel Blob nebo Cloudflare R2. Stávající Blob je soukromý, takže by šlo buď o veřejné úložiště, nebo o průchozí endpoint s Range (ověřit limity Vercelu).
- Vykreslení: OpenLayers přes `ol-pmtiles` (2.0.2), MapLibre přes `pmtiles` (4.5.0) a styl `@protomaps/basemaps` (5.7.2), Leaflet přes `protomaps-leaflet` (5.1.0).
- Výsledek: podklad závislý jen na vlastní infrastruktuře, bez třetích stran a bez API klíčů.

### Úroveň C: vlastní historický výřez a offline režim
- Z **II. vojenského mapování (CENIA)**, jehož podmínky uvádějí „bez podmínek“, vyříznout čtverce kolem míst předků a převést je do 3857 PMTiles: GDAL (`gdal_translate` z WMS → `gdalwarp -t_srs EPSG:3857` → dlaždice → `pmtiles convert`). Historická vrstva pak bude dostupná, i když CENIA nepojede. Před zveřejněním je dobré podmínky potvrdit s CENIA a uvádět zdroj.
- Císařské otisky ani jiné archiválie ČÚZK takhle **neukládat** bez písemného souhlasu.
- Volitelně service worker (PWA) s mezipamětí naposledy prohlížených dlaždic a PMTiles rozsahů. Mapa pak funguje i bez připojení.

## 5. Návrh uživatelského rozhraní

- **Přepínač podkladu** (jeden aktivní): OpenStreetMap / Vlastní podklad (PMTiles) / ZTM ČR / Ortofoto / II. vojenské mapování / III. vojenské mapování / Císařské otisky (dostupné jen tam, kde existují).
- **Překryvné vrstvy** (více najednou): Historická jména, Císařské otisky (Jihočeský kraj), hranice z vestavěné mapy.
- **Průhlednost** historické vrstvy posuvníkem a **porovnání** (posuvná dělicí čára mezi současnou a historickou mapou), aby šlo vidět, kde stál dům předků dnes.
- V **detailu osoby na mapě** u události tlačítko „Ukázat na historické mapě“: přiblíží na úroveň 17 a zapne nejvhodnější historickou vrstvu podle roku události (před 1850 otisky nebo II. mapování, 1876–1880 III. mapování).
- Atribuce každé vrstvy (© ČÚZK, © CENIA, © OpenStreetMap…) v rohu mapy, podmínka licencí.
- Výběr podkladu, překryvů a průhlednosti uložit do Nastavení (`settings.map.baseLayer`, `overlays`, `historicOpacity`). Pro nepřihlášené fungují všechny vrstvy, protože body jsou v anonymním režimu skryté tak jako tak.

## 6. Alternativa k Leafletu

### Doporučení: **OpenLayers 10** (aktuálně 10.11.0)
- **Přepočet rastrových vrstev v prohlížeči.** Po registraci S-JTSK (`proj4.defs('EPSG:5514', …)` + `register(proj4)`) zobrazí WMTS a WMS v 5514 nad podkladem v 3857. Jen tak se dostanou do aplikace vojenská mapování od CENIA a krajské služby.
- Nativní WMS, WMTS (`optionsFromCapabilities`) i ArcGIS REST (`TileArcGISRest`), bez doplňků.
- Shlukování (`ol/source/Cluster`), průhlednost vrstev a porovnání posuvníkem (`prerender` a `postrender` s ořezem) jsou součástí knihovny nebo jdou napsat na pár řádků.
- PMTiles přes `ol-pmtiles`, vektorové styly přes `ol-mapbox-style`.
- Licence BSD-2, bez API klíčů, ES moduly a TypeScript typy. Nebude potřeba načítání z CDN jako dnes u Leafletu.
- Nevýhody: větší knihovna (importují se jen použité moduly) a vlastní značky a panel je potřeba přepsat.

### Další možnost: **MapLibre GL JS 6** (aktuálně 6.14.0)
- Výborné pro vektorový podklad (PMTiles, vlastní styl), plynulé WebGL přibližování, 3D terén.
- **Neumí přepočítat rastry z 5514.** Vojenská mapování CENIA by potřebovala vlastní převodní server (dlaždice 3857 skládané na serveru z WMS 5514), který by šel přes Vercel funkce a zvýšil by závislost na online službách.
- Hodí se, pokud by hlavní důraz byl na moderní vektorový podklad a historické vrstvy by stačily ty ve 3857.

### Zůstat u Leafletu
- Lze přidat ZTM, ortofoto, historická jména, jihočeské otisky (přes `export` v 3857) a PMTiles (`protomaps-leaflet`).
- **Nelze** rozumně přidat vrstvy jen v 5514 (CENIA). `Proj4Leaflet` přepne celou mapu do 5514 a podklad OSM by zmizel.
- Nejmenší práce, ale strop je jasný.

### Porovnání

| | Leaflet 1.9 | OpenLayers 10 | MapLibre GL JS 6 |
|---|---|---|---|
| Vrstvy jen v S-JTSK (CENIA) | ne | **ano** | ne (jen přes server) |
| WMS/WMTS/ArcGIS bez doplňků | částečně | **ano** | jen dlaždice podle URL šablony |
| PMTiles (vektorové) | doplněk | doplněk | **nativní styl** |
| Shlukování značek | doplněk (dnes CDN) | vestavěné | vestavěné (GeoJSON cluster) |
| Výkon s mnoha body | dobrý | dobrý | nejlepší (WebGL) |
| Pracnost přechodu | 0 | střední: přepsat `map.vue` | střední: přepsat `map.vue` |

## 7. Postup po fázích

1. **Ověření podmínek** (bez kódu)
   - Napsat ÚAZK (ČÚZK) s dotazem, zda a za jakých podmínek lze vrstvu `archiv_spojene_cisarske_otisky` zobrazovat v nekomerční rodinné aplikaci (token nebo jiný přístup). Celé území ČR s otisky jinak není dostupné.
   - Potvrdit s CENIA podmínky II. a III. vojenského mapování, hlavně kvůli uložení výřezu (úroveň C).
2. **Katalog vrstev a přepínač, ještě v Leafletu** (malý krok, hned užitečný)
   - `utils/map/layers.ts`: popis vrstev (id, název EN/CS, typ, URL, souřadnice, atribuce, rozsah přiblížení, hranice území).
   - Přepínač, průhlednost, Nastavení. Vrstvy: OSM (bez `{s}`), ZTM, ortofoto, historická jména, jihočeské otisky přes `export`.
   - Vestavěná záložní mapa (úroveň A) a automatické přepnutí, když podklad nejede.
3. **Přechod na OpenLayers**
   - Přepsat `map.vue` (značky, shluky, panel `MapPersonPanel`, `revealMarker`, migrační čáry) se stejným chováním. Panel je už oddělená komponenta, takže zůstane.
   - Přidat S-JTSK a vrstvy CENIA, porovnání posuvníkem, „Ukázat na historické mapě“ podle roku události.
4. **Vlastní podklady**
   - PMTiles výřez OSM pro ČR (úroveň B) jako výchozí podklad, OSM jako záloha.
   - Historický výřez (úroveň C) a případně PWA mezipaměť.
5. **Císařské otisky celoplošně**, pokud ÚAZK přístup povolí.

## 8. Rizika a otevřené otázky

- **Licence archiválií ČÚZK.** Otisky nejsou otevřená data. Bez souhlasu ÚAZK je k dispozici jen krajská jihočeská služba.
- **Stabilita služeb.** Krajské a CENIA služby nemají garantovanou dostupnost. Proto je potřeba úroveň A a B.
- **Velikost a hosting PMTiles.** Je potřeba ověřit limity veřejného Vercel Blob (velikost souboru, přenosy) nebo zvolit R2.
- **Výkon.** Přepočet rastrů z 5514 v prohlížeči je náročnější na mobilech, je potřeba ho otestovat (viz skill `test-ui`, telefon 390×844).
- **Archivní ortofoto ČÚZK** při ověřování neodpovědělo, souřadnice a podmínky zůstávají otevřené.

## Zdroje

Ověřeno 17. 10. 2026.

- Jihočeský kraj, Císařské otisky WMTS: <https://geoportal.kraj-jihocesky.gov.cz/portal/mapy/ostatni/Cisarske-otisky-WMTS>
- ČÚZK, metadata Císařské povinné otisky (Čechy): <https://geoportal.gov.cz/php/micka/record/basic/CZ-CUZK-COC-R>
- ČÚZK, aplikace Archiv (vrstva „Císařské otisky spojené“): <https://ags.cuzk.gov.cz/archiv/>
- ČÚZK, přehled mapových služeb: <https://geoportal.cuzk.gov.cz/(S(3kox2kdr3hv4mz0mkbutpb51))/Default.aspx?mode=Head&fnc=ServerMap>
- ČÚZK, otevřená data a licence CC BY 4.0 (výjimka pro archiválie): <https://cuzk.gov.cz/Uvod/Produkty-a-sluzby/Otevrena-data/Otevrena-data-zakladni-informace.aspx>
- CENIA, II. vojenské mapování (metadata): <https://micka.cenia.cz/en/record/full/4e678953-ba1c-49a2-a61e-3b96c0a80137>
- CENIA, III. vojenské mapování (metadata): <https://micka.cenia.cz/en/record/full/53df7ed6-c66c-4d25-8212-6966c0a80137>
- Protomaps, self-hosting a PMTiles: <https://protomaps.com/about>, <https://protomaps.com/faq>
- Arcanum (WMTS historických map): <https://maps.arcanum.com/en/map/france-1836>
