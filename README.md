# Acidin 🧪

Acidin is een browser-skategame gebouwd met Babylon.js. Skate door het park, voer tricks en grinds uit, voltooi missies en taken en verdien wheels om nieuwe wielsets vrij te spelen.

## 🎮 Spelen

Speel de game op [recap.nu](https://recap.nu).

Om lokaal te spelen, serveer je de projectmap via een lokale webserver. De game laadt modellen en takenbestanden op basis van relatieve paden; open `index.html` daarom niet rechtstreeks als `file://`-bestand.

Bijvoorbeeld met Python:

```powershell
py -m http.server 8000
```

Open daarna [http://localhost:8000](http://localhost:8000) in je browser.

## 🕹️ Besturing

| Toets / actie | Functie |
| --- | --- |
| WASD | Bewegen en sturen |
| Spatie | Pushen |
| Shift ingedrukt houden | Crouchen |
| W terwijl Shift ingedrukt is | Ollie |
| Shift loslaten | Uncrouchen |
| Q | Grinden |
| Scrollwiel | Shuvit |
| Muisbeweging | Tricks |
| V | Wielset wisselen |
| T | Missie-, taken- en shopmenu openen/sluiten |
| I | Instellingen openen/sluiten |

Klik op de lichte-modusknop in **Instellingen** om tussen lichte en donkere modus te wisselen. De gekozen modus wordt lokaal opgeslagen.

## 🛹 Menu's

- **Missies:** bekijk je dagelijkse missie en start een rush om sterren te verzamelen.
- **Taken:** bekijk actieve trick- en grindtaken en hun wheel-beloningen.
- **Shop:** koop en equip wielsets met je verdiende wheels.
- **Instellingen:** schakel de lichte modus in of uit.
- **3D-boardpreview:** bekijk en draai het skateboardmodel met je huidige wielset.
- **Taal:** kies in Instellingen uit Engels (standaard), Nederlands, Spaans, Duits of Frans. Je keuze wordt lokaal opgeslagen.

Voortgang, vrijgespeelde wielen en de gekozen wielset worden in de browser opgeslagen.

## 📁 Projectbestanden

- `index.html` — gamepagina en interface.
- `game.js` — Babylon.js-scene, besturing, missies, taken en shop.
- `tasks.json` — beschikbare taken.
- `models/` — skateboard-, wiel- en mapmodellen.

## 📢 Updates

- **v0.4:**
    - Taalkeuze: Nederlands, English (standaard), Deutsch, Español en Français.
    - Aparte menu's voor missies, taken en de shop.
    - Interactieve 3D-boardpreview met je huidige wielset.
    - Lichte modus via Instellingen.
- **v0.3:** Aparte menu's voor missies, taken en de shop, een interactieve 3D-boardpreview en een lichte modus via Instellingen.
- **v0.2:** Nieuwe modellen en een bijgewerkte artstijl.
- **v0.1:** Eerste speelbare HTML-versie.

## 📄 Licentie en credits

De broncode, scripts en ontwerpen in deze repository zijn eigendom van de maker. Zonder uitdrukkelijke toestemming is herpublicatie van de code of assets niet toegestaan. Externe 3D-assets kunnen eigen licentie- en attributievoorwaarden hebben; zie de credits in het game-menu en de voorwaarden van de oorspronkelijke makers.

Skateboardmodel: Poly by Google via [Poly Pizza](https://poly.pizza/m/cms3_9IcYbB), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). De game vermeldt ook credits voor Quaternius en Kenney.
