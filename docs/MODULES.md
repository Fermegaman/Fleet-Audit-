# Module guide

The maintained entry point is `index.html`. Each feature file starts with a short English explanation of its responsibility.

## JavaScript

| File under `js/` | Responsibility |
| --- | --- |
| `core/config.js` | Keep the storage key and source field definitions in one place. Changing these names can affect existing browser data. |
| `core/state.js` | Read the saved workspace once. Feature modules share this state so client selection and drafts stay consistent. |
| `shared/values.js` | Normalize source values and format dates and money without changing the imported billing amounts. |
| `core/migrations.js` | Bring older browser workspaces into the current shape. Run this only after all feature definitions have loaded. |
| `core/selectors.js` | Read the active client, its fleet and its original workbook sheets. These helpers keep client boundaries consistent. |
| `shared/ui.js` | Build the small tables, forms and checklists reused across pages. |
| `shared/csv.js` | Parse comma, tab or semicolon exports, including quoted values and embedded line breaks. This is the effective parser from the original app. |
| `features/fleet/table.js` | Render sortable fleet tables and connect their vehicle editing buttons. |
| `features/dashboard.js` | Summarize the selected client and render the dashboard shortcuts. |
| `features/clients.js` | List clients, show their details and create client workspaces. |
| `features/fleet/page.js` | Render Fleet & Grounded and connect its upload and manual-entry controls. |
| `features/fleet/import.js` | Read Amazon CSV or Excel exports and reconcile vehicles by VIN while keeping manual fields and history. |
| `features/fleet/editor.js` | Edit fleet-team fields and show grounding history without overwriting Amazon source values. |
| `features/trackers.js` | Display the rental, maintenance, FIF, toll, PAVE and recall workbook views. |
| `features/actions.js` | Show and add follow-up actions for the selected client. |
| `features/invoices.js` | Render the invoice workflow overview and links to each audit. |
| `features/element/review-model.js` | Normalize review statuses and maintain independent maintenance and toll review rows and totals. |
| `features/element/audit-model.js` | Select active audit drafts, detect changes and save a monthly audit with the existing validation rules. |
| `features/element/source.js` | Interpret Element source columns and build charge categories. Invoice charges remain separate from review decisions. |
| `features/element/tables.js` | Render reconciliation and sortable invoice, pivot and review tables. |
| `features/element/review-export.js` | Export maintenance and toll review workbooks using the bundled SheetJS library. |
| `features/element/toll-import.js` | Match uploaded toll reviews to invoice charges and retain unmatched or conflicting records. |
| `features/element/maintenance-import.js` | Match uploaded maintenance reviews without changing the original billed charges. |
| `features/element/invoice-import.js` | Import Element invoices and attach PDF evidence to the current audit draft. |
| `features/element/drafts.js` | Update invoice metadata, start a new month and clear only the active draft after confirmation. |
| `features/element/history.js` | Render saved audit history and reopen a saved audit into the active workspace. |
| `features/element/backup.js` | Export and restore audit backups, preserving the existing duplicate and validation checks. |
| `features/element/reports.js` | Build the deliverable and printable client report from the current invoice and review data. |
| `features/element/page.js` | Compose the Element workspace and connect its controls to the focused audit modules. |
| `features/leaseplan.js` | Render and save the LeasePlan / Wheels audit form. |
| `features/original-data.js` | Browse the original workbook sheets for the selected client. |
| `core/navigation.js` | Map sidebar destinations to page renderers and keep the active navigation state in sync. |
| `bootstrap.js` | Start the app after every module has loaded. Keep this script last in index.html. |

## Loading and shared state

These are classic browser script modules, not ES modules with import/export. This deliberately keeps direct file opening and existing inline event handlers compatible. Functions still share the browser global scope; the split is by responsibility, not a new state-management framework.

`index.html` is the explicit loading manifest. `data/workbook.js` loads before state. Configuration, state, helpers and feature definitions load next. Only `js/bootstrap.js` runs migrations and starts the current UI. Do not add `async`, move bootstrap earlier or run startup inside feature modules. `currentClientId` is assigned after state migration so legacy client IDs resolve correctly.

The `state` object is the existing workspace. Feature mutations continue to use `save()` and the same `FleetAuditHub_v3` storage key. No schema reset or new database is introduced. Client selectors live in `core/selectors.js`; CSV parsing lives in `shared/csv.js`; rendering helpers live in `shared/ui.js`. Navigation can call every feature and each feature can use these shared helpers. Element modules also call one another; consult their function names when following the workflow.

The two original `csvRows` declarations did not implement two independent parsers: JavaScript used the last declaration. Only that effective implementation is retained.

## Styling

`css/app.css` imports base styles, navigation/layout, reusable components, fleet colors, responsive rules and layout utilities. Fixed inline styles now use named `data-layout` attributes, leaving the existing class selectors intact. Their declarations retain inline-style precedence with `!important`. JavaScript still controls visibility where the original behavior requires it.

`css/reports/client-report.css` styles the separate printable report. The generated report uses an absolute stylesheet URL resolved against the application URL, so the popup can find it under both local files and a hosted subdirectory. Keep the whole project folder together.

## Data, vendor code and historical entry point

`data/workbook.js` contains the unchanged original workbook snapshot, shared by both entry points. It is a script rather than fetched JSON so local opening does not require a server. The bundled SheetJS build and its license are unchanged.

`Fleet_Audit_Hub_v3.html` remains the separate historical prototype. Its own feature scripts are in `js/legacy/` and its stylesheet is in `css/legacy/`. It does not load the current application modules. Use `index.html` for the maintained app.
