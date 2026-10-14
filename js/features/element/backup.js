/**
 * Export and restore audit backups, preserving the existing duplicate and validation checks.
 * Classic script module; shared services and state are loaded by index.html.
 */

function exportElementAuditBackup() {
  const payload = {
    format: 'FleetAuditHubElementAuditBackup',
    version: 1,
    exportedAt: new Date().toISOString(),
    audits: state.elementAudits.map(cloneElementAudit),
    activeWorkspaces: Object.fromEntries(Object.entries(state.activeElementAuditByClient || {})
      .map(([clientId, audit]) => [clientId, cloneElementAudit(audit)]))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fleet-audit-element-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function restoreElementAuditBackup(file) {
  if (!file) return;
  const previousAudits = state.elementAudits.slice();
  const previousWorkspaces = Object.assign({}, state.activeElementAuditByClient || {});
  const reader = new FileReader();
  reader.onerror = () => alert('The selected Element audit backup could not be read.');
  reader.onload = event => {
    try {
      const backup = JSON.parse(String(event.target.result || ''));
      if (backup.format !== 'FleetAuditHubElementAuditBackup' || !Array.isArray(backup.audits)) {
        throw new Error('This file is not a supported Fleet Audit Hub Element audit backup.');
      }
      const existingIds = new Set(state.elementAudits.map(audit => audit.id));
      const existingKeys = new Set(state.elementAudits.map(audit =>
        elementAuditMonthKey(audit.clientId, audit.month)
      ));
      let restored = 0;
      let skipped = 0;
      backup.audits.forEach(audit => {
        if (!audit || !audit.id || !audit.clientId || !audit.month || !audit.invoiceNumber ||
            !Array.isArray(audit.elementRecords)) {
          skipped++;
          return;
        }
        const key = elementAuditMonthKey(audit.clientId, audit.month);
        if (existingIds.has(audit.id) || existingKeys.has(key)) {
          skipped++;
          return;
        }
        state.elementAudits.push(cloneElementAudit(audit));
        existingIds.add(audit.id);
        existingKeys.add(key);
        restored++;
      });
      state.activeElementAuditByClient = state.activeElementAuditByClient || {};
      Object.entries(backup.activeWorkspaces || {}).forEach(([clientId, audit]) => {
        if (audit && audit.clientId === clientId && !state.activeElementAuditByClient[clientId]) {
          state.activeElementAuditByClient[clientId] = cloneElementAudit(audit);
        }
      });
      save();
      alert('Backup restore complete. Added ' + restored + ' saved audit(s); skipped ' + skipped +
        ' duplicate or invalid record(s). Existing app data was preserved.');
      element();
    } catch (error) {
      state.elementAudits = previousAudits;
      state.activeElementAuditByClient = previousWorkspaces;
      console.error('Unable to restore Element audit backup.', error);
      alert('Unable to restore backup: ' + error.message);
    }
  };
  reader.readAsText(file);
}
