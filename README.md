# Garage 197 Car Lookup

An installable web app (PWA). Enter a car and its chassis number to decode it and see what comparable cars have sold for.

- `index.html`: the whole app (no build step).
- `sales.csv`: sold results the app reads. Replace this file to update the data.
- `manifest.webmanifest`, `sw.js`, icons: make it installable and usable offline.

Run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.

Saved cars are kept in the browser on each device. Accounts, a shared database and a licensed data feed are the next steps.
