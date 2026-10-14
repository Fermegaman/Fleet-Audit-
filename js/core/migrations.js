/**
 * Bring older browser workspaces into the current shape. Run this only after all feature definitions have loaded.
 * Classic script module; shared services and state are loaded by index.html.
 */

function initializeState() {
  state.sheets = state.sheets || seed;
  state.clients = Array.isArray(state.clients) ? state.clients : [];
  state.actions = Array.isArray(state.actions) ? state.actions : [];
  state.elementAudits = Array.isArray(state.elementAudits) ? state.elementAudits : [];
  state.activeElementAuditByClient = state.activeElementAuditByClient || {};
  state.leaseAudits = Array.isArray(state.leaseAudits) ? state.leaseAudits : [];
  state.clients.forEach(client => {
    client.shortCode = String(client.shortCode || '').trim().toUpperCase();
    client.id = client.id || clientIdForCode(client.shortCode);
  });
  let legacyClient = state.clients.find(client => client.shortCode === LEGACY_CLIENT_CODE);
  if (!legacyClient) {
    legacyClient = {
      id: clientIdForCode(LEGACY_CLIENT_CODE),
      shortCode: LEGACY_CLIENT_CODE,
      company: 'Angell Parcel & Logistics, LLC',
      station: 'DDA9',
      status: 'Active'
    };
    state.clients.unshift(legacyClient);
  }
  state.fleetsByClient = state.fleetsByClient || {};
  state.clientSheets = state.clientSheets || {};
  state.importSummaries = state.importSummaries || {};
  state.selectedClientId = state.selectedClientId || legacyClient.id;
  if (!state.clients.some(client => client.id === state.selectedClientId)) {
    state.selectedClientId = legacyClient.id;
  }
  if (!Object.prototype.hasOwnProperty.call(state.fleetsByClient, legacyClient.id)) {
    state.fleetsByClient[legacyClient.id] = migrateLegacyFleet();
  }
  state.clients.forEach(client => {
    state.fleetsByClient[client.id] = normalizeClientFleet(
      client,
      state.fleetsByClient[client.id] || [],
      Boolean(state.importSummaries[client.id])
    );
  });
  state.actions.forEach(action => {
    if (!action.clientId) {
      const client = state.clients.find(item =>
        item.shortCode === String(action.client || '').trim().toUpperCase()
      );
      action.clientId = client ? client.id : legacyClient.id;
    }
  });
  state.elementAudits.concat(state.leaseAudits).forEach(record => {
    if (!record.clientId) {
      const client = state.clients.find(item =>
        item.shortCode === String(record.client || '').trim().toUpperCase()
      );
      record.clientId = client ? client.id : legacyClient.id;
    }
  });
  state.elementAudits.forEach(audit => {
    audit.id = audit.id || createElementAuditId();
    const client = state.clients.find(item => item.id === audit.clientId);
    audit.clientName = audit.clientName || (client && client.company) || '';
    audit.shortCode = audit.shortCode || (client && client.shortCode) || '';
    audit.station = audit.station || (client && client.station) || '';
    const maintenanceReference = ELEMENT_PDF_DETAIL_REFERENCES[
      elementAuditKey(audit.clientId, audit.month, audit.invoiceNumber)
    ];
    if ((audit.pdfMaintenanceDetailTotal == null || audit.pdfMaintenanceDetailTotal === '') && maintenanceReference) {
      audit.pdfMaintenanceDetailTotal = String(maintenanceReference.total);
      audit.pdfMaintenanceDetailSource = maintenanceReference.source;
    }
    if (audit.sourceInvoiceTotal !== '' && Number(audit.sourceInvoiceTotal) === 0 &&
        Array.isArray(audit.elementRecords) &&
        audit.elementRecords.some(record => Object.values(record.categories || {}).some(value => Number(value) !== 0))) {
      audit.sourceInvoiceTotal = '';
    }
  });
}

