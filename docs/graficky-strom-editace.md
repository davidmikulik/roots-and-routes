# Editace v grafickém stromu – popis implementace

Grafický strom (`/graph`) dostane stejné editační funkce jako stránka Strom: úpravu osoby a přidání nové osoby
s předem nastavenou vazbou k vybrané osobě. Všechny editační funkce v aplikaci používají jeden společný editor.

## Požadavky

- Správce může ve grafickém stromu upravit vybranou osobu (osobu uprostřed).
- Správce může založit novou osobu s předem nastavenou vazbou k vybrané osobě: **otec, matka, partner, dítě,
  sourozenec**.
- Editor je jedna společná komponenta pro grafický strom i stránku Strom (úprava, nová osoba, nový příbuzný).
- Pro nepřihlášené a na anonymních datech se editační ovládání nezobrazí (store to navíc odmítne v `requireEditable`).

## Společné části

| Soubor | Role |
|---|---|
| `composables/usePersonEditor.ts` | Stav editoru (otevřeno, koncept osoby, upravovaná osoba, popis vazby) a akce `openEdit(id)`, `openNew(relation?, anchorId?)`, `save()`. Volá se ve stránce, dostává instanci storu (komponenty `useGedcomStore()` volat nesmí). Obsahuje i převod osoby na koncept (`draftFromPerson`) a předvyplnění vazby (`relationDraft`). |
| `app/components/PersonEditor.vue` | Dialog s formulářem (jméno, pohlaví, narození, úmrtí, rodiče, partner a sňatek, další události, odkazy a přílohy, poznámky). Vyčleněný beze změny chování z `tree.vue`. |
| `app/components/PersonRelationActions.vue` | Řada tlačítek „Upravit · Přidat: otce, matku, partnera, dítě, sourozence“ pro jednu osobu. Používá ji grafický strom i detail osoby ve Stromu. |

Stránka zapojí editor takto: `const editor = usePersonEditor(gedcomStore)`, v šabloně
`<PersonEditor :editor="editor" @saved="…" />` a `<PersonRelationActions :editor="editor" :person-id="…" />`.

## Předvyplnění vazby

Nová osoba se ukládá přes stávající `savePerson` (koncept `IndividualDraft`). Vazba se předvyplní do polí formuláře,
která správce může před uložením změnit. V hlavičce editoru je popis vazby („Otec osoby Jan Novák“).

| Vazba | Předvyplnění |
|---|---|
| Otec | pohlaví M; nová osoba se stane otcem vybrané osoby (`parentOf`); partner = matka vybrané osoby, je-li zapsaná |
| Matka | pohlaví F; obdobně, partner = otec |
| Partner | pohlaví opačné k vybrané osobě; partner = vybraná osoba (vznikne rodina, lze vyplnit sňatek) |
| Dítě | otec a matka z první rodiny, ve které je vybraná osoba partnerem; bez partnera je vybraná osoba otcem, nebo matkou podle pohlaví |
| Sourozenec | otec a matka z rodiny, kde je vybraná osoba dítětem |

Tlačítka **Otce** a **Matku** jsou neaktivní, když vybraná osoba daného rodiče už má. **Sourozence** jde přidat jen
osobě se zapsaným rodičem (sourozenci jsou v GEDCOM děti stejné rodiny).

### Změna ve storu: `parentOf`

`savePerson` uměl nastavit jen rodiče, partnera a sňatek *ukládané* osoby. Přidání rodiče k existující osobě
potřebuje nové volitelné pole konceptu `parentOf` (id dítěte). Před zpracováním partnera `savePerson`:

1. vezme první rodinu, kde je dítě potomkem (`familiesAsChild[0]`),
2. nová osoba obsadí místo podle pohlaví (muž → `husband`, žena → `wife`, neznámé → volné místo),
3. když rodina neexistuje, založí ji (`husband`/`wife` + `children: [dítě]`) a doplní vazby oběma směry,
4. když je místo obsazené, uložení odmítne s hláškou (UI tomu brání neaktivním tlačítkem).

Předvyplněný partner (druhý rodič) pak najde tutéž rodinu, takže nevznikne duplicitní rodina a jde rovnou vyplnit
sňatek.

## Grafický strom

- Nad plátnem je pro správce panel vybrané osoby (osoby uprostřed) s `PersonRelationActions` a tlačítkem
  **Uložit na server**, když je vypnuté automatické ukládání a jsou neuložené změny (`state.dirty`).
- Po uložení zůstává uprostřed původní osoba, nový příbuzný se objeví v rozložení kolem ní. Úprava osoby uprostřed
  se projeví hned na kartě.
- Neznámého partnera (`unknown-…`, „Osoba není zapsána“) vybrat ani upravit nejde, není v GEDCOM.

## Stránka Strom

- Vlastní formulář v `tree.vue` nahradí `PersonEditor` (stejná pole a chování, včetně odkazů, příloh a hlášení
  o přenosu souřadnic známých míst).
- Detail vybrané osoby dostane `PersonRelationActions`, takže i tady jde přidat příbuzného s předvyplněnou vazbou.

## Ověření

- `npx vue-tsc --noEmit`, `npm run build`, `npm run check:graph` (syntetické případy).
- Headless Chrome s podstrčenými daty: přidání otce, matky, partnera, dítěte a sourozence v `/graph`, kontrola vazeb
  v souboru a karet na plátně; úprava osoby; editor ve `/tree`; telefon 390 px.
