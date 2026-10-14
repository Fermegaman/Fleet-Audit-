/**
 * Build the deliverable and printable client report from the current invoice and review data.
 * Classic script module; shared services and state are loaded by index.html.
 */

function deliverableCategoryHtml(audit, category, title) {
  const items = elementChargeItems(audit, category);
  if (!items.length) return '';
  const total = items.reduce((sum, item) => sum + item.cost, 0);
  return '<h4>' + esc(title) + '</h4><div class="table"><table><thead><tr><th>VIN</th><th>Description</th><th>Cost</th></tr></thead><tbody>' +
    items.map(item => '<tr><td>' + esc(item.vin) + '</td><td>' + esc(item.description) + '</td><td>' + esc(formatMoney(item.cost)) + '</td></tr>').join('') +
    '<tr><th colspan="2">TOTAL</th><th>' + esc(formatMoney(total)) + '</th></tr></tbody></table></div>';
}

function maintenanceDeliverableSummary(audit) {
  const rows = ensureMaintenanceReviewFromElement(audit);
  const summary = maintenanceReviewSummary(audit);
  return {
    billed: summary.totalCharges,
    reviewedApproved: summary.approved,
    pending: summary.pending,
    difference: summary.totalDifference,
    pendingStatus: rows.some(row => normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Pending Review' || row.reviewedAmount === '')
  };
}

function deliverableHtml(audit) {
  if (!audit) return '<p class="muted">Upload Element data to build the client deliverable.</p>';
  const totals = elementSummary(audit);
  const review = maintenanceDeliverableSummary(audit);
  const categoryCards = [
    ['Lease Charges', totals.lease], ['Maintenance Charges', totals.maintenance],
    ['Uncategorized Charges', totals.uncategorized], ['Ticket / Toll', totals.ticket],
    ['Credits', totals.credits], ['Tax Rental', totals.taxRental], ['Other Charges', totals.other],
    ['TOTAL', totals.total]
  ];
  return '<div class="cards">' + categoryCards.map(([label, value]) =>
    '<div class="card"><div class="muted">' + esc(label) + '</div><div class="num">' + esc(formatMoney(value)) + '</div></div>'
  ).join('') + '</div>' +
    elementReconciliationHtml(audit, false) +
    deliverableCategoryHtml(audit, 'maintenance', 'Maintenance Charges') +
    deliverableCategoryHtml(audit, 'ticket', 'Ticket / Toll') +
    deliverableCategoryHtml(audit, 'uncategorized', 'Uncategorized Charges') +
    deliverableCategoryHtml(audit, 'credits', 'Credits') +
    deliverableCategoryHtml(audit, 'other', 'Other Charges') +
    '<div class="panel" data-layout="space-top-12"><h3>Maintenance Review (separate from Element billed totals)</h3>' +
    (review.pendingStatus ? '<div class="notice">Maintenance Review Pending</div>' : '') +
    '<p>Element Maintenance Billed: <strong>' + esc(formatMoney(review.billed)) +
    '</strong> &nbsp; Reviewed / Approved Amount: <strong>' + esc(formatMoney(review.reviewedApproved)) +
    '</strong> &nbsp; Pending Review: <strong>' + esc(formatMoney(review.pending)) +
    '</strong> &nbsp; Maintenance Difference: <strong>' + esc(formatMoney(review.difference)) + '</strong></p></div>';
}

function clientReportHtml(audit) {
  const selected = selectedClient();
  const client = {
    company: audit.clientName || selected.company,
    shortCode: audit.shortCode || selected.shortCode,
    station: audit.station || selected.station
  };
  const totals = elementSummary(audit);
  const sourceTotal = elementSourceInvoiceTotal(audit);
  const calculatedTotal = totals.total;
  const difference = sourceTotal == null ? null : calculatedTotal - sourceTotal;
  const maintenanceVariance = elementMaintenanceVariance(audit);
  const maintenanceSummary = maintenanceReviewSummary(audit);
  const review = maintenanceDeliverableSummary(audit);
  const tollSummary = tollReviewSummary(audit);
  const tollRows = ensureTollReviewFromElement(audit);
  const missingInformation = [];
  if (!audit.month) missingInformation.push('Audit month');
  if (!audit.invoiceNumber) missingInformation.push('Invoice number');
  if (!audit.invoiceDate) missingInformation.push('Invoice date');
  if (sourceTotal == null) missingInformation.push('Element invoice total');
  if (!elementAuditRecords(audit).length) missingInformation.push('Element invoice CSV/CDV records');
  const auditStatus = sourceTotal == null
    ? 'Missing invoice total'
    : Math.abs(difference) < 0.01 ? 'Balanced' : 'Variance';
  const pivot = elementPivot(audit);
  const pivotRows = pivot.map(row => '<tr><td>' + esc(row.vin) + '</td>' +
    [row.ticket, row.lease, row.maintenance, row.uncategorized, row.credits, row.taxRental, row.other, row.total]
      .map(value => '<td>' + esc(formatMoney(value)) + '</td>').join('') + '</tr>').join('');
  const detailTable = (title, category) => {
    const items = elementChargeItems(audit, category);
    if (!items.length) return '';
    return '<h3>' + esc(title) + '</h3><table><thead><tr><th>VIN</th><th>Description</th><th>Cost</th></tr></thead><tbody>' +
      items.map(item => '<tr><td>' + esc(item.vin) + '</td><td>' + esc(item.description) + '</td><td>' + esc(formatMoney(item.cost)) + '</td></tr>').join('') +
      '<tr><th colspan="2">TOTAL</th><th>' + esc(formatMoney(items.reduce((sum, item) => sum + item.cost, 0))) + '</th></tr></tbody></table>';
  };
  const reviewRows = ensureMaintenanceReviewFromElement(audit);
  return '<!doctype html><html><head><meta charset="utf-8"><title>Element Audit - ' + esc(audit.month) +
    '</title><link rel="stylesheet" href="' + esc(new URL('css/reports/client-report.css', document.baseURI).href) + '"></head><body>' +
    '<div class="toolbar"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>' +
    '<h1>Element Invoice Audit</h1><p><strong>Client:</strong> ' + esc(client.company) + '<br><strong>Short Code:</strong> ' + esc(client.shortCode) +
    '<br><strong>Station:</strong> ' + esc(client.station) + '<br><strong>Audit Month:</strong> ' + esc(audit.month) +
    '<br><strong>Invoice Number:</strong> ' + esc(audit.invoiceNumber) + '<br><strong>Invoice Date:</strong> ' + esc(audit.invoiceDate) +
    '<br><strong>Invoice Total:</strong> ' + esc(sourceTotal == null ? 'MISSING — enter the total from the Element invoice PDF' : formatMoney(sourceTotal)) + '</p>' +
    '<h2>Element Invoice Charges Summary</h2><div class="summary">' +
    [['Lease Charges', totals.lease], ['Maintenance Charges', totals.maintenance], ['Uncategorized Charges', totals.uncategorized],
      ['Ticket / Toll', totals.ticket], ['Credits', totals.credits], ['Tax Rental', totals.taxRental],
      ['Other Charges', totals.other], ['TOTAL', totals.total]].map(([label, value]) =>
      '<div class="card"><strong>' + esc(label) + '</strong><br>' + esc(formatMoney(value)) + '</div>').join('') + '</div>' +
    '<h2>Element Pivot Summary</h2><table><thead><tr><th>VIN</th><th>Ticket / Toll</th><th>Lease Charges</th><th>Maintenance Charges</th><th>Uncategorized Charges</th><th>Credits</th><th>Tax Rental</th><th>Other Charges</th><th>Total Charges</th></tr></thead><tbody>' +
    pivotRows + '<tr><th>TOTAL</th>' + [totals.ticket, totals.lease, totals.maintenance, totals.uncategorized, totals.credits, totals.taxRental, totals.other, totals.total]
      .map(value => '<th>' + esc(formatMoney(value)) + '</th>').join('') + '</tr></tbody></table>' +
    '<h2>Maintenance Review Summary</h2>' +
    (review.pendingStatus ? '<p><strong>Maintenance Review Pending</strong></p>' : '') +
    '<p>Element Maintenance Billed: ' + esc(formatMoney(review.billed)) +
    ' | Reviewed / Approved Amount: ' + esc(formatMoney(review.reviewedApproved)) +
    ' | Pending Review: ' + esc(formatMoney(review.pending)) +
    ' | Difference: ' + esc(formatMoney(review.difference)) + '</p>' +
    '<p>Reviewed Amount: ' + esc(formatMoney(maintenanceSummary.reviewed)) +
    ' | Approved: ' + esc(formatMoney(maintenanceSummary.approved)) +
    ' | Disputed: ' + esc(formatMoney(maintenanceSummary.disputed)) + '</p>' +
    '<h3>Maintenance Details</h3><table><thead><tr><th>VIN</th><th>Description</th><th>Element Charge</th><th>Reviewed Amount</th><th>Difference</th><th>Status</th><th>Notes</th></tr></thead><tbody>' +
    (reviewRows.length ? reviewRows.map(row => '<tr><td>' + esc(row.vin) + '</td><td>' + esc(row.maintenanceDescription) +
      '</td><td>' + esc(formatMoney(row.elementCharge)) + '</td><td>' + esc(row.reviewedAmount === '' ? '' : formatMoney(row.reviewedAmount)) +
      '</td><td>' + esc(row.difference === '' ? '' : formatMoney(row.difference)) +
      '</td><td>' + esc(row.reviewStatus) + '</td><td>' + esc(row.reviewNotes) + '</td></tr>').join('') :
      '<tr><td colspan="7">No maintenance charges.</td></tr>') + '</tbody></table>' +
    '<h2>Toll Review Summary</h2>' +
    (tollRows.some(row => normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Pending Review' ||
      row.reviewedAmount === '' || row.reviewedAmount == null)
      ? '<p><strong>Toll Review Pending</strong></p>' : '') +
    '<p>Element Toll Billed: ' + esc(formatMoney(tollSummary.billed)) +
    ' | Reviewed Amount: ' + esc(formatMoney(tollSummary.reviewed)) +
    ' | Approved: ' + esc(formatMoney(tollSummary.approved)) +
    ' | Pending Review: ' + esc(formatMoney(tollSummary.pending)) +
    ' | Disputed: ' + esc(formatMoney(tollSummary.disputed)) +
    ' | Total Difference: ' + esc(formatMoney(tollSummary.difference)) + '</p>' +
    '<h3>Toll Review Details</h3><table><thead><tr><th>VIN</th><th>Unit</th><th>Client Asset ID</th>' +
    '<th>Description</th><th>Element Charge</th><th>Reviewed Amount</th><th>Difference</th><th>Status</th><th>Notes</th></tr></thead><tbody>' +
    (tollRows.length ? tollRows.map(row => '<tr><td>' + esc(row.vin) + '</td><td>' + esc(row.unit) +
      '</td><td>' + esc(row.clientAssetId) + '</td><td>' + esc(row.description) +
      '</td><td>' + esc(formatMoney(row.elementCharge)) + '</td><td>' +
      esc(row.reviewedAmount === '' || row.reviewedAmount == null ? '' : formatMoney(row.reviewedAmount)) +
      '</td><td>' + esc(row.difference === '' ? '' : formatMoney(row.difference)) +
      '</td><td>' + esc(row.reviewStatus) + '</td><td>' + esc(row.reviewNotes) + '</td></tr>').join('') :
      '<tr><td colspan="9">No Element Ticket / Toll charges.</td></tr>') + '</tbody></table>' +
    detailTable('Ticket / Toll Details', 'ticket') +
    detailTable('Uncategorized Charges', 'uncategorized') +
    detailTable('Credits', 'credits') +
    detailTable('Other Charges', 'other') +
    '<h2>Element Invoice Reconciliation</h2><p>Calculated Element Total: ' + esc(formatMoney(calculatedTotal)) +
    '<br>Element Invoice Total: ' + esc(sourceTotal == null ? 'MISSING' : formatMoney(sourceTotal)) +
    '<br>Difference: ' + esc(difference == null ? 'Not calculated — invoice total is missing' : formatMoney(difference)) +
    '<br>Audit Status: ' + esc(auditStatus) + '</p>' +
    (maintenanceVariance ? '<h2>Maintenance Source Verification</h2><p>CSV maintenance category: ' +
      esc(formatMoney(maintenanceVariance.csvTotal)) + '<br>PDF maintenance detail total: ' +
      esc(formatMoney(maintenanceVariance.pdfDetailTotal)) + '<br>Difference (PDF − CSV): ' +
      esc(formatMoney(maintenanceVariance.difference)) +
      '<br>' + esc(maintenanceVariance.source) +
      '<br>This source-level variance is unresolved and does not change billed or reviewed amounts.</p>' : '') +
    (missingInformation.length ? '<div class="notice"><strong>Missing information:</strong> ' + esc(missingInformation.join(', ')) + '</div>' : '') +
    '</body></html>';
}

function generateClientReport() {
  const audit = currentElementAudit();
  if (!audit) {
    alert('Upload Element invoice data before generating the client report.');
    return;
  }
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    alert('The client report tab was blocked. Allow pop-ups for this application and try again.');
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(clientReportHtml(audit));
  reportWindow.document.close();
}
