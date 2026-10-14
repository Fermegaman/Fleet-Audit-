/**
 * Read Amazon CSV or Excel exports and reconcile vehicles by VIN while keeping manual fields and history.
 * Classic script module; shared services and state are loaded by index.html.
 */

function csvFieldIndexesOptional(headers) {
  const indexes = {};
  AMAZON_FIELDS.forEach(field => {
    const index = headers.findIndex(header => {
      const key = normalizedKey(header);
      return field === 'vin' ? key === 'vin' || key.startsWith('vinlast') : key === normalizedKey(field);
    });
    if (index >= 0) indexes[field] = index;
  });
  return indexes;
}

function csvFieldIndexes(headers) {
  const indexes = csvFieldIndexesOptional(headers);
  if (indexes.vin == null) throw new Error('The selected CSV does not contain a VIN column.');
  return indexes;
}

function importFleetFile(file) {
  if (!file) return;
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(extension)) {
    showImportError('Choose an Amazon fleet export in .csv, .xlsx, or .xls format.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showImportError('The selected Amazon fleet file could not be read.');
  reader.onload = () => {
    try {
      if (extension === 'csv') {
        importFleetRows(csvRows(String(reader.result || '')));
      } else {
        importAmazonWorkbook(reader.result);
      }
    } catch (error) {
      showImportError(error.message || 'The Amazon fleet file could not be imported.');
    }
  };
  if (extension === 'csv') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

function importFleetRows(rows) {
  if (rows.length < 2) throw new Error('The selected file has no vehicle data rows.');
  const indexes = csvFieldIndexes(rows[0]);
  applyFleetImport(rows.slice(1), indexes);
}

function importAmazonWorkbook(arrayBuffer) {
  if (typeof XLSX === 'undefined') {
    throw new Error('The Excel parser is unavailable. Reload the application and try again.');
  }
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  for (const sheetName of workbook.SheetNames) {
    const worksheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    });
    for (let headerIndex = 0; headerIndex < worksheetRows.length; headerIndex++) {
      const indexes = csvFieldIndexesOptional(worksheetRows[headerIndex]);
      if (indexes.vin == null || Object.keys(indexes).length < 3) continue;
      const dataRows = worksheetRows.slice(headerIndex + 1)
        .filter(row => normalizeVin(row[indexes.vin]));
      if (!dataRows.length) continue;
      applyFleetImport(dataRows, indexes);
      return;
    }
  }
  throw new Error('No worksheet with Amazon fleet column headers and VIN data was found.');
}

