/**
 * Interpret Element source columns and build charge categories. Invoice charges remain separate from review decisions.
 * Classic script module; shared services and state are loaded by index.html.
 */

function elementRecordsFromText(text) {
  const rows = csvRows(text);
  const headerIndex = rows.findIndex(row => {
    const keys = row.map(normalizedElementKey);
    return keys.some(key => key === 'vin' || key === 'vinnumber' || key === 'vinno') &&
      keys.some(key => /charge|amount|cost|description|breakdown|ticket|toll|maintenance|lease/.test(key));
  });
  if (headerIndex < 0) {
    throw new Error('Could not find an Element invoice header row containing VIN and charge fields.');
  }
  const headerCounts = new Map();
  const headers = rows[headerIndex].map((header, index) => {
    const value = String(header || '').trim();
    const label = value || 'Column ' + (index + 1);
    const key = normalizedElementKey(label);
    const count = (headerCounts.get(key) || 0) + 1;
    headerCounts.set(key, count);
    return count === 1 ? label : label + ' [' + count + ']';
  });
  return rows.slice(headerIndex + 1).map(values => {
    const source = {};
    headers.forEach((header, index) => {
      source[header] = values[index] == null ? '' : values[index];
    });
    return source;
  }).filter(source => Object.values(source).some(value => String(value).trim()));
}

const ELEMENT_METADATA_HEADERS = new Set([
  'corp', 'client', 'invoicedate', 'invoice', 'invoicenumber', 'preference',
  'invoicetotal', 'breakdown', 'unit', 'unitnumber', 'clientassetid', 'vin',
  'driverlastname', 'driverfirstname'
]);
const ELEMENT_OTHER_CHARGE_HEADERS = new Set([
  'accidentmanagementcharges', 'accidentmanagementfee', 'fasandmanagementfees',
  'fleetadminservicesfee', 'fleetlinefee', 'fuelcharges',
  'informationconsultingfee', 'insurance', 'motorvehiclerecord',
  'onboardhardwareandinstall', 'onboardservicefee', 'rentalcar', 'safety',
  'servicecardfee', 'vehicleexpensereportingfee', 'consultingservices',
  'deliveryfee', 'deliveryrelatedcharges', 'latecharges', 'taxfederal',
  'taxlocal', 'taxmiscellaneous', 'taxpersonalproperty', 'taxsalesexcise',
  'titleandregistrationcharges', 'titleregistrationfee', 'usedvehiclesalefee',
  'usedvehiclesales', 'taxfuelalternative', 'reimbursementprogram',
  'telematicshardwareandinstal', 'telematicsservicefee', 'telematicsmonitor',
  'ceidrivercare', 'passthru', 'programfee', 'titleandregistration',
  'titleregistration'
]);

function elementHeaderKey(header) {
  return normalizedElementKey(String(header || '').replace(/\s+\[\d+\]$/, ''));
}

function elementChargeCategory(header) {
  const key = elementHeaderKey(header);
  if (/^totalunitcharges$/.test(key)) return '';
  if (key === 'leaseadjustments' || key === 'leasecharges') return 'lease';
  if (key === 'maintenancecharges' || key === 'maintenancefee') return 'maintenance';
  if (key === 'ticket') return 'ticket';
  if (key === 'taxrental') return 'taxRental';
  if (key === 'chargesnotcategorized' || key === 'feenotcategorized') return 'uncategorized';
  if (key.includes('credit')) return 'credits';
  if (key === 'other' || ELEMENT_OTHER_CHARGE_HEADERS.has(key)) return 'other';
  if (ELEMENT_METADATA_HEADERS.has(key)) return '';
  return 'uncategorized';
}

function elementInvoiceDate(value) {
  const raw = String(value == null ? '' : value).trim();
  const digits = raw.replace(/\D/g, '');
  if (/^\d{8}$/.test(digits)) {
    const iso = digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6, 8);
    const date = new Date(iso + 'T00:00:00Z');
    if (Number.isNaN(date.getTime())) return { iso: '', month: '' };
    return {
      iso,
      month: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
    };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { iso: '', month: '' };
  const iso = date.toISOString().slice(0, 10);
  return {
    iso,
    month: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
  };
}

