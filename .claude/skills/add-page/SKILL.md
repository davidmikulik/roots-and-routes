---
name: add-page
description: Přidání nové stránky do Roots & Routes (Nuxt stránka, navigace, překlady, načtení dat, anonymní režim). Použij, když uživatel chce novou stránku, obrazovku nebo položku v menu.
---

# Nová stránka

Vše v `roots-and-routes/`. Vzor: `app/pages/graph.vue` (data ze storu, nastavení, anonymní režim).

## Postup

1. **Soubor stránky** `app/pages/<nazev>.vue`. Importy mimo `srcDir` jdou přes `~~/`:
   ```ts
   import { useGedcomStore } from '~~/composables/useGedcomStore'
   import { useSettings } from '~~/composables/useSettings'
   import { useAnonymize } from '~~/composables/useAnonymize'
   import { useT } from '~~/composables/useT'
   ```
2. **Data až na klientu.** Stránky se prerenderují a cachují, takže nic nenačítej při SSR:
   ```ts
   const loaded = ref(gedcomStore.hasData.value)
   onMounted(async () => {
     if (!gedcomStore.hasData.value) await gedcomStore.refreshFromServer()
     loaded.value = true
   })
   ```
   Store vrací `ComputedRef` i do šablony, takže piš `gedcomStore.hasData.value`, ne `!gedcomStore.hasData`.
3. **Nastavení.** Načítají se až v `onMounted` v `app.vue`. Když z nich stránka bere počáteční hodnotu, nastav ji znovu po `appSettings.ready` (viz `tree.vue`, `map.vue`).
4. **Texty** jen přes `t('klíč')`. Vytvoř `i18n/<nazev>.ts` (skill `add-translations`) a přidej ho do `i18n/index.ts` (`en` i `cs`).
5. **Navigace:** položka do pole `navLinks` v `app/app.vue` (desktopové i mobilní menu ji převezmou) a klíče `nav.<nazev>` a `title.<nazev>` do `i18n/common.ts`.
6. **Prerender:** veřejnou stránku přidej do `nitro.prerender.routes` v `nuxt.config.ts`.
7. **Osobní údaje:** každé jméno, datum a místo zobraz přes `anon.name(...)`, `anon.date(...)`, `anon.place(...)`. Datum formátuj z textu GEDCOM (`utils/gedcom/dates.ts`), ne z `Date`. Jména (`names[].full`) jsou bez lomítek, nikdy je nepřidávej.
8. **Editace** skryj podle oprávnění (`adminAuth.canEdit.value`, `canRead`, `canManage`, `isSystemAdmin`, viz `composables/useAdminAuth.ts`) a mutace dělej ve storu (skill `edit-store-data`).
9. **Rozložení** ověř i na telefonu (skill `test-ui`).

Nakonec spusť skill `verify-change`.
