/**
 * Select active audit drafts, detect changes and save a monthly audit with the existing validation rules.
 * Classic script module; shared services and state are loaded by index.html.
 */

function elementAuditList() {
  return state.elementAudits.filter(audit => audit.clientId === currentClientId);
}

function currentElementAudit() {
  state.activeElementAuditByClient = state.activeElementAuditByClient || {};
  const active = state.activeElementAuditByClient[currentClientId];
  if (active) return active;
  const audits = elementAuditList();
  const selectedId = state.selectedElementAuditByClient &&
    state.selectedElementAuditByClient[currentClientId];
  const selected = audits.find(audit => audit.id === selectedId) || audits[audits.length - 1];
  if (!selected) return null;
  state.activeElementAuditByClient[currentClientId] = JSON.parse(JSON.stringify(selected));
  return state.activeElementAuditByClient[currentClientId];
}

function cloneElementAudit(audit) {
  return JSON.parse(JSON.stringify(audit));
}

function createElementAuditId() {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  return 'element-audit-' + random;
}

function elementAuditSignature(audit) {
  if (!audit) return '';
  const data = cloneElementAudit(audit);
  ['savedAt', 'updatedAt', 'reconciliationDifference', 'reconciliationStatus'].forEach(key => delete data[key]);
  return JSON.stringify(data);
}

function elementAuditIsDirty(audit) {
  if (!audit) return false;
  const savedAudit = state.elementAudits.find(item => item.id === audit.id);
  return !savedAudit || elementAuditSignature(savedAudit) !== elementAuditSignature(audit);
}

function elementAuditReconciliation(audit) {
  const calculatedTotal = elementSummary(audit).total;
  const invoiceTotal = elementSourceInvoiceTotal(audit);
  const difference = invoiceTotal == null ? null : roundCurrency(calculatedTotal - invoiceTotal);
  return {
    calculatedTotal,
    invoiceTotal,
    difference,
    status: invoiceTotal == null ? 'Missing invoice total' :
      Math.abs(difference) < 0.01 ? 'Balanced' : 'Variance'
  };
}

function saveCurrentElementAudit(audit, confirmOverwrite = true) {
  if (!audit) throw new Error('There is no active Element audit to save.');
  if (!String(audit.month || '').trim() || !String(audit.invoiceNumber || '').trim() ||
      !String(audit.invoiceDate || '').trim()) {
    alert('Enter the audit month, invoice number, and invoice date before saving this audit.');
    return null;
  }
  const existingById = state.elementAudits.find(item => item.id === audit.id);
  if (existingById && elementAuditMonthKey(existingById.clientId, existingById.month) !==
      elementAuditMonthKey(audit.clientId, audit.month)) {
    alert('A saved audit cannot be moved to a different client or month. Use Archive & Start New Month for a new monthly audit.');
    return null;
  }
  if (confirmOverwrite && existingById &&
      elementAuditSignature(existingById) !== elementAuditSignature(audit) &&
      !window.confirm('This will update the saved audit for ' +
        (existingById.clientName || audit.clientName || 'this client') + ', ' +
        existingById.month + ', invoice ' + existingById.invoiceNumber +
        '. Continue and replace its saved data?')) {
    return null;
  }
  const client = state.clients.find(item => item.id === audit.clientId);
  if (!client) throw new Error('The active Element audit has no matching client.');
  audit.clientName = client.company;
  audit.shortCode = client.shortCode;
  audit.station = client.station;
  audit.updatedAt = new Date().toISOString();
  audit.createdAt = audit.createdAt || audit.updatedAt;
  retainElementMaintenanceVerification(audit);
  ensureTollReviewFromElement(audit);
  const reconciliation = elementAuditReconciliation(audit);
  audit.reconciliationDifference = reconciliation.difference;
  audit.reconciliationStatus = reconciliation.status;
  const duplicate = state.elementAudits.find(item =>
    item.clientId === audit.clientId &&
    elementAuditMonthKey(item.clientId, item.month) ===
      elementAuditMonthKey(audit.clientId, audit.month)
  );
  if (duplicate && duplicate.id !== audit.id) {
    alert('A saved audit already exists for this client and month. Open that audit from Audit History instead of creating a duplicate.');
    return null;
  }
  const index = state.elementAudits.findIndex(item => item.id === audit.id);
  const previousSavedAudit = index >= 0 ? state.elementAudits[index] : null;
  const hadActiveWorkspace = Object.prototype.hasOwnProperty.call(
    state.activeElementAuditByClient, audit.clientId
  );
  const previousActiveWorkspace = state.activeElementAuditByClient[audit.clientId];
  const previousSelectedAuditId = state.selectedElementAuditByClient &&
    state.selectedElementAuditByClient[audit.clientId];
  const savedAudit = cloneElementAudit(audit);
  savedAudit.savedAt = savedAudit.savedAt || savedAudit.updatedAt;
  if (index >= 0) state.elementAudits[index] = savedAudit;
  else state.elementAudits.push(savedAudit);
  state.activeElementAuditByClient[audit.clientId] = audit;
  state.selectedElementAuditByClient = state.selectedElementAuditByClient || {};
  state.selectedElementAuditByClient[audit.clientId] = audit.id;
  try {
    save();
  } catch (error) {
    if (index >= 0) state.elementAudits[index] = previousSavedAudit;
    else state.elementAudits = state.elementAudits.filter(item => item.id !== audit.id);
    if (hadActiveWorkspace) {
      state.activeElementAuditByClient[audit.clientId] = previousActiveWorkspace;
    } else {
      delete state.activeElementAuditByClient[audit.clientId];
    }
    state.selectedElementAuditByClient = state.selectedElementAuditByClient || {};
    if (previousSelectedAuditId) {
      state.selectedElementAuditByClient[audit.clientId] = previousSelectedAuditId;
    } else {
      delete state.selectedElementAuditByClient[audit.clientId];
    }
    console.error('Unable to save the Element audit to browser storage.', error);
    alert('The Element audit could not be saved in browser storage. Export a backup and check available storage.');
    return null;
  }
  return audit;
}

function normalizedElementKey(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function elementAuditKey(clientId, month, invoiceNumber) {
  return [clientId, normalizedElementKey(month), normalizedElementKey(invoiceNumber)].join('|');
}

function elementAuditMonthKey(clientId, month) {
  return [clientId, normalizedElementKey(month)].join('|');
}

function sourceValue(source, candidates) {
  const candidateKeys = candidates.map(normalizedElementKey);
  const entry = Object.entries(source || {}).find(([key]) =>
    candidateKeys.includes(normalizedElementKey(key))
  );
  return entry ? entry[1] : '';
}
