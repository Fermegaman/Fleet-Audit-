const seed = JSON.parse(document.getElementById('seed').textContent);
const KEY = 'FleetAuditHub_v3';
const LEGACY_CLIENT_CODE = 'AGPL';
const AMAZON_FIELDS = [
  'vin', 'serviceType', 'vehicleName', 'licensePlateNumber', 'make', 'model',
  'subModel', 'status', 'statusPriority', 'statusReasonCode',
  'statusReasonMessage', 'operationalStatus', 'statusSearchValue',
  'subcontractorName', 'vehicleProvider', 'vehicleRegistrationType', 'year',
  'type', 'ownershipType', 'ownershipStartDate', 'ownershipEndDate', 'pmStats',
  'registrationExpiryDate', 'registeredState', 'serviceTier', 'stationCode',
  'payload', 'cubicCapacity'
];
const MANUAL_FIELDS = [
  ['dateGrounded', 'Date Grounded'],
  ['repairIssue', 'Repair / Issue'],
  ['atDealership', 'At Dealership'],
  ['location', 'Location'],
  ['afsEligible', 'AFS Eligible'],
  ['repairStatus', 'Repair Status'],
  ['status', 'Status'],
  ['notes', 'Notes']
];
// Verification-only detail sum from the supplied PDF; never used as the invoice total or billed charge.
const ELEMENT_PDF_DETAIL_REFERENCES = {
  'client-agpl|october2026|0011794022': {
    total: 845.73,
    source: 'Previously extracted from the supplied Element PDF; verify against the attached source.'
  }
};
let saved;
try {
  saved = JSON.parse(localStorage.getItem(KEY) || 'null');
} catch (error) {
  console.error('Unable to read saved Fleet Audit Hub data.', error);
}
const state = saved || {
  clients: [],
  actions: [],
  elementAudits: [],
  leaseAudits: [],
  sheets: seed
};
const $ = id => document.getElementById(id);
const esc = value => String(value == null ? '' : value)
  .replace(/[&<>"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[character]));

function normalizedKey(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeVin(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .toUpperCase();
}

function clientIdForCode(code) {
  return 'client-' + String(code || '').trim().toLowerCase();
}

function vehicleIdForVin(vin, clientId) {
  return 'vehicle-' + encodeURIComponent(clientId) + '-' + encodeURIComponent(vin);
}

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

initializeState();
let currentClientId = state.selectedClientId;
let currentView = 'dashboard';
const fleetSortByClient = {};

function save() {
  state.selectedClientId = currentClientId;
  localStorage.setItem(KEY, JSON.stringify(state));
}

function selectedClient() {
  return state.clients.find(client => client.id === currentClientId) || state.clients[0];
}

function clientFleet(clientId = currentClientId) {
  return state.fleetsByClient[clientId] || [];
}

function hasAmazonFleetImport(clientId = currentClientId) {
  return Boolean(state.importSummaries[clientId]);
}

function currentFleetRecords(clientId = currentClientId) {
  const records = clientFleet(clientId);
  return records.filter(vehicle =>
    isActiveStatus(vehicle.amazon && vehicle.amazon.status) &&
    (!hasAmazonFleetImport(clientId) || vehicle.presentInLatestExport)
  );
}

function clientSheet(name, clientId = currentClientId) {
  const client = state.clients.find(item => item.id === clientId);
  if (client && client.shortCode === LEGACY_CLIENT_CODE) {
    return state.sheets[name] || [];
  }
  return state.clientSheets[clientId] && state.clientSheets[clientId][name] || [];
}

function data(name) {
  return clientSheet(name);
}

function rows(name) {
  return data(name).slice(1);
}

function isGrounded(vehicle) {
  return String(vehicle.amazon && vehicle.amazon.operationalStatus || '').trim().toUpperCase() === 'GROUNDED';
}

function isActiveStatus(status) {
  return String(status == null ? '' : status).trim().toUpperCase() === 'ACTIVE';
}

function isInactiveStatus(status) {
  return String(status == null ? '' : status).trim().toUpperCase() === 'INACTIVE';
}

function todayDate() {
  const today = new Date();
  return today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
}

function setTitle(title, subtitle) {
  $('title').textContent = title;
  $('subtitle').textContent = subtitle;
}

function table(headers, records, rowRenderer, limit = 500) {
  if (!records.length) return '<div class="empty">No records yet.</div>';
  return '<div class="table"><table><thead><tr>' +
    headers.map(header => '<th>' + esc(header) + '</th>').join('') +
    '</tr></thead><tbody>' +
    records.slice(0, limit).map(rowRenderer).join('') +
    '</tbody></table></div>';
}

function workbookTable(sheet, limit = 500) {
  if (!sheet || !sheet.length) return '<div class="empty">No records yet.</div>';
  const headers = sheet[0] || [];
  return table(headers, sheet.slice(1, limit + 1), row =>
    '<tr>' + headers.map((_, index) => '<td>' + esc(row && row[index]) + '</td>').join('') + '</tr>',
    limit
  );
}

const FLEET_COLUMNS = [
  ['vin', 'VIN', vehicle => vehicle.vin],
  ['vehicleName', 'Vehicle Name', vehicle => vehicle.amazon.vehicleName],
  ['licensePlateNumber', 'License Plate', vehicle => vehicle.amazon.licensePlateNumber],
  ['make', 'Make', vehicle => vehicle.amazon.make],
  ['model', 'Model', vehicle => vehicle.amazon.model],
  ['operationalStatus', 'Operational Status', vehicle => vehicle.amazon.operationalStatus],
  ['amazonStatus', 'Amazon Status', vehicle => vehicle.amazon.status],
  ['vehicleProvider', 'Vehicle Provider', vehicle => vehicle.amazon.vehicleProvider],
  ['repairIssue', 'Repair / Issue', vehicle => vehicle.manual.repairIssue],
  ['location', 'Location', vehicle => vehicle.manual.location],
  ['repairStatus', 'Repair Status', vehicle => vehicle.manual.repairStatus],
  ['status', 'Status', vehicle => vehicle.manual.status],
  ['notes', 'Notes', vehicle => vehicle.manual.notes]
];
const GROUNDED_COLUMNS = [
  ...FLEET_COLUMNS.slice(0, 6),
  FLEET_COLUMNS[7],
  ['dateGrounded', 'Date Grounded', vehicle => vehicle.manual.dateGrounded],
  FLEET_COLUMNS[8],
  ['atDealership', 'At Dealership', vehicle => vehicle.manual.atDealership],
  FLEET_COLUMNS[9],
  ['afsEligible', 'AFS Eligible', vehicle => vehicle.manual.afsEligible],
  FLEET_COLUMNS[10],
  FLEET_COLUMNS[11],
  FLEET_COLUMNS[12]
];
const fleetCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function fleetTable(records, tableId, columns = FLEET_COLUMNS) {
  const sort = fleetSortByClient[currentClientId] && fleetSortByClient[currentClientId][tableId];
  const column = columns.find(item => item[0] === (sort && sort.column));
  const sorted = records.slice();
  if (column && sort) {
    sorted.sort((left, right) => {
      const result = fleetCollator.compare(
        String(column[2](left) == null ? '' : column[2](left)),
        String(column[2](right) == null ? '' : column[2](right))
      );
      return sort.direction === 'desc' ? -result : result;
    });
  }
  if (!sorted.length) return '<div class="empty">No records yet.</div>';
  const headers = columns.map(([key, label]) => {
    const active = sort && sort.column === key;
    const indicator = active ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : '';
    return '<th><button type="button" class="sort-header" data-sort-column="' + key +
      '" aria-sort="' + (active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none') +
      '">' + esc(label + indicator) + '</button></th>';
  }).join('') + '<th>Action</th>';
  return '<div class="table" data-fleet-table="' + esc(tableId) + '"><table><thead><tr>' + headers +
    '</tr></thead><tbody>' + sorted.map(vehicle => {
      const absent = hasAmazonFleetImport() && !vehicle.presentInLatestExport;
      const vinCell = esc(vehicle.vin) + (absent
        ? '<br><span class="small">Not in latest Amazon export</span>'
        : '');
      const inactive = isInactiveStatus(vehicle.amazon.status);
      const groundedActive = !inactive && isActiveStatus(vehicle.amazon.status) && isGrounded(vehicle);
      return '<tr class="fleet-row' + (absent ? ' absent' : inactive ? ' inactive' : groundedActive ? ' grounded' : '') + '">' +
        columns.map(([key, , getValue]) => '<td>' +
          (key === 'vin' ? vinCell : esc(key === 'operationalStatus' &&
            vehicle.lastOperationalChange === 'GROUNDED->OPERATIONAL'
            ? String(getValue(vehicle) || '') + ' — Returned to service'
            : key === 'amazonStatus' && inactive
              ? 'INACTIVE'
              : getValue(vehicle))) + '</td>').join('') +
        '<td><button class="btn secondary" data-edit-vin="' + esc(vehicle.vin) + '">View/Edit</button></td>' +
        '</tr>';
    }).join('') + '</tbody></table></div>';
}

function wireFleetTableSorting(tableId, records, columns = FLEET_COLUMNS) {
  const holder = document.querySelector('[data-fleet-table="' + tableId + '"]');
  if (!holder) return;
  holder.querySelectorAll('[data-sort-column]').forEach(button => {
    button.addEventListener('click', () => {
      const clientSort = fleetSortByClient[currentClientId] || (fleetSortByClient[currentClientId] = {});
      const previous = clientSort[tableId];
      const column = button.dataset.sortColumn;
      clientSort[tableId] = {
        column,
        direction: previous && previous.column === column && previous.direction === 'asc' ? 'desc' : 'asc'
      };
      holder.outerHTML = fleetTable(records, tableId, columns);
      const updatedHolder = document.querySelector('[data-fleet-table="' + tableId + '"]');
      wireFleetTableSorting(tableId, records, columns);
      wireVehicleEditors(updatedHolder);
    });
  });
}

function wireFleetTable(tableId, records, columns = FLEET_COLUMNS) {
  wireFleetTableSorting(tableId, records, columns);
  const holder = document.querySelector('[data-fleet-table="' + tableId + '"]');
  wireVehicleEditors(holder);
}

function wireVehicleEditors(root = document) {
  if (!root) return;
  root.querySelectorAll('[data-edit-vin]').forEach(button =>
    button.addEventListener('click', () => editVehicle(button.dataset.editVin))
  );
}

function dashboardCards() {
  const fleet = currentFleetRecords();
  const grounded = fleet.filter(isGrounded).length;
  const rentals = Math.max(0, rows('Rental Tracker').length);
  const actions = state.actions.filter(action => action.clientId === currentClientId).length;
  return '<div class="cards">' +
    '<div class="card"><div class="muted">Fleet records</div><div class="num">' + fleet.length + '</div></div>' +
    '<div class="card"><div class="muted">Grounded records</div><div class="num">' + grounded + '</div></div>' +
    '<div class="card"><div class="muted">Rental records</div><div class="num">' + rentals + '</div></div>' +
    '<div class="card"><div class="muted">Open actions</div><div class="num">' + actions + '</div></div></div>';
}

function dashboard() {
  const client = selectedClient();
  const fleet = currentFleetRecords();
  setTitle('Dashboard', client.shortCode + ' — ' + client.company);
  $('content').innerHTML = dashboardCards() +
    '<div class="grid"><div class="panel"><h3>Start here</h3><div class="toolbar">' +
    '<button class="btn" onclick="go(\'fleet\')">Upload / update fleet</button>' +
    '<button class="btn" onclick="go(\'element\')">Element audit</button>' +
    '<button class="btn" onclick="go(\'leaseplan\')">LeasePlan audit</button>' +
    '<button class="btn secondary" onclick="go(\'clients\')">Manage clients</button></div>' +
    '<div class="notice"><b>How to use it:</b> Select a module on the left. You can add records with the blue “Add” buttons. Information is saved in this browser for this prototype.</div></div>' +
    '<div class="panel"><h3>Audit cadence</h3><p class="muted">Element: invoice ready by the 1st and client review by the 15th. LeasePlan: complete the invoice summary, VIN-level tables and completion status.</p></div></div>' +
    '<div class="panel" style="margin-top:14px"><h3>Current fleet</h3>' +
    fleetTable(fleet.slice(0, 20), 'dashboardFleet') + '</div>';
  wireFleetTable('dashboardFleet', fleet.slice(0, 20));
}

function clientCounts(clientId) {
  const fleet = currentFleetRecords(clientId);
  return {
    fleet: fleet.length,
    grounded: fleet.filter(isGrounded).length,
    rentals: Math.max(0, clientSheet('Rental Tracker', clientId).slice(1).length),
    actions: state.actions.filter(action => action.clientId === clientId).length
  };
}

function clients() {
  setTitle('Clients', 'Central client registry for all fleet operations.');
  $('content').innerHTML = '<div class="panel"><div class="toolbar">' +
    '<button class="btn" onclick="addClient()">+ Add client</button></div>' +
    '<div class="table"><table><thead><tr><th>Short Code</th><th>Company</th><th>Station</th><th>Status</th><th>Fleet</th><th>Grounded</th><th>Rentals</th><th>Actions</th><th></th></tr></thead><tbody>' +
    state.clients.map((client, index) => {
      const counts = clientCounts(client.id);
      return '<tr><td><b>' + esc(client.shortCode) + '</b></td><td>' + esc(client.company) +
        '</td><td>' + esc(client.station) + '</td><td>' + esc(client.status) +
        '</td><td>' + counts.fleet + '</td><td>' + counts.grounded + '</td><td>' +
        counts.rentals + '</td><td>' + counts.actions +
        '</td><td><button class="btn secondary" data-open-client="' + index + '">View</button></td></tr>';
    }).join('') + '</tbody></table></div></div>';
  document.querySelectorAll('[data-open-client]').forEach(button =>
    button.addEventListener('click', () => openClient(Number(button.dataset.openClient)))
  );
}

function openClient(index) {
  const client = state.clients[index];
  if (!client) return;
  currentClientId = client.id;
  $('clientSelect').value = currentClientId;
  save();
  const counts = clientCounts(client.id);
  setTitle(client.shortCode + ' — Client Profile', client.company);
  $('content').innerHTML = '<div class="toolbar"><button class="btn secondary" onclick="go(\'clients\')">← Back to Clients</button></div>' +
    '<div class="cards"><div class="card"><div class="muted">Fleet</div><div class="num">' + counts.fleet +
    '</div></div><div class="card"><div class="muted">Grounded</div><div class="num">' + counts.grounded +
    '</div></div><div class="card"><div class="muted">Rentals</div><div class="num">' + counts.rentals +
    '</div></div><div class="card"><div class="muted">Open Actions</div><div class="num">' + counts.actions +
    '</div></div></div><div class="grid"><div class="panel"><h3>Client Information</h3><p><b>Company:</b> ' +
    esc(client.company) + '</p><p><b>Short Code:</b> ' + esc(client.shortCode) + '</p><p><b>Station:</b> ' +
    esc(client.station) + '</p><p><b>Status:</b> ' + esc(client.status) +
    '</p></div><div class="panel"><h3>Quick Actions</h3><div class="toolbar">' +
    '<button class="btn" onclick="go(\'fleet\')">Fleet & Grounded</button><button class="btn" onclick="go(\'rentals\')">Rentals</button>' +
    '<button class="btn" onclick="go(\'maintenance\')">Maintenance</button><button class="btn" onclick="go(\'element\')">Element Audit</button>' +
    '<button class="btn" onclick="go(\'leaseplan\')">LeasePlan Audit</button></div></div></div>' +
    '<div class="panel" style="margin-top:14px"><h3>Current Fleet</h3>' +
    fleetTable(currentFleetRecords(client.id).slice(0, 50), 'clientFleet') + '</div>';
  wireFleetTable('clientFleet', currentFleetRecords(client.id).slice(0, 50));
}

function addClient() {
  const shortCode = prompt('Client short code (example: AGPL):');
  if (!shortCode) return;
  const normalizedCode = shortCode.trim().toUpperCase();
  if (state.clients.some(client => client.shortCode === normalizedCode)) {
    alert('A client with that short code already exists.');
    return;
  }
  const company = prompt('Company name:') || normalizedCode;
  const station = prompt('Station code:') || '';
  let id = clientIdForCode(normalizedCode);
  let suffix = 2;
  while (state.clients.some(client => client.id === id)) {
    id = clientIdForCode(normalizedCode) + '-' + suffix++;
  }
  state.clients.push({ id, shortCode: normalizedCode, company, station, status: 'Active' });
  state.fleetsByClient[id] = [];
  save();
  renderClientSelector();
  clients();
}

function renderClientSelector() {
  const select = $('clientSelect');
  select.innerHTML = state.clients.map(client =>
    '<option value="' + esc(client.id) + '">' + esc(client.shortCode + ' — ' + client.company) + '</option>'
  ).join('');
  select.value = currentClientId;
}

function fleet() {
  const client = selectedClient();
  const currentRecords = currentFleetRecords();
  const grounded = clientFleet().filter(vehicle =>
    isGrounded(vehicle) && (!hasAmazonFleetImport() || vehicle.presentInLatestExport)
  );
  const noLongerPresent = hasAmazonFleetImport()
    ? clientFleet().filter(vehicle => !vehicle.presentInLatestExport)
    : [];
  const operational = currentRecords.filter(vehicle =>
    String(vehicle.amazon.operationalStatus || '').trim().toUpperCase() === 'OPERATIONAL'
  );
  setTitle('Fleet & Grounded', client.shortCode + ' — upload an Amazon fleet export or manage fleet records.');
  $('content').innerHTML = '<div class="toolbar"><button class="btn" id="uploadAmazonFleet">Upload Amazon Fleet</button>' +
    '<input id="fleetFile" type="file" accept=".csv,.xlsx,.xls" hidden>' +
    '<span class="small">Upload the latest Amazon fleet export (.xlsx, .xls, or .csv).</span>' +
    '<button class="btn secondary" onclick="document.getElementById(\'groundedForm\').scrollIntoView({behavior:\'smooth\'})">Add grounded vehicle</button></div>' +
    '<div id="importResult"></div>' +
    '<div class="cards"><div class="card"><div class="muted">Amazon fleet vehicles</div><div class="num">' + currentRecords.length +
    '</div></div><div class="card"><div class="muted">Grounded</div><div class="num">' + grounded.length +
    '</div></div><div class="card"><div class="muted">Operational</div><div class="num">' + operational.length +
    '</div></div><div class="card"><div class="muted">Returned to service</div><div class="num">' +
    currentRecords.filter(vehicle =>
      vehicle.lastOperationalChange === 'GROUNDED->OPERATIONAL' &&
      String(vehicle.amazon.operationalStatus || '').trim().toUpperCase() === 'OPERATIONAL'
    ).length +
    '</div></div></div>' +
    '<div class="panel"><h3>Fleet Records</h3>' +
    fleetTable(currentRecords, 'fleetRecords') + '</div>' +
    '<div class="panel" style="margin-top:14px"><h3>Grounded Vehicles</h3>' +
    fleetTable(grounded, 'groundedVehicles', GROUNDED_COLUMNS) + '</div>' +
    (noLongerPresent.length
      ? '<div class="panel" style="margin-top:14px"><h3>Not Present in Latest Amazon Export</h3>' +
        '<p class="muted">These records are retained for history and are not included in the latest export.</p>' +
        fleetTable(noLongerPresent, 'missingFleetRecords') + '</div>'
      : '') +
    '<div class="panel" id="groundedForm" style="margin-top:14px"><h3>Add grounded vehicle</h3>' +
    '<div class="formgrid">' +
    '<div class="field"><label>VIN</label><input id="newVin" required></div>' +
    '<div class="field"><label>Date Grounded</label><input id="newDateGrounded" type="date"></div>' +
    '<div class="field"><label>Repair / Issue</label><textarea id="newRepairIssue" rows="2"></textarea></div>' +
    '<div class="field"><label>At Dealership</label><select id="newAtDealership">' + yesNoHtml('') + '</select></div>' +
    '<div class="field"><label>Location</label><input id="newLocation"></div>' +
    '<div class="field"><label>AFS Eligible</label><select id="newAfsEligible">' + yesNoHtml('') + '</select></div>' +
    '<div class="field"><label>Repair Status</label><input id="newRepairStatus"></div>' +
    '<div class="field"><label>Status</label><select id="newStatus">' + manualStatusOptions('') + '</select></div>' +
    '<div class="field full"><label>Notes</label><textarea id="newNotes" rows="3"></textarea></div>' +
    '<div class="field full"><button class="btn" id="addGroundedVehicle">Save</button></div></div></div>';
  $('uploadAmazonFleet').addEventListener('click', () => $('fleetFile').click());
  $('fleetFile').addEventListener('change', event => importFleetFile(event.target.files[0]));
  $('addGroundedVehicle').addEventListener('click', addGrounded);
  wireFleetTable('fleetRecords', currentRecords);
  wireFleetTable('groundedVehicles', grounded, GROUNDED_COLUMNS);
  wireFleetTable('missingFleetRecords', noLongerPresent);
  renderImportSummary();
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index++;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some(value => value.trim())) rows.push(row);
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  return rows;
}

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

function yesNoHtml(value) {
  const selected = String(value || '').trim();
  return '<option value="">Select</option>' + ['Yes', 'No'].map(option =>
    '<option value="' + option + '"' + (selected.toLowerCase() === option.toLowerCase() ? ' selected' : '') +
    '>' + option + '</option>'
  ).join('');
}

function manualStatusOptions(value) {
  const statuses = ['Open', 'Pending DSP action', 'Waiting DSP action', 'Resolved', 'Closed', 'Rejected'];
  const selected = String(value || '');
  const retained = selected && !statuses.includes(selected)
    ? '<option value="' + esc(selected) + '" selected>' + esc(selected) + '</option>'
    : '';
  return '<option value="">Select</option>' + retained + statuses.map(status =>
    '<option value="' + esc(status) + '"' + (selected === status ? ' selected' : '') +
    '>' + esc(status) + '</option>'
  ).join('');
}

function editVehicle(vin) {
  const normalizedVin = normalizeVin(vin);
  const clientId = currentClientId;
  const vehicle = clientFleet(clientId).find(record => normalizeVin(record.vin) === normalizedVin);
  if (!vehicle) return fleet();
  const vehicleId = vehicle.id;
  currentView = 'vehicleEdit';
  setTitle('View / Edit Vehicle', selectedClient().shortCode + ' — ' + vehicle.vin);
  const amazonLabels = [
    ['vin', 'VIN'], ['vehicleName', 'Vehicle Name'],
    ['licensePlateNumber', 'License Plate'], ['make', 'Make'], ['model', 'Model'],
    ['subModel', 'Sub Model'], ['status', 'Amazon Status'],
    ['operationalStatus', 'Operational Status'], ['vehicleProvider', 'Vehicle Provider'],
    ['ownershipType', 'Ownership Type'], ['registrationExpiryDate', 'Registration Expiry'],
    ['registeredState', 'Registered State'], ['stationCode', 'Station']
  ];
  $('content').innerHTML = '<div class="toolbar"><button class="btn secondary" onclick="go(\'fleet\')">← Back to Fleet</button></div>' +
    '<div class="panel"><h3>AMAZON FLEET INFORMATION</h3><div class="formgrid">' +
    amazonLabels.map(([key, label]) => '<div class="field"><label>' + esc(label) + '</label><input readonly value="' +
      esc(vehicle.amazon[key]) + '"></div>').join('') + '</div></div>' +
    '<form id="manualVehicleForm" class="panel" style="margin-top:14px"><h3>FLEET TEAM INFORMATION</h3><div class="formgrid">' +
    MANUAL_FIELDS.map(([key, label]) => {
      const rawValue = vehicle.manual[key];
      const value = esc(key === 'dateGrounded' && rawValue ? String(rawValue).slice(0, 10) : rawValue);
      const multiline = key === 'notes' || key === 'repairIssue';
      const yesNo = key === 'atDealership' || key === 'afsEligible';
      return '<div class="field' + (multiline ? ' full' : '') + '"><label for="manual-' + key + '">' + esc(label) +
        '</label>' + (multiline
          ? '<textarea id="manual-' + key + '" name="manual-' + key + '" rows="3">' + value + '</textarea>'
          : yesNo
            ? '<select id="manual-' + key + '" name="manual-' + key + '">' + yesNoHtml(rawValue) + '</select>'
            : key === 'status'
              ? '<select id="manual-' + key + '" name="manual-' + key + '">' + manualStatusOptions(rawValue) + '</select>'
              : '<input id="manual-' + key + '" name="manual-' + key + '" value="' + value + '"' +
                (key === 'dateGrounded' ? ' type="date"' : '') + '>') + '</div>';
    }).join('') +     '</div><div class="toolbar" style="margin-top:14px"><button class="btn" type="submit">Save Changes</button></div></form>' +
    renderGroundingHistory(vehicle);
  $('manualVehicleForm').addEventListener('submit', event => {
    event.preventDefault();
    const clientRecords = state.fleetsByClient[clientId] || [];
    const record = clientRecords.find(item => item.id === vehicleId) ||
      clientRecords.find(item => normalizeVin(item.vin) === normalizedVin);
    if (!record) {
      alert('This vehicle is no longer available for the selected client. Reopen the record and try again.');
      return fleet();
    }
    const previousManual = { ...emptyManual(), ...(record.manual || {}) };
    const updatedManual = { ...emptyManual(), ...(record.manual || {}) };
    MANUAL_FIELDS.forEach(([key]) => {
      const field = event.currentTarget.elements.namedItem('manual-' + key);
      if (!field) throw new Error('Missing fleet team field: ' + key);
      updatedManual[key] = field.value;
    });
    if (isGrounded(record) && MANUAL_FIELDS.some(([key]) => previousManual[key] !== updatedManual[key])) {
      record.groundingHistory = record.groundingHistory || [];
      record.groundingHistory.push({
        event: 'Fleet Team details updated',
        at: new Date().toISOString(),
        manual: previousManual
      });
    }
    if (isGrounded(record) && !updatedManual.dateGrounded) updatedManual.dateGrounded = todayDate();
    record.manual = updatedManual;
    currentClientId = clientId;
    save();
    fleet();
  });
}

function renderGroundingHistory(vehicle) {
  const entries = [
    ...(vehicle.manualHistory || []).map(entry => ({
      event: 'Legacy workbook grounding record',
      at: entry.dateGrounded,
      manual: entry
    })),
    ...(vehicle.groundingHistory || [])
  ];
  if (!entries.length) return '';
  return '<div class="panel" style="margin-top:14px"><h3>GROUNDING HISTORY</h3><div class="table"><table><thead><tr>' +
  '<th>Event</th><th>Date</th><th>Date Grounded</th><th>Date Returned / Resolved</th><th>Repair / Issue</th><th>At Dealership</th>' +
  '<th>Location</th><th>AFS Eligible</th><th>Repair Status</th><th>Status</th><th>Notes</th>' +
  '</tr></thead><tbody>' + entries.map(entry => {
    const manual = entry.manual || entry;
    return '<tr><td>' + esc(entry.event) + '</td><td>' + esc(entry.at) +
      '</td><td>' + esc(entry.dateGrounded || manual.dateGrounded) +
      '</td><td>' + esc(entry.dateReturned || '') + '</td><td>' + esc(manual.repairIssue) +
        '</td><td>' + esc(manual.atDealership) + '</td><td>' + esc(manual.location) +
        '</td><td>' + esc(manual.afsEligible) + '</td><td>' + esc(manual.repairStatus) +
        '</td><td>' + esc(manual.status) + '</td><td>' + esc(manual.notes) + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

function addGrounded() {
  const vin = normalizeVin($('newVin').value);
  if (!vin) {
    $('newVin').focus();
    return;
  }
  const records = clientFleet();
  const existing = records.find(record => normalizeVin(record.vin) === vin);
  if (existing) return editVehicle(existing.vin);
  const vehicle = {
    id: vehicleIdForVin(vin, currentClientId),
    vin,
    amazon: { vin, status: 'ACTIVE', operationalStatus: 'GROUNDED' },
    manual: emptyManual(),
    manualHistory: [],
    groundingHistory: [],
    presentInLatestExport: true
  };
  records.push(vehicle);
  vehicle.manual.dateGrounded = $('newDateGrounded').value;
  vehicle.manual.repairIssue = $('newRepairIssue').value;
  vehicle.manual.atDealership = $('newAtDealership').value;
  vehicle.manual.location = $('newLocation').value;
  vehicle.manual.afsEligible = $('newAfsEligible').value;
  vehicle.manual.repairStatus = $('newRepairStatus').value;
  vehicle.manual.status = $('newStatus').value;
  vehicle.manual.notes = $('newNotes').value;
  if (!vehicle.manual.dateGrounded) vehicle.manual.dateGrounded = todayDate();
  vehicle.groundingHistory.push({
    event: 'Manually added as grounded',
    dateGrounded: vehicle.manual.dateGrounded,
    dateReturned: '',
    at: new Date().toISOString(),
    manual: { ...vehicle.manual }
  });
  save();
  fleet();
}

function form(fields, handler) {
  return '<div class="formgrid">' + fields.map(([key, label]) =>
    '<div class="field"><label>' + esc(label) + '</label><input id="f_' + esc(key) + '"></div>'
  ).join('') + '<div class="field full"><button class="btn" onclick="' + handler + '()">Save</button></div></div>';
}

function rentals() {
  setTitle('Rentals', 'Centralized rental tracker.');
  $('content').innerHTML = '<div class="panel"><div class="toolbar"><button class="btn" onclick="alert(\'Rental entry form is ready for the database build.\')">+ Add rental</button></div>' +
    workbookTable(data('Rental Tracker')) + '</div>';
}

function maintenance() {
  setTitle('PM / Maintenance', 'Preventative maintenance and repair tracking.');
  $('content').innerHTML = '<div class="panel"><div class="toolbar"><button class="btn" onclick="alert(\'PM entry form is ready for the database build.\')">+ Add PM item</button></div>' +
    workbookTable(data('PMS')) + '</div>';
}

function fif() {
  setTitle('FIF', 'Fleet Improvement Fund tracking.');
  $('content').innerHTML = '<div class="panel"><div class="toolbar"><button class="btn" onclick="alert(\'FIF entry form is ready for the database build.\')">+ Add claim</button></div>' +
    workbookTable(data('FIF Tracker')) + '</div>';
}

function tolls() {
  setTitle('Toll Claims', 'Expected, approved and resolved toll reimbursement.');
  $('content').innerHTML = '<div class="panel"><div class="toolbar"><button class="btn" onclick="alert(\'Toll entry form is ready for the database build.\')">+ Add claim</button></div>' +
    workbookTable(data('Toll Tracker')) + '</div>';
}

function pave() {
  setTitle('PAVE', 'Inspection due-date tracking.');
  $('content').innerHTML = '<div class="panel">' + workbookTable(data('Pave')) + '</div>';
}

function recalls() {
  setTitle('Recalls', 'Recall status.');
  $('content').innerHTML = '<div class="panel">' + workbookTable(data('Recalls')) + '</div>';
}

function actions() {
  setTitle('Open Actions', 'A single place for disputes, missing documents and follow-ups.');
  const clientActions = state.actions.filter(action => action.clientId === currentClientId);
  $('content').innerHTML = '<div class="panel"><div class="toolbar"><button class="btn" onclick="addAction()">+ Add action</button></div>' +
    (clientActions.length ? '<div class="table"><table><thead><tr><th>Client</th><th>Area</th><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>' +
      clientActions.map(action => '<tr><td>' + esc(selectedClient().shortCode) + '</td><td>' + esc(action.area) +
        '</td><td>' + esc(action.action) + '</td><td>' + esc(action.owner) + '</td><td>' + esc(action.due) +
        '</td><td>' + esc(action.status) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="empty">No open actions.</div>') + '</div>';
}

function addAction() {
  const action = prompt('What needs to be done?');
  if (!action) return;
  const area = prompt('Area (Element, LeasePlan, Grounded, Rental, etc.):') || '';
  const owner = prompt('Owner:') || '';
  const due = prompt('Due date:') || '';
  state.actions.push({ clientId: currentClientId, area, action, owner, due, status: 'Open' });
  save();
  actions();
}

function invoices() {
  setTitle('Invoice Audits', 'Two workflows based directly on the provided SOPs.');
  $('content').innerHTML = '<div class="grid2"><div class="panel"><h3>Element Invoice</h3><p class="muted">PDF + CDV + fleet matching workflow.</p><button class="btn" onclick="go(\'element\')">Open Element Audit</button></div>' +
    '<div class="panel"><h3>LeasePlan / Wheels</h3><p class="muted">PDF summary and VIN-level review workflow.</p><button class="btn" onclick="go(\'leaseplan\')">Open LeasePlan Audit</button></div></div>';
}

function check(items) {
  return '<div class="check">' + items.map(item => '<label><input type="checkbox"> ' + item + '</label>').join('') + '</div>';
}

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

function parseNumeric(value) {
  if (value == null || value === '') return 0;
  const cleaned = String(value).replace(/[$,\s]/g, '').replace(/\((.*)\)/, '-$1');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseEnteredMoney(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  const normalized = raw.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  const amount = typeof value === 'number' ? value : parseNumeric(value);
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

function elementReconciliationHtml(audit, includeMaintenanceInput = true) {
  if (!audit) return '<div class="notice">Enter invoice details and upload Element CSV/CDV records to begin reconciliation.</div>';
  const reconciliation = elementAuditReconciliation(audit);
  const maintenanceVariance = elementMaintenanceVariance(audit);
  return '<div class="cards">' +
    [['Calculated CSV Total', formatMoney(reconciliation.calculatedTotal)],
      ['Actual Invoice Total', reconciliation.invoiceTotal == null ? 'Not entered' : formatMoney(reconciliation.invoiceTotal)],
      ['Difference (CSV − Invoice)', reconciliation.difference == null ? '—' : formatMoney(reconciliation.difference)],
      ['Reconciliation Status', reconciliation.status]].map(([label, value]) =>
      '<div class="card"><div class="muted">' + esc(label) + '</div><div class="num">' + esc(value) + '</div></div>'
    ).join('') + '</div>' +
    (includeMaintenanceInput ? '<div class="field" style="margin-top:10px"><label>PDF Maintenance Detail Total' +
      (audit.pdfMaintenanceDetailSource ? ' (previously extracted; verify)' : ' (optional verification)') + '</label>' +
      '<input id="pdfMaintenanceDetailTotal" type="number" step="0.01" value="' +
      esc(audit.pdfMaintenanceDetailTotal == null ? '' : audit.pdfMaintenanceDetailTotal) + '">' +
      '<div class="small">Enter the sum of the maintenance detail lines from the PDF to compare it with the CSV maintenance category. This does not change billed or reviewed charges.</div></div>' : '') +
    (maintenanceVariance ? '<div class="notice">Maintenance source check: CSV category ' +
      esc(formatMoney(maintenanceVariance.csvTotal)) + '; PDF detail total ' +
      esc(formatMoney(maintenanceVariance.pdfDetailTotal)) + '; difference (PDF − CSV) ' +
      esc(formatMoney(maintenanceVariance.difference)) +
      '. ' + esc(maintenanceVariance.source) +
      ' Investigate this source-level variance; it does not alter the invoice or maintenance review amounts.</div>' : '');
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

function csvRows(text) {
  const allLines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  const headerLine = allLines.find(line => /vin/i.test(line) &&
    /charge|amount|cost|description|breakdown|ticket|toll|maintenance|lease/i.test(line));
  const sampleLines = headerLine ? [headerLine] : allLines.slice(0, 12);
  const delimiters = [',', '\t', ';'];
  const delimiter = delimiters.map(candidate => {
    const count = sampleLines.map(line => {
      let quoted = false;
      let lineCount = 0;
      for (let index = 0; index < line.length; index++) {
        if (line[index] === '"') {
          if (quoted && line[index + 1] === '"') index++;
          else quoted = !quoted;
        } else if (line[index] === candidate && !quoted) lineCount++;
      }
      return lineCount;
    }).sort((left, right) => right - left)[0] || 0;
    return { delimiter: candidate, count };
  }).sort((left, right) => right.count - left.count)[0].delimiter;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(cell);
      if (row.some(value => String(value).trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some(value => String(value).trim())) rows.push(row);
  }
  return rows;
}

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

migrateElementAuditChargeCategories();

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

function sortedElementRecords(audit, tableName, records) {
  const sorts = state.elementAuditSort || (state.elementAuditSort = {});
  const sort = sorts[tableName] || { key: 'vin', direction: 'asc' };
  return records.slice().sort((left, right) => {
    const a = tableName === 'source' && left.categories
      ? (left.categories[sort.key] == null ? left[sort.key] : left.categories[sort.key])
      : left[sort.key];
    const b = tableName === 'source' && right.categories
      ? (right.categories[sort.key] == null ? right[sort.key] : right.categories[sort.key])
      : right[sort.key];
    const result = typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), undefined, { numeric: true, sensitivity: 'base' });
    return sort.direction === 'desc' ? -result : result;
  });
}

function elementTableHead(columns, tableName) {
  const sort = state.elementAuditSort && state.elementAuditSort[tableName] || { key: 'vin', direction: 'asc' };
  return '<thead><tr>' + columns.map(([key, label]) => key === 'detail'
    ? '<th>' + esc(label) + '</th>'
    : '<th><button type="button" class="sort-header" data-element-sort="' + tableName + ':' + key + '" aria-sort="' +
      (sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none') + '">' +
      esc(label) + (sort.key === key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : '') + '</button></th>'
  ).join('') + '</tr></thead>';
}

function elementInvoiceTableHtml(audit) {
  const columns = [
    ['vin', 'VIN'], ['unit', 'Unit'], ['clientAssetId', 'Client Asset ID'], ['description', 'Breakdown / Description'],
    ['total', 'Total Unit Charges'], ['lease', 'Lease Charges'], ['maintenance', 'Maintenance Charges'],
    ['ticket', 'Ticket'], ['taxRental', 'Tax Rental'], ['uncategorized', 'Charges Not Categorized'],
    ['credits', 'Credits'], ['other', 'Other'], ['detail', 'Source Record']
  ];
  const records = sortedElementRecords(audit, 'source', elementAuditRecords(audit));
  if (!records.length) return '<p class="muted">Upload an Element CSV/CDV to view invoice records.</p>';
  return '<div class="table"><table>' + elementTableHead(columns, 'source') + '<tbody>' +
    records.map((record, index) => {
      const values = [record.vin, record.unit, record.clientAssetId, record.description, formatMoney(record.total),
        formatMoney(record.categories.lease), formatMoney(record.categories.maintenance), formatMoney(record.categories.ticket),
        formatMoney(record.categories.taxRental), formatMoney(record.categories.uncategorized),
        formatMoney(record.categories.credits), formatMoney(record.categories.other)];
      return '<tr class="element-source-row" data-source-index="' + index + '" data-filter-text="' + esc(values.join(' ').toLowerCase()) + '">' +
        values.map(value => '<td>' + esc(value) + '</td>').join('') +
        '<td><button type="button" class="btn secondary" data-source-detail="' + index + '">View source</button></td></tr>' +
        '<tr class="element-source-detail" data-source-detail-row="' + index + '" data-expanded="false" hidden><td colspan="' + columns.length +
        '"><pre style="white-space:pre-wrap;margin:0">' + esc(JSON.stringify({
          sourceRecord: record.source,
          chargeCategorization: record.chargeClassifications || []
        }, null, 2)) + '</pre></td></tr>';
    }).join('') + '</tbody></table></div>';
}

function elementPivotTableHtml(audit) {
  const columns = [
    ['vin', 'VIN'], ['ticket', 'Ticket / Toll'], ['lease', 'Lease Charges'], ['maintenance', 'Maintenance Charges'],
    ['uncategorized', 'Uncategorized Charges'], ['credits', 'Credits'], ['taxRental', 'Tax Rental'],
    ['other', 'Other Charges'], ['total', 'Total Charges']
  ];
  const rows = sortedElementRecords(audit, 'pivot', elementPivot(audit));
  if (!rows.length) return '<p class="muted">No Element VIN totals are available.</p>';
  const totals = elementSummary(audit);
  return '<div class="table"><table>' + elementTableHead(columns, 'pivot') + '<tbody>' +
    rows.map(row => {
      const values = [row.vin, row.ticket, row.lease, row.maintenance, row.uncategorized, row.credits, row.taxRental, row.other, row.total];
      return '<tr class="element-pivot-row" data-filter-text="' + esc(values.join(' ').toLowerCase()) + '">' +
        '<td>' + esc(row.vin) + '</td>' + values.slice(1).map(value => '<td>' + esc(formatMoney(value)) + '</td>').join('') + '</tr>';
    }).join('') +
    '<tr><th>TOTAL</th>' + [totals.ticket, totals.lease, totals.maintenance, totals.uncategorized, totals.credits, totals.taxRental, totals.other, totals.total]
      .map(value => '<th>' + esc(formatMoney(value)) + '</th>').join('') + '</tr>' +
    '</tbody></table></div>';
}

function maintenanceReviewTableHtml(audit) {
  const rows = ensureMaintenanceReviewFromElement(audit);
  if (!rows.length) {
    return '<p class="muted">No maintenance charges were identified in the Element invoice data.</p>';
  }
  return '<div class="table"><table><thead><tr>' +
    '<th>VIN</th><th>Unit</th><th>Client Asset ID</th><th>Maintenance Description</th><th>Element Charge</th>' +
    '<th>Reviewed Amount</th><th>Difference</th><th>Review Status</th><th>Review Notes</th></tr></thead><tbody>' +
    rows.map((row, index) => {
      const reviewStatus = normalizeMaintenanceReviewStatus(row.reviewStatus);
      const elementCharge = row.elementCharge == null || row.elementCharge === '' ? '' : formatMoney(row.elementCharge);
      const reviewedAmount = row.reviewedAmount == null || row.reviewedAmount === '' ? '' : formatMoney(row.reviewedAmount);
      const difference = row.difference == null || row.difference === '' ? '' : formatMoney(row.difference);
      return '<tr>' +
        '<td>' + esc(row.vin || '') + '</td>' +
        '<td>' + esc(row.unit || '') + '</td>' +
        '<td>' + esc(row.clientAssetId || '') + '</td>' +
        '<td>' + esc(row.maintenanceDescription || '') + '</td>' +
        '<td>' + esc(elementCharge) + '</td>' +
        '<td><input type="number" step="0.01" data-maintenance-review-field="reviewedAmount" data-index="' + index + '" value="' + esc(row.reviewedAmount || '') + '"></td>' +
        '<td>' + esc(difference) + '</td>' +
        '<td><select data-maintenance-review-field="reviewStatus" data-index="' + index + '">' +
          ['Pending Review', 'Reviewed', 'Approved', 'Disputed'].map(status =>
            '<option value="' + esc(status) + '"' + (status === reviewStatus ? ' selected' : '') + '>' + esc(status) + '</option>'
          ).join('') +
        '</select></td>' +
        '<td><textarea data-maintenance-review-field="reviewNotes" data-index="' + index + '" rows="2">' + esc(row.reviewNotes || '') + '</textarea></td>' +
        '</tr>';
    }).join('') + '</tbody></table></div>';
}

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

function tollReviewTableHtml(audit) {
  const rows = ensureTollReviewFromElement(audit);
  if (!rows.length) {
    return '<p class="muted">No Ticket / Toll charges were identified in the Element invoice data.</p>';
  }
  return '<div class="table"><table><thead><tr>' +
    '<th>VIN</th><th>Unit</th><th>Client Asset ID</th><th>Description</th><th>Element Charge</th>' +
    '<th>Reviewed Amount</th><th>Difference</th><th>Review Status</th><th>Review Notes</th></tr></thead><tbody>' +
    rows.map((row, index) => '<tr>' +
      '<td>' + esc(row.vin || '') + '</td>' +
      '<td>' + esc(row.unit || '') + '</td>' +
      '<td>' + esc(row.clientAssetId || '') + '</td>' +
      '<td>' + esc(row.description || '') + '</td>' +
      '<td>' + esc(formatMoney(row.elementCharge)) + '</td>' +
      '<td><input type="number" step="0.01" data-toll-review-field="reviewedAmount" data-index="' + index +
        '" value="' + esc(row.reviewedAmount == null ? '' : row.reviewedAmount) + '"></td>' +
      '<td>' + esc(row.difference === '' ? '' : formatMoney(row.difference)) + '</td>' +
      '<td><select data-toll-review-field="reviewStatus" data-index="' + index + '">' +
        ['Pending Review', 'Reviewed', 'Approved', 'Disputed'].map(status =>
          '<option value="' + esc(status) + '"' +
          (status === normalizeMaintenanceReviewStatus(row.reviewStatus) ? ' selected' : '') + '>' +
          esc(status) + '</option>'
        ).join('') + '</select></td>' +
      '<td><textarea data-toll-review-field="reviewNotes" data-index="' + index +
        '" rows="2">' + esc(row.reviewNotes || '') + '</textarea></td></tr>'
    ).join('') + '</tbody></table></div>';
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

function parseElementInvoiceFile(file) {
  if (!file) return;
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!['csv', 'txt', 'cdv'].includes(extension)) {
    alert('Choose an Element .csv, .txt, or .cdv file.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => alert('The Element invoice CSV/CDV could not be read.');
  reader.onload = event => {
    try {
      const sourceRows = elementRecordsFromText(String(event.target.result || ''));
      if (!sourceRows.length) throw new Error('The Element file has headers but no invoice records.');
      const csvInvoiceNumber = String(sourceValue(sourceRows[0], ['Invoice #', 'Invoice Number'])).trim();
      const csvInvoiceDate = elementInvoiceDate(sourceValue(sourceRows[0], ['Invoice Date']));
      if (!$('elementInvoiceNumber').value.trim() && csvInvoiceNumber) {
        $('elementInvoiceNumber').value = csvInvoiceNumber;
      }
      if (!$('elementInvoiceDate').value && csvInvoiceDate.iso) {
        $('elementInvoiceDate').value = csvInvoiceDate.iso;
      }
      if (!$('elementAuditMonth').value.trim() && csvInvoiceDate.month) {
        $('elementAuditMonth').value = csvInvoiceDate.month;
      }
      const month = $('elementAuditMonth').value.trim();
      const invoiceNumber = $('elementInvoiceNumber').value.trim();
      if (!month || !invoiceNumber) {
        alert('Enter the Audit Month and Invoice Number. The invoice date and number can be read from the Element CSV when present.');
        return;
      }
      const clientId = currentClientId;
      const key = elementAuditKey(clientId, month, invoiceNumber);
      const activeAudit = currentElementAudit();
      const existingMonthAudit = elementAuditList().find(item =>
        elementAuditMonthKey(item.clientId, item.month) === elementAuditMonthKey(clientId, month)
      );
      if (existingMonthAudit &&
          (existingMonthAudit.id !== (activeAudit && activeAudit.id) ||
           normalizedElementKey(existingMonthAudit.invoiceNumber) !== normalizedElementKey(invoiceNumber))) {
        if (window.confirm('An audit already exists for this client and month. Open it from Audit History instead of importing over it?')) {
          changeElementAudit(existingMonthAudit.id);
        }
        return;
      }
      if (activeAudit && activeAudit.month && activeAudit.invoiceNumber &&
          elementAuditKey(activeAudit.clientId, activeAudit.month, activeAudit.invoiceNumber) !== key &&
          elementAuditIsDirty(activeAudit)) {
        const shouldSave = window.confirm('The active Element audit has unsaved changes. Save it to Audit History before importing another invoice?');
        if (!shouldSave || !saveCurrentElementAudit(activeAudit, false)) return;
      }
      let audit = activeAudit &&
        (!activeAudit.month || !activeAudit.invoiceNumber ||
          elementAuditKey(activeAudit.clientId, activeAudit.month, activeAudit.invoiceNumber) === key)
        ? activeAudit
        : null;
      if (!audit) audit = elementAuditList().find(item =>
        elementAuditKey(item.clientId, item.month, item.invoiceNumber) === key
      );
      if (audit && state.elementAudits.includes(audit)) audit = cloneElementAudit(audit);
      if (!audit) {
        audit = {
          id: createElementAuditId(),
          clientId,
          month,
          invoiceNumber,
          invoiceDate: '',
          sourceInvoiceTotal: '',
          elementRecords: [],
          maintenanceReview: [],
          unmatchedReviewRecords: []
        };
      }
      audit.month = month;
      audit.invoiceNumber = invoiceNumber;
      const client = selectedClient();
      audit.clientId = clientId;
      audit.clientName = client.company;
      audit.shortCode = client.shortCode;
      audit.station = client.station;
      const pdfDetailReference = ELEMENT_PDF_DETAIL_REFERENCES[key];
      if ((audit.pdfMaintenanceDetailTotal == null || audit.pdfMaintenanceDetailTotal === '') &&
          pdfDetailReference) {
        audit.pdfMaintenanceDetailTotal = String(pdfDetailReference.total);
        audit.pdfMaintenanceDetailSource = pdfDetailReference.source;
      }
      const invoiceDate = $('elementInvoiceDate').value;
      if (invoiceDate || !audit.invoiceDate) audit.invoiceDate = invoiceDate;
      audit.elementRecords = sourceRows.map(elementRecordValues);
      const invoiceTotal = $('elementInvoiceTotal').value.trim();
      if (invoiceTotal || !audit.sourceInvoiceTotal) audit.sourceInvoiceTotal = invoiceTotal;
      audit.csvFileName = file.name;
      audit.csvFileSize = file.size;
      audit.csvImportedAt = new Date().toISOString();
      state.activeElementAuditByClient = state.activeElementAuditByClient || {};
      state.activeElementAuditByClient[clientId] = audit;
      state.selectedElementAuditByClient = state.selectedElementAuditByClient || {};
      state.selectedElementAuditByClient[clientId] = audit.id;
      ensureMaintenanceReviewFromElement(audit);
      ensureTollReviewFromElement(audit);
      try {
        save();
      } catch (error) {
        console.error('Unable to save imported Element invoice data in browser storage.', error);
        alert('The Element CSV was parsed, but its active workspace could not be saved in browser storage. Export a backup and check available storage.');
        return;
      }
      alert('Imported ' + audit.elementRecords.length + ' Element invoice records for ' + month + ' / ' + invoiceNumber + '.');
      element();
    } catch (error) {
      console.error('Unable to parse Element invoice file.', error);
      alert('Unable to parse the Element invoice file: ' + error.message);
    }
  };
  reader.readAsText(file);
}

function attachElementInvoicePdf(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name || '')) {
    alert('Choose the Element invoice PDF.');
    return;
  }
  const audit = currentElementAudit();
  if (!audit) {
    alert('Enter an audit month and invoice number before attaching the Element PDF.');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    alert('The PDF is larger than the 2 MB browser-storage limit for this prototype.');
    return;
  }
  const auditId = audit.id;
  const reader = new FileReader();
  reader.onerror = () => alert('The selected Element invoice PDF could not be read.');
  reader.onload = event => {
    const target = currentElementAudit();
    if (!target) {
      alert('The active Element audit is no longer available. Select it again and attach the PDF.');
      return;
    }
    if (target.id !== auditId) {
      alert('The active Element audit changed while the PDF was being read. Attach it again.');
      return;
    }
    const previousAttachment = {
      name: target.invoicePdfName,
      size: target.invoicePdfSize,
      dataUrl: target.invoicePdfDataUrl
    };
    target.invoicePdfName = file.name;
    target.invoicePdfSize = file.size;
    target.invoicePdfDataUrl = String(event.target.result || '');
    try {
      save();
      element();
    } catch (error) {
      if (previousAttachment.name == null) delete target.invoicePdfName;
      else target.invoicePdfName = previousAttachment.name;
      if (previousAttachment.size == null) delete target.invoicePdfSize;
      else target.invoicePdfSize = previousAttachment.size;
      if (previousAttachment.dataUrl == null) delete target.invoicePdfDataUrl;
      else target.invoicePdfDataUrl = previousAttachment.dataUrl;
      console.error('Unable to save the Element invoice PDF attachment.', error);
      alert('The Element invoice PDF could not be saved in browser storage.');
    }
  };
  reader.readAsDataURL(file);
}

function saveElementAuditDetails() {
  const month = $('elementAuditMonth').value.trim();
  const invoiceNumber = $('elementInvoiceNumber').value.trim();
  if (!month || !invoiceNumber) {
    alert('Enter both the Audit Month and Invoice Number.');
    return;
  }
  let audit = currentElementAudit();
  if (!audit) {
    audit = {
      id: createElementAuditId(),
      clientId: currentClientId,
      month,
      invoiceNumber,
      invoiceDate: '',
      sourceInvoiceTotal: '',
      elementRecords: [],
      maintenanceReview: [],
      unmatchedReviewRecords: []
    };
  }
  audit.month = month;
  audit.invoiceNumber = invoiceNumber;
  audit.invoiceDate = $('elementInvoiceDate').value;
  audit.sourceInvoiceTotal = $('elementInvoiceTotal').value.trim();
  const previousPdfDetailTotal = audit.pdfMaintenanceDetailTotal == null
    ? ''
    : String(audit.pdfMaintenanceDetailTotal);
  audit.pdfMaintenanceDetailTotal = $('pdfMaintenanceDetailTotal')
    ? $('pdfMaintenanceDetailTotal').value.trim()
    : audit.pdfMaintenanceDetailTotal || '';
  if (audit.pdfMaintenanceDetailTotal && audit.pdfMaintenanceDetailTotal !== previousPdfDetailTotal) {
    audit.pdfMaintenanceDetailSource = 'Entered by fleet team for source verification.';
  }
  audit.clientId = currentClientId;
  audit.clientId = currentClientId;
  const client = selectedClient();
  audit.clientName = client.company;
  audit.shortCode = client.shortCode;
  state.activeElementAuditByClient = state.activeElementAuditByClient || {};
  state.activeElementAuditByClient[currentClientId] = audit;
  state.selectedElementAuditByClient = state.selectedElementAuditByClient || {};
  state.selectedElementAuditByClient[currentClientId] = audit.id;
  if (!saveCurrentElementAudit(audit)) return;
  element();
}

function elementAuditHasDraftContent(audit) {
  if (!audit) return false;
  return Boolean(
    String(audit.month || '').trim() ||
    String(audit.invoiceNumber || '').trim() ||
    String(audit.invoiceDate || '').trim() ||
    String(audit.sourceInvoiceTotal || '').trim() ||
    String(audit.invoicePdfName || '').trim() ||
    String(audit.invoicePdfDataUrl || '').trim() ||
    String(audit.csvFileName || '').trim() ||
    (Array.isArray(audit.elementRecords) && audit.elementRecords.length) ||
    (Array.isArray(audit.maintenanceReview) && audit.maintenanceReview.length) ||
    (Array.isArray(audit.tollReview) && audit.tollReview.length) ||
    (Array.isArray(audit.unmatchedReviewRecords) && audit.unmatchedReviewRecords.length) ||
    (Array.isArray(audit.unmatchedTollReviewRecords) && audit.unmatchedTollReviewRecords.length)
  );
}

function createEmptyElementAuditDraft(month = '') {
  const client = selectedClient();
  return {
    id: createElementAuditId(),
    clientId: currentClientId,
    clientName: client.company,
    shortCode: client.shortCode,
    station: client.station,
    month,
    invoiceNumber: '',
    invoiceDate: '',
    sourceInvoiceTotal: '',
    pdfMaintenanceDetailTotal: '',
    elementRecords: [],
    maintenanceReview: [],
    tollReview: [],
    unmatchedReviewRecords: [],
    unmatchedTollReviewRecords: [],
    createdAt: new Date().toISOString()
  };
}

function startNewElementAudit() {
  const current = currentElementAudit();
  if (elementAuditHasDraftContent(current)) {
    if (!current.invoiceNumber || !current.invoiceDate || !current.month) {
      alert('Complete the current audit month, invoice number, and invoice date before archiving it.');
      return;
    }
    if (!saveCurrentElementAudit(current)) return;
  }
  const month = window.prompt('Enter the new audit month (for example, November 2026):');
  if (month == null || !month.trim()) return;
  const client = selectedClient();
  const existingAudit = elementAuditList().find(item =>
    elementAuditMonthKey(item.clientId, item.month) ===
      elementAuditMonthKey(currentClientId, month)
  );
  if (existingAudit) {
    if (window.confirm('An audit already exists for ' + client.company + ' in ' + month.trim() +
        '. Open that saved audit instead of creating or replacing it?')) {
      changeElementAudit(existingAudit.id);
    }
    return;
  }
  if (!window.confirm('Archive the current audit and start a clean Element audit for ' +
      client.company + ', ' + month.trim() + '? The current month will be saved in Audit History; ' +
      'the new draft will not carry over charges, files, or review entries.')) {
    return;
  }
  const previous = current;
  const previousSelectedAuditId = state.selectedElementAuditByClient &&
    state.selectedElementAuditByClient[currentClientId];
  const audit = createEmptyElementAuditDraft(month.trim());
  state.activeElementAuditByClient = state.activeElementAuditByClient || {};
  state.activeElementAuditByClient[currentClientId] = audit;
  state.selectedElementAuditByClient = state.selectedElementAuditByClient || {};
  state.selectedElementAuditByClient[currentClientId] = audit.id;
  try {
    save();
  } catch (error) {
    if (previous) state.activeElementAuditByClient[currentClientId] = previous;
    else delete state.activeElementAuditByClient[currentClientId];
    if (previousSelectedAuditId) state.selectedElementAuditByClient[currentClientId] = previousSelectedAuditId;
    else delete state.selectedElementAuditByClient[currentClientId];
    console.error('Unable to save the new Element audit workspace in browser storage.', error);
    alert('The new Element audit workspace could not be saved in browser storage. The prior workspace was retained.');
    return;
  }
  element();
}

function clearCurrentElementDraft() {
  const current = currentElementAudit();
  if (!current) {
    alert('There is no active Element draft to clear.');
    return;
  }
  const savedAudit = state.elementAudits.find(audit => audit.id === current.id);
  if (savedAudit) {
    if (!window.confirm('This audit is saved in Audit History and will not be deleted. Discard only unsaved changes and reload the saved audit?')) {
      return;
    }
    state.activeElementAuditByClient[currentClientId] = cloneElementAudit(savedAudit);
    try {
      save();
    } catch (error) {
      state.activeElementAuditByClient[currentClientId] = current;
      console.error('Unable to reload the saved Element audit.', error);
      alert('The saved audit remains intact, but the active workspace could not be reloaded.');
      return;
    }
    element();
    return;
  }
  const warning = elementAuditHasDraftContent(current)
    ? 'This will discard unsaved Element data, review entries, and any active draft file references. Saved Audit History will not be affected. Continue?'
    : 'Reset the active Element form? Saved Audit History will not be affected.';
  if (!window.confirm(warning)) return;
  const previousSelectedAuditId = state.selectedElementAuditByClient &&
    state.selectedElementAuditByClient[currentClientId];
  state.activeElementAuditByClient[currentClientId] = createEmptyElementAuditDraft();
  if (state.selectedElementAuditByClient) delete state.selectedElementAuditByClient[currentClientId];
  try {
    save();
  } catch (error) {
    state.activeElementAuditByClient[currentClientId] = current;
    if (previousSelectedAuditId) {
      state.selectedElementAuditByClient[currentClientId] = previousSelectedAuditId;
    }
    console.error('Unable to clear the active Element draft.', error);
    alert('The active Element draft could not be cleared in browser storage. Existing data was retained.');
    return;
  }
  element();
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
  return '<div class="panel" id="elementAuditHistory" style="margin-top:14px"><h2>Audit History</h2>' +
    '<p class="muted">Saved audits are stored in this browser only; local history is not shared with other team members or synced across computers. Use Export Backup to retain a portable copy. Attached PDFs are included only when saved in browser storage and the backup.</p>' +
    '<div class="toolbar"><button type="button" class="btn secondary" id="exportElementAuditBackup">Export Backup</button>' +
    '<button type="button" class="btn secondary" id="restoreElementAuditBackup">Restore Backup</button>' +
    '<input id="elementAuditBackupFile" type="file" accept=".json,application/json" hidden></div>' +
    (rows ? '<div class="table"><table><thead><tr><th>Client</th><th>Audit Month</th><th>Invoice Number</th><th>Invoice Date</th><th>Invoice Total</th><th>Calculated CSV Total</th><th>Difference</th><th>Reconciliation</th><th>Maintenance Review</th><th>Toll Review</th><th>Action</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' : '<p class="muted">No saved audits for this client yet.</p>') + '</div>';
}

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

function setElementTableSort(value) {
  const [tableName, key] = value.split(':');
  state.elementAuditSort = state.elementAuditSort || {};
  const previous = state.elementAuditSort[tableName];
  state.elementAuditSort[tableName] = {
    key,
    direction: previous && previous.key === key && previous.direction === 'asc' ? 'desc' : 'asc'
  };
  element();
}

function filterElementRows(input, selector) {
  const query = input.value.trim().toLowerCase();
  document.querySelectorAll(selector).forEach(row => {
    row.hidden = !String(row.dataset.filterText || '').includes(query);
    if (row.classList.contains('element-source-row')) {
      const detail = document.querySelector('[data-source-detail-row="' + row.dataset.sourceIndex + '"]');
      if (detail) detail.hidden = row.hidden || !detail.dataset.expanded;
    }
  });
}

function deliverableCategoryHtml(audit, category, title) {
  const items = elementChargeItems(audit, category);
  if (!items.length) return '';
  const total = items.reduce((sum, item) => sum + item.cost, 0);
  return '<h4>' + esc(title) + '</h4><div class="table"><table><thead><tr><th>VIN</th><th>Description</th><th>Cost</th></tr></thead><tbody>' +
    items.map(item => '<tr><td>' + esc(item.vin) + '</td><td>' + esc(item.description) + '</td><td>' + esc(formatMoney(item.cost)) + '</td></tr>').join('') +
    '<tr><th colspan="2">TOTAL</th><th>' + esc(formatMoney(total)) + '</th></tr></tbody></table></div>';
}

function maintenanceDeliverableSummary(audit) {
  const rows = ensureMaintenanceReviewFromElement(audit);
  const summary = maintenanceReviewSummary(audit);
  return {
    billed: summary.totalCharges,
    reviewedApproved: summary.approved,
    pending: summary.pending,
    difference: summary.totalDifference,
    pendingStatus: rows.some(row => normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Pending Review' || row.reviewedAmount === '')
  };
}

function deliverableHtml(audit) {
  if (!audit) return '<p class="muted">Upload Element data to build the client deliverable.</p>';
  const totals = elementSummary(audit);
  const review = maintenanceDeliverableSummary(audit);
  const categoryCards = [
    ['Lease Charges', totals.lease], ['Maintenance Charges', totals.maintenance],
    ['Uncategorized Charges', totals.uncategorized], ['Ticket / Toll', totals.ticket],
    ['Credits', totals.credits], ['Tax Rental', totals.taxRental], ['Other Charges', totals.other],
    ['TOTAL', totals.total]
  ];
  return '<div class="cards">' + categoryCards.map(([label, value]) =>
    '<div class="card"><div class="muted">' + esc(label) + '</div><div class="num">' + esc(formatMoney(value)) + '</div></div>'
  ).join('') + '</div>' +
    elementReconciliationHtml(audit, false) +
    deliverableCategoryHtml(audit, 'maintenance', 'Maintenance Charges') +
    deliverableCategoryHtml(audit, 'ticket', 'Ticket / Toll') +
    deliverableCategoryHtml(audit, 'uncategorized', 'Uncategorized Charges') +
    deliverableCategoryHtml(audit, 'credits', 'Credits') +
    deliverableCategoryHtml(audit, 'other', 'Other Charges') +
    '<div class="panel" style="margin-top:12px"><h3>Maintenance Review (separate from Element billed totals)</h3>' +
    (review.pendingStatus ? '<div class="notice">Maintenance Review Pending</div>' : '') +
    '<p>Element Maintenance Billed: <strong>' + esc(formatMoney(review.billed)) +
    '</strong> &nbsp; Reviewed / Approved Amount: <strong>' + esc(formatMoney(review.reviewedApproved)) +
    '</strong> &nbsp; Pending Review: <strong>' + esc(formatMoney(review.pending)) +
    '</strong> &nbsp; Maintenance Difference: <strong>' + esc(formatMoney(review.difference)) + '</strong></p></div>';
}

function clientReportHtml(audit) {
  const selected = selectedClient();
  const client = {
    company: audit.clientName || selected.company,
    shortCode: audit.shortCode || selected.shortCode,
    station: audit.station || selected.station
  };
  const totals = elementSummary(audit);
  const sourceTotal = elementSourceInvoiceTotal(audit);
  const calculatedTotal = totals.total;
  const difference = sourceTotal == null ? null : calculatedTotal - sourceTotal;
  const maintenanceVariance = elementMaintenanceVariance(audit);
  const maintenanceSummary = maintenanceReviewSummary(audit);
  const review = maintenanceDeliverableSummary(audit);
  const tollSummary = tollReviewSummary(audit);
  const tollRows = ensureTollReviewFromElement(audit);
  const missingInformation = [];
  if (!audit.month) missingInformation.push('Audit month');
  if (!audit.invoiceNumber) missingInformation.push('Invoice number');
  if (!audit.invoiceDate) missingInformation.push('Invoice date');
  if (sourceTotal == null) missingInformation.push('Element invoice total');
  if (!elementAuditRecords(audit).length) missingInformation.push('Element invoice CSV/CDV records');
  const auditStatus = sourceTotal == null
    ? 'Missing invoice total'
    : Math.abs(difference) < 0.01 ? 'Balanced' : 'Variance';
  const pivot = elementPivot(audit);
  const pivotRows = pivot.map(row => '<tr><td>' + esc(row.vin) + '</td>' +
    [row.ticket, row.lease, row.maintenance, row.uncategorized, row.credits, row.taxRental, row.other, row.total]
      .map(value => '<td>' + esc(formatMoney(value)) + '</td>').join('') + '</tr>').join('');
  const detailTable = (title, category) => {
    const items = elementChargeItems(audit, category);
    if (!items.length) return '';
    return '<h3>' + esc(title) + '</h3><table><thead><tr><th>VIN</th><th>Description</th><th>Cost</th></tr></thead><tbody>' +
      items.map(item => '<tr><td>' + esc(item.vin) + '</td><td>' + esc(item.description) + '</td><td>' + esc(formatMoney(item.cost)) + '</td></tr>').join('') +
      '<tr><th colspan="2">TOTAL</th><th>' + esc(formatMoney(items.reduce((sum, item) => sum + item.cost, 0))) + '</th></tr></tbody></table>';
  };
  const reviewRows = ensureMaintenanceReviewFromElement(audit);
  return '<!doctype html><html><head><meta charset="utf-8"><title>Element Audit - ' + esc(audit.month) +
    '</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:32px}h1,h2,h3{color:#111827}table{border-collapse:collapse;width:100%;margin:10px 0 22px}th,td{border:1px solid #d8dee8;padding:7px;text-align:left}th{background:#f3f4f6}.toolbar{margin-bottom:20px}.btn{padding:9px 14px;background:#2563eb;color:white;border:0;border-radius:5px;cursor:pointer}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{border:1px solid #d8dee8;padding:12px}.muted{color:#667085}@media print{.toolbar{display:none}body{margin:10mm}}</style></head><body>' +
    '<div class="toolbar"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>' +
    '<h1>Element Invoice Audit</h1><p><strong>Client:</strong> ' + esc(client.company) + '<br><strong>Short Code:</strong> ' + esc(client.shortCode) +
    '<br><strong>Station:</strong> ' + esc(client.station) + '<br><strong>Audit Month:</strong> ' + esc(audit.month) +
    '<br><strong>Invoice Number:</strong> ' + esc(audit.invoiceNumber) + '<br><strong>Invoice Date:</strong> ' + esc(audit.invoiceDate) +
    '<br><strong>Invoice Total:</strong> ' + esc(sourceTotal == null ? 'MISSING — enter the total from the Element invoice PDF' : formatMoney(sourceTotal)) + '</p>' +
    '<h2>Element Invoice Charges Summary</h2><div class="summary">' +
    [['Lease Charges', totals.lease], ['Maintenance Charges', totals.maintenance], ['Uncategorized Charges', totals.uncategorized],
      ['Ticket / Toll', totals.ticket], ['Credits', totals.credits], ['Tax Rental', totals.taxRental],
      ['Other Charges', totals.other], ['TOTAL', totals.total]].map(([label, value]) =>
      '<div class="card"><strong>' + esc(label) + '</strong><br>' + esc(formatMoney(value)) + '</div>').join('') + '</div>' +
    '<h2>Element Pivot Summary</h2><table><thead><tr><th>VIN</th><th>Ticket / Toll</th><th>Lease Charges</th><th>Maintenance Charges</th><th>Uncategorized Charges</th><th>Credits</th><th>Tax Rental</th><th>Other Charges</th><th>Total Charges</th></tr></thead><tbody>' +
    pivotRows + '<tr><th>TOTAL</th>' + [totals.ticket, totals.lease, totals.maintenance, totals.uncategorized, totals.credits, totals.taxRental, totals.other, totals.total]
      .map(value => '<th>' + esc(formatMoney(value)) + '</th>').join('') + '</tr></tbody></table>' +
    '<h2>Maintenance Review Summary</h2>' +
    (review.pendingStatus ? '<p><strong>Maintenance Review Pending</strong></p>' : '') +
    '<p>Element Maintenance Billed: ' + esc(formatMoney(review.billed)) +
    ' | Reviewed / Approved Amount: ' + esc(formatMoney(review.reviewedApproved)) +
    ' | Pending Review: ' + esc(formatMoney(review.pending)) +
    ' | Difference: ' + esc(formatMoney(review.difference)) + '</p>' +
    '<p>Reviewed Amount: ' + esc(formatMoney(maintenanceSummary.reviewed)) +
    ' | Approved: ' + esc(formatMoney(maintenanceSummary.approved)) +
    ' | Disputed: ' + esc(formatMoney(maintenanceSummary.disputed)) + '</p>' +
    '<h3>Maintenance Details</h3><table><thead><tr><th>VIN</th><th>Description</th><th>Element Charge</th><th>Reviewed Amount</th><th>Difference</th><th>Status</th><th>Notes</th></tr></thead><tbody>' +
    (reviewRows.length ? reviewRows.map(row => '<tr><td>' + esc(row.vin) + '</td><td>' + esc(row.maintenanceDescription) +
      '</td><td>' + esc(formatMoney(row.elementCharge)) + '</td><td>' + esc(row.reviewedAmount === '' ? '' : formatMoney(row.reviewedAmount)) +
      '</td><td>' + esc(row.difference === '' ? '' : formatMoney(row.difference)) +
      '</td><td>' + esc(row.reviewStatus) + '</td><td>' + esc(row.reviewNotes) + '</td></tr>').join('') :
      '<tr><td colspan="7">No maintenance charges.</td></tr>') + '</tbody></table>' +
    '<h2>Toll Review Summary</h2>' +
    (tollRows.some(row => normalizeMaintenanceReviewStatus(row.reviewStatus) === 'Pending Review' ||
      row.reviewedAmount === '' || row.reviewedAmount == null)
      ? '<p><strong>Toll Review Pending</strong></p>' : '') +
    '<p>Element Toll Billed: ' + esc(formatMoney(tollSummary.billed)) +
    ' | Reviewed Amount: ' + esc(formatMoney(tollSummary.reviewed)) +
    ' | Approved: ' + esc(formatMoney(tollSummary.approved)) +
    ' | Pending Review: ' + esc(formatMoney(tollSummary.pending)) +
    ' | Disputed: ' + esc(formatMoney(tollSummary.disputed)) +
    ' | Total Difference: ' + esc(formatMoney(tollSummary.difference)) + '</p>' +
    '<h3>Toll Review Details</h3><table><thead><tr><th>VIN</th><th>Unit</th><th>Client Asset ID</th>' +
    '<th>Description</th><th>Element Charge</th><th>Reviewed Amount</th><th>Difference</th><th>Status</th><th>Notes</th></tr></thead><tbody>' +
    (tollRows.length ? tollRows.map(row => '<tr><td>' + esc(row.vin) + '</td><td>' + esc(row.unit) +
      '</td><td>' + esc(row.clientAssetId) + '</td><td>' + esc(row.description) +
      '</td><td>' + esc(formatMoney(row.elementCharge)) + '</td><td>' +
      esc(row.reviewedAmount === '' || row.reviewedAmount == null ? '' : formatMoney(row.reviewedAmount)) +
      '</td><td>' + esc(row.difference === '' ? '' : formatMoney(row.difference)) +
      '</td><td>' + esc(row.reviewStatus) + '</td><td>' + esc(row.reviewNotes) + '</td></tr>').join('') :
      '<tr><td colspan="9">No Element Ticket / Toll charges.</td></tr>') + '</tbody></table>' +
    detailTable('Ticket / Toll Details', 'ticket') +
    detailTable('Uncategorized Charges', 'uncategorized') +
    detailTable('Credits', 'credits') +
    detailTable('Other Charges', 'other') +
    '<h2>Element Invoice Reconciliation</h2><p>Calculated Element Total: ' + esc(formatMoney(calculatedTotal)) +
    '<br>Element Invoice Total: ' + esc(sourceTotal == null ? 'MISSING' : formatMoney(sourceTotal)) +
    '<br>Difference: ' + esc(difference == null ? 'Not calculated — invoice total is missing' : formatMoney(difference)) +
    '<br>Audit Status: ' + esc(auditStatus) + '</p>' +
    (maintenanceVariance ? '<h2>Maintenance Source Verification</h2><p>CSV maintenance category: ' +
      esc(formatMoney(maintenanceVariance.csvTotal)) + '<br>PDF maintenance detail total: ' +
      esc(formatMoney(maintenanceVariance.pdfDetailTotal)) + '<br>Difference (PDF − CSV): ' +
      esc(formatMoney(maintenanceVariance.difference)) +
      '<br>' + esc(maintenanceVariance.source) +
      '<br>This source-level variance is unresolved and does not change billed or reviewed amounts.</p>' : '') +
    (missingInformation.length ? '<div class="notice"><strong>Missing information:</strong> ' + esc(missingInformation.join(', ')) + '</div>' : '') +
    '</body></html>';
}

function generateClientReport() {
  const audit = currentElementAudit();
  if (!audit) {
    alert('Upload Element invoice data before generating the client report.');
    return;
  }
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    alert('The client report tab was blocked. Allow pop-ups for this application and try again.');
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(clientReportHtml(audit));
  reportWindow.document.close();
}

function syncElementAuditDraft() {
  const month = $('elementAuditMonth').value.trim();
  const invoiceNumber = $('elementInvoiceNumber').value.trim();
  let audit = currentElementAudit();
  if (!audit && !month && !invoiceNumber) return;
  if (!audit) {
    const client = selectedClient();
    audit = {
      id: createElementAuditId(),
      clientId: currentClientId,
      clientName: client.company,
      shortCode: client.shortCode,
      month: '',
      invoiceNumber: '',
      invoiceDate: '',
      sourceInvoiceTotal: '',
      pdfMaintenanceDetailTotal: '',
      elementRecords: [],
      maintenanceReview: [],
      unmatchedReviewRecords: []
    };
    state.activeElementAuditByClient = state.activeElementAuditByClient || {};
    state.activeElementAuditByClient[currentClientId] = audit;
  }
  audit.month = month;
  audit.invoiceNumber = invoiceNumber;
  audit.invoiceDate = $('elementInvoiceDate').value;
  audit.sourceInvoiceTotal = $('elementInvoiceTotal').value.trim();
  const previousPdfDetailTotal = audit.pdfMaintenanceDetailTotal == null
    ? ''
    : String(audit.pdfMaintenanceDetailTotal);
  audit.pdfMaintenanceDetailTotal = $('pdfMaintenanceDetailTotal')
    ? $('pdfMaintenanceDetailTotal').value.trim()
    : audit.pdfMaintenanceDetailTotal || '';
  if (audit.pdfMaintenanceDetailTotal && audit.pdfMaintenanceDetailTotal !== previousPdfDetailTotal) {
    audit.pdfMaintenanceDetailSource = 'Entered by fleet team for source verification.';
  }
  try {
    save();
  } catch (error) {
    console.error('Unable to save the active Element audit workspace.', error);
    alert('The active Element audit could not be saved in browser storage. Export a backup and check available browser storage.');
  }
  const reconciliationPanel = $('elementReconciliation');
  if (reconciliationPanel) {
    reconciliationPanel.innerHTML = elementReconciliationHtml(audit);
    const maintenanceDetailInput = $('pdfMaintenanceDetailTotal');
    if (maintenanceDetailInput) maintenanceDetailInput.addEventListener('change', syncElementAuditDraft);
  }
}

function element() {
  setTitle('Element Invoice Audit', 'Audit only the records and charges contained in the Element invoice.');
  const audits = elementAuditList();
  const audit = currentElementAudit();
  if (audit) ensureMaintenanceReviewFromElement(audit);
  if (audit) ensureTollReviewFromElement(audit);
  const reviewSummary = audit ? maintenanceReviewSummary(audit) : { totalCharges: 0, pending: 0, reviewed: 0, approved: 0, disputed: 0, totalDifference: 0 };
  const tollSummary = audit ? tollReviewSummary(audit) : {
    billed: 0, reviewed: 0, approved: 0, pending: 0, disputed: 0, difference: 0
  };
  const selectedAuditId = audit && audit.id;
  const savedAuditIds = new Set(audits.map(item => item.id));
  $('content').innerHTML =
    '<div class="panel"><h2>1. ELEMENT INVOICE</h2>' +
    '<div class="toolbar"><button type="button" class="btn" id="saveElementAudit">Save Audit</button>' +
    '<button type="button" class="btn secondary" id="startNewElementAudit">Archive &amp; Start New Month</button>' +
    '<button type="button" class="btn secondary" id="clearCurrentElementDraft">Clear Current Draft</button>' +
    '<button type="button" class="btn secondary" id="showElementAuditHistory">Audit History</button>' +
    (audits.length ? '<label>Saved audit <select id="elementAuditSelect">' +
      (audit && !savedAuditIds.has(audit.id) ? '<option value="' + esc(audit.id) + '" selected>' +
        esc((audit.month || 'Untitled') + ' — ' + (audit.invoiceNumber || 'No invoice') + ' (Draft)') + '</option>' : '') +
      audits.map(item => '<option value="' + esc(item.id) + '"' + (item.id === selectedAuditId ? ' selected' : '') + '>' +
        esc(item.month + ' — ' + item.invoiceNumber) + '</option>').join('') + '</select></label>' : '') +
    '<div class="field"><label>Audit Month</label><input id="elementAuditMonth" value="' + esc(audit && audit.month || '') + '" placeholder="October 2026"></div>' +
    '<div class="field"><label>Invoice Number</label><input id="elementInvoiceNumber" value="' + esc(audit && audit.invoiceNumber || '') + '"></div>' +
    '<div class="field"><label>Invoice Date</label><input id="elementInvoiceDate" type="date" value="' + esc(audit && audit.invoiceDate || '') + '"></div>' +
    '<div class="field"><label>Invoice Total (from Element PDF)</label><input id="elementInvoiceTotal" type="number" step="0.01" value="' +
      esc(audit && audit.sourceInvoiceTotal != null ? audit.sourceInvoiceTotal : '') + '"></div>' +
    '</div>' +
    '<div class="drop" style="margin-bottom:12px">Element PDF invoice<br><input id="elementInvoicePdf" type="file" accept=".pdf,application/pdf">' +
    (audit && audit.invoicePdfName ? '<div class="small">Attached to this audit: ' + esc(audit.invoicePdfName) +
      (audit.invoicePdfDataUrl ? ' <a href="' + esc(audit.invoicePdfDataUrl) + '" download="' + esc(audit.invoicePdfName) + '">Open / download PDF</a>' : '') +
      '</div>' : '') +
    '<div class="small">Use the PDF as the invoice reference and enter its invoice total above.</div></div>' +
    '<div class="drop">Upload Element CSV / CDV<br><input id="elementInvoiceFile" type="file" accept=".csv,.txt,.cdv"></div>' +
    '<p class="muted">Element invoice data is the source of truth for audit vehicles and charges. Amazon fleet records are not used here.</p>' +
    '<div id="elementReconciliation">' + elementReconciliationHtml(audit) + '</div>' +
    '<div class="toolbar" style="margin-top:12px"><input id="elementInvoiceSearch" placeholder="Search Element invoice records"></div>' +
    elementInvoiceTableHtml(audit) + '</div>' +
    '<div class="panel" style="margin-top:14px"><h2>2. ELEMENT PIVOT</h2>' +
    '<div class="toolbar"><input id="elementPivotSearch" placeholder="Search VIN-level pivot"></div>' +
    elementPivotTableHtml(audit) + '</div>' +
    '<div class="panel" style="margin-top:14px"><h2>3. MAINTENANCE REVIEW</h2>' +
    '<div class="toolbar"><button class="btn" id="downloadMaintenanceReview">Download Maintenance Review</button>' +
    '<button class="btn secondary" id="uploadCompletedMaintenanceReview">Upload Completed Maintenance Review</button>' +
    '<input id="maintenanceReviewFile" type="file" accept=".csv,.xlsx,.xls" hidden></div>' +
    '<div class="cards"><div class="card"><div class="muted">Maintenance Charges</div><div class="num">' + formatMoney(reviewSummary.totalCharges) + '</div></div>' +
    '<div class="card"><div class="muted">Pending Review</div><div class="num">' + formatMoney(reviewSummary.pending) + '</div></div>' +
    '<div class="card"><div class="muted">Reviewed Amount</div><div class="num">' + formatMoney(reviewSummary.reviewed) + '</div></div>' +
    '<div class="card"><div class="muted">Approved</div><div class="num">' + formatMoney(reviewSummary.approved) + '</div></div>' +
    '<div class="card"><div class="muted">Disputed</div><div class="num">' + formatMoney(reviewSummary.disputed) + '</div></div>' +
    '<div class="card"><div class="muted">Reviewed Difference</div><div class="num">' + formatMoney(reviewSummary.totalDifference) + '</div></div></div>' +
    '<div class="notice">Review amounts are separate from the original Element charges and invoice total.</div>' +
    maintenanceReviewTableHtml(audit) +
    (audit && audit.unmatchedReviewRecords && audit.unmatchedReviewRecords.length ?
      '<h3>Unmatched Review Records</h3><div class="table"><table><thead><tr><th>VIN</th><th>Client Asset ID</th><th>Description</th><th>Element Charge</th><th>Review Status</th><th>Notes</th><th>Reason</th></tr></thead><tbody>' +
      audit.unmatchedReviewRecords.map(entry => '<tr><td>' + esc(entry.vin) + '</td><td>' + esc(entry.clientAssetId) + '</td><td>' +
        esc(entry.maintenanceDescription) + '</td><td>' + esc(entry.elementCharge) + '</td><td>' + esc(entry.reviewStatus) + '</td><td>' + esc(entry.reviewNotes) +
        '</td><td>' + esc(entry.conflictReason || 'No matching maintenance charge found.') + '</td></tr>').join('') +
      '</tbody></table></div>' : '') + '</div>' +
    '<div class="panel" style="margin-top:14px"><h2>4. TOLL REVIEW</h2>' +
    '<div class="toolbar"><button type="button" class="btn" id="downloadTollReview">Download Toll Review</button>' +
    '<button type="button" class="btn secondary" id="uploadCompletedTollReview">Upload Completed Toll Review</button>' +
    '<input id="tollReviewFile" type="file" accept=".csv,.xlsx,.xls" hidden></div>' +
    '<div class="cards"><div class="card"><div class="muted">Element Toll Billed</div><div class="num">' + formatMoney(tollSummary.billed) + '</div></div>' +
    '<div class="card"><div class="muted">Reviewed Amount</div><div class="num">' + formatMoney(tollSummary.reviewed) + '</div></div>' +
    '<div class="card"><div class="muted">Approved</div><div class="num">' + formatMoney(tollSummary.approved) + '</div></div>' +
    '<div class="card"><div class="muted">Pending Review</div><div class="num">' + formatMoney(tollSummary.pending) + '</div></div>' +
    '<div class="card"><div class="muted">Disputed</div><div class="num">' + formatMoney(tollSummary.disputed) + '</div></div>' +
    '<div class="card"><div class="muted">Total Difference</div><div class="num">' + formatMoney(tollSummary.difference) + '</div></div></div>' +
    '<div class="notice">Toll review values are separate from the original Element billed charges and invoice reconciliation.</div>' +
    tollReviewTableHtml(audit) +
    (audit && audit.unmatchedTollReviewRecords && audit.unmatchedTollReviewRecords.length ?
      '<h3>Unmatched Toll Review Records</h3><div class="table"><table><thead><tr><th>VIN</th><th>Element Charge</th><th>Reviewed Amount</th><th>Status</th><th>Notes</th><th>Reason</th></tr></thead><tbody>' +
      audit.unmatchedTollReviewRecords.map(row => '<tr><td>' + esc(row.vin) + '</td><td>' +
        esc(row['Element Charge'] || row.elementCharge || '') + '</td><td>' +
        esc(row['Reviewed Amount'] || row.reviewedAmount || '') + '</td><td>' +
        esc(row['Review Status'] || row.reviewStatus || '') + '</td><td>' +
        esc(row['Review Notes'] || row.reviewNotes || '') + '</td><td>' +
        esc(row.conflictReason || 'No matching Element Ticket / Toll charge found.') + '</td></tr>').join('') +
      '</tbody></table></div>' : '') + '</div>' +
    '<div class="panel" style="margin-top:14px"><h2>5. DELIVERABLE</h2>' +
    (audit ? deliverableHtml(audit) : '<p class="muted">Upload Element invoice data to build the client deliverable.</p>') + '</div>' +
    '<div class="panel" style="margin-top:14px;text-align:right"><button type="button" class="btn" id="generateClientReport">Generate Client Report</button></div>' +
    elementAuditHistoryHtml();
  if ($('downloadMaintenanceReview')) {
    $('downloadMaintenanceReview').addEventListener('click', exportMaintenanceReviewWorkbook);
  }
  if ($('uploadCompletedMaintenanceReview')) {
    $('uploadCompletedMaintenanceReview').addEventListener('click', () => $('maintenanceReviewFile').click());
  }
  if ($('maintenanceReviewFile')) {
    $('maintenanceReviewFile').addEventListener('change', event => parseMaintenanceReviewFile(event.target.files[0]));
  }
  if ($('downloadTollReview')) {
    $('downloadTollReview').addEventListener('click', exportTollReviewWorkbook);
  }
  if ($('uploadCompletedTollReview')) {
    $('uploadCompletedTollReview').addEventListener('click', () => $('tollReviewFile').click());
  }
  if ($('tollReviewFile')) {
    $('tollReviewFile').addEventListener('change', event => parseTollReviewFile(event.target.files[0]));
  }
  if ($('elementInvoiceFile')) {
    $('elementInvoiceFile').addEventListener('change', event => parseElementInvoiceFile(event.target.files[0]));
  }
  if ($('elementInvoicePdf')) {
    $('elementInvoicePdf').addEventListener('change', event => attachElementInvoicePdf(event.target.files[0]));
  }
  if ($('saveElementAudit')) {
    $('saveElementAudit').addEventListener('click', saveElementAuditDetails);
  }
  if ($('startNewElementAudit')) {
    $('startNewElementAudit').addEventListener('click', startNewElementAudit);
  }
  if ($('clearCurrentElementDraft')) {
    $('clearCurrentElementDraft').addEventListener('click', clearCurrentElementDraft);
  }
  if ($('showElementAuditHistory')) {
    $('showElementAuditHistory').addEventListener('click', () => {
      const history = $('elementAuditHistory');
      if (history) history.scrollIntoView({ behavior: 'smooth' });
    });
  }
  ['elementAuditMonth', 'elementInvoiceNumber', 'elementInvoiceDate', 'elementInvoiceTotal', 'pdfMaintenanceDetailTotal']
    .forEach(id => {
      if ($(id)) $(id).addEventListener('change', syncElementAuditDraft);
    });
  if ($('exportElementAuditBackup')) {
    $('exportElementAuditBackup').addEventListener('click', exportElementAuditBackup);
  }
  if ($('restoreElementAuditBackup')) {
    $('restoreElementAuditBackup').addEventListener('click', () => $('elementAuditBackupFile').click());
  }
  if ($('elementAuditBackupFile')) {
    $('elementAuditBackupFile').addEventListener('change', event => restoreElementAuditBackup(event.target.files[0]));
  }
  document.querySelectorAll('[data-open-element-audit]').forEach(button => {
    button.addEventListener('click', () => changeElementAudit(button.dataset.openElementAudit));
  });
  if ($('generateClientReport')) {
    $('generateClientReport').addEventListener('click', generateClientReport);
  }
  if ($('elementAuditSelect')) {
    $('elementAuditSelect').addEventListener('change', event => {
      changeElementAudit(event.target.value);
    });
  }
  document.querySelectorAll('[data-element-sort]').forEach(button => {
    button.addEventListener('click', () => setElementTableSort(button.dataset.elementSort));
  });
  if ($('elementInvoiceSearch')) {
    $('elementInvoiceSearch').addEventListener('input', event => filterElementRows(event.target, '.element-source-row'));
  }
  if ($('elementPivotSearch')) {
    $('elementPivotSearch').addEventListener('input', event => filterElementRows(event.target, '.element-pivot-row'));
  }
  document.querySelectorAll('[data-source-detail]').forEach(button => {
    button.addEventListener('click', () => {
      const detail = document.querySelector('[data-source-detail-row="' + button.dataset.sourceDetail + '"]');
      if (detail) {
        detail.dataset.expanded = String(!detail.hidden);
        detail.hidden = !detail.hidden;
      }
    });
  });
  document.querySelectorAll('[data-maintenance-review-field]').forEach(input => {
    input.addEventListener('change', () => {
      const audit = currentElementAudit();
      if (!audit) return;
      const row = ensureMaintenanceReviewFromElement(audit)[Number(input.dataset.index)];
      if (!row) return;
      const field = input.dataset.maintenanceReviewField;
      row[field] = input.value;
      if (field === 'reviewedAmount') {
        row.difference = input.value === '' ? '' : String(parseNumeric(row.reviewedAmount) - parseNumeric(row.elementCharge));
      } else if (field === 'difference') {
        row.difference = String(parseNumeric(row.reviewedAmount) - parseNumeric(row.elementCharge));
      }
      try {
        save();
      } catch (error) {
        console.error('Unable to persist the maintenance review change.', error);
        alert('The review change is visible in this workspace but could not be saved in browser storage. Export a backup and check available storage.');
      }
      element();
    });
  });
  document.querySelectorAll('[data-toll-review-field]').forEach(input => {
    input.addEventListener('change', () => {
      const audit = currentElementAudit();
      if (!audit) return;
      const row = ensureTollReviewFromElement(audit)[Number(input.dataset.index)];
      if (!row) return;
      const field = input.dataset.tollReviewField;
      row[field] = input.value;
      if (field === 'reviewedAmount') {
        row.difference = input.value === ''
          ? ''
          : String(roundCurrency(parseNumeric(input.value) - parseNumeric(row.elementCharge)));
      }
      try {
        save();
      } catch (error) {
        console.error('Unable to persist the toll review change.', error);
        alert('The toll review change is visible in this workspace but could not be saved in browser storage. Export a backup and check available storage.');
      }
      element();
    });
  });
}

function leaseplan() {
  setTitle('LeasePlan / Wheels Audit', 'PDF summary → verification → completion.');
  $('content').innerHTML = '<div class="panel"><h3>1. Invoice PDF</h3><div class="drop">Choose LeasePlan PDF<br><input type="file" accept=".pdf"></div><div class="notice">The production version will extract the five categories from the PDF. For now, enter/verify the amounts below.</div></div>' +
    '<div class="grid2" style="margin-top:14px"><div class="panel"><h3>2. Charge Summary</h3>' +
    form([['month', 'Invoice Month'], ['lease', 'Lease Charges'], ['maintenance', 'Maintenance Charges'], ['tolls', 'Tolls'], ['misc', 'Misc Charges'], ['credit', 'Credits'], ['total', 'PDF Total']], 'saveLease') +
    '</div><div class="panel"><h3>3. SOP Checklist</h3>' +
    check(['Invoice exported / saved', 'Summary includes Lease, Maintenance, Tolls, Misc and Credit', 'Summary total matches PDF', 'Maintenance VINs / descriptions / costs reviewed', 'Toll VINs / amounts reviewed', 'Credits and Misc communicated', 'Lease charge count checked', 'Audit marked complete and client email sent']) +
    '</div></div>';
}

function saveLease() {
  const record = { clientId: currentClientId };
  ['month', 'lease', 'maintenance', 'tolls', 'misc', 'credit', 'total'].forEach(key => {
    record[key] = $('f_' + key).value;
  });
  state.leaseAudits.push(record);
  save();
  alert('LeasePlan audit saved.');
  go('dashboard');
}

function legacy() {
  setTitle('Original Data', 'The original workbook data is preserved here while the new modules are being built.');
  const names = Object.keys(seed);
  $('content').innerHTML = '<div class="tabs">' + names.map((name, index) =>
    '<button data-i="' + index + '">' + esc(name) + '</button>'
  ).join('') + '</div><div id="legacyPanel"></div>';
  document.querySelectorAll('.tabs button').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    $('legacyPanel').innerHTML = workbookTable(clientSheet(names[Number(button.dataset.i)]));
  }));
  document.querySelector('.tabs button').click();
}

const views = {
  dashboard, clients, fleet, rentals, maintenance, invoices, fif, tolls, pave,
  recalls, element, leaseplan, actions, legacy
};

function go(view) {
  currentView = view;
  document.querySelectorAll('.nav button').forEach(button =>
    button.classList.toggle('active', button.dataset.view === view)
  );
  views[view]();
}

function initializeApplication() {
  renderClientSelector();
  $('clientSelect').addEventListener('change', event => {
    currentClientId = event.target.value;
    state.selectedClientId = currentClientId;
    save();
    go(currentView === 'vehicleEdit' ? 'fleet' : currentView);
  });
  document.querySelectorAll('.nav button').forEach(button =>
    button.addEventListener('click', () => go(button.dataset.view))
  );
  go('dashboard');
}

initializeApplication();
