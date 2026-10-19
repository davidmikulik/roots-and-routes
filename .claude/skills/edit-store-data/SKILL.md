---
name: edit-store-data
description: Přidání nebo změna operace, která mění data rodokmenu v Roots & Routes (useGedcomStore — editace, mazání, merge, hromadné úpravy osob a rodin). Použij, kdykoli má aplikace nově zapisovat do stromu.
---

# Změna dat ve storu

Jediný klientský store je `composables/useGedcomStore.ts` (`useState('gedcom-store')`). Vzor: `removePerson`, `savePerson`.

## Kostra mutace

```ts
const doSomething = async (...): Promise<void> => {
  requireEditable()                        // 1. jen s oprávněním edit a nikdy na anonymních datech
  const file = state.value.file
  if (!file) return
  // 2. změň file.individuals / file.families (jsou to Map) a udrž vazby oběma směry:
  //    family.husband/wife/children  ↔  person.familiesAsSpouse/familiesAsChild
  file.metadata.totalIndividuals = file.individuals.size
  file.metadata.totalFamilies = file.families.size
  setFile(file, { ... })                   // 3. setFile musí zachovat fileId
  if (import.meta.client) {
    await saveContent(writeGedcom(file))   // 4. záloha do IndexedDB
    await persist(file)                    // 5. server, nebo jen state.dirty
  }
}
```

Novou funkci přidej do objektu, který `useGedcomStore()` vrací.

## Pravidla

- **`persist`** podle nastavení `data.autoSave` buď hned uloží (`POST /api/gedcom/save`), nebo nastaví `state.dirty`. Uživatel pak ukládá tlačítkem (`saveNow`). Dokud je `dirty`, `refreshFromServer` nepřepisuje data a `app.vue` varuje před zavřením stránky.
- **Každý požadavek** na server s mutací posílá `headers: adminAuth.authHeaders(state.value.databaseId)`, aby šel do základny, ze které je strom načtený.
- **`GedcomFile` obsahuje `Map` a `Date`.** Přes JSON vždy posílej `serializeGedcomFile` / `deserializeGedcomFile` (`utils/gedcom/serialize.ts`). Nové pole typu `Date` v `types/gedcom.ts` přidej do `DATE_KEYS`.
- **Jména:** `names[].full` je bez lomítek. Rozklad a zápis GEDCOM jmen dělají `parseGedcomName` / `nameToGedcom` (`utils/gedcom/names.ts`).
- **UI:** tlačítka pro editaci skryj přes `adminAuth.canEdit.value` (nahrazení stromu a obnova záloh `canManage`).
- Před riskantní hromadnou změnou zvaž zálohu: `POST /api/admin/backups` (vzor `mergeFile`).

## Ověření

Skill `verify-change`, potom ručně: úprava → uložení → reload → `/map`, `/tree`, `/graph`. Data musí zůstat i po přepnutí stránky. Když nezůstanou, použij skill `debug-gedcom-data`.
