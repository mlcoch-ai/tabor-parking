# 🅿️ Parkování — tábor

Jednoduchá webová appka, kde na plánku tábora vidíš obsazenost parkovišť a kdokoliv
může zadat, **kolik aut kde stojí** a **jaká je kapacita**. Nahoře je barevné
doporučení, jestli jet **spodní** nebo **horní** cestou.

- 📱 Funguje na mobilu i počítači (stačí odkaz, žádná instalace).
- 🔴🟠🟢 Parkoviště se barví podle obsazenosti.
- ⚡ Změny se u všech objeví **živě** (přes Supabase realtime).
- ✏️ Parkoviště se kreslí přímo do mapy (režim úprav).
- 🙈 Bez přihlašování, `noindex` (nebude ve vyhledávačích).

---

## Rychlý start (demo)

Otevři `index.html` v prohlížeči. Dokud není nastavené Supabase, běží **demo režim** —
data se ukládají jen v tvém prohlížeči (nikdo jiný je nevidí). Slouží k vyzkoušení UI.

## Ostrý provoz — 3 kroky

### 1) Supabase (sdílení dat mezi lidmi)
1. Založ projekt na <https://supabase.com> (zdarma).
2. V **SQL Editoru** spusť obsah souboru [`supabase-setup.sql`](supabase-setup.sql)
   (vytvoří tabulku `parking_spots`, práva a zapne realtime).
3. V **Project Settings → API** zkopíruj:
   - **Project URL** → do `config.js` jako `SUPABASE_URL`
   - **anon public** klíč → do `config.js` jako `SUPABASE_ANON_KEY`

> ⚠️ Používej jen **anon public** klíč (je určený do prohlížeče, je veřejný).
> Klíč **service_role** je tajný a nikdy nesmí do kódu.

### 2) Mapa
Nahraď `assets/map.png` vlastním plánkem tábora (stejný název souboru).
Souřadnice parkovišť se ukládají relativně, takže sedí na jakýkoliv obrázek.

### 3) Nasazení zdarma na GitHub Pages
V repozitáři: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Po pushi na větev `claude/camp-parking-app-mz4yq2` se web sám nasadí
(workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) a dostaneš veřejnou URL.

---

## Dvě části aplikace

| Stránka | K čemu | Kdo |
|---|---|---|
| `index.html` | **Veřejná appka** — prohlížení obsazenosti + zadání počtu aut | všichni |
| `editor.html` | **Editor parkovišť** — kreslení a správa parkovišť | jen ty (správce) |

Editor **není** odkazovaný z veřejné appky. Otevřeš ho ručně na `.../editor.html`.

## Veřejná appka (`index.html`)

- **Zadat počet aut:** klikni na parkoviště → nastav „kolik stojí" a „kapacitu" → *Uložit*.
  Kapacitu zmenši, když jsou na parkovišti dlouhá auta.
- Nahoře je barevné doporučení, kterou cestou jet.
- Nedají se tu přidávat ani mazat parkoviště — to je jen v editoru.

## Editor parkovišť (`editor.html`)

Samostatný nástroj pro správce. Otevři `.../editor.html`.

- **Nové parkoviště:** táhni obdélník po mapě.
- **Vybrat:** klikni na parkoviště (odroluje se nad panel a otevře jeho vlastnosti).
- **Přesun:** táhni už vybrané parkoviště. **Velikost:** táhni jeho pravý dolní roh.
- **Vlastnosti:** název, kapacita, přepínač **„u spodní cesty"** (zahrne ho do doporučení), *Smazat*.
- **💾 Uložit do DB** — uloží rozvržení do Supabase (živě se projeví ve veřejné appce).
  Ukládá jen geometrii/název/kapacitu — **nepřepíše aktuální počty aut**.
- **⬇️ Export / ⬆️ Import** — zálohuj/obnov rozvržení jako soubor `parkoviste.json`.
- **Volitelný PIN:** nastav `EDITOR_PIN` v `config.js` a editor se před otevřením zeptá na PIN
  (jen lehká překážka, ne skutečné zabezpečení).

## Doporučení cesty (banner nahoře)

Počítá se ze součtu volných míst na parkovištích označených **„u spodní cesty"**:

| Volných míst dole | Hláška |
|---|---|
| 0 | 🚫 Spodní parkoviště PLNÁ → jeď HORNÍ cestou |
| 1–3 | ⚠️ Dole skoro plno — zvaž horní cestu |
| 4+ | ✅ Dole je volno — můžeš jet spodní cestou |

---

## Soubory

| Soubor | Popis |
|---|---|
| `index.html` + `app.js` | Veřejná appka (prohlížení + zadání počtu aut) |
| `editor.html` + `editor.js` | Editor parkovišť (jen pro správce) |
| `styles.css` | Vzhled (mobil-first) — sdílený |
| `config.js` | Přístup k Supabase (URL + anon klíč) + volitelný `EDITOR_PIN` |
| `supabase-setup.sql` | Vytvoření tabulky a práv v Supabase |
| `supabase-reset.sql` | Čistý reset tabulky (při konfliktu z dřívějška) |
| `assets/map.png` | Plánek tábora |
| `robots.txt` | Zákaz indexace vyhledávači |
| `.github/workflows/deploy.yml` | Automatické nasazení na GitHub Pages |
