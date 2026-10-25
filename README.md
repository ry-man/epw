# E.P.W. - Elemental Plumbing Wars (web)

A JavaScript/HTML5 port of the Python/Tkinter game, playable on a phone browser (installable as an app).

- `js/game.js` - rules engine and CPU players (port of `fire_n_ice.py`)
- `js/tutorial.js` - illustrated Game Rules pages; `js/guided_tutorial.js` - interactive Tutorial run on the real game screen
- `js/ui.js` - canvas rendering and touch controls
- `index.html`, `style.css` - page and layout
- `manifest.webmanifest`, `sw.js`, `icons/` - "Add to Home screen" + offline support

## Run locally

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Play on Android

Open the GitHub Pages URL in Chrome, then menu (&vellip;) > **Add to Home screen** / **Install app**.
