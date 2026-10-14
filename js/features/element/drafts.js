/**
 * Update invoice metadata, start a new month and clear only the active draft after confirmation.
 * Classic script module; shared services and state are loaded by index.html.
 */

function saveElementAuditDetails() {
  const month = $('elementAuditMonth').value.trim();
  const invoiceNumber = $('elementInvoiceNumber').value.trim();
  if (!month || !invoiceNumber) {
    alert('Enter both the Audit Month and Invoice Number.');
    return;
  }
  let audit = currentElementAudit();
  if (!audit) {
    audit = {
      id: createElementAuditId(),
      clientId: currentClientId,
      month,
      invoiceNumber,
      invoiceDate: '',
      sourceInvoiceTotal: '',
      elementRecords: [],
      maintenanceReview: [],
      unmatchedReviewRecords: []
    };
  }
  audit.month = month;
  audit.invoiceNumber = invoiceNumber;
  audit.invoiceDate = $('elementInvoiceDate').value;
  audit.sourceInvoiceTotal = $('elementInvoiceTotal').value.trim();
  const previousPdfDetailTotal = audit.pdfMaintenanceDetailTotal == null
    ? ''
    : String(audit.pdfMaintenanceDetailTotal);
  audit.pdfMaintenanceDetailTotal = $('pdfMaintenanceDetailTotal')
    ? $('pdfMaintenanceDetailTotal').value.trim()
    : audit.pdfMaintenanceDetailTotal || '';
  if (audit.pdfMaintenanceDetailTotal && audit.pdfMaintenanceDetailTotal !== previousPdfDetailTotal) {
    audit.pdfMaintenanceDetailSource = 'Entered by fleet team for source verification.';
  }
  audit.clientId = currentClientId;
  audit.clientId = currentClientId;
  const client = selectedClient();
  audit.clientName = client.company;
  audit.shortCode = client.shortCode;
  state.activeElementAuditByClient = state.activeElementAuditByClient || {};
  state.activeElementAuditByClient[currentClientId] = audit;
  state.selectedElementAuditByClient = state.selectedElementAuditByClient || {};
  state.selectedElementAuditByClient[currentClientId] = audit.id;
  if (!saveCurrentElementAudit(audit)) return;
  element();
}

function elementAuditHasDraftContent(audit) {
  if (!audit) return false;
  return Boolean(
    String(audit.month || '').trim() ||
    String(audit.invoiceNumber || '').trim() ||
    String(audit.invoiceDate || '').trim() ||
    String(audit.sourceInvoiceTotal || '').trim() ||
    String(audit.invoicePdfName || '').trim() ||
    String(audit.invoicePdfDataUrl || '').trim() ||
    String(audit.csvFileName || '').trim() ||
    (Array.isArray(audit.elementRecords) && audit.elementRecords.length) ||
    (Array.isArray(audit.maintenanceReview) && audit.maintenanceReview.length) ||
    (Array.isArray(audit.tollReview) && audit.tollReview.length) ||
    (Array.isArray(audit.unmatchedReviewRecords) && audit.unmatchedReviewRecords.length) ||
    (Array.isArray(audit.unmatchedTollReviewRecords) && audit.unmatchedTollReviewRecords.length)
  );
}

function createEmptyElementAuditDraft(month = '') {
  const client = selectedClient();
  return {
    id: createElementAuditId(),
    clientId: currentClientId,
    clientName: client.company,
    shortCode: client.shortCode,
    station: client.station,
    month,
    invoiceNumber: '',
    invoiceDate: '',
    sourceInvoiceTotal: '',
    pdfMaintenanceDetailTotal: '',
    elementRecords: [],
    maintenanceReview: [],
    tollReview: [],
    unmatchedReviewRecords: [],
    unmatchedTollReviewRecords: [],
    createdAt: new Date().toISOString()
  };
}

function startNewElementAudit() {
  const current = currentElementAudit();
  if (elementAuditHasDraftContent(current)) {
    if (!current.invoiceNumber || !current.invoiceDate || !current.month) {
      alert('Complete the current audit month, invoice number, and invoice date before archiving it.');
      return;
    }
    if (!saveCurrentElementAudit(current)) return;
  }
  const month = window.prompt('Enter the new audit month (for example, November 2026):');
  if (month == null || !month.trim()) return;
  const client = selectedClient();
  const existingAudit = elementAuditList().find(item =>
    elementAuditMonthKey(item.clientId, item.month) ===
      elementAuditMonthKey(currentClientId, month)
  );
  if (existingAudit) {
    if (window.confirm('An audit already exists for ' + client.company + ' in ' + month.trim() +
        '. Open that saved audit instead of creating or replacing it?')) {
      changeElementAudit(existingAudit.id);
    }
    return;
  }
  if (!window.confirm('Archive the current audit and start a clean Element audit for ' +
      client.company + ', ' + month.trim() + '? The current month will be saved in Audit History; ' +
      'the new draft will not carry over charges, files, or review entries.')) {
    return;
  }
  const previous = current;
  const previousSelectedAuditId = state.selectedElementAuditByClient &&
    state.selectedElementAuditByClient[currentClientId];
  const audit = createEmptyElementAuditDraft(month.trim());
  state.activeElementAuditByClient = state.activeElementAuditByClient || {};
  state.activeElementAuditByClient[currentClientId] = audit;
  state.selectedElementAuditByClient = state.selectedElementAuditByClient || {};
  state.selectedElementAuditByClient[currentClientId] = audit.id;
  try {
    save();
  } catch (error) {
    if (previous) state.activeElementAuditByClient[currentClientId] = previous;
    else delete state.activeElementAuditByClient[currentClientId];
    if (previousSelectedAuditId) state.selectedElementAuditByClient[currentClientId] = previousSelectedAuditId;
    else delete state.selectedElementAuditByClient[currentClientId];
    console.error('Unable to save the new Element audit workspace in browser storage.', error);
    alert('The new Element audit workspace could not be saved in browser storage. The prior workspace was retained.');
    return;
  }
  element();
}

