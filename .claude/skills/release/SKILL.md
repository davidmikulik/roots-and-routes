---
name: release
description: Commit, push a nasazení Roots & Routes na produkci (Vercel nasazuje automaticky po pushi). Použij jen když uživatel výslovně řekne commit, push nebo deploy/nasaď.
---

# Commit, push, deploy

Každý krok dělej **jen na výslovný pokyn**. „commit“ neznamená push. **Push do `master` ale znamená nasazení na produkci**: Vercel má Git integraci a po pushi nasazuje sám. Před pushem to uživateli připomeň, pokud o tom zjevně neví.

## Commit

1. Před commitem změn v kódu spusť skill `verify-change`, pokud ještě neproběhl.
2. Změna, kterou uživatel uvidí, se **vždy** promítne do novinek i do O aplikaci (viz AGENTS.md): položka v `roots-and-routes/utils/releaseNotes.ts` (česky i anglicky; nové vydání = nová položka na začátku `RELEASE_NOTES` a stejná `version` v `roots-and-routes/package.json`) a aktuální seznam funkcí a technologií v O aplikaci (`settings.about.*` v `roots-and-routes/i18n/settings.ts`). Ověř `npm run check:release`.
3. `git status` a `git diff`: commituj jen soubory, které patří k úkolu. Nikdy `.env` ani stažená data (`get.json`, `.ged`).
4. Zpráva je krátká, česky bez diakritiky nebo ve tvaru `fix: …` / `feat: …` / `improve: …`, např. `feat: detail osoby na mape po vyberu znacky`. Na konec přidej řádek Co-Authored-By podle pokynů prostředí.
5. Větev `master`, commituje se přímo do ní.

## Push

`git push` do `origin master` (https://github.com/davidmikulik/roots-and-routes). Uživateli napiš hash commitu.

## Deploy (automaticky po pushi)

Produkce: https://nase-koreny.mikulik.com (region `iad1`). Build na Vercelu trvá asi 1–3 minuty od pushe.

Po pushi ověř, že běží nový build. Nastavení → O aplikaci ukazuje číslo buildu (`YYYYMMDD.HHMM` v UTC) a commit, který musí odpovídat právě pushnutému commitu:
```bash
curl -s https://nase-koreny.mikulik.com/settings | grep -o 'commit:"[^"]*"\|number:"[^"]*"'
```
Číslo se objeví ve vykresleném HTML, protože `/settings` se neprerenderuje. Když po pár minutách pořád ukazuje starý commit, napiš to uživateli: deploy na Vercelu nejspíš selhal nebo čeká.

- Rychlá kontrola dat: `curl -s https://nase-koreny.mikulik.com/api/gedcom/get | head -c 300` musí vrátit `"success":true` (bez tokenu jsou to anonymní data, `"anonymized":true` je na konci odpovědi).
- Po změně toku dat (store, `/api/gedcom/*`, Blob) připomeň uživateli, ať na produkci zkusí import nebo editaci, potom reload.

## Ruční deploy (jen na vyžádání)

Jen když automatický deploy neproběhl **a uživatel ho výslovně vyžádá**:
```bash
cd roots-and-routes && npm run deploy   # vercel --prod
```
Složka není propojená přes `vercel link`, takže se CLI zeptá „Set up and deploy …?“ a na výběr projektu. Na tyto otázky neodpovídej za uživatele: zastav se, ať příkaz spustí sám nebo potvrdí projekt na Vercelu. Jinak by vznikl nový, prázdný projekt.
