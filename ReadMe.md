# Roots & Routes (`roots-and-routes`)

**Roots & Routes** je webová aplikace určená k přehledné prezentaci rodokmenů s důrazem na geografické souvislosti a životní příběhy předků. Hlavním cílem projektu je vizualizovat rodovou historii přímo na mapě – zobrazovat místa narození, sňatků, úmrtí a migraci rodin v čase. Aplikace plně podporuje standardní genealogický formát GEDCOM.

---

## 🔑 Hlavní funkce (Core Features)

### 1. Vizualizace na mapě (Roots & Routes)
* **Geografické události:** Zobrazení klíčových životních milníků na interaktivní mapě:
  * 👶 Narození / Křty
  * 💍 Sňatky
  * ⚰️ Úmrtí / Pohřby
* **Časová osa a filtrace:** Možnost filtrovat události podle období, konkrétních větví rodu nebo konkrétních osob.
* **Cesty předků:** Vizualizace migrace jednotlivců i celých rodin v průběhu generací.

### 2. Správa a editace dat
* **Editace rodokmenu:** Kompletní správce osob, rodin, událostí a vzájemných vztahů přes uživatelské rozhraní.
* **Zobrazení stromu:** Přehledné stromové nebo grafové zobrazení rodokmenu.

### 3. Import, Export a Slučování (GEDCOM)
* **Import GEDCOM (`.ged`):** Načítání genealogických dat ve standardním formátu.
* **Export GEDCOM (`.ged`):** Export kompletního nebo vyfiltrovaného rodokmenu.
* **Chytré slučování (Merge):** Možnost spojit nahrávaný GEDCOM soubor se stávající databází s detekcí duplicit a řešením konfliktů.

### 4. Budoucí rozvoj (Roadmap)
* Prezentace zajímavostí, příběhů, fotografií a historických dokumentů.
* Podpora historických mapových podkladů.
* Statistiky rodu (nejčastější jména, průměrný věk, nejčastější lokace).

---

## 🛠 Technické požadavky & Architektura (Doporučeno)

* **Data Format:** Standard GEDCOM 5.5 / 7.0.
* **Geokódování:** Automatická nebo manuální přeměna textových adres/obcí na souřadnice (Latitude/Longitude).
* **Mapový podklad:** Leaflet / Mapbox / OpenStreetMap.
Pro tento projekt je navržen moderní, efektivní a bezserverový (serverless) stack plně optimalizovaný pro bezplatný hosting na Vercel:

Frontend:

Vue.js 3 + Nuxt 3 (zajišťuje SSR/SSG, skvělé SEO a strukturu aplikací).

Backend (Doporučeno):

Nuxt Server Routes (Nitro engine) – jelikož používáte Nuxt, nejjednodušší, nejčistší a nejvýkonnější backend je přímo jeho vestavěný Nitro server. Na Vercel se automaticky deployuje jako série Serverless Functions, takže neplatíte za žádný běžící server.


Úložiště dat (Storage):

Vercel Blob – nativní objektové úložiště od Vercelu pro ukládání nahraných GEDCOM souborů a parsovaných JSON databází rodokmenu.

Mapová knihovna:

MapLibre GL (např. přes vue-leaflet) nebo MapLibre GL nad podklady OpenStreetMap.

Hosting & Deployment:

Vercel (Free tier – ideální pro Nuxt 3 full-stack aplikace a bezserverové API).

---

## 🚀 Jak začít (Development Setup)

*Tato sekce bude doplněna po zvolení konkrétního tech stacku.*

```bash
# Klonování repozitáře
git clone https://gitlab.com/your-username/roots-and-routes.git
cd roots-and-routes
