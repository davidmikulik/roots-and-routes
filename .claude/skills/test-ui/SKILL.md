---
name: test-ui
description: Ruční nebo automatizované ověření UI Roots & Routes v prohlížeči (dev server, headless Chrome, mobilní viewporty, mapa, bubliny, anonymní režim). Použij po změně šablon, layoutu, mapy nebo stromu.
---

# Ověření UI v prohlížeči

## Spuštění

```bash
cd roots-and-routes && npm run dev   # na pozadí; http://localhost:3000
```
Pro data ze serveru je potřeba `.env` s `BLOB_READ_WRITE_TOKEN`. Bez něj použij zachycení požadavků v prohlížeči a podstrč odpověď `GET /api/gedcom/get`, třeba stáhnutou z produkce: `curl https://nase-koreny.mikulik.com/api/gedcom/get -o get.json` (soubor ulož do scratchpadu, ne do repa).

## Headless Chrome

Chrome je v `C:\Program Files\Google\Chrome\Application\chrome.exe`. Puppeteer projekt nemá, takže skript a `puppeteer-core` dej do scratchpadu (`npm i puppeteer-core` tam) a spusť ho s `executablePath` na Chrome.

- **Viewporty:** desktop 1440×900, telefon 390×844 a tablet 820×1180, oba s `isMobile: true, hasTouch: true`. Layout mapy a menu (☰ pod 768 px) vždy ověř na telefonu.
- **Scrollování:** `html` má `scroll-behavior: smooth`, používej `el.scrollIntoView({ behavior: 'instant' })`.
- **Hydratace:** po `goto` počkej, až zmizí text načítání, a sleduj chyby v konzoli (`page.on('console')`, `pageerror`), hlavně hydration mismatch.
- **Anonymní režim** je pro nepřihlášené vždy zapnutý: jména jako iniciály, data jen jako rok, místa skrytá. Plné údaje uvidíš jen s admin tokenem (`localStorage` podle `composables/useAdminAuth.ts`).

## Co kontrolovat

| Oblast | Kontrola |
|---|---|
| Mapa | `#map-container` má na telefonu výšku > 0. `.leaflet-container` nesmí mít v CSS `height`. Klepnutí na značku otevře `MapPersonPanel`, Esc nebo klepnutí do mapy ho zavře. |
| Bubliny (`HoverTip`) | Fungují při najetí i při fokusu a nepřetékají přes okraj obrazovky. |
| Strom / graf | Po přepnutí stránky a po reloadu jsou data pořád vidět. |
| Jazyk | Přepni EN/CS v Nastavení a ověř, že nezůstal žádný text nepřeložený. |
| Tmavý režim | Čitelnost v obou motivech. |

Uživateli napiš, co bylo ověřeno a v jakých viewportech, a co ověřit nešlo (např. Blob bez tokenu).
