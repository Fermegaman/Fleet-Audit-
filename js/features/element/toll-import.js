/**
 * Match uploaded toll reviews to invoice charges and retain unmatched or conflicting records.
 * Classic script module; shared services and state are loaded by index.html.
 */

function matchTollReviewRecords(rows) {
  const audit = currentElementAudit();
  if (!audit) return [];
  const reviewRows = ensureTollReviewFromElement(audit);
  const consumed = new Set();
  const unmatched = [];
  rows.forEach(row => {
    const vin = normalizeVin(row.vin || row.VIN || row['VIN #']);
    const description = row.description || row.Description || row['Toll Description'] || '';
    const elementCharge = row.elementCharge == null ? row['Element Charge'] : row.elementCharge;
    const candidates = reviewRows.map((candidate, index) => ({ candidate, index }))
      .filter(item => normalizeVin(item.candidate.vin) === vin && !consumed.has(item.index));
    const amountCandidates = elementCharge == null || String(elementCharge).trim() === ''
      ? candidates
      : candidates.filter(item =>
        Math.abs(parseNumeric(item.candidate.elementCharge) - parseNumeric(elementCharge)) < 0.01
      );
    const exactDescription = amountCandidates.filter(item =>
      normalizedElementKey(item.candidate.description) === normalizedElementKey(description)
    );
    const targetMatch = exactDescription.length === 1 ? exactDescription[0]
      : amountCandidates.length === 1 ? amountCandidates[0]
        : candidates.length === 1 && (elementCharge == null || String(elementCharge).trim() === '')
          ? candidates[0]
          : null;
    const target = targetMatch && targetMatch.candidate;
    if (!vin || !target) {
      unmatched.push(Object.assign({}, row, {
        vin,
        description,
        conflictReason: 'No unique Element Ticket / Toll charge matched this review row.'
      }));
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
      unmatched.push(Object.assign({}, row, {
        vin,
        description,
        conflictReason: 'Existing toll review decision preserved; uploaded ' + conflicts.join(', ') +
          ' conflicts with the saved record.'
      }));
      return;
    }
    if (reviewedAmount != null && String(reviewedAmount).trim() !== '') {
      target.reviewedAmount = reviewedAmount;
      target.difference = String(roundCurrency(parseNumeric(reviewedAmount) - parseNumeric(target.elementCharge)));
    }
    if (normalizedStatus) target.reviewStatus = normalizedStatus;
    if (notes != null && String(notes).trim() !== '') target.reviewNotes = notes;
  });
  audit.unmatchedTollReviewRecords = (audit.unmatchedTollReviewRecords || []).concat(unmatched);
  save();
  return unmatched;
}

function parseTollReviewFile(file) {
  if (!file) return;
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(extension)) {
    alert('Choose a .csv, .xlsx, or .xls file for the completed toll review.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => alert('The completed toll review file could not be read.');
  reader.onload = event => {
    try {
      let rows;
      if (extension === 'csv') {
        const parsed = csvRows(String(event.target.result || ''));
        if (!parsed.length) return;
        const headers = parsed[0].map(value => String(value || '').trim());
        rows = parsed.slice(1).map(parsedRow => {
          const object = {};
          headers.forEach((header, index) => {
            object[header] = parsedRow[index] == null ? '' : parsedRow[index];
          });
          return object;
        });
      } else {
        const workbook = XLSX.read(event.target.result, { type: 'array' });
        const sheetName = workbook.SheetNames.find(name => {
          const values = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
            header: 1, blankrows: false, defval: ''
          });
          return /vin|element charge|reviewed amount|review status/i.test(values.flat().join(' '));
        }) || workbook.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      }
      const normalizedRows = rows.map(row => ({
        vin: sourceValue(row, ['VIN', 'VIN #', 'VIN Number']),
        unit: sourceValue(row, ['Unit']),
        clientAssetId: sourceValue(row, ['Client Asset ID']),
        description: sourceValue(row, ['Description', 'Toll Description']),
        elementCharge: sourceValue(row, ['Element Charge']),
        reviewedAmount: sourceValue(row, ['Reviewed Amount']),
        difference: sourceValue(row, ['Difference']),
        reviewStatus: sourceValue(row, ['Review Status']),
        reviewNotes: sourceValue(row, ['Review Notes'])
      })).filter(record => Object.values(record).some(value =>
        String(value == null ? '' : value).trim()
      ));
      if (!normalizedRows.length) throw new Error('No toll review records were found.');
      const unmatched = matchTollReviewRecords(normalizedRows);
      alert(unmatched.length
        ? 'Some toll review records did not match or conflicted with an existing decision. They were saved under Unmatched Toll Review Records.'
        : 'Toll review upload completed for this Element audit.');
      element();
    } catch (error) {
      console.error('Unable to parse completed toll review file.', error);
      alert('Unable to parse the completed toll review file: ' + error.message);
    }
  };
  if (extension === 'csv') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}
