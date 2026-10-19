---
name: add-api-endpoint
description: Přidání nebo úprava serverového endpointu v Roots & Routes (Nitro routes v server/routes/api, Vercel Blob, oprávnění uživatelů a datové základny). Použij při práci na API, ukládání do Blobu, zálohách nebo katalogu lokalit.
---

# Serverový endpoint

Routy jsou v `server/routes/api/` a název souboru určuje metodu (`save.post.ts`, `get.get.ts`). Server-only kód patří do `server/utils/`, sdílený kód pro klient i server do `utils/`.

## Zabezpečení

- `server/middleware/loginForWrites.ts` vyžaduje přihlášení (relace nebo `ADMIN_API_TOKEN`) u všeho kromě GET/HEAD/OPTIONS a `/api/auth/login`. Oprávnění ověřuje každý endpoint sám jako první řádek (`~~/server/utils/access`):
  - data jedné datové základny: `const { db } = await requireDatabase(event, 'read' | 'edit' | 'admin')`, soubory přes `databasePaths(db)` (`original`, `parsed`, `backups`, `media`, `prefix`). Nikdy nepiš natvrdo `uploads/gedcom/...` pro data stromu.
  - společná data (katalog míst, mapové vrstvy, uživatelé): `await requireActor(event, role)`.
- Veřejné je jen `GET /api/gedcom/get`, a to bez oprávnění `read` vrací anonymní kopii (`resolveDatabase` + `anonymizeGedcomFile`). Kdo přidá další čtecí endpoint s osobními údaji, musí vyžadovat `read`, nebo anonymizovat stejně, a nastavit `cache-control: private, no-store` a `vary: Authorization, X-Database`.
- `/api/gedcom/export` vyžaduje `read`.

## Vzor (zápis)

```ts
import { databasePaths, requireDatabase } from '~~/server/utils/access'
import { deserializeGedcomFile, type SerializedGedcomFile } from '~~/utils/gedcom/serialize'

export default defineEventHandler(async (event) => {
  const { db } = await requireDatabase(event, 'edit')
  const body = await readBody<{ fileData: SerializedGedcomFile }>(event)
  if (!body?.fileData) throw createError({ statusCode: 400, statusMessage: 'fileData is required' })
  const file = deserializeGedcomFile(body.fileData)
  // ...
  return { success: true }
})
```

## Data a úložiště

- `GedcomFile` jde ven i dovnitř jen přes `serializeGedcomFile` / `deserializeGedcomFile`, jinak se z `Map` stane `{}`.
- Blob (private): funkce v `server/utils/storage.ts` (`saveParsedGedcom`, `loadParsedGedcom`, …) a `server/utils/backups.ts`. Cesty jsou pod `uploads/gedcom/`. Aplikace je pro jednoho uživatele, `fileId` je vždy `current`.
- `listUserFiles()` vrací celý prefix, tedy i `parsed/`, `exports/`, `backups/` a `known-locations.json`. Filtruj výsledky.
- `FormData`: textová pole musí být **za** souborem (viz `import.post.ts`).
- Logy pro Vercel piš s prefixem (`[GEDCOM]`, `[GEDCOM GET]`, `[STORAGE]`). Existující `console.log` nemaž.
- `/api/**` má `cache-control: no-cache` (`nuxt.config.ts`).

## Klient

Volání z prohlížeče: `$fetch(url, { method, headers: adminAuth.authHeaders(), body })` (posílá i `X-Database`), mutace jen ve storu (skill `edit-store-data`).

## Ověření

Skill `verify-change`. Lokální `npm run dev` potřebuje `.env` s `BLOB_READ_WRITE_TOKEN` a `ADMIN_API_TOKEN`. Bez tokenu Blobu nejde endpoint s úložištěm otestovat, a to uživateli řekni.
