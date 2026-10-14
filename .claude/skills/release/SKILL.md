---
name: release
description: Commit, push a nasazení Roots & Routes na produkci (Vercel). Použij jen když uživatel výslovně řekne commit, push nebo deploy/nasaď.
---

# Commit, push, deploy

Každý krok dělej **jen na výslovný pokyn**. „commit“ neznamená push a „push“ neznamená deploy.

## Commit

1. Před commitem změn v kódu spusť skill `verify-change`, pokud ještě neproběhl.
2. `git status` a `git diff`: commituj jen soubory, které patří k úkolu. Nikdy `.env` ani stažená data (`get.json`, `.ged`).
3. Zpráva je krátká, česky bez diakritiky nebo ve tvaru `fix: …` / `feat: …` / `improve: …`, např. `feat: detail osoby na mape po vyberu znacky`. Na konec přidej řádek Co-Authored-By podle pokynů prostředí.
4. Větev `master`, commituje se přímo do ní.

## Push

`git push` do `origin master` (https://github.com/davidmikulik/roots-and-routes). Uživateli napiš hash commitu.

## Deploy

```bash
cd roots-and-routes && npm run deploy   # vercel --prod
```
- Produkce: https://nase-koreny.mikulik.com (region `iad1`).
- Po nasazení ověř, že běží nový build: Nastavení → O aplikaci ukazuje číslo buildu (`YYYYMMDD.HHMM` v UTC) a commit. Musí odpovídat právě pushnutému commitu.
- Rychlá kontrola dat: `curl -s https://nase-koreny.mikulik.com/api/gedcom/get | head -c 300` musí vrátit `"success":true`.
- Po změně toku dat (store, `/api/gedcom/*`, Blob) připomeň uživateli, ať na produkci zkusí import nebo editaci, potom reload.
