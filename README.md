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

- Element audits are scoped by client and audit month, with invoice number and date retained on the saved record. The active workspace is stored separately from saved Audit History. Use **Save Audit** to add or update its stable audit record and **Audit History** to reopen saved work.
- Use **Archive & Start New Month** to save the current month and switch to an empty workspace; each client can have only one saved audit per month. **Clear Current Draft** requires confirmation and never deletes a saved audit. Invoice date is required before a draft can be saved to history.
- Enter the actual invoice total from the Element PDF; it is not inferred from CSV charges. Reconciliation reports the calculated CSV total, invoice total, difference, and status. PDF maintenance detail totals can be entered separately to verify source variances without changing billed charges.
- For the supplied AGPL October 2026 source, the CSV maintenance category is $792.19 while the previously extracted PDF detail lines total $845.73, a $53.54 source variance. The UI flags this for verification; neither value replaces the original CSV maintenance charges.
- Element CSV/CDV rows are the source for invoice records, VIN-level pivot totals, charge categories, maintenance review, the deliverable, and the printable client report. This workflow does not compare against or read Amazon fleet records.
- Original Element maintenance charges remain unchanged. Completed maintenance reviews update only review amount, calculated difference, review status, and notes; unmatched VIN/charge rows remain visible under Unmatched Review Records.
- Toll Review is a separate workflow populated only from Element charges categorized as Ticket / Toll. It stores reviewed amounts, differences, statuses, and notes independently, with separate workbook download/upload; toll decisions do not change invoice calculations or maintenance review data.
- The client report is generated in the browser and can be printed or saved as PDF.
- Audit history and active workspaces are stored only in this browser's `localStorage`; they are not shared with teammates or synced across computers. Export the Element Audit Backup regularly and restore it on another browser to transfer saved audits. Only attached PDFs whose contents were successfully stored are included; CSV-derived rows and source filenames are retained, not necessarily the original CSV file.