function clearCurrentElementDraft() {
  const current = currentElementAudit();
  if (!current) {
    alert('There is no active Element draft to clear.');
    return;
  }
  const savedAudit = state.elementAudits.find(audit => audit.id === current.id);
  if (savedAudit) {
    if (!window.confirm('This audit is saved in Audit History and will not be deleted. Discard only unsaved changes and reload the saved audit?')) {
      return;
    }
    state.activeElementAuditByClient[currentClientId] = cloneElementAudit(savedAudit);
    try {
      save();
    } catch (error) {
      state.activeElementAuditByClient[currentClientId] = current;
      console.error('Unable to reload the saved Element audit.', error);
      alert('The saved audit remains intact, but the active workspace could not be reloaded.');
      return;
    }
    element();
    return;
  }
  const warning = elementAuditHasDraftContent(current)
    ? 'This will discard unsaved Element data, review entries, and any active draft file references. Saved Audit History will not be affected. Continue?'
    : 'Reset the active Element form? Saved Audit History will not be affected.';
  if (!window.confirm(warning)) return;
  const previousSelectedAuditId = state.selectedElementAuditByClient &&
    state.selectedElementAuditByClient[currentClientId];
  state.activeElementAuditByClient[currentClientId] = createEmptyElementAuditDraft();
  if (state.selectedElementAuditByClient) delete state.selectedElementAuditByClient[currentClientId];
  try {
    save();
  } catch (error) {
    state.activeElementAuditByClient[currentClientId] = current;
    if (previousSelectedAuditId) {
      state.selectedElementAuditByClient[currentClientId] = previousSelectedAuditId;
    }
    console.error('Unable to clear the active Element draft.', error);
    alert('The active Element draft could not be cleared in browser storage. Existing data was retained.');
    return;
  }
  element();
}

function syncElementAuditDraft() {
  const month = $('elementAuditMonth').value.trim();
  const invoiceNumber = $('elementInvoiceNumber').value.trim();
  let audit = currentElementAudit();
  if (!audit && !month && !invoiceNumber) return;
  if (!audit) {
    const client = selectedClient();
    audit = {
      id: createElementAuditId(),
      clientId: currentClientId,
      clientName: client.company,
      shortCode: client.shortCode,
      month: '',
      invoiceNumber: '',
      invoiceDate: '',
      sourceInvoiceTotal: '',
      pdfMaintenanceDetailTotal: '',
      elementRecords: [],
      maintenanceReview: [],
      unmatchedReviewRecords: []
    };
    state.activeElementAuditByClient = state.activeElementAuditByClient || {};
    state.activeElementAuditByClient[currentClientId] = audit;
  }
  audit.month = month;
  audit.invoiceNumber = invoiceNumber;
  audit.invoiceDate = $('elementInvoiceDate').value;
  audit.sourceInvoiceTotal = $('elementInvoiceTotal').value.trim();
  const previousPdfDetailTotal = audit.pdfMaintenanceDetailTotal == null
    ? ''
    : String(audit.pdfMaintenanceDetailTotal);
  audit.pdfMaintenanceDetailTotal = $('pdfMaintenanceDetailTotal')
    ? $('pdfMaintenanceDetailTotal').value.trim()
    : audit.pdfMaintenanceDetailTotal || '';
  if (audit.pdfMaintenanceDetailTotal && audit.pdfMaintenanceDetailTotal !== previousPdfDetailTotal) {
    audit.pdfMaintenanceDetailSource = 'Entered by fleet team for source verification.';
  }
  try {
    save();
  } catch (error) {
    console.error('Unable to save the active Element audit workspace.', error);
    alert('The active Element audit could not be saved in browser storage. Export a backup and check available browser storage.');
  }
  const reconciliationPanel = $('elementReconciliation');
  if (reconciliationPanel) {
    reconciliationPanel.innerHTML = elementReconciliationHtml(audit);
    const maintenanceDetailInput = $('pdfMaintenanceDetailTotal');
    if (maintenanceDetailInput) maintenanceDetailInput.addEventListener('change', syncElementAuditDraft);
  }
}
