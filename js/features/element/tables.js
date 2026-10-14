/**
 * Render reconciliation and sortable invoice, pivot and review tables.
 * Classic script module; shared services and state are loaded by index.html.
 */

function elementReconciliationHtml(audit, includeMaintenanceInput = true) {
  if (!audit) return '<div class="notice">Enter invoice details and upload Element CSV/CDV records to begin reconciliation.</div>';
  const reconciliation = elementAuditReconciliation(audit);
  const maintenanceVariance = elementMaintenanceVariance(audit);
  return '<div class="cards">' +
    [['Calculated CSV Total', formatMoney(reconciliation.calculatedTotal)],
      ['Actual Invoice Total', reconciliation.invoiceTotal == null ? 'Not entered' : formatMoney(reconciliation.invoiceTotal)],
      ['Difference (CSV − Invoice)', reconciliation.difference == null ? '—' : formatMoney(reconciliation.difference)],
      ['Reconciliation Status', reconciliation.status]].map(([label, value]) =>
      '<div class="card"><div class="muted">' + esc(label) + '</div><div class="num">' + esc(value) + '</div></div>'
    ).join('') + '</div>' +
    (includeMaintenanceInput ? '<div class="field" data-layout="space-top-10"><label>PDF Maintenance Detail Total' +
      (audit.pdfMaintenanceDetailSource ? ' (previously extracted; verify)' : ' (optional verification)') + '</label>' +
      '<input id="pdfMaintenanceDetailTotal" type="number" step="0.01" value="' +
      esc(audit.pdfMaintenanceDetailTotal == null ? '' : audit.pdfMaintenanceDetailTotal) + '">' +
      '<div class="small">Enter the sum of the maintenance detail lines from the PDF to compare it with the CSV maintenance category. This does not change billed or reviewed charges.</div></div>' : '') +
    (maintenanceVariance ? '<div class="notice">Maintenance source check: CSV category ' +
      esc(formatMoney(maintenanceVariance.csvTotal)) + '; PDF detail total ' +
      esc(formatMoney(maintenanceVariance.pdfDetailTotal)) + '; difference (PDF − CSV) ' +
      esc(formatMoney(maintenanceVariance.difference)) +
      '. ' + esc(maintenanceVariance.source) +
      ' Investigate this source-level variance; it does not alter the invoice or maintenance review amounts.</div>' : '');
}

function sortedElementRecords(audit, tableName, records) {
  const sorts = state.elementAuditSort || (state.elementAuditSort = {});
  const sort = sorts[tableName] || { key: 'vin', direction: 'asc' };
  return records.slice().sort((left, right) => {
    const a = tableName === 'source' && left.categories
      ? (left.categories[sort.key] == null ? left[sort.key] : left.categories[sort.key])
      : left[sort.key];
    const b = tableName === 'source' && right.categories
      ? (right.categories[sort.key] == null ? right[sort.key] : right.categories[sort.key])
      : right[sort.key];
    const result = typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), undefined, { numeric: true, sensitivity: 'base' });
    return sort.direction === 'desc' ? -result : result;
  });
}

