---
name: test-ui
description: Ruční nebo automatizované ověření UI Roots & Routes v prohlížeči (dev server, headless Chrome, mobilní viewporty, mapa, bubliny, anonymní režim). Použij po změně šablon, layoutu, mapy nebo stromu.
---

# Ověření UI v prohlížeči

## Spuštění

```bash
cd roots-and-routes && npm run dev   # na pozadí; http://localhost:3000
```
Pro data ze serveru je potřeba `.env` s `BLOB_READ_WRITE_TOKEN`. Bez něj použij zachycení požadavků v prohlížeči a podstrč odpověď `GET /api/gedcom/get`, třeba stáhnutou z produkce: `curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" https://nase-koreny.mikulik.com/api/gedcom/get -o get.json` (soubor ulož do scratchpadu, ne do repa). Bez tokenu přijde anonymní kopie, kterou dostává nepřihlášený návštěvník (iniciály, jen roky, žádné body na mapě). Pro test obou stavů podstrč podle hlavičky `Authorization` plná, nebo anonymní data. Token ber z `.env`, nikam ho nevypisuj. Když ho nemáš, zeptej se uživatele.

## Headless Chrome

Chrome je v `C:\Program Files\Google\Chrome\Application\chrome.exe`. Puppeteer projekt nemá, takže skript a `puppeteer-core` dej do scratchpadu (`npm i puppeteer-core` tam) a spusť ho s `executablePath` na Chrome.

- **Viewporty:** desktop 1440×900, telefon 390×844 a tablet 820×1180, oba s `isMobile: true, hasTouch: true`. Layout mapy a menu (☰ pod 768 px) vždy ověř na telefonu.
- **Scrollování:** `html` má `scroll-behavior: smooth`, používej `el.scrollIntoView({ behavior: 'instant' })`.
- **Hydratace:** po `goto` počkej, až zmizí text načítání, a sleduj chyby v konzoli (`page.on('console')`, `pageerror`), hlavně hydration mismatch.
- **Anonymní režim** je pro nepřihlášené vždy zapnutý: jména jako iniciály, data jen jako rok, místa skrytá. Plné údaje uvidíš jen přihlášený s oprávněním `read` (relace v `localStorage` podle `composables/useAdminAuth.ts`). Bez Blobu podstrč i `POST /api/auth/login` a `GET /api/auth/me` (tvar `SessionInfo` v `types/accounts.ts`) a `GET /api/gedcom/get` podle hlavičky `X-Database`.

## Co kontrolovat

| Oblast | Kontrola |
|---|---|
| Mapa | `#map-container` má na telefonu výšku > 0 a `.ol-viewport canvas` existuje. Značky jsou na plátně, ne v DOM: pozici zjisti přes `window.__eventMap.pixelOf(id)` (jen `npm run dev`) a klepni na `getBoundingClientRect()` prvku `[data-event-map]` + pixel. Klepnutí na značku otevře `MapPersonPanel`, Esc nebo klepnutí do mapy ho zavře. Shluk se klepnutím přiblíží nebo ukáže `[data-event-chooser]`. Historické vrstvy: přepni `[data-historic-layer]` a sleduj požadavky na `gis.cenia.cz` / `gis.kraj-jihocesky.cz`. |
| Bubliny (`HoverTip`) | Fungují při najetí i při fokusu a nepřetékají přes okraj obrazovky. |
| Strom / graf | Po přepnutí stránky a po reloadu jsou data pořád vidět. |
| Jazyk | Přepni EN/CS v Nastavení a ověř, že nezůstal žádný text nepřeložený. |
| Tmavý režim | Čitelnost v obou motivech. |

Uživateli napiš, co bylo ověřeno a v jakých viewportech, a co ověřit nešlo (např. Blob bez tokenu).
