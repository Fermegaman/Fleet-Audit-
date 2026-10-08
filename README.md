# Fleet Audit Hub

Centralized fleet operations and audit application.

## Current structure

- `index.html` — application shell and page markup
- `css/app.css` — application styling
- `js/app.js` — application behavior and current prototype data
- `README.md` — project notes

## Development

Open the project in GitHub Codespaces and use Live Server to run `index.html`.

This foundation split preserves the existing Fleet Audit Hub prototype while separating the HTML, CSS, and JavaScript so multiple developers can work on the application more easily.

## Client and fleet data

- Clients have stable IDs and are selected from the application header.
- Fleet records are stored separately by client ID in browser storage. Amazon CSV fields and fleet-team grounding fields are kept separately on each vehicle.
- The existing AGPL workbook is retained as the original-data archive and is migrated into AGPL's fleet records by VIN the first time the app loads.
- Use **Upload Amazon Fleet** on Fleet & Grounded to import `.csv`, `.xlsx`, or `.xls` exports. Excel files are parsed with the bundled local SheetJS browser build, and all formats use the same VIN reconciliation while preserving fleet-team fields and grounding history.
- Amazon `status` determines active fleet membership; current totals and the Fleet Records and Grounded Vehicles tables include only `ACTIVE` vehicles. Inactive records remain stored for history. `operationalStatus` independently determines grounding and row color.
- Active vehicles reported as grounded appear automatically in Grounded Vehicles. Use **View/Edit** to update Fleet Team details; Amazon status transitions record grounding and return dates without removing the vehicle's manual information or history.
- Fleet tables can be sorted by each data column; Amazon-grounded rows are highlighted in light red.
- Browser `localStorage` is a prototype persistence adapter; the client-ID-keyed state is intended to be replaceable by a shared database.

## Element invoice audit

- Element audits are scoped by client, audit month, and invoice number. Upload an Element CSV/CDV after entering the audit month and invoice number; source records and invoice charges stay with that audit.
- Element CSV/CDV rows are the source for invoice records, VIN-level pivot totals, charge categories, maintenance review, the deliverable, and the printable client report. This workflow does not compare against or read Amazon fleet records.
- Original Element maintenance charges remain unchanged. Completed maintenance reviews update only review amount, calculated difference, review status, and notes; unmatched VIN/charge rows remain visible under Unmatched Review Records.
- The client report is generated in the browser and can be printed or saved as PDF.