function elementRecordValues(source) {
  const vin = normalizeVin(sourceValue(source, ['VIN', 'VIN #', 'VIN Number', 'VIN No']));
  const unit = sourceValue(source, ['Unit', 'Unit Number', 'Vehicle Number']);
  const clientAssetId = sourceValue(source, ['Client Asset ID', 'Client Asset ID #', 'Asset ID']);
  const description = sourceValue(source, ['Breakdown', 'Breakdown / Description', 'Breakdown Description']);
  const totalValue = sourceValue(source, ['Total Unit Charges', 'Total Charges', 'Unit Total']);
  const categories = {
    lease: 0,
    maintenance: 0,
    ticket: 0,
    uncategorized: 0,
    credits: 0,
    taxRental: 0,
    other: 0
  };
  const chargeClassifications = [];
  Object.entries(source || {}).forEach(([header, rawValue]) => {
    const sourceCategory = elementChargeCategory(header);
    if (!sourceCategory) return;
    const raw = String(rawValue == null ? '' : rawValue).trim();
    if (!raw) return;
    const normalizedAmount = raw.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
    const value = Number(normalizedAmount);
    if (!Number.isFinite(value)) {
      throw new Error('Invalid charge amount "' + raw + '" in Element column "' +
        header.replace(/\s+\[\d+\]$/, '') + '".');
    }
    if (!value) return;
    const descriptionText = String(description || '');
    const sourceText = header.replace(/\s+\[\d+\]$/, '') + ' ' + descriptionText;
    const explicitCredit = /\b(credits?|rebates?|refunds?)\b/i.test(sourceText);
    const explicitAdjustment = /\b(adjust(?:ments?)?|adjs?|reversals?|corrections?|true[\s-]?ups?)\b/i.test(sourceText);
    const category = value < 0 && !explicitCredit && !explicitAdjustment
      ? 'credits'
      : sourceCategory;
    categories[category] += value;
    chargeClassifications.push({
      sourceHeader: header.replace(/\s+\[\d+\]$/, ''),
      sourceCategory,
      auditCategory: category,
      amount: value,
      reason: category === 'credits' && value < 0 && sourceCategory !== 'credits'
        ? 'Negative source charge without an explicit adjustment label; classified as a credit.'
        : value < 0 && explicitAdjustment && !explicitCredit
          ? 'Negative amount retained in the source category because the source explicitly labels an adjustment.'
        : category === sourceCategory
          ? 'Retained in the category identified by the source field.'
          : 'Identified as a credit by the source field or description.'
    });
  });

  const total = parseNumeric(totalValue);
  const hasSourceTotal = totalValue !== '';
  const categoryTotal = Object.values(categories).reduce((sum, value) => sum + value, 0);
  const calculatedTotal = hasSourceTotal ? total : categoryTotal;
  const maintenanceHeaders = Object.entries(source || {})
    .filter(([header, value]) => elementChargeCategory(header) === 'maintenance' && parseNumeric(value) !== 0)
    .map(([header]) => header);
  const maintenanceDescription = maintenanceHeaders.length
    ? 'Element category: ' + maintenanceHeaders.map(header => header.replace(/\s+\[\d+\]$/, '').trim()).join(', ')
    : '';
  return {
    vin,
    unit: String(unit || ''),
    clientAssetId: String(clientAssetId || ''),
    description: String(description || ''),
    maintenanceDescription,
    total: calculatedTotal,
    categoryTotal,
    categoryDifference: calculatedTotal - categoryTotal,
    categories,
    chargeClassifications,
    source
  };
}

function migrateElementAuditChargeCategories() {
  let changed = false;
  const audits = state.elementAudits.concat(Object.values(state.activeElementAuditByClient || {}));
  audits.forEach(audit => {
    if (!audit || !Array.isArray(audit.elementRecords)) return;
    audit.elementRecords.forEach(record => {
      if (!record || !record.source || !Object.keys(record.source).some(elementChargeCategory)) return;
      const imported = elementRecordValues(record.source);
      if (JSON.stringify(record.categories || {}) !== JSON.stringify(imported.categories) ||
          !Array.isArray(record.chargeClassifications)) {
        record.categories = imported.categories;
        record.categoryTotal = imported.categoryTotal;
        record.categoryDifference = imported.categoryDifference;
        record.chargeClassifications = imported.chargeClassifications;
        record.maintenanceDescription = imported.maintenanceDescription || record.maintenanceDescription;
        changed = true;
      }
    });
  });
  if (changed) {
    try {
      save();
    } catch (error) {
      console.error('Unable to persist the Element charge-category migration.', error);
      alert('Element charge categories were updated for this session but could not be saved in browser storage.');
    }
  }
}

function elementAuditRecords(audit) {
  return Array.isArray(audit && audit.elementRecords) ? audit.elementRecords : [];
}

function elementSummary(audit) {
  return elementAuditRecords(audit).reduce((summary, record) => {
    Object.keys(summary).forEach(key => { summary[key] += record.categories[key] || 0; });
    summary.total += record.categoryTotal == null
      ? Object.values(record.categories || {}).reduce((total, amount) => total + (amount || 0), 0)
      : record.categoryTotal;
    return summary;
  }, { lease: 0, maintenance: 0, ticket: 0, uncategorized: 0, credits: 0, taxRental: 0, other: 0, total: 0 });
}

function elementSourceInvoiceTotal(audit) {
  if (audit && audit.sourceInvoiceTotal != null && audit.sourceInvoiceTotal !== '') {
    return parseNumeric(audit.sourceInvoiceTotal);
  }
  return null;
}

function elementPivot(audit) {
  const groups = new Map();
  elementAuditRecords(audit).forEach(record => {
    const vin = record.vin || '(No VIN)';
    const row = groups.get(vin) || {
      vin, lease: 0, maintenance: 0, ticket: 0, uncategorized: 0, credits: 0,
      taxRental: 0, other: 0, total: 0
    };
    Object.keys(record.categories).forEach(key => { row[key] += record.categories[key] || 0; });
    row.total += record.categoryTotal == null
      ? Object.values(record.categories || {}).reduce((total, amount) => total + (amount || 0), 0)
      : record.categoryTotal;
    groups.set(vin, row);
  });
  return Array.from(groups.values()).sort((left, right) => left.vin.localeCompare(right.vin));
}

function elementChargeItems(audit, category) {
  return elementAuditRecords(audit).filter(record => Math.abs(record.categories[category] || 0) >= 0.005)
    .map(record => ({
      vin: record.vin,
      description: category === 'maintenance'
        ? (record.maintenanceDescription || 'Element maintenance category')
        : (record.source['Maintenance Description'] || record.source['Ticket Description'] ||
          record.description || ''),
      cost: record.categories[category]
    }));
}
