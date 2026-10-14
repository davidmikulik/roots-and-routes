---
name: add-translations
description: Přidání nebo úprava textů v UI Roots & Routes (překlady EN/CS v i18n/). Použij, kdykoli se v šabloně nebo kódu objevuje text pro uživatele, nebo když uživatel chce změnit popisek, hlášku či překlad.
---

# Texty a překlady

Natvrdo psaný text ve stránkách a komponentách je chyba. Vše jde přes `const { t } = useT()` (`~~/composables/useT`).

## Kam klíč patří

- `i18n/common.ts`: hlavička, menu (`nav.*`), titulky stránek (`title.*`), přihlášení admina (`admin.*`), patička.
- `i18n/<stránka>.ts`: texty jedné stránky (`map`, `tree`, `graph`, `gedcom`, `settings`, `locations`, `home`).
- Nový soubor přidej do `i18n/index.ts` do obou objektů `en` i `cs`.

## Formát

```ts
import { defineMessages } from './define'

export default defineMessages({
  'graph.empty': 'No data loaded',
}, {
  'graph.empty': 'Nejsou načtena žádná data',
})
```

- První objekt je angličtina, druhý čeština. `defineMessages` hlídá v typech, že čeština má každý anglický klíč.
- Klíče mají prefix stránky (`graph.…`) a musí být v celé aplikaci unikátní, protože `index.ts` slučuje všechny soubory do jednoho objektu.
- Typ `MessageKey` se z nich odvozuje sám. Pole klíčů (např. `navLinks`) typuj jako `MessageKey`.
- Čeština: běžný spisovný jazyk, krátké popisky, uvozovky „…“.

## Ověření

`npx vue-tsc --noEmit 2>&1 | grep i18n` nesmí nic vypsat. Chybějící český klíč se projeví chybou typu v `defineMessages`.
