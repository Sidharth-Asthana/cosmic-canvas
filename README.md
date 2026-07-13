# Cosmic Canvas — self-updating space telescope wallpaper

A live Windows wallpaper that stays fresh with the newest publicly released
imagery from **NASA, ESA, ISRO and JAXA** space telescopes, rendered through
[Lively Wallpaper](https://github.com/rocksdanister/lively) with interactive
cursor effects.

## What it does

- **Daily 4K imagery** — a scheduled task pulls the latest releases from
  ESA/Hubble and ESA/Webb (Data2Dome feeds), NASA APOD, and the NASA Image
  Library, plus best-effort scrapes of ISRO and JAXA galleries. Images are
  scored (source curation, resolution, colorfulness, sharpness) and the top 3
  per run are downloaded and re-encoded as wallpaper-friendly JPEGs.
- **Interactive live wallpaper** — a WebGL slideshow with slow Ken Burns
  drift and a rotating cursor effect: exactly one effect is live per
  wallpaper, cycling through the rotation as images change (or on its own
  timer — set *Effect cycle interval* in Lively's customize panel; a small
  toast names the effect when it switches). Checkboxes control which effects
  are in the rotation:
  - *Parallax drift* — image + twinkling starfield shift with the cursor
  - *Lens ripple* — a gravitational-lens warp radiates from each click
  - *Stardust trail* — glowing particles follow your drag
  - *Constellation lines* — dragging sketches a twinkling constellation
- **Self-cleaning storage** — images older than 30 days or beyond a 2 GB
  folder cap are deleted automatically. `wallpaper/images/favorites/` is
  never touched.

## Setup

```powershell
cd "C:\VSCODE\desktop personalizations"
pip install -r fetcher\requirements.txt
.\install.ps1
```

Then in the Lively app: apply **Cosmic Canvas** from the library, and set
**Settings → Wallpaper → Wallpaper input** to *Mouse* so clicks and drags
reach the wallpaper. Note: click/drag effects trigger on the **empty
desktop** — clicks over app windows go to those windows, by design.

## Screensaver

Lively can run any wallpaper as the Windows screensaver: **Lively Settings →
General → Screen saver**, pick Cosmic Canvas. The same imagery and effects
double as your screensaver with zero extra code.

## Everyday use

| I want to… | Do this |
|---|---|
| Keep an image forever | Move it into `wallpaper\images\favorites\` |
| Fetch new images right now | `python fetcher\fetch.py` (or run the `SpaceWallpaperFetch` task) |
| Change slideshow speed / toggle effects | Right-click the wallpaper in Lively → Customize |
| Change retention (2 GB / 30 days) | Edit `cleanup` in `fetcher\config.json` |
| Use a personal NASA API key | Create `fetcher\config.local.json`: `{"nasa_api_key": "YOUR_KEY"}` (free at [api.nasa.gov](https://api.nasa.gov)) |
| Disable a source | Set it to `false` under `sources` in `fetcher\config.json` |

## Notes & caveats

- **ISRO and JAXA** publish no image APIs and rarely release true 4K; those
  sources are best-effort gallery scrapes with a relaxed 2560px minimum, and
  they may silently yield nothing when the sites restructure. ESA and NASA
  feeds carry the bulk of the imagery (routinely 4K–8K).
- The NASA APOD `DEMO_KEY` allows ~50 requests/day — plenty for the daily
  fetch, but get a free personal key if you run the fetcher manually a lot.
- Wallpaper images and per-image credits are shown in the bottom-right
  overlay (toggleable). Imagery is CC/public-domain from the agencies;
  credit lines come from each release.

## Future screensaver ideas (to discuss)

Each of these would be a new Lively wallpaper package (HTML/WebGL), pluggable
into the same Lively screensaver mechanism:

1. **Warp-speed starfield** — classic hyperspace tunnel, GPU particles,
   speed reacts to time of day.
2. **Live solar system** — real planetary positions from an ephemeris,
   orbits to scale, current spacecraft positions annotated.
3. **ISS ground track** — live ISS position over a night-side Earth with
   city lights, next-pass countdown for your location.
4. **Black-hole lensing** — a Gargantua-style accretion disk shader bending
   the current wallpaper image behind it.
5. **Deep-field zoom** — infinite slow dive into Hubble/Webb deep-field
   tiles with parallax layers.

## Project layout

```
fetcher/          Python: sources (ESA d2d, NASA APOD/Library, ISRO, JAXA),
                  scoring, cleanup, manifest writer. Entry: fetch.py
wallpaper/        Lively wallpaper package: index.html, main.js (WebGL),
                  effects/ (parallax, stardust, ripple, constellation),
                  LivelyInfo.json, LivelyProperties.json, images/
install.ps1       One-time setup: Lively junction + initial fetch + scheduled task
```
