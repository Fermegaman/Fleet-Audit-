/**
 * Export maintenance and toll review workbooks using the bundled SheetJS library.
 * Classic script module; shared services and state are loaded by index.html.
 */

function exportMaintenanceReviewWorkbook() {
  if (typeof XLSX === 'undefined') {
    throw new Error('The Excel export library is unavailable.');
  }
  const audit = currentElementAudit();
  if (!audit) {
    alert('Upload Element invoice data before exporting maintenance review.');
    return;
  }
  const rows = ensureMaintenanceReviewFromElement(audit)
    .filter(row => normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Pending Review' || row.reviewedAmount === '')
    .map(row => ({
      VIN: row.vin || '',
      Unit: row.unit || '',
      'Client Asset ID': row.clientAssetId || '',
      'Maintenance Description': row.maintenanceDescription || '',
      'Element Charge': row.elementCharge,
      'Reviewed Amount': '',
      Difference: '',
      'Review Status': 'Pending Review',
      'Review Notes': ''
    }));
  if (!rows.length) {
    alert('There are no pending maintenance charges to export for this audit.');
    return;
  }
  const headers = ['VIN', 'Unit', 'Client Asset ID', 'Maintenance Description', 'Element Charge', 'Reviewed Amount', 'Difference', 'Review Status', 'Review Notes'];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Maintenance Review');
  const fileMonth = String(audit.month || 'Element').replace(/[^a-z0-9_-]+/gi, '-');
  XLSX.writeFile(workbook, fileMonth + '-maintenance-review.xlsx');
}

function exportTollReviewWorkbook() {
  if (typeof XLSX === 'undefined') {
    throw new Error('The Excel export library is unavailable.');
  }
  const audit = currentElementAudit();
  if (!audit) {
    alert('Upload Element invoice data before exporting toll review.');
    return;
  }
  const rows = ensureTollReviewFromElement(audit)
    .filter(row => normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Pending Review' ||
      row.reviewedAmount === '' || row.reviewedAmount == null)
    .map(row => ({
      VIN: row.vin || '',
      Unit: row.unit || '',
      'Client Asset ID': row.clientAssetId || '',
      Description: row.description || '',
      'Element Charge': row.elementCharge,
      'Reviewed Amount': '',
      Difference: '',
      'Review Status': 'Pending Review',
      'Review Notes': ''
    }));
  if (!rows.length) {
    alert('There are no pending toll charges to export for this audit.');
    return;
  }
  const headers = ['VIN', 'Unit', 'Client Asset ID', 'Description', 'Element Charge',
    'Reviewed Amount', 'Difference', 'Review Status', 'Review Notes'];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Toll Review');
  const fileMonth = String(audit.month || 'Element').replace(/[^a-z0-9_-]+/gi, '-');
  XLSX.writeFile(workbook, fileMonth + '-toll-review.xlsx');
}
