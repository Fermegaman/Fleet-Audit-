/**
 * Render saved audit history and reopen a saved audit into the active workspace.
 * Classic script module; shared services and state are loaded by index.html.
 */

function elementAuditHistoryHtml() {
  const audits = elementAuditList().slice().sort((left, right) =>
    String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || ''))
  );
  const rows = audits.map(audit => {
    const reconciliation = elementAuditReconciliation(audit);
    const maintenanceStatus = elementReviewCompletionStatus(ensureMaintenanceReviewFromElement(audit));
    const tollStatus = elementReviewCompletionStatus(ensureTollReviewFromElement(audit));
    const client = state.clients.find(item => item.id === audit.clientId);
    return '<tr><td>' + esc((client && client.shortCode) || audit.shortCode || '') + ' — ' +
      esc((client && client.company) || audit.clientName || '') + '</td><td>' + esc(audit.month || '') +
      '</td><td>' + esc(audit.invoiceNumber || '') + '</td><td>' + esc(audit.invoiceDate || '') + '</td><td>' +
      esc(reconciliation.invoiceTotal == null ? 'Not entered' : formatMoney(reconciliation.invoiceTotal)) +
      '</td><td>' + esc(formatMoney(reconciliation.calculatedTotal)) + '</td><td>' +
      esc(reconciliation.difference == null ? '—' : formatMoney(reconciliation.difference)) +
      '</td><td>' + esc(reconciliation.status) + '</td><td>' + esc(maintenanceStatus) + '</td><td>' +
      esc(tollStatus) + '</td><td><button type="button" class="btn secondary" data-open-element-audit="' +
      esc(audit.id) + '">Open</button></td></tr>';
  }).join('');
  return '<div class="panel" id="elementAuditHistory" data-layout="space-top-14"><h2>Audit History</h2>' +
    '<p class="muted">Saved audits are stored in this browser only; local history is not shared with other team members or synced across computers. Use Export Backup to retain a portable copy. Attached PDFs are included only when saved in browser storage and the backup.</p>' +
    '<div class="toolbar"><button type="button" class="btn secondary" id="exportElementAuditBackup">Export Backup</button>' +
    '<button type="button" class="btn secondary" id="restoreElementAuditBackup">Restore Backup</button>' +
    '<input id="elementAuditBackupFile" type="file" accept=".json,application/json" hidden></div>' +
    (rows ? '<div class="table"><table><thead><tr><th>Client</th><th>Audit Month</th><th>Invoice Number</th><th>Invoice Date</th><th>Invoice Total</th><th>Calculated CSV Total</th><th>Difference</th><th>Reconciliation</th><th>Maintenance Review</th><th>Toll Review</th><th>Action</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' : '<p class="muted">No saved audits for this client yet.</p>') + '</div>';
}

function changeElementAudit(auditId) {
  const current = currentElementAudit();
  if (current && elementAuditIsDirty(current)) {
    const hasRequiredMetadata = String(current.month || '').trim() &&
      String(current.invoiceNumber || '').trim() && String(current.invoiceDate || '').trim();
    if (hasRequiredMetadata) {
      const shouldSave = window.confirm('The active Element audit has unsaved changes. Save it to Audit History before opening another audit?');
      if (!shouldSave || !saveCurrentElementAudit(current, false)) return;
    } else if (elementAuditHasDraftContent(current) &&
        !window.confirm('The active draft is incomplete and cannot be archived yet. Discard this active draft and open the saved audit?')) {
      return;
    }
  }
  const audit = elementAuditList().find(item => item.id === auditId);
  if (!audit) {
    alert('The selected saved audit could not be found for this client.');
    return;
  }
  state.activeElementAuditByClient = state.activeElementAuditByClient || {};
  state.activeElementAuditByClient[currentClientId] = cloneElementAudit(audit);
  state.selectedElementAuditByClient = state.selectedElementAuditByClient || {};
  state.selectedElementAuditByClient[currentClientId] = auditId;
  try {
    save();
  } catch (error) {
    console.error('Unable to persist the selected Element audit workspace.', error);
    alert('The selected audit is open, but its workspace selection could not be saved in browser storage.');
    return;
  }
  element();
}
