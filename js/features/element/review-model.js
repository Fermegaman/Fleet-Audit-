/**
 * Normalize review statuses and maintain independent maintenance and toll review rows and totals.
 * Classic script module; shared services and state are loaded by index.html.
 */

function normalizeMaintenanceReviewStatus(value) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) return 'Pending Review';
  const map = {
    'pending review': 'Pending Review',
    'pending': 'Pending Review',
    'reviewed': 'Reviewed',
    'approved': 'Approved',
    'disputed': 'Disputed'
  };
  const key = normalized.toLowerCase();
  return map[key] || normalized;
}

function maintenanceReviewSummary(audit) {
  const rows = audit ? ensureMaintenanceReviewFromElement(audit) :
    (Array.isArray(audit && audit.maintenanceReview) ? audit.maintenanceReview : []);
  const totalCharges = rows.reduce((total, row) => total + parseNumeric(row.elementCharge), 0);
  const pendingRows = rows.filter(row =>
    normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Pending Review' || row.reviewedAmount === ''
  );
  const pending = pendingRows
    .reduce((total, row) => total + parseNumeric(row.elementCharge), 0);
  const reviewedRows = rows.filter(row =>
    normalizeMaintenanceReviewStatus(row.reviewStatus) !== 'Pending Review' && row.reviewedAmount !== ''
  );
  const reviewed = reviewedRows.reduce((total, row) => total + parseNumeric(row.reviewedAmount), 0);
  const approved = reviewedRows.filter(row => normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Approved')
    .reduce((total, row) => total + parseNumeric(row.reviewedAmount), 0);
  const disputed = reviewedRows.filter(row => normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Disputed')
    .reduce((total, row) => total + parseNumeric(row.reviewedAmount), 0);
  const totalDifference = reviewedRows.reduce((total, row) =>
    total + parseNumeric(row.reviewedAmount) - parseNumeric(row.elementCharge), 0);
  return {
    totalCharges,
    pending,
    reviewed,
    approved,
    disputed,
    totalDifference
  };
}

function ensureTollReviewFromElement(audit) {
  if (!audit) return [];
  const priorRows = Array.isArray(audit.tollReview) ? audit.tollReview : [];
  const queues = new Map();
  priorRows.forEach(row => {
    const key = [normalizeVin(row.vin), roundCurrency(parseNumeric(row.elementCharge)),
      normalizedElementKey(row.description)].join('|');
    const queue = queues.get(key) || [];
    queue.push(row);
    queues.set(key, queue);
  });
  audit.tollReview = [];
  elementAuditRecords(audit).forEach(record => {
    const charge = Number(record.categories && record.categories.ticket) || 0;
    if (Math.abs(charge) < 0.005) return;
    const source = record.source || {};
    const description = String(sourceValue(source, [
      'Ticket Description', 'Ticket / Toll Description', 'Toll Description'
    ]) || record.description || 'Element Ticket / Toll charge');
    const key = [normalizeVin(record.vin), roundCurrency(charge), normalizedElementKey(description)].join('|');
    const queue = queues.get(key);
    const prior = queue && queue.length ? queue.shift() : null;
    audit.tollReview.push(Object.assign(prior || {}, {
      vin: normalizeVin(record.vin),
      unit: record.unit || '',
      clientAssetId: record.clientAssetId || '',
      description,
      elementCharge: charge,
      reviewedAmount: prior && prior.reviewedAmount != null ? prior.reviewedAmount : '',
      difference: prior && prior.reviewedAmount != null && prior.reviewedAmount !== ''
        ? String(roundCurrency(parseNumeric(prior.reviewedAmount) - charge))
        : '',
      reviewStatus: normalizeMaintenanceReviewStatus(prior && prior.reviewStatus),
      reviewNotes: prior && prior.reviewNotes != null ? prior.reviewNotes : ''
    }));
  });
  audit.tollReview.forEach(row => {
    row.reviewStatus = normalizeMaintenanceReviewStatus(row.reviewStatus);
    if (row.reviewedAmount != null && row.reviewedAmount !== '') {
      row.difference = String(roundCurrency(parseNumeric(row.reviewedAmount) - parseNumeric(row.elementCharge)));
    }
  });
  audit.unmatchedTollReviewRecords = Array.isArray(audit.unmatchedTollReviewRecords)
    ? audit.unmatchedTollReviewRecords
    : [];
  return audit.tollReview;
}

function tollReviewSummary(audit) {
  const rows = ensureTollReviewFromElement(audit);
  const reviewedRows = rows.filter(row =>
    normalizeMaintenanceReviewStatus(row.reviewStatus) !== 'Pending Review' &&
    row.reviewedAmount !== '' && row.reviewedAmount != null
  );
  return {
    billed: roundCurrency(rows.reduce((sum, row) => sum + parseNumeric(row.elementCharge), 0)),
    reviewed: roundCurrency(reviewedRows.reduce((sum, row) => sum + parseNumeric(row.reviewedAmount), 0)),
    approved: roundCurrency(reviewedRows.filter(row => normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Approved')
      .reduce((sum, row) => sum + parseNumeric(row.reviewedAmount), 0)),
    pending: roundCurrency(rows.filter(row =>
      normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Pending Review' ||
      row.reviewedAmount === '' || row.reviewedAmount == null
    ).reduce((sum, row) => sum + parseNumeric(row.elementCharge), 0)),
    disputed: roundCurrency(reviewedRows.filter(row => normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Disputed')
      .reduce((sum, row) => sum + parseNumeric(row.reviewedAmount), 0)),
    difference: roundCurrency(reviewedRows.reduce((sum, row) =>
      sum + parseNumeric(row.reviewedAmount) - parseNumeric(row.elementCharge), 0))
  };
}

function ensureAuditMaintenanceReview(audit) {
  if (!audit) return [];
  audit.maintenanceReview = Array.isArray(audit.maintenanceReview) ? audit.maintenanceReview : [];
  audit.unmatchedReviewRecords = Array.isArray(audit.unmatchedReviewRecords) ? audit.unmatchedReviewRecords : [];
  audit.maintenanceReview.forEach(row => {
    row.vin = normalizeVin(row.vin || row.VIN || row['VIN #']);
    row.unit = row.unit || row.Unit || '';
    row.clientAssetId = row.clientAssetId || row['Client Asset ID'] || row.clientAssetID || '';
    row.maintenanceDescription = row.maintenanceDescription || row['Maintenance Description'] || row.description || '';
    row.elementCharge = row.elementCharge == null ? (row['Element Charge'] || '') : row.elementCharge;
    row.reviewedAmount = row.reviewedAmount == null ? (row['Reviewed Amount'] || '') : row.reviewedAmount;
    row.difference = row.difference == null ? (row['Difference'] || '') : row.difference;
    row.reviewStatus = normalizeMaintenanceReviewStatus(row.reviewStatus || row['Review Status']);
    row.reviewNotes = row.reviewNotes == null ? (row['Review Notes'] || '') : row.reviewNotes;
    if (row.reviewedAmount !== '' &&
        (row.difference === '' || row.difference == null)) {
      row.difference = String(parseNumeric(row.reviewedAmount) - parseNumeric(row.elementCharge));
    }
  });
  return audit.maintenanceReview;
}

function ensureMaintenanceReviewFromElement(audit) {
  if (!audit) return [];
  const priorRows = Array.isArray(audit.maintenanceReview) ? audit.maintenanceReview : [];
  const queues = new Map();
  priorRows.forEach(row => {
    const key = [normalizeVin(row.vin), parseNumeric(row.elementCharge)].join('|');
    const queue = queues.get(key) || [];
    queue.push(row);
    queues.set(key, queue);
  });
  audit.maintenanceReview = [];
  elementAuditRecords(audit).forEach(record => {
    const charge = record.categories.maintenance || 0;
    if (Math.abs(charge) < 0.005) return;
    const description = record.maintenanceDescription || 'Element maintenance category';
    const key = [record.vin, charge].join('|');
    const previous = queues.get(key);
    const prior = previous && previous.length ? previous.shift() : null;
    audit.maintenanceReview.push(Object.assign(prior || {}, {
      vin: record.vin,
      unit: record.unit,
      clientAssetId: record.clientAssetId,
      maintenanceDescription: description,
      elementCharge: charge,
      reviewedAmount: prior ? prior.reviewedAmount : '',
      difference: prior ? prior.difference : '',
      reviewStatus: prior ? prior.reviewStatus : 'Pending Review',
      reviewNotes: prior ? prior.reviewNotes : ''
    }));
  });
  return ensureAuditMaintenanceReview(audit);
}

function elementMaintenanceVariance(audit) {
  if (!audit) return null;
  const reference = ELEMENT_PDF_DETAIL_REFERENCES[
    elementAuditKey(audit.clientId, audit.month, audit.invoiceNumber)
  ];
  const rawPdfDetailTotal = audit.pdfMaintenanceDetailTotal == null || audit.pdfMaintenanceDetailTotal === ''
    ? reference && reference.total
    : audit.pdfMaintenanceDetailTotal;
  if (rawPdfDetailTotal == null || rawPdfDetailTotal === '') return null;
  const csvTotal = elementSummary(audit).maintenance;
  const pdfDetailTotal = parseNumeric(rawPdfDetailTotal);
  return {
    csvTotal,
    pdfDetailTotal,
    difference: roundCurrency(pdfDetailTotal - csvTotal),
    source: audit.pdfMaintenanceDetailSource || (reference && reference.source) || ''
  };
}

function retainElementMaintenanceVerification(audit) {
  const variance = elementMaintenanceVariance(audit);
  audit.pdfMaintenanceDetailTotal = variance ? String(variance.pdfDetailTotal) : '';
  audit.pdfMaintenanceDetailSource = variance ? variance.source : '';
  audit.maintenanceDetailDifference = variance ? variance.difference : null;
  audit.maintenanceDetailStatus = variance && Math.abs(variance.difference) >= 0.01
    ? 'Unresolved variance'
    : variance ? 'Matched' : 'Not compared';
}

function elementReviewCompletionStatus(rows) {
  if (!rows.length) return 'No review items';
  const pending = rows.filter(row =>
    normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Pending Review' ||
    row.reviewedAmount == null || row.reviewedAmount === ''
  ).length;
  return pending ? 'Pending (' + pending + '/' + rows.length + ')' : 'Complete';
}