function normalizeClientFleet(client, records, hasAmazonImport) {
  const byVin = new Map();
  const normalizedRecords = [];
  records.forEach(vehicle => {
    const vin = normalizeVin(vehicle.vin || (vehicle.amazon && vehicle.amazon.vin));
    vehicle.amazon = vehicle.amazon || {};
    vehicle.manual = { ...emptyManual(), ...(vehicle.manual || {}) };
    vehicle.manualHistory = Array.isArray(vehicle.manualHistory) ? vehicle.manualHistory : [];
    vehicle.groundingHistory = Array.isArray(vehicle.groundingHistory) ? vehicle.groundingHistory : [];
    if (!vin) {
      normalizedRecords.push(vehicle);
      return;
    }
    vehicle.vin = vin;
    vehicle.amazon.vin = vin;
    vehicle.id = vehicle.id || vehicleIdForVin(vin, client.id);
    if (!hasAmazonImport && AMAZON_FIELDS.some(field =>
      field !== 'vin' && vehicle.amazon[field] != null && vehicle.amazon[field] !== ''
    )) {
      vehicle.presentInLatestExport = true;
    }
    if (!byVin.has(vin)) {
      byVin.set(vin, vehicle);
      normalizedRecords.push(vehicle);
      return;
    }
    const retained = byVin.get(vin);
    AMAZON_FIELDS.forEach(field => {
      if ((retained.amazon[field] == null || retained.amazon[field] === '') &&
          vehicle.amazon[field] != null && vehicle.amazon[field] !== '') {
        retained.amazon[field] = vehicle.amazon[field];
      }
    });
    Object.keys(retained.manual).forEach(field => {
      if ((retained.manual[field] == null || retained.manual[field] === '') &&
          vehicle.manual[field] != null && vehicle.manual[field] !== '') {
        retained.manual[field] = vehicle.manual[field];
      }
    });
    retained.manualHistory.push(...vehicle.manualHistory);
    retained.groundingHistory.push(...vehicle.groundingHistory);
    retained.presentInLatestExport = retained.presentInLatestExport || vehicle.presentInLatestExport;
  });
  return normalizedRecords;
}

function migrateLegacyFleet() {
  const fleetSheet = state.sheets['Branded Fleet'] || [];
  const headers = fleetSheet[0] || [];
  const records = new Map();
  fleetSheet.slice(1).forEach(row => {
    const amazon = {};
    AMAZON_FIELDS.forEach(field => {
      const index = headers.findIndex(header => {
        const key = normalizedKey(header);
        return field === 'vin' ? key === 'vin' || key.startsWith('vinlast') : key === normalizedKey(field);
      });
      if (index >= 0) amazon[field] = row[index] == null ? '' : row[index];
    });
    const vin = normalizeVin(amazon.vin);
    if (!vin) return;
    const existing = records.get(vin);
    if (existing) {
      AMAZON_FIELDS.forEach(field => {
        if (amazon[field] !== '' && amazon[field] != null) existing.amazon[field] = amazon[field];
      });
    } else {
      records.set(vin, {
        id: vehicleIdForVin(vin, clientIdForCode(LEGACY_CLIENT_CODE)),
        vin,
        amazon: { ...amazon, vin },
        manual: emptyManual(),
        manualHistory: [],
        groundingHistory: [],
        presentInLatestExport: false
      });
    }
  });

  const groundedSheet = state.sheets['Van Info'] || [];
  const manualHeaders = groundedSheet[1] || [];
  groundedSheet.slice(2).forEach(row => {
    const valueFor = names => {
      const index = names.map(name => manualHeaders.findIndex(header =>
        normalizedKey(header) === name
      )).find(position => position >= 0);
      return index >= 0 && row[index] != null ? row[index] : '';
    };
    const vin = normalizeVin(valueFor(['vin', 'vinnumber']));
    if (!vin) return;
    const vehicle = records.get(vin) || {
      vin,
      amazon: { vin },
      manual: emptyManual(),
      manualHistory: [],
      groundingHistory: [],
      presentInLatestExport: false
    };
    const manual = {
      dateGrounded: valueFor(['dategrounded']),
      repairIssue: valueFor(['repairissue', 'repiarissue']),
      atDealership: valueFor(['atdealership']),
      location: valueFor(['location']),
      afsEligible: valueFor(['afseligible']),
      repairStatus: valueFor(['repairstatus']),
      status: '',
      notes: valueFor(['notes'])
    };
    vehicle.manualHistory = vehicle.manualHistory || [];
    vehicle.manualHistory.push({
      ...manual,
      sourceHeaders: manualHeaders.slice(),
      sourceRow: row.slice()
    });
    vehicle.manual = manual;
    records.set(vin, vehicle);
  });
  return Array.from(records.values());
}

function emptyManual() {
  return {
    dateGrounded: '',
    repairIssue: '',
    atDealership: '',
    location: '',
    afsEligible: '',
    repairStatus: '',
    status: '',
    notes: ''
  };
}
