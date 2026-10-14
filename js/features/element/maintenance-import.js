/**
 * Match uploaded maintenance reviews without changing the original billed charges.
 * Classic script module; shared services and state are loaded by index.html.
 */

function matchMaintenanceReviewRecords(rows) {
  const audit = currentElementAudit();
  if (!audit) return [];
  const reviewRows = ensureMaintenanceReviewFromElement(audit);
  const consumed = new Set();
  const unmatched = [];
  rows.forEach(row => {
    const vin = normalizeVin(row.vin || row.VIN || row['VIN #']);
    const description = row.maintenanceDescription || row['Maintenance Description'] || row.description || '';
    const elementCharge = row.elementCharge == null ? row['Element Charge'] : row.elementCharge;
    if (!vin) {
      unmatched.push({
        vin: '',
        unit: row.unit || row.Unit || '',
        clientAssetId: row.clientAssetId || row['Client Asset ID'] || '',
        maintenanceDescription: description,
        elementCharge: elementCharge || '',
        reviewedAmount: row.reviewedAmount || row['Reviewed Amount'] || '',
        difference: row.difference || row['Difference'] || '',
        reviewStatus: normalizeMaintenanceReviewStatus(row.reviewStatus || row['Review Status'] || 'Pending Review'),
        reviewNotes: row.reviewNotes || row['Review Notes'] || ''
      });
      return;
    }
    const candidates = reviewRows.map((candidate, index) => ({ candidate, index }))
      .filter(item => normalizeVin(item.candidate.vin) === vin && !consumed.has(item.index));
    const hasElementCharge = elementCharge != null && elementCharge !== '';
    const amountCandidates = hasElementCharge ? candidates.filter(item =>
      Math.abs(parseNumeric(item.candidate.elementCharge) - parseNumeric(elementCharge)) < 0.01
    ) : candidates;
    const exactDescription = amountCandidates.filter(item =>
      normalizedElementKey(item.candidate.maintenanceDescription) === normalizedElementKey(description)
    );
    const targetMatch = exactDescription.length === 1 ? exactDescription[0]
      : amountCandidates.length === 1 ? amountCandidates[0]
        : candidates.length === 1 && !hasElementCharge ? candidates[0] : null;
    const target = targetMatch && targetMatch.candidate;
    if (!target) {
      unmatched.push({
        vin,
        unit: row.unit || row.Unit || '',
        clientAssetId: row.clientAssetId || row['Client Asset ID'] || '',
        maintenanceDescription: description,
        elementCharge: elementCharge || '',
        reviewedAmount: row.reviewedAmount || row['Reviewed Amount'] || '',
        difference: row.difference || row['Difference'] || '',
        reviewStatus: normalizeMaintenanceReviewStatus(row.reviewStatus || row['Review Status'] || 'Pending Review'),
        reviewNotes: row.reviewNotes || row['Review Notes'] || ''
      });
      return;
    }
    consumed.add(targetMatch.index);
    const reviewedAmount = row.reviewedAmount == null ? row['Reviewed Amount'] : row.reviewedAmount;
    const importedStatus = row.reviewStatus || row['Review Status'];
    const normalizedStatus = importedStatus ? normalizeMaintenanceReviewStatus(importedStatus) : '';
    const notes = row.reviewNotes == null ? row['Review Notes'] : row.reviewNotes;
    const conflicts = [];
    if (reviewedAmount != null && String(reviewedAmount).trim() !== '' &&
        target.reviewedAmount !== '' &&
        Math.abs(parseNumeric(target.reviewedAmount) - parseNumeric(reviewedAmount)) >= 0.01) {
      conflicts.push('Reviewed Amount');
    }
    if (normalizedStatus && normalizedStatus !== normalizeMaintenanceReviewStatus(target.reviewStatus) &&
        normalizeMaintenanceReviewStatus(target.reviewStatus) !== 'Pending Review') {
      conflicts.push('Review Status');
    }
    if (notes != null && String(notes).trim() !== '' && target.reviewNotes &&
        String(target.reviewNotes) !== String(notes)) {
      conflicts.push('Review Notes');
    }
    if (conflicts.length) {
      unmatched.push({
        vin,
        unit: row.unit || row.Unit || target.unit || '',
        clientAssetId: row.clientAssetId || row['Client Asset ID'] || target.clientAssetId || '',
        maintenanceDescription: description || target.maintenanceDescription,
        elementCharge: elementCharge || target.elementCharge,
        reviewedAmount: reviewedAmount || '',
        difference: reviewedAmount == null || reviewedAmount === '' ? '' :
          String(parseNumeric(reviewedAmount) - parseNumeric(target.elementCharge)),
        reviewStatus: normalizedStatus || '',
        reviewNotes: notes || '',
        conflictReason: 'Existing review decision preserved; uploaded ' + conflicts.join(', ') +
          ' conflicts with the saved record.'
      });
      return;
    }
    if (reviewedAmount != null && String(reviewedAmount).trim() !== '') {
      target.reviewedAmount = reviewedAmount;
      target.difference = String(parseNumeric(reviewedAmount) - parseNumeric(target.elementCharge));
    }
    if (normalizedStatus) target.reviewStatus = normalizedStatus;
    if (notes != null && String(notes).trim() !== '') target.reviewNotes = notes;
  });
  audit.unmatchedReviewRecords = (audit.unmatchedReviewRecords || []).concat(unmatched);
  save();
  return unmatched;
}

