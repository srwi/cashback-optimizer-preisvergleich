# Cashback Optimizer für Preisvergleiche (Chrome & Firefox)

Zeigt Cashback-, Rabatt- und Gutscheinmöglichkeiten von [cashback-optimizer.de](https://cashback-optimizer.de/) direkt in den Angebotszeilen auf Idealo, Geizhals, billiger.de und guenstiger.de an.

## Installation (Entwicklermodus)

### Google Chrome / Edge / Brave
1. `chrome://extensions/` öffnen.
2. Oben rechts **Entwicklermodus** aktivieren.
3. Auf **Entpackte Erweiterung laden** klicken und diesen Ordner (`cashback-optimizer-preisvergleich` bzw. den Repo-Ordner) auswählen.

### Mozilla Firefox (ab Version 109+)
1. `about:debugging#/runtime/this-firefox` öffnen.
2. Auf **Temporäres Add-on laden…** klicken.
3. Die Datei `manifest.json` aus diesem Ordner auswählen.

## Funktionsweise
- `background.js` lädt die Shop-Daten einmal alle 24 Stunden von `https://cashback-optimizer.de/`, parst sie ohne DOM-Abhängigkeit (funktioniert im Chrome Service Worker und in Firefox) und speichert sie in `storage.local`.
- `content.js` liest auf Idealo (`OffersOfProduct/*`), Geizhals (`geizhals.de`, `geizhals.at`, `gh.de`), billiger.de (`billiger.de/*`) und guenstiger.de (`guenstiger.de/*`) den Shop-Namen jeder Angebotszeile aus und zeigt direkt unter dem Shop-/Angebots-Button den maximalen Cashback-Wert (inkl. Hover-Tooltip mit allen Portalen, Gutscheinen und Rabatten) an. Unterstützt auch den Dark Mode (z. B. auf Geizhals).
- Über das Extension-Popup lässt sich der Cache-Stand prüfen und jederzeit manuell aktualisieren.

## Automatisches Release (GitHub Actions)
Beim Pushen eines Tags (z. B. `git tag v1.0.0 && git push --tags`) baut `.github/workflows/release.yml` automatisch:
1. `cashback-optimizer-preisvergleich-chrome.zip` für Chrome/Edge/Brave.
2. Eine signierte `.xpi`-Datei für Firefox (Unlisted über AMO), sofern in den GitHub-Repository-Secrets folgende Keys hinterlegt sind:
   - `AMO_JWT_ISSUER`
   - `AMO_JWT_SECRET`
   *(Erhältlich kostenlos unter `https://addons.mozilla.org/developers/addon/api/key/`.)*
