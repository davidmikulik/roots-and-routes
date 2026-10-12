---
name: verify-change
description: Ověření změny v Roots & Routes před commitem nebo deployem (typecheck změněných souborů + nuxt build). Použij po každé úpravě kódu v roots-and-routes/.
---

# Ověření změny

Projekt nemá automatické testy. Postup (vše v `roots-and-routes/`):

1. **Typecheck jen změněných souborů.** V projektu jsou starší TS chyby, proto výstup filtruj:
   ```bash
   cd roots-and-routes
   FILES=$(git diff --name-only HEAD -- . | sed 's#^roots-and-routes/##' | xargs -n1 basename | paste -sd'|')
   npx vue-tsc --noEmit 2>&1 | grep -E "$FILES" || echo "Žádné TS chyby ve změněných souborech"
   ```
2. **Build** (výsledek je `.vercel/output`, trvá ~1–3 min):
   ```bash
   npm run build 2>&1 | tail -5   # musí skončit "✨ Build complete!"
   ```
3. **Pokud změna sahá na tok dat** (store, `/api/gedcom/*`, `storage.ts`, `serialize.ts`): připomeň uživateli ruční test, nebo ho proveď v `npm run dev` (potřebuje `.env` s `BLOB_READ_WRITE_TOKEN`). Postup: import GEDCOM → `/map` → `/tree` → reload → editace osoby → reload.
4. Commit, push a deploy (`npm run deploy`) prováděj jen na výslovný pokyn uživatele.

Uživateli vždy napiš, co z kroků 1–3 proběhlo a co ne.