function parseMaintenanceReviewFile(file) {
  if (!file) return;
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(extension)) {
    alert('Choose a .csv, .xlsx, or .xls file for the completed maintenance review.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => alert('The completed maintenance review file could not be read.');
  reader.onload = event => {
    try {
      let rows;
      if (extension === 'csv') {
        const parsed = csvRows(String(event.target.result || ''));
        if (!parsed.length) return;
        const headers = parsed[0].map(value => String(value || '').trim());
        rows = parsed.slice(1).map(parsedRow => {
          const object = {};
          headers.forEach((header, headerIndex) => {
            object[header] = parsedRow[headerIndex] == null ? '' : parsedRow[headerIndex];
          });
          return object;
        });
      } else {
        const workbook = XLSX.read(event.target.result, { type: 'array' });
        const firstSheetName = workbook.SheetNames.find(sheetName => {
          const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
          const text = sheet.flat().join(' ').toLowerCase();
          return /vin|maintenance|element charge|reviewed amount|review status/.test(text);
        }) || workbook.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
      }
      const normalizedRows = rows.map(row => ({
        vin: sourceValue(row, ['VIN', 'VIN #', 'VIN Number']),
        unit: sourceValue(row, ['Unit']),
        clientAssetId: sourceValue(row, ['Client Asset ID']),
        maintenanceDescription: sourceValue(row, ['Maintenance Description', 'Description']),
        elementCharge: sourceValue(row, ['Element Charge']),
        reviewedAmount: sourceValue(row, ['Reviewed Amount']),
        difference: sourceValue(row, ['Difference']),
        reviewStatus: sourceValue(row, ['Review Status']),
        reviewNotes: sourceValue(row, ['Review Notes'])
      })).filter(record => Object.values(record).some(value => String(value == null ? '' : value).trim()));
      if (!normalizedRows.length) {
        throw new Error('No review records with matching headers were found.');
      }
      const unmatched = matchMaintenanceReviewRecords(normalizedRows);
      if (unmatched && unmatched.length) {
        alert('Some maintenance review records did not match or conflicted with an existing review decision. They were saved under Unmatched Review Records.');
      } else {
        alert('Maintenance review upload completed for this Element audit.');
      }
      element();
    } catch (error) {
      console.error(error);
      alert('Unable to parse the completed maintenance review file.');
    }
  };
  if (extension === 'csv') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}
