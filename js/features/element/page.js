/**
 * Compose the Element workspace and connect its controls to the focused audit modules.
 * Classic script module; shared services and state are loaded by index.html.
 */

function element() {
  setTitle('Element Invoice Audit', 'Audit only the records and charges contained in the Element invoice.');
  const audits = elementAuditList();
  const audit = currentElementAudit();
  if (audit) ensureMaintenanceReviewFromElement(audit);
  if (audit) ensureTollReviewFromElement(audit);
  const reviewSummary = audit ? maintenanceReviewSummary(audit) : { totalCharges: 0, pending: 0, reviewed: 0, approved: 0, disputed: 0, totalDifference: 0 };
  const tollSummary = audit ? tollReviewSummary(audit) : {
    billed: 0, reviewed: 0, approved: 0, pending: 0, disputed: 0, difference: 0
  };
  const selectedAuditId = audit && audit.id;
  const savedAuditIds = new Set(audits.map(item => item.id));
  $('content').innerHTML =
    '<div class="panel"><h2>1. ELEMENT INVOICE</h2>' +
    '<div class="toolbar"><button type="button" class="btn" id="saveElementAudit">Save Audit</button>' +
    '<button type="button" class="btn secondary" id="startNewElementAudit">Archive &amp; Start New Month</button>' +
    '<button type="button" class="btn secondary" id="clearCurrentElementDraft">Clear Current Draft</button>' +
    '<button type="button" class="btn secondary" id="showElementAuditHistory">Audit History</button>' +
    (audits.length ? '<label>Saved audit <select id="elementAuditSelect">' +
      (audit && !savedAuditIds.has(audit.id) ? '<option value="' + esc(audit.id) + '" selected>' +
        esc((audit.month || 'Untitled') + ' — ' + (audit.invoiceNumber || 'No invoice') + ' (Draft)') + '</option>' : '') +
      audits.map(item => '<option value="' + esc(item.id) + '"' + (item.id === selectedAuditId ? ' selected' : '') + '>' +
        esc(item.month + ' — ' + item.invoiceNumber) + '</option>').join('') + '</select></label>' : '') +
    '<div class="field"><label>Audit Month</label><input id="elementAuditMonth" value="' + esc(audit && audit.month || '') + '" placeholder="October 2026"></div>' +
    '<div class="field"><label>Invoice Number</label><input id="elementInvoiceNumber" value="' + esc(audit && audit.invoiceNumber || '') + '"></div>' +
    '<div class="field"><label>Invoice Date</label><input id="elementInvoiceDate" type="date" value="' + esc(audit && audit.invoiceDate || '') + '"></div>' +
    '<div class="field"><label>Invoice Total (from Element PDF)</label><input id="elementInvoiceTotal" type="number" step="0.01" value="' +
      esc(audit && audit.sourceInvoiceTotal != null ? audit.sourceInvoiceTotal : '') + '"></div>' +
    '</div>' +
    '<div class="drop" data-layout="space-bottom-12">Element PDF invoice<br><input id="elementInvoicePdf" type="file" accept=".pdf,application/pdf">' +
    (audit && audit.invoicePdfName ? '<div class="small">Attached to this audit: ' + esc(audit.invoicePdfName) +
      (audit.invoicePdfDataUrl ? ' <a href="' + esc(audit.invoicePdfDataUrl) + '" download="' + esc(audit.invoicePdfName) + '">Open / download PDF</a>' : '') +
      '</div>' : '') +
    '<div class="small">Use the PDF as the invoice reference and enter its invoice total above.</div></div>' +
    '<div class="drop">Upload Element CSV / CDV<br><input id="elementInvoiceFile" type="file" accept=".csv,.txt,.cdv"></div>' +
    '<p class="muted">Element invoice data is the source of truth for audit vehicles and charges. Amazon fleet records are not used here.</p>' +
    '<div id="elementReconciliation">' + elementReconciliationHtml(audit) + '</div>' +
    '<div class="toolbar" data-layout="space-top-12"><input id="elementInvoiceSearch" placeholder="Search Element invoice records"></div>' +
    elementInvoiceTableHtml(audit) + '</div>' +
    '<div class="panel" data-layout="space-top-14"><h2>2. ELEMENT PIVOT</h2>' +
    '<div class="toolbar"><input id="elementPivotSearch" placeholder="Search VIN-level pivot"></div>' +
    elementPivotTableHtml(audit) + '</div>' +
    '<div class="panel" data-layout="space-top-14"><h2>3. MAINTENANCE REVIEW</h2>' +
    '<div class="toolbar"><button class="btn" id="downloadMaintenanceReview">Download Maintenance Review</button>' +
    '<button class="btn secondary" id="uploadCompletedMaintenanceReview">Upload Completed Maintenance Review</button>' +
    '<input id="maintenanceReviewFile" type="file" accept=".csv,.xlsx,.xls" hidden></div>' +
    '<div class="cards"><div class="card"><div class="muted">Maintenance Charges</div><div class="num">' + formatMoney(reviewSummary.totalCharges) + '</div></div>' +
    '<div class="card"><div class="muted">Pending Review</div><div class="num">' + formatMoney(reviewSummary.pending) + '</div></div>' +
    '<div class="card"><div class="muted">Reviewed Amount</div><div class="num">' + formatMoney(reviewSummary.reviewed) + '</div></div>' +
    '<div class="card"><div class="muted">Approved</div><div class="num">' + formatMoney(reviewSummary.approved) + '</div></div>' +
    '<div class="card"><div class="muted">Disputed</div><div class="num">' + formatMoney(reviewSummary.disputed) + '</div></div>' +
    '<div class="card"><div class="muted">Reviewed Difference</div><div class="num">' + formatMoney(reviewSummary.totalDifference) + '</div></div></div>' +
    '<div class="notice">Review amounts are separate from the original Element charges and invoice total.</div>' +
    maintenanceReviewTableHtml(audit) +
    (audit && audit.unmatchedReviewRecords && audit.unmatchedReviewRecords.length ?
      '<h3>Unmatched Review Records</h3><div class="table"><table><thead><tr><th>VIN</th><th>Client Asset ID</th><th>Description</th><th>Element Charge</th><th>Review Status</th><th>Notes</th><th>Reason</th></tr></thead><tbody>' +
      audit.unmatchedReviewRecords.map(entry => '<tr><td>' + esc(entry.vin) + '</td><td>' + esc(entry.clientAssetId) + '</td><td>' +
        esc(entry.maintenanceDescription) + '</td><td>' + esc(entry.elementCharge) + '</td><td>' + esc(entry.reviewStatus) + '</td><td>' + esc(entry.reviewNotes) +
        '</td><td>' + esc(entry.conflictReason || 'No matching maintenance charge found.') + '</td></tr>').join('') +
      '</tbody></table></div>' : '') + '</div>' +
    '<div class="panel" data-layout="space-top-14"><h2>4. TOLL REVIEW</h2>' +
    '<div class="toolbar"><button type="button" class="btn" id="downloadTollReview">Download Toll Review</button>' +
    '<button type="button" class="btn secondary" id="uploadCompletedTollReview">Upload Completed Toll Review</button>' +
    '<input id="tollReviewFile" type="file" accept=".csv,.xlsx,.xls" hidden></div>' +
    '<div class="cards"><div class="card"><div class="muted">Element Toll Billed</div><div class="num">' + formatMoney(tollSummary.billed) + '</div></div>' +
    '<div class="card"><div class="muted">Reviewed Amount</div><div class="num">' + formatMoney(tollSummary.reviewed) + '</div></div>' +
    '<div class="card"><div class="muted">Approved</div><div class="num">' + formatMoney(tollSummary.approved) + '</div></div>' +
    '<div class="card"><div class="muted">Pending Review</div><div class="num">' + formatMoney(tollSummary.pending) + '</div></div>' +
    '<div class="card"><div class="muted">Disputed</div><div class="num">' + formatMoney(tollSummary.disputed) + '</div></div>' +
    '<div class="card"><div class="muted">Total Difference</div><div class="num">' + formatMoney(tollSummary.difference) + '</div></div></div>' +
    '<div class="notice">Toll review values are separate from the original Element billed charges and invoice reconciliation.</div>' +
    tollReviewTableHtml(audit) +
    (audit && audit.unmatchedTollReviewRecords && audit.unmatchedTollReviewRecords.length ?
      '<h3>Unmatched Toll Review Records</h3><div class="table"><table><thead><tr><th>VIN</th><th>Element Charge</th><th>Reviewed Amount</th><th>Status</th><th>Notes</th><th>Reason</th></tr></thead><tbody>' +
      audit.unmatchedTollReviewRecords.map(row => '<tr><td>' + esc(row.vin) + '</td><td>' +
        esc(row['Element Charge'] || row.elementCharge || '') + '</td><td>' +
        esc(row['Reviewed Amount'] || row.reviewedAmount || '') + '</td><td>' +
        esc(row['Review Status'] || row.reviewStatus || '') + '</td><td>' +
        esc(row['Review Notes'] || row.reviewNotes || '') + '</td><td>' +
        esc(row.conflictReason || 'No matching Element Ticket / Toll charge found.') + '</td></tr>').join('') +
      '</tbody></table></div>' : '') + '</div>' +
    '<div class="panel" data-layout="space-top-14"><h2>5. DELIVERABLE</h2>' +
    (audit ? deliverableHtml(audit) : '<p class="muted">Upload Element invoice data to build the client deliverable.</p>') + '</div>' +
    '<div class="panel" data-layout="actions-right"><button type="button" class="btn" id="generateClientReport">Generate Client Report</button></div>' +
    elementAuditHistoryHtml();
  if ($('downloadMaintenanceReview')) {
    $('downloadMaintenanceReview').addEventListener('click', exportMaintenanceReviewWorkbook);
  }
  if ($('uploadCompletedMaintenanceReview')) {
    $('uploadCompletedMaintenanceReview').addEventListener('click', () => $('maintenanceReviewFile').click());
  }
  if ($('maintenanceReviewFile')) {
    $('maintenanceReviewFile').addEventListener('change', event => parseMaintenanceReviewFile(event.target.files[0]));
  }
  if ($('downloadTollReview')) {
    $('downloadTollReview').addEventListener('click', exportTollReviewWorkbook);
  }
  if ($('uploadCompletedTollReview')) {
    $('uploadCompletedTollReview').addEventListener('click', () => $('tollReviewFile').click());
  }
  if ($('tollReviewFile')) {
    $('tollReviewFile').addEventListener('change', event => parseTollReviewFile(event.target.files[0]));
  }
  if ($('elementInvoiceFile')) {
    $('elementInvoiceFile').addEventListener('change', event => parseElementInvoiceFile(event.target.files[0]));
  }
  if ($('elementInvoicePdf')) {
    $('elementInvoicePdf').addEventListener('change', event => attachElementInvoicePdf(event.target.files[0]));
  }
  if ($('saveElementAudit')) {
    $('saveElementAudit').addEventListener('click', saveElementAuditDetails);
  }
  if ($('startNewElementAudit')) {
    $('startNewElementAudit').addEventListener('click', startNewElementAudit);
  }
  if ($('clearCurrentElementDraft')) {
    $('clearCurrentElementDraft').addEventListener('click', clearCurrentElementDraft);
  }
  if ($('showElementAuditHistory')) {
    $('showElementAuditHistory').addEventListener('click', () => {
      const history = $('elementAuditHistory');
      if (history) history.scrollIntoView({ behavior: 'smooth' });
    });
  }
  ['elementAuditMonth', 'elementInvoiceNumber', 'elementInvoiceDate', 'elementInvoiceTotal', 'pdfMaintenanceDetailTotal']
    .forEach(id => {
      if ($(id)) $(id).addEventListener('change', syncElementAuditDraft);
    });
  if ($('exportElementAuditBackup')) {
    $('exportElementAuditBackup').addEventListener('click', exportElementAuditBackup);
  }
  if ($('restoreElementAuditBackup')) {
    $('restoreElementAuditBackup').addEventListener('click', () => $('elementAuditBackupFile').click());
  }
  if ($('elementAuditBackupFile')) {
    $('elementAuditBackupFile').addEventListener('change', event => restoreElementAuditBackup(event.target.files[0]));
  }
  document.querySelectorAll('[data-open-element-audit]').forEach(button => {
    button.addEventListener('click', () => changeElementAudit(button.dataset.openElementAudit));
  });
  if ($('generateClientReport')) {
    $('generateClientReport').addEventListener('click', generateClientReport);
  }
  if ($('elementAuditSelect')) {
    $('elementAuditSelect').addEventListener('change', event => {
      changeElementAudit(event.target.value);
    });
  }
  document.querySelectorAll('[data-element-sort]').forEach(button => {
    button.addEventListener('click', () => setElementTableSort(button.dataset.elementSort));
  });
  if ($('elementInvoiceSearch')) {
    $('elementInvoiceSearch').addEventListener('input', event => filterElementRows(event.target, '.element-source-row'));
  }
  if ($('elementPivotSearch')) {
    $('elementPivotSearch').addEventListener('input', event => filterElementRows(event.target, '.element-pivot-row'));
  }
  document.querySelectorAll('[data-source-detail]').forEach(button => {
    button.addEventListener('click', () => {
      const detail = document.querySelector('[data-source-detail-row="' + button.dataset.sourceDetail + '"]');
      if (detail) {
        detail.dataset.expanded = String(!detail.hidden);
        detail.hidden = !detail.hidden;
      }
    });
  });
  document.querySelectorAll('[data-maintenance-review-field]').forEach(input => {
    input.addEventListener('change', () => {
      const audit = currentElementAudit();
      if (!audit) return;
      const row = ensureMaintenanceReviewFromElement(audit)[Number(input.dataset.index)];
      if (!row) return;
      const field = input.dataset.maintenanceReviewField;
      row[field] = input.value;
      if (field === 'reviewedAmount') {
        row.difference = input.value === '' ? '' : String(parseNumeric(row.reviewedAmount) - parseNumeric(row.elementCharge));
      } else if (field === 'difference') {
        row.difference = String(parseNumeric(row.reviewedAmount) - parseNumeric(row.elementCharge));
      }
      try {
        save();
      } catch (error) {
        console.error('Unable to persist the maintenance review change.', error);
        alert('The review change is visible in this workspace but could not be saved in browser storage. Export a backup and check available storage.');
      }
      element();
    });
  });
  document.querySelectorAll('[data-toll-review-field]').forEach(input => {
    input.addEventListener('change', () => {
      const audit = currentElementAudit();
      if (!audit) return;
      const row = ensureTollReviewFromElement(audit)[Number(input.dataset.index)];
      if (!row) return;
      const field = input.dataset.tollReviewField;
      row[field] = input.value;
      if (field === 'reviewedAmount') {
        row.difference = input.value === ''
          ? ''
          : String(roundCurrency(parseNumeric(input.value) - parseNumeric(row.elementCharge)));
      }
      try {
        save();
      } catch (error) {
        console.error('Unable to persist the toll review change.', error);
        alert('The toll review change is visible in this workspace but could not be saved in browser storage. Export a backup and check available storage.');
      }
      element();
    });
  });
}