function elementTableHead(columns, tableName) {
  const sort = state.elementAuditSort && state.elementAuditSort[tableName] || { key: 'vin', direction: 'asc' };
  return '<thead><tr>' + columns.map(([key, label]) => key === 'detail'
    ? '<th>' + esc(label) + '</th>'
    : '<th><button type="button" class="sort-header" data-element-sort="' + tableName + ':' + key + '" aria-sort="' +
      (sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none') + '">' +
      esc(label) + (sort.key === key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : '') + '</button></th>'
  ).join('') + '</tr></thead>';
}

function elementInvoiceTableHtml(audit) {
  const columns = [
    ['vin', 'VIN'], ['unit', 'Unit'], ['clientAssetId', 'Client Asset ID'], ['description', 'Breakdown / Description'],
    ['total', 'Total Unit Charges'], ['lease', 'Lease Charges'], ['maintenance', 'Maintenance Charges'],
    ['ticket', 'Ticket'], ['taxRental', 'Tax Rental'], ['uncategorized', 'Charges Not Categorized'],
    ['credits', 'Credits'], ['other', 'Other'], ['detail', 'Source Record']
  ];
  const records = sortedElementRecords(audit, 'source', elementAuditRecords(audit));
  if (!records.length) return '<p class="muted">Upload an Element CSV/CDV to view invoice records.</p>';
  return '<div class="table"><table>' + elementTableHead(columns, 'source') + '<tbody>' +
    records.map((record, index) => {
      const values = [record.vin, record.unit, record.clientAssetId, record.description, formatMoney(record.total),
        formatMoney(record.categories.lease), formatMoney(record.categories.maintenance), formatMoney(record.categories.ticket),
        formatMoney(record.categories.taxRental), formatMoney(record.categories.uncategorized),
        formatMoney(record.categories.credits), formatMoney(record.categories.other)];
      return '<tr class="element-source-row" data-source-index="' + index + '" data-filter-text="' + esc(values.join(' ').toLowerCase()) + '">' +
        values.map(value => '<td>' + esc(value) + '</td>').join('') +
        '<td><button type="button" class="btn secondary" data-source-detail="' + index + '">View source</button></td></tr>' +
        '<tr class="element-source-detail" data-source-detail-row="' + index + '" data-expanded="false" hidden><td colspan="' + columns.length +
        '"><pre data-layout="source-details">' + esc(JSON.stringify({
          sourceRecord: record.source,
          chargeCategorization: record.chargeClassifications || []
        }, null, 2)) + '</pre></td></tr>';
    }).join('') + '</tbody></table></div>';
}

function elementPivotTableHtml(audit) {
  const columns = [
    ['vin', 'VIN'], ['ticket', 'Ticket / Toll'], ['lease', 'Lease Charges'], ['maintenance', 'Maintenance Charges'],
    ['uncategorized', 'Uncategorized Charges'], ['credits', 'Credits'], ['taxRental', 'Tax Rental'],
    ['other', 'Other Charges'], ['total', 'Total Charges']
  ];
  const rows = sortedElementRecords(audit, 'pivot', elementPivot(audit));
  if (!rows.length) return '<p class="muted">No Element VIN totals are available.</p>';
  const totals = elementSummary(audit);
  return '<div class="table"><table>' + elementTableHead(columns, 'pivot') + '<tbody>' +
    rows.map(row => {
      const values = [row.vin, row.ticket, row.lease, row.maintenance, row.uncategorized, row.credits, row.taxRental, row.other, row.total];
      return '<tr class="element-pivot-row" data-filter-text="' + esc(values.join(' ').toLowerCase()) + '">' +
        '<td>' + esc(row.vin) + '</td>' + values.slice(1).map(value => '<td>' + esc(formatMoney(value)) + '</td>').join('') + '</tr>';
    }).join('') +
    '<tr><th>TOTAL</th>' + [totals.ticket, totals.lease, totals.maintenance, totals.uncategorized, totals.credits, totals.taxRental, totals.other, totals.total]
      .map(value => '<th>' + esc(formatMoney(value)) + '</th>').join('') + '</tr>' +
    '</tbody></table></div>';
}

function maintenanceReviewTableHtml(audit) {
  const rows = ensureMaintenanceReviewFromElement(audit);
  if (!rows.length) {
    return '<p class="muted">No maintenance charges were identified in the Element invoice data.</p>';
  }
  return '<div class="table"><table><thead><tr>' +
    '<th>VIN</th><th>Unit</th><th>Client Asset ID</th><th>Maintenance Description</th><th>Element Charge</th>' +
    '<th>Reviewed Amount</th><th>Difference</th><th>Review Status</th><th>Review Notes</th></tr></thead><tbody>' +
    rows.map((row, index) => {
      const reviewStatus = normalizeMaintenanceReviewStatus(row.reviewStatus);
      const elementCharge = row.elementCharge == null || row.elementCharge === '' ? '' : formatMoney(row.elementCharge);
      const reviewedAmount = row.reviewedAmount == null || row.reviewedAmount === '' ? '' : formatMoney(row.reviewedAmount);
      const difference = row.difference == null || row.difference === '' ? '' : formatMoney(row.difference);
      return '<tr>' +
        '<td>' + esc(row.vin || '') + '</td>' +
        '<td>' + esc(row.unit || '') + '</td>' +
        '<td>' + esc(row.clientAssetId || '') + '</td>' +
        '<td>' + esc(row.maintenanceDescription || '') + '</td>' +
        '<td>' + esc(elementCharge) + '</td>' +
        '<td><input type="number" step="0.01" data-maintenance-review-field="reviewedAmount" data-index="' + index + '" value="' + esc(row.reviewedAmount || '') + '"></td>' +
        '<td>' + esc(difference) + '</td>' +
        '<td><select data-maintenance-review-field="reviewStatus" data-index="' + index + '">' +
          ['Pending Review', 'Reviewed', 'Approved', 'Disputed'].map(status =>
            '<option value="' + esc(status) + '"' + (status === reviewStatus ? ' selected' : '') + '>' + esc(status) + '</option>'
          ).join('') +
        '</select></td>' +
        '<td><textarea data-maintenance-review-field="reviewNotes" data-index="' + index + '" rows="2">' + esc(row.reviewNotes || '') + '</textarea></td>' +
        '</tr>';
    }).join('') + '</tbody></table></div>';
}

function tollReviewTableHtml(audit) {
  const rows = ensureTollReviewFromElement(audit);
  if (!rows.length) {
    return '<p class="muted">No Ticket / Toll charges were identified in the Element invoice data.</p>';
  }
  return '<div class="table"><table><thead><tr>' +
    '<th>VIN</th><th>Unit</th><th>Client Asset ID</th><th>Description</th><th>Element Charge</th>' +
    '<th>Reviewed Amount</th><th>Difference</th><th>Review Status</th><th>Review Notes</th></tr></thead><tbody>' +
    rows.map((row, index) => '<tr>' +
      '<td>' + esc(row.vin || '') + '</td>' +
      '<td>' + esc(row.unit || '') + '</td>' +
      '<td>' + esc(row.clientAssetId || '') + '</td>' +
      '<td>' + esc(row.description || '') + '</td>' +
      '<td>' + esc(formatMoney(row.elementCharge)) + '</td>' +
      '<td><input type="number" step="0.01" data-toll-review-field="reviewedAmount" data-index="' + index +
        '" value="' + esc(row.reviewedAmount == null ? '' : row.reviewedAmount) + '"></td>' +
      '<td>' + esc(row.difference === '' ? '' : formatMoney(row.difference)) + '</td>' +
      '<td><select data-toll-review-field="reviewStatus" data-index="' + index + '">' +
        ['Pending Review', 'Reviewed', 'Approved', 'Disputed'].map(status =>
          '<option value="' + esc(status) + '"' +
          (status === normalizeMaintenanceReviewStatus(row.reviewStatus) ? ' selected' : '') + '>' +
          esc(status) + '</option>'
        ).join('') + '</select></td>' +
      '<td><textarea data-toll-review-field="reviewNotes" data-index="' + index +
        '" rows="2">' + esc(row.reviewNotes || '') + '</textarea></td></tr>'
    ).join('') + '</tbody></table></div>';
}

function setElementTableSort(value) {
  const [tableName, key] = value.split(':');
  state.elementAuditSort = state.elementAuditSort || {};
  const previous = state.elementAuditSort[tableName];
  state.elementAuditSort[tableName] = {
    key,
    direction: previous && previous.key === key && previous.direction === 'asc' ? 'desc' : 'asc'
  };
  element();
}

function filterElementRows(input, selector) {
  const query = input.value.trim().toLowerCase();
  document.querySelectorAll(selector).forEach(row => {
    row.hidden = !String(row.dataset.filterText || '').includes(query);
    if (row.classList.contains('element-source-row')) {
      const detail = document.querySelector('[data-source-detail-row="' + row.dataset.sourceIndex + '"]');
      if (detail) detail.hidden = row.hidden || !detail.dataset.expanded;
    }
  });
}
