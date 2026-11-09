# Acidin 🧪

Acidin is een browser-skategame gebouwd met Babylon.js. Leer skaten via levels, land tricks en grinds en verdien wheels om nieuwe wielsets vrij te spelen.

## 🎮 Spelen

*Just remember, the text is recapped*

bekijk de website op [recap.nu](https://recap.nu).

Om lokaal te spelen, serveer je de projectmap via een lokale webserver. De game laadt modellen en instellingen op basis van relatieve paden; open `index.html` daarom niet rechtstreeks als `file://`-bestand.

Bijvoorbeeld met Python:

```powershell
py -m http.server 8000
```

Open daarna [http://localhost:8000](http://localhost:8000) in je browser.

## 🏗️ MakeAPark

Open [MakeAPark](MAP/index.html) (lokaal: [http://localhost:8000/MAP/](http://localhost:8000/MAP/)) om je eigen skatepark te bouwen met de onderdelen uit `MAP/models/`.

- Kies rechtsonder **Ramps**, **Rails**, **Benches** of **Extra**.
- Sleep een onderdeel het park in, of klik erop om het in het midden te plaatsen. Sleep met de muis in de 3D-ruimte om rond te kijken; scroll om in en uit te zoomen.
- De onderdelen uit de standaardcatalogus worden vier keer groter geplaatst dan de bronmodellen. De startcamera begint dichterbij en draaien, pannen en zoomen reageren rustiger.
- Selecteer een onderdeel en kies **Move**, **Rotate** of **Scale** (sneltoetsen **1**, **2**, **3**); **World** en **Local** kiezen de gizmo-oriëntatie. Met **Copy** en **Paste** of **Ctrl+C / Ctrl+V** maak je een exacte kopie op dezelfde positie, rotatie en schaal. Gebruik **Undo / Redo**, **Ctrl+Z / Ctrl+Y** of **Ctrl+Shift+Z** om wijzigingen ongedaan te maken of opnieuw toe te passen; een gizmo-drag is één stap. Druk op **S** om object-snap aan of uit te zetten: tijdens het verplaatsen klikken randen en middelpunten van objecten binnen bereik op elkaar vast. **R** draait het object 90°; **Delete** verwijdert het geselecteerde onderdeel.
- Met **My parks** sla je meerdere parken op dit apparaat op; ieder park krijgt een eigen code. **Share** maakt een link met de parkgegevens erin, zodat daarvoor geen aparte server nodig is. De code is een herkenningscode, geen openbare zoekcode; deel de link om het park te openen. MakeAPark zelf moet wel op een publiek bereikbare website staan. **Test park** opent het huidige park in de game op dit apparaat. **Import GLB** en **Export GLB** laden en bewaren parkbestanden als `.glb`.
- De officiële texture-atlas staat in `MAP/models/Textures/colormap.png` en wordt ook in GLB-exports meegenomen. De game maakt voor elk parkonderdeel een statische triangle-mesh-collider op basis van de geschaalde geometrie, niet een bounding-box-collider. Pas de testgrootte in `game.js` aan met `TEST_PARK_SCALE_MULTIPLIER` (standaard `10`).

## 🕹️ Besturing

| Toets / actie | Functie |
| --- | --- |
| W/S/A/D of pijltjes | Bewegen en sturen |
| Spatie | Pushen |
| Shift ingedrukt houden | Crouchen |
| W terwijl Shift ingedrukt is | Ollie |
| Shift loslaten | Uncrouchen |
| Q | 50-50-grinden |
| E + Q | Boardslide |
| E terwijl je in de lucht bent | Impossible |
| Scrollwiel | Shuvit |
| V | Wielset wisselen |
| L | Levelmenu openen/sluiten |
| T | Shop openen/sluiten |
| I | Instellingen openen/sluiten |

Klik op de lichte-modusknop in **Instellingen** om tussen lichte en donkere modus te wisselen. De gekozen modus wordt lokaal opgeslagen.
Open met **T** het menu en kies **Trickuitleg** naast **Credits** voor uitleg over flips en shuvits.

## 🛹 Levels en menu's

- **Levels:** begin met de basis en sterren, leer daarna flips en shuvits en speel gevorderde trick- en grinddoelen vrij.
- **Shop:** koop en equip wielsets met je verdiende wheels.
- **Instellingen:** schakel de lichte modus in of uit, of open met **Bouw een skatepark** de MakeAPark-editor in een nieuw tabblad.
- **3D-boardpreview:** bekijk en draai het skateboardmodel met je huidige wielset.
- **Taal:** kies in Instellingen uit Engels (standaard), Nederlands, Spaans, Duits of Frans. Je keuze wordt lokaal opgeslagen.
- **Toetscombinaties:** `&&` betekent dat toetsen samen ingedrukt moeten zijn; `||` betekent dat een van de alternatieven volstaat. Een lijst met toetsen biedt alternatieven, zoals `["a", "arrowleft"]`.

Bij de eerste start kies je een gebruikersnaam en taal en krijg je een tutorial met uitleg over bewegen, pushen, ollies, flips, shuvits, grinds en menu's. De naam zweeft boven je skater. Levelvoortgang, naam, taal, vrijgespeelde wielen en de gekozen wielset worden lokaal in de browser opgeslagen.

## 📁 Projectbestanden

- `index.html` — gamepagina en interface.
- `game.js` — Babylon.js-scene, besturing, tricks, levelvoortgang en shop.
- `settings.json` — interne gamegegevens, leveldoelen, talen en vertalingen. Mapdefinities zijn uitbreidbaar; `map2.glb` is nog een prototype en is niet speelbaar.
- `models/` — skateboard-, wiel- en mapmodellen.
- `MAP/` — zelfstandige MakeAPark-editor (`index.html`, `map.js`) en skateparkonderdelen (`models/`).

## 📢 Updates

- **v0.6:**
    - **Multi-flip:** een grote muisbeweging doet nu meerdere flips, zowel in de score/levelvoortgang als in de visual. Hoe verder je flickt, hoe meer rotaties.
    - **Combo’s in elke volgorde:** shuvit + kickflip/heelflip (en langere combo’s) werken ongeacht de volgorde. Je kunt de flip tijdens de shuvit-animatie doen, ervoor of erna, zolang het binnen het combo-venster gebeurt.
    - Sterren in levels geven voortgang (zie minimap en leveldoelen).
- **v0.5:**
    - **Levelprogressie:** Levels vervangen de losse missie-, taken- en Rush-route. Doelen tellen pas mee na een veilige landing; een bail verliest de ongebankte score en telt niet als gelande trick.
    - **Landingen en bails:** Land rechtop en met de neus van je board binnen 30° van je bewegingsrichting. Een mislukte landing activeert de fysica-ragdoll; druk op een willekeurige toets of muisknop om op te staan.
    - **Trick-combo's:** Naast 360 Flip en Laser Flip zijn 360 Hardflip en 360 Inward Heelflip toegevoegd. TRICK-SCORE toont de speciale flip-combo's. Voor een Laser Flip: scroll omhoog voor een FS 360 Shuvit (twee snelle stappen) en flick daarna naar links voor een Heelflip. Druk op E in de lucht voor Impossible; gebruik E + Q voor een boardslide. Combinaties moeten binnen het ingestelde venster.
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
