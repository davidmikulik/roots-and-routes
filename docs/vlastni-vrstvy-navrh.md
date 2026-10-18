# Vlastní vrstvy historických map – návrh

Nahrazuje „Vlastní nahrané listy“ (`overlays` u známých míst). Správce si vytvoří libovolný počet pojmenovaných
vrstev, každá vrstva obsahuje jeden nebo více nahraných listů (map) a každý list je na současnou mapu umístěný
vlastními vlícovacími body. Vrstva se pak nabízí jako samostatná volba v **Historická mapa**.

## Požadavky

- Správce přidá novou vrstvu mezi historické mapy.
- Každý list vrstvy musí být namapovaný **aspoň třemi body**, bodů může být víc (do 30), víc bodů zpřesní umístění.
- Správce může kdykoli:
  - přejmenovat vrstvu,
  - upravit mapování listu: přidat bod, odebrat bod, upravit bod (přesunout na listu i na mapě),
  - přidat do vrstvy další list (mapu),
  - odebrat list z vrstvy,
  - smazat celou vrstvu.
- Vrstvy i obrázky jsou soukromé, vidí je jen přihlášený správce (jako dosud).

## Datový model

Nový soubor v Blobu `uploads/gedcom/map-layers.json` (`{ "layers": MapLayer[] }`), typy v `types/mapLayers.ts`:

```ts
interface MapLayer { id: string; title: string; sheets: MapSheet[] }
interface MapSheet {
  id: string
  file: string          // media/<uuid>.<jpg|png|webp>, soukromý Blob
  title: string
  source?: string       // citace zdroje
  width: number; height: number   // rozměr obrázku v pixelech
  points: ControlPoint[]           // { px, py, x, y }: pixel listu ↔ Web Mercator
}
```

Vrstvy nejsou vázané na známé místo (list často pokrývá víc obcí). Validaci sdílí klient i server
(`utils/map/mapLayers.ts`: `sanitizeMapLayers`), limity: 50 vrstev, 50 listů ve vrstvě, 3–30 bodů na list,
název do 300 znaků.

## API (jen správce)

- `GET /api/admin/map-layers` → `{ layers }`
- `PUT /api/admin/map-layers` `{ layers }` → nahradí celý seznam (po validaci).
- Nahrávání obrázku zůstává přes klientské nahrávání do Blobu (`/api/media/overlay-token`), čtení přes
  `GET /api/media/<name>`.

Každá změna (vytvoření, přejmenování, uložení listu, odebrání listu, smazání vrstvy) se ukládá hned, stejně jako
odkazy u známých míst. Soubor obrázku po odebrání listu v Blobu zůstává (jako u příloh osob).

## Převod stávajících dat

Při prvním čtení, když `map-layers.json` ještě neexistuje, server vezme všechny `overlays` z
`known-locations.json` a vytvoří z nich jednu vrstvu `id: "uploaded"`, „Vlastní nahrané listy“, a soubor hned uloží
(i prázdný, aby se převod neopakoval). Převod se spustí jen tehdy, když Blob výslovně hlásí, že soubor neexistuje;
při jiné chybě čtení se nic nepřepisuje. Uložení katalogu míst (`PUT /api/admin/locations`) převod nejdřív vynutí,
pak pole `overlays` z katalogu vypustí.

Uložená volba `historicLayer: "overlays"` v Nastavení se převede na `custom:uploaded`.

## Mapa

- Volby historické mapy: `none`, pevné vrstvy z `utils/map/layers.ts` a pro správce `custom:<id>` za každou vrstvu,
  která má aspoň jeden umístěný list.
- Vybraná vlastní vrstva vykreslí všechny své listy (`createOverlayImageLayer`, afinní transformace z bodů) s
  průhledností historické mapy. `EventMap` zůstává beze změny rozhraní (`overlays`).
- Nepřihlášený nebo vrstva, která už neexistuje: výběr ukazuje „Žádná“, uložená volba se nemaže (po přihlášení se
  vrstva zase ukáže).
- U výběru vrstev je pro správce odkaz **Spravovat vlastní vrstvy**.

## Správa: stránka `/admin/layers`

Odkaz z Nastavení (vedle Známých míst) a z panelu vrstev na mapě.

- Seznam vrstev; nahoře pole „Název nové vrstvy“ + **Přidat vrstvu**.
- U vrstvy: název (úprava a **Uložit název**), **Smazat vrstvu** (s potvrzením), seznam listů:
  název, počet bodů, největší odchylka, **Upravit umístění**, **Odebrat list** (s potvrzením),
  a **Přidat list** (výběr souboru JPG/PNG/WEBP → nahrání → editor).
- Editor listu (dialog): název listu, zdroj, editor bodů. **Uložit list** vyžaduje ≥ 3 body a název.

### Editor bodů (`OverlayEditor.client.vue`)

- Vlevo list, vpravo současná mapa (volitelný podklad). Nový bod: klepnutí na místo na listu a na mapě (v libovolném
  pořadí).
- **Úprava bodu:** bod jde na listu i na mapě přetáhnout myší; nebo tlačítkem **Přesunout** u bodu v seznamu:
  další klepnutí na list přesune pixel bodu, klepnutí na mapu jeho polohu (tlačítko **Hotovo** nebo Esc režim ukončí).
  Hodí se na dotykových zařízeních.
- **Odebrání bodu:** tlačítko u bodu.
- U každého bodu odchylka v metrech, největší je zvýrazněná; při ≥ 3 bodech živý náhled listu nad mapou s
  nastavitelnou průhledností.
- Výchozí výřez mapy: body listu, jinak ostatní listy vrstvy, jinak ČR; pole **Přejít na místo** (seznam známých míst).

## Mimo rozsah

- Zálohy (`/api/admin/backups`) obrázky listů ani `map-layers.json` nezahrnují (stejně jako dosud u listů).
- Pořadí listů ve vrstvě a pořadí vrstev se neřeší (kreslí se v pořadí přidání).
