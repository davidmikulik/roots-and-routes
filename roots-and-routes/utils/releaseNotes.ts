// Release notes shown on /release-notes, on the home page (the latest release) and in Settings → About.
// Newest release first. Every release adds an entry here and the same version to package.json (the About page shows
// the version from package.json; scripts/check-release-notes.mts checks they match). Texts are for users, in Czech
// and English, without technical terms.
export type ReleaseItemKind = 'new' | 'improved' | 'fixed'

export interface ReleaseItem {
  kind: ReleaseItemKind
  cs: string
  en: string
}

export interface Release {
  version: string
  // ISO date of the release (YYYY-MM-DD)
  date: string
  title: { cs: string; en: string }
  items: ReleaseItem[]
}

export const RELEASE_NOTES: Release[] = [
  {
    version: '1.12.0',
    date: '2026-10-29',
    title: { cs: 'Nahrání zálohy z disku', en: 'Uploading a backup from the disk' },
    items: [
      { kind: 'new', cs: 'V Nastavení → Data a zálohy jde nahrát zálohu z disku: soubor GEDCOM (.ged) nebo stažený ZIP i s přílohami. Objeví se v seznamu záloh a obnovíte ji tlačítkem Obnovit.', en: 'Settings → Data and backups can upload a backup from the disk: a GEDCOM file (.ged) or a downloaded ZIP with its attachments. It appears in the list of backups and Restore brings it back.' },
    ],
  },
  {
    version: '1.11.0',
    date: '2026-10-29',
    title: { cs: 'Ruční záloha a stažení zálohy', en: 'Manual backup and backup download' },
    items: [
      { kind: 'new', cs: 'V Nastavení → Data a zálohy je tlačítko Zálohovat teď: zazálohuje strom uložený na serveru i s přílohami. Starší zálohy nad nastavený počet se smažou.', en: 'Settings → Data and backups has a Back up now button: it backs up the tree saved on the server with its attachments. Older backups over the set number are deleted.' },
      { kind: 'new', cs: 'Každou zálohu jde stáhnout: bez příloh jako soubor GEDCOM, s přílohami jako ZIP (gedcom.ged a složka media).', en: 'Every backup can be downloaded: without attachments as a GEDCOM file, with attachments as a ZIP (gedcom.ged and the media folder).' },
    ],
  },
  {
    version: '1.10.2',
    date: '2026-10-28',
    title: { cs: 'Export GEDCOM vždy po ruce', en: 'GEDCOM export always at hand' },
    items: [
      { kind: 'improved', cs: 'Na stránce Import a export GEDCOM je stále sekce Export: ukazuje rodokmen, počet osob a příloh a stáhne celý strom (s přílohami jako ZIP). Dřív se export nabízel jen hned po importu.', en: 'The GEDCOM import and export page always has an Export section: it shows the family tree, the number of people and attachments and downloads the whole tree (with attachments as a ZIP). Before, the export was offered only right after an import.' },
      { kind: 'improved', cs: 'Tlačítko Exportovat GEDCOM je ve Stromu ve všech zobrazeních, nejen v seznamu.', en: 'The Export GEDCOM button is on the Tree page in every view, not only in the list.' },
    ],
  },
  {
    version: '1.10.1',
    date: '2026-10-21',
    title: { cs: 'Věk žijících a věk ve všech stromech', en: 'Age of living people in every tree' },
    items: [
      { kind: 'improved', cs: 'Osoba bez data úmrtí a bez příznaku „Zemřel(a)“ se považuje za žijící a ukazuje se u ní aktuální věk. V editoru je proto jen volba Žije / Zemřel(a); zemřelou osobu bez známého data úmrtí označte „Zemřel(a)“.', en: 'A person without a date of death and not marked "Deceased" counts as living and shows the current age. The editor therefore offers only Living / Deceased; mark a deceased person whose date of death is not known as "Deceased".' },
      { kind: 'improved', cs: 'Věk je přímo u osob i v zobrazení stromu a grafu na stránce Strom (k seznamu, detailu a grafickému stromu).', en: 'The age is shown right at the people also in the tree and chart views of the Tree page (besides the list, the detail and the graphical tree).' },
    ],
  },
  {
    version: '1.10.0',
    date: '2026-10-20',
    title: { cs: 'Věk osob', en: 'Age of people' },
    items: [
      { kind: 'new', cs: 'U každé osoby je vidět věk: u žijící současný, u zemřelé dožitý věk. Když není známé datum narození nebo úmrtí nebo se neví, zda osoba žije, je místo věku „?“. U neúplných dat (jen rok, „asi“) je věk označen „asi“. Věk je v detailu osoby, v seznamu Stromu (sloupec Věk) a na kartách grafického stromu.', en: 'Every person shows their age: the current age of a living person, the age at death of a deceased one. When the date of birth or death is missing, or it is not known whether the person is alive, "?" is shown instead. Incomplete dates (a year only, "about") make the age "about". The age is in the person detail, in the Tree list (column Age) and on the cards of the graphical tree.' },
    ],
  },
  {
    version: '1.9.1',
    date: '2026-10-20',
    title: { cs: 'Jednotný detail osoby', en: 'One person detail everywhere' },
    items: [
      { kind: 'improved', cs: 'Detail osoby ve Stromu (zobrazení stromu, grafu i seznamu) je stejný jako na mapě a v grafickém stromu: všechny události s místy, rodiče, partneři a děti (klepnutím se přejde na jejich detail), zdroje, odkazy a odkaz Vybrat na mapě.', en: 'The person detail on the Tree page (tree, chart and list views) is the same as on the map and in the graphical tree: all events with places, parents, partners and children (a click opens their detail), sources, links and Choose on the map.' },
      { kind: 'improved', cs: 'Nastavení „Zobrazit podrobnosti“ ve Stromu odpadlo, detail ukazuje vždy všechno.', en: 'The Tree setting "Show detailed info" is gone, the detail always shows everything.' },
    ],
  },
  {
    version: '1.9.0',
    date: '2026-10-20',
    title: { cs: 'Zdroje údajů a žijící osoby', en: 'Sources of facts and living people' },
    items: [
      { kind: 'new', cs: 'Ke každému údaji osoby (jméno, jméno po sňatku, pohlaví, narození, úmrtí, sňatek a další události) jde v editoru připojit zdroj: existující odkaz nebo přílohu osoby, nebo rovnou nový. V detailu osoby jsou Zdroje údajů s čísly odkazů.', en: 'Every fact of a person (name, name after marriage, sex, birth, death, marriage and other events) can have its sources in the editor: an existing link or attachment of the person, or a new one. The person detail lists the Sources of the facts with the numbers of the links.' },
      { kind: 'new', cs: 'U osoby jde zapsat, zda žije, zemřela, nebo to nevíme. Zemřelá osoba nemusí mít datum úmrtí; detail ukazuje „žije“ nebo „zemřel(a)“.', en: 'A person can be recorded as living, deceased or not known. A deceased person needs no date of death; the detail shows "living" or "deceased".' },
      { kind: 'fixed', cs: 'Zdroje událostí z importovaného souboru GEDCOM se při uložení osoby už neztrácejí a úmrtí bez data („zemřel“) zůstane zachované.', en: 'Sources of events from an imported GEDCOM file are no longer lost when a person is saved, and a death without a date ("deceased") is kept.' },
      { kind: 'fixed', cs: 'Po uložení osoby ve Stromu se znovu otevře její detail.', en: 'After saving a person on the Tree page, their detail opens again.' },
    ],
  },
  {
    version: '1.8.1',
    date: '2026-10-19',
    title: { cs: 'Veřejný rodokmen pro přihlášené a známá místa', en: 'The public family tree for logged-in users and known places' },
    items: [
      { kind: 'fixed', cs: 'Přihlášený uživatel s rolí číst nebo editovat vidí veřejný rodokmen celý, ne jen anonymizovaný. Upravovat ho může jen ten, komu ho přidělíte k editaci.', en: 'A logged-in user with the role read or edit sees the public family tree in full, not only anonymized. Only those it is shared with for editing can change it.' },
      { kind: 'improved', cs: 'Známá místa upravuje jen administrátor. Ostatním se při úpravě osoby souřadnice z katalogu jen doplní.', en: 'Known places are changed by the administrator only. For others, editing a person only fills in coordinates from the catalog.' },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-10-19',
    title: { cs: 'Uživatelé, oprávnění a více rodokmenů', en: 'Users, permissions and several family trees' },
    items: [
      { kind: 'new', cs: 'Přihlášení jménem a heslem místo tokenu správce. Při prvním přihlášení zadejte své jméno a jako heslo dosavadní token: stanete se administrátorem a dosavadní rodokmen bude váš.', en: 'Logging in with a user name and password instead of the administrator token. For the first login enter your name and the former token as the password: you become the administrator and the existing family tree becomes yours.' },
      { kind: 'new', cs: 'Administrátor spravuje uživatele (Uživatelé pod zámkem): zakládá je, mění jim roli a heslo a maže je. Role jsou demo (jen anonymizovaná data), číst, editovat a administrovat.', en: 'The administrator manages users (Users under the lock): creates them, changes their role and password and deletes them. The roles are demo (only anonymized data), read, edit and administer.' },
      { kind: 'new', cs: 'Datové základny: každý uživatel s právem editovat může mít vlastní rodokmeny a přidělit je dalším uživatelům s oprávněním (Můj účet). Mezi základnami se přepíná v menu pod zámkem.', en: 'Databases: every user who can edit can have their own family trees and share them with other users with a permission (My account). Switch between them in the menu under the lock.' },
      { kind: 'improved', cs: 'Zálohy a přílohy patří ke své datové základně. Známá místa a mapové vrstvy jsou společné pro všechny.', en: 'Backups and attachments belong to their database. Known places and map layers are shared by all.' },
      { kind: 'new', cs: 'Každý si může změnit heslo v sekci Můj účet.', en: 'Everyone can change their password under My account.' },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-10-19',
    title: { cs: 'Katastrální mapa při umísťování listů', en: 'Cadastral map when placing sheets' },
    items: [
      { kind: 'new', cs: 'Při umísťování listu na mapu (Mapové vrstvy) jde jako současnou mapu zvolit i Katastrální mapu. Hranice dnešních parcel jsou vidět nad náhledem listu, takže se podle nich dají přesně umístit body.', en: 'When placing a sheet on the map (Map layers), the Cadastral map can be chosen as the current map. Today\'s parcel borders are shown over the preview of the sheet, so points can be placed precisely along them.' },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-10-18',
    title: { cs: 'Úvodní stránka a menu správce', en: 'Home page and the administrator menu' },
    items: [
      { kind: 'improved', cs: 'Úvodní stránka je pro návštěvníky: přehled aplikace, cesta na mapu a do grafického stromu, karty funkcí jsou odkazy.', en: 'The home page is for visitors: what the app offers, the way to the map and the graphical tree, the feature cards are links.' },
      { kind: 'new', cs: 'Po přihlášení správce je pod zámkem v hlavičce menu Správa: import a export GEDCOM, známá místa, mapové vrstvy, zálohy a data.', en: 'Once the administrator logs in, the lock in the header opens an Administration menu: GEDCOM import and export, known places, map layers, backups and data.' },
      { kind: 'improved', cs: 'Položku GEDCOM v menu, import na mapě a odkazy na správu v Nastavení vidí jen přihlášený správce.', en: 'The GEDCOM menu item, the import on the map and the administration links in Settings are shown only to the logged-in administrator.' },
      { kind: 'improved', cs: 'Novinky jsou v Nastavení → O aplikaci.', en: 'Release notes are in Settings → About.' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-18',
    title: { cs: 'Jména, data a detail osoby', en: 'Names, dates and the person detail' },
    items: [
      { kind: 'new', cs: 'Rodné jméno a příjmení po sňatku. Osoba se zobrazuje jako „Marie Nováková (roz. Dvořáková)“. Jména po sňatku z původně importovaného souboru jde převzít v Nastavení → Data.', en: 'Birth name and surname after marriage. A person is shown as "Marie Nováková (née Dvořáková)". Names after marriage from the originally imported file can be taken over in Settings → Data.' },
      { kind: 'new', cs: 'Jméno a příjmení se zadávají zvlášť. Hledání a řazení podle rodového jména, ve Stromu filtr Rodové jméno.', en: 'Given name and surname are entered separately. Search and sorting by family name, a Family name filter on the Tree page.' },
      { kind: 'new', cs: 'Na mapě se osoba vybírá psaním jména, příjmení nebo roku narození, bez ohledu na diakritiku.', en: 'On the map a person is chosen by typing a name, surname or year of birth, diacritics do not matter.' },
      { kind: 'new', cs: 'Neúplná data událostí: jen rok, měsíc a rok, s upřesněním asi, před nebo po. Zobrazují se slovy, např. „asi 1850“ nebo „březen 1850“.', en: 'Incomplete event dates: just a year, a month and year, about, before or after. They are shown in words, e.g. "about 1850" or "March 1850".' },
      { kind: 'new', cs: 'U úmrtí jde zapsat příčinu.', en: 'A cause of death can be recorded.' },
      { kind: 'new', cs: 'Grafický strom: detail osoby a menu na pravé tlačítko myši se stejnými akcemi jako tlačítka.', en: 'Graphical tree: a person detail and a right-click menu with the same actions as the buttons.' },
      { kind: 'new', cs: 'Detail osoby na mapě má tlačítko Vybrat osobu, detail v grafickém stromu odkaz Vybrat na mapě.', en: 'The person detail on the map has a Choose the person button, the detail in the graphical tree a Choose on the map link.' },
      { kind: 'new', cs: 'Odkazy a vložené dokumenty jsou vidět i v detailu osoby na mapě a v grafickém stromu.', en: 'Links and stored documents are shown in the person detail on the map and in the graphical tree too.' },
      { kind: 'new', cs: 'Novinky jednotlivých verzí (tato stránka), na úvodní stránce a v O aplikaci.', en: 'Release notes (this page), on the home page and in About.' },
      { kind: 'fixed', cs: 'Editor už při uložení nemění neúplná data na 1. ledna a datum jde smazat.', en: 'The editor no longer turns incomplete dates into 1 January when saving, and a date can be removed.' },
      { kind: 'fixed', cs: 'U událostí se už nezobrazují pomocné údaje z MyHeritage (např. MH:I500003 nebo čas úpravy).', en: 'Events no longer show helper values from MyHeritage (e.g. MH:I500003 or the time of a change).' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-18',
    title: { cs: 'Vlastní mapové vrstvy a úpravy v grafickém stromu', en: 'Own map layers and editing in the graphical tree' },
    items: [
      { kind: 'new', cs: 'Vlastní vrstvy historických map: nahrané listy umístěné na mapu body, které jde kdykoli upravit, přesunout nebo odebrat (Admin → Mapové vrstvy).', en: 'Own historical map layers: uploaded sheets placed on the map by points that can be edited, moved or removed at any time (Admin → Map layers).' },
      { kind: 'new', cs: 'Úpravy v grafickém stromu: úprava osoby a přidání otce, matky, partnera, dítěte nebo sourozence s předvyplněnou vazbou.', en: 'Editing in the graphical tree: edit a person and add a father, mother, partner, child or sibling with the relation filled in.' },
      { kind: 'improved', cs: 'Jeden společný editor osob pro Strom i Grafický strom.', en: 'One person editor shared by the Tree and the Graphical tree.' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-17',
    title: { cs: 'Historické mapy', en: 'Historical maps' },
    items: [
      { kind: 'new', cs: 'Nová mapa s historickými vrstvami: vojenská mapování, císařské otisky stabilního katastru, letecké snímky z 50. let, turistická mapa, katastr a čísla domů.', en: 'A new map with historical layers: military surveys, imperial imprints of the stable cadastre, aerial photos from the 1950s, a topographic map, the cadastre and house numbers.' },
      { kind: 'new', cs: 'Ke známým místům jde přidat odkazy, např. na listy archivu ČÚZK nebo kroniku.', en: 'Known places can have links, e.g. to sheets of the ČÚZK archive or a chronicle.' },
      { kind: 'new', cs: 'Pravé tlačítko na mapě ukáže GPS souřadnice a otevře místo v Mapy.com nebo Google Maps.', en: 'A right click on the map shows the GPS coordinates and opens the place in Mapy.com or Google Maps.' },
      { kind: 'improved', cs: 'Události v editoru mají nadpis podle typu (např. Bydliště 2).', en: 'Events in the editor are headed by their type (e.g. Residence 2).' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-16',
    title: { cs: 'Přílohy, zálohy a známá místa', en: 'Attachments, backups and known places' },
    items: [
      { kind: 'new', cs: 'Odkazy u osoby s kopií obrázku nebo dokumentu přímo do stromu, i vložením ze schránky.', en: 'Links of a person with a copy of an image or document stored in the tree, also pasted from the clipboard.' },
      { kind: 'new', cs: 'Zálohy a export obsahují i přílohy (export jako ZIP).', en: 'Backups and the export include the attachments (export as ZIP).' },
      { kind: 'new', cs: 'Souřadnice se při úpravě osoby a při importu synchronizují se známými místy; tlačítko pro synchronizaci celého stromu.', en: 'Coordinates are synced with the known places when a person is edited and on import; a button syncs the whole tree.' },
      { kind: 'improved', cs: 'Nepřihlášení návštěvníci dostávají jen anonymní data a export je jen pro správce.', en: 'Visitors who are not logged in get only anonymized data, and the export is for the administrator only.' },
      { kind: 'fixed', cs: 'Pomocné značky z MyHeritage se už nenačítají jako události.', en: 'Helper tags from MyHeritage are no longer read as events.' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-13',
    title: { cs: 'Grafický strom a anonymní režim', en: 'Graphical tree and anonymous mode' },
    items: [
      { kind: 'new', cs: 'Grafický strom: předci nahoře, potomci dole, posun a přiblížení.', en: 'Graphical tree: ancestors above, descendants below, pan and zoom.' },
      { kind: 'new', cs: 'Detail osoby po klepnutí na značku na mapě.', en: 'A person detail after clicking a marker on the map.' },
      { kind: 'new', cs: 'Anonymní režim: iniciály místo jmen, jen roky, skrytá místa.', en: 'Anonymous mode: initials instead of names, years only, places hidden.' },
      { kind: 'new', cs: 'Bubliny s celým datem u roků života a s místem u událostí.', en: 'Tooltips with the full date at the years of life and the place at the events.' },
      { kind: 'improved', cs: 'Menu a rozložení pro telefon a tablet; číslo verze v O aplikaci.', en: 'Menu and layout for phones and tablets; the version number in About.' },
      { kind: 'fixed', cs: 'Příjmení se už nezobrazují v lomítkách.', en: 'Surnames are no longer shown in slashes.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-12',
    title: { cs: 'První verze', en: 'First version' },
    items: [
      { kind: 'new', cs: 'Import souboru GEDCOM a uložení stromu na server.', en: 'GEDCOM import and saving the tree on the server.' },
      { kind: 'new', cs: 'Mapa událostí, seznam a strom osob, úpravy osob.', en: 'A map of events, a list and tree of people, editing people.' },
      { kind: 'new', cs: 'Známá místa se souřadnicemi, jejich import a export.', en: 'Known places with coordinates, their import and export.' },
      { kind: 'new', cs: 'Přihlášení správce pro všechny změny a nastavení aplikace.', en: 'Administrator login for all changes, and the settings.' },
    ],
  },
]

export const LATEST_RELEASE = RELEASE_NOTES[0]!