function applyFleetImport(rows, indexes) {
  const records = clientFleet();
  const reconciled = normalizeClientFleet(selectedClient(), records, hasAmazonFleetImport());
  records.splice(0, records.length, ...reconciled);
  const byVin = new Map(records.map(vehicle => [normalizeVin(vehicle.vin), vehicle]));
  const previouslyCurrent = new Set(records
    .filter(vehicle => vehicle.presentInLatestExport)
    .map(vehicle => normalizeVin(vehicle.vin)));
  const incoming = new Map();
  rows.forEach(row => {
    const vin = normalizeVin(row[indexes.vin]);
    if (!vin) return;
    const amazon = {};
    Object.entries(indexes).forEach(([field, index]) => {
      amazon[field] = row[index] == null ? '' : row[index].trim();
    });
    amazon.vin = vin;
    incoming.set(vin, amazon);
  });
  if (!incoming.size) throw new Error('The CSV contains no rows with a VIN.');

  const summary = {
    imported: incoming.size,
    activeVehicles: 0,
    inactiveVehicles: 0,
    existingActiveUpdated: 0,
    newActiveAdded: 0,
    newVehicles: 0,
    updatedVehicles: 0,
    grounded: 0,
    returnedToOperational: 0,
    noLongerPresent: 0,
    changes: []
  };
  incoming.forEach((amazon, vin) => {
    const existing = byVin.get(vin);
    const incomingActive = isActiveStatus(amazon.status);
    const incomingInactive = isInactiveStatus(amazon.status);
    if (incomingActive) summary.activeVehicles++;
    if (incomingInactive) summary.inactiveVehicles++;
    if (!existing) {
      const vehicle = {
        id: vehicleIdForVin(vin, currentClientId),
        vin,
        amazon,
        manual: emptyManual(),
        manualHistory: [],
        groundingHistory: [],
        presentInLatestExport: true
      };
      if (String(amazon.operationalStatus || '').trim().toUpperCase() === 'GROUNDED') {
        vehicle.manual.dateGrounded = todayDate();
        vehicle.groundingHistory.push({
          event: 'Became grounded',
          dateGrounded: vehicle.manual.dateGrounded,
          dateReturned: '',
          at: new Date().toISOString(),
          manual: { ...vehicle.manual }
        });
      }
      records.push(vehicle);
      byVin.set(vin, vehicle);
      summary.newVehicles++;
      if (incomingActive) {
        summary.newActiveAdded++;
        summary.changes.push({ type: 'New active vehicle', vin });
      } else {
        summary.changes.push({ type: incomingInactive ? 'New inactive vehicle' : 'New vehicle', vin });
      }
      return;
    }
    summary.updatedVehicles++;
    if (incomingActive) summary.existingActiveUpdated++;
    const oldStatus = String(existing.amazon.operationalStatus || '').trim().toUpperCase();
    const newStatus = String(amazon.operationalStatus || '').trim().toUpperCase();
    existing.amazon = { ...existing.amazon, ...amazon };
    existing.id = existing.id || vehicleIdForVin(vin, currentClientId);
    existing.presentInLatestExport = true;
    existing.manual = { ...emptyManual(), ...(existing.manual || {}) };
    existing.manualHistory = Array.isArray(existing.manualHistory) ? existing.manualHistory : [];
    existing.groundingHistory = Array.isArray(existing.groundingHistory) ? existing.groundingHistory : [];
    if (Object.prototype.hasOwnProperty.call(amazon, 'operationalStatus') && oldStatus !== newStatus) {
      summary.changes.push({ type: 'Operational status changed', vin, from: oldStatus || '—', to: newStatus || '—' });
      if (oldStatus === 'GROUNDED' && newStatus === 'OPERATIONAL') {
        summary.returnedToOperational++;
        existing.lastOperationalChange = 'GROUNDED->OPERATIONAL';
        const latestGrounding = [...existing.groundingHistory].reverse().find(entry =>
          (entry.event === 'Became grounded' || entry.event === 'Manually added as grounded') &&
          !entry.dateReturned
        );
        if (latestGrounding) latestGrounding.dateReturned = todayDate();
        existing.groundingHistory.push({
          event: 'Returned to service',
          from: oldStatus,
          to: newStatus,
          dateReturned: todayDate(),
          at: new Date().toISOString(),
          manual: { ...existing.manual }
        });
        summary.changes.push({ type: 'Returned to operational', vin, from: oldStatus, to: newStatus });
      } else if (oldStatus === 'OPERATIONAL' && newStatus === 'GROUNDED') {
        existing.lastOperationalChange = 'OPERATIONAL->GROUNDED';
        if (!existing.manual.dateGrounded) existing.manual.dateGrounded = todayDate();
        existing.groundingHistory.push({
          event: 'Became grounded',
          from: oldStatus,
          to: newStatus,
          dateGrounded: existing.manual.dateGrounded,
          dateReturned: '',
          at: new Date().toISOString(),
          manual: { ...existing.manual }
        });
        summary.changes.push({ type: 'Became grounded', vin, from: oldStatus, to: newStatus });
      } else {
        delete existing.lastOperationalChange;
      }
    }
  });

  records.forEach(vehicle => {
    const vin = normalizeVin(vehicle.vin);
    if (previouslyCurrent.has(vin) && !incoming.has(vin)) {
      vehicle.presentInLatestExport = false;
      summary.noLongerPresent++;
      summary.changes.push({ type: 'No longer present in export', vin });
    } else if (incoming.has(vin)) {
      vehicle.presentInLatestExport = true;
    }
  });
  summary.grounded = Array.from(incoming.values()).filter(amazon =>
    String(amazon.operationalStatus || '').trim().toUpperCase() === 'GROUNDED'
  ).length;
  state.importSummaries[currentClientId] = summary;
  save();
  fleet();
}

function showImportError(message) {
  $('importResult').innerHTML = '<div class="notice" role="alert"><b>Import failed:</b> ' + esc(message) + '</div>';
}

function renderImportSummary() {
  const summary = state.importSummaries[currentClientId];
  if (!summary) return;
  const changes = summary.changes.length
    ? '<ul>' + summary.changes.map(change => '<li>' + esc(change.type + ' — ' + change.vin +
      (change.from != null ? ' (' + change.from + ' → ' + change.to + ')' : '')) + '</li>').join('') + '</ul>'
    : '<p>No vehicle changes detected.</p>';
  $('importResult').innerHTML = '<div class="notice"><b>Latest Amazon fleet import</b><br>' +
    'Vehicles imported: ' + summary.imported +
    ' · New vehicles: ' + summary.newVehicles +
    ' · Existing vehicles updated: ' + summary.updatedVehicles +
    ' · Active vehicles in Amazon file: ' + (summary.activeVehicles == null ? summary.imported : summary.activeVehicles) +
    ' · Inactive vehicles in Amazon file: ' + (summary.inactiveVehicles || 0) +
    ' · Grounded vehicles: ' +
    summary.grounded + ' · Returned to operational: ' + summary.returnedToOperational +
    ' · No longer present in latest export: ' + summary.noLongerPresent + '</div>' +
    '<details><summary>View detected changes</summary>' + changes + '</details>';
}
