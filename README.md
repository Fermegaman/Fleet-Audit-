# Fleet Audit Hub

Fleet operations and invoice audits, organized into focused browser modules.

## Run

Extract the entire ZIP and open **index.html**. No package installation or build step is required. You can also use Live Server or serve this folder with `python3 -m http.server 8000` and open `http://localhost:8000`.

Keep `css/`, `js/`, `data/` and `vendor/` next to the HTML files. To keep using an existing browser workspace, replace files at the same hosted origin. Browser storage is tied to the origin; opening a different URL or local path may show a different workspace. The existing audit backup export/restore remains available.

## Project layout

- `index.html`: maintained app shell and explicit script load order.
- `js/core/`: configuration, state, migrations, selectors and navigation.
- `js/shared/`: CSV parsing, value formatting and reusable rendering helpers.
- `js/features/`: dashboard, clients, fleet, trackers, actions and invoice workflows.
- `js/features/element/`: invoice imports, charge calculations, drafts, review imports/exports, history, backups, tables and reports.
- `js/bootstrap.js`: migrations and application startup.
- `css/`: base/layout styles, components, fleet styles, responsive rules and printable report styles.
- `data/workbook.js`: unchanged source workbook data.
- `vendor/`: unchanged local SheetJS build and license.
- `js/legacy/`, `css/legacy/`: separate historical prototype, opened through `Fleet_Audit_Hub_v3.html`.
- `docs/`: module map, existing workflow notes and verification scope.
- `tests/`: comparison harness for the original and reorganized versions.

See [the module guide](docs/MODULES.md) for responsibilities, shared dependencies and startup order. See [workflow notes](docs/WORKFLOWS.md) for existing business rules.

## Verification

With Node.js installed, compare this project against an extracted copy of the original ZIP:

```sh
node tests/regression.cjs /absolute/path/to/original/Fleet-Audit--main
```

The harness uses Node's built-in VM and a minimal DOM stub; it does not install dependencies or replace browser testing. See [verification scope](docs/VERIFICATION.md).
