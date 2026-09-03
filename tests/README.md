# SatGuardView Smoke Suite

One-step happy-path validation for every menu use case (tabs, layer switcher,
dark mode, hamburger, quick locations, search, sort, export, pagination,
draw area, keyboard shortcuts, and Live View).

## Run (inside the codespace, with the app already running on :8080)

```bash
cd /workspaces/satguardview/tests
npm install
npx playwright install --with-deps chromium   # one-time, needs sudo (codespace has it)
npx playwright test
```

## Run from anywhere (against the public codespace URL)

```bash
BASE_URL=https://<codespace>-8080.app.github.dev npx playwright test
```

## Use-case matrix

| ID | Menu use case | Happy-path assertion |
|----|---------------|----------------------|
| UC-01 | App shell | title, map, Ready status, all menu controls present |
| UC-02a/b | Tabs | Live View / Explorer sidebars swap |
| UC-03a–d | Layer switcher | OSM / GIBS / OpenTopoMap / Wikimedia tiles load, button active |
| UC-04 | Provider guard | zero CARTO requests, all tiles HTTP 200 |
| UC-05a/b | Dark mode | body class + dark-tiles layer swap both directions |
| UC-06 | Hamburger (mobile) | sidebar opens on 375×812 viewport |
| UC-07 | Quick locations | Varanasi/Kailash enable Search |
| UC-08 | Search | result items render |
| UC-09 | Sort | option applied, results intact |
| UC-10a/b | Export | .csv / .geojson downloads fire |
| UC-11 | Pagination | Load More appends page-2 results; hidden when single page |
| UC-12 | Draw Area | draw-mode toast appears |
| UC-13a–d | Keyboard | L cycles layers, D dark, S focus, Esc collapse |
| UC-14a–c | Live View | country→city enabled, live marker, directional buttons N/S/E/W |

Notes:
- Tests run **serially** (workers=1) because the app is a single shared instance.
- STAC/catalog-dependent tests (UC-08 through UC-14b) carry long timeouts.
- `UC-11` forces a >50-hit search (wide dates, cloud 100) so page 2 is guaranteed real.
