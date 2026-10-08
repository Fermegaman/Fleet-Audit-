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
    if (!hasAmazonImport) vehicle.presentInLatestExport = false;
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
      return '<tr class="fleet-row' + (inactive ? ' inactive' : groundedActive ? ' grounded' : '') + '">' +
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
  const grounded = currentRecords.filter(isGrounded);
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
      if (incomingActive &&
          String(amazon.operationalStatus || '').trim().toUpperCase() === 'GROUNDED') {
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
    isActiveStatus(amazon.status) &&
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
    'Active vehicles in Amazon file: ' + (summary.activeVehicles == null ? summary.imported : summary.activeVehicles) +
    ' · Inactive vehicles in Amazon file: ' + (summary.inactiveVehicles || 0) +
    ' · Existing active vehicles updated: ' + (summary.existingActiveUpdated == null ? summary.updatedVehicles : summary.existingActiveUpdated) +
    ' · New active vehicles added: ' + (summary.newActiveAdded == null ? summary.newVehicles : summary.newActiveAdded) +
    ' · Grounded active vehicles: ' +
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
  const vehicle = clientFleet().find(record => normalizeVin(record.vin) === normalizedVin);
  if (!vehicle) return fleet();
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
          ? '<textarea id="manual-' + key + '" rows="3">' + value + '</textarea>'
          : yesNo
            ? '<select id="manual-' + key + '">' + yesNoHtml(rawValue) + '</select>'
            : key === 'status'
              ? '<select id="manual-' + key + '">' + manualStatusOptions(rawValue) + '</select>'
              : '<input id="manual-' + key + '" value="' + value + '"' +
                (key === 'dateGrounded' ? ' type="date"' : '') + '>') + '</div>';
    }).join('') +     '</div><div class="toolbar" style="margin-top:14px"><button class="btn" type="submit">Save Changes</button></div></form>' +
    renderGroundingHistory(vehicle);
  $('manualVehicleForm').addEventListener('submit', event => {
    event.preventDefault();
    const record = clientFleet().find(item => normalizeVin(item.vin) === normalizedVin);
    if (!record) return fleet();
    const previousManual = { ...record.manual };
    const updatedManual = { ...record.manual };
    MANUAL_FIELDS.forEach(([key]) => {
      updatedManual[key] = $('manual-' + key).value;
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

function element() {
  setTitle('Element Invoice Audit', 'Upload the source files, then work through the SOP checklist.');
  $('content').innerHTML = '<div class="grid2"><div class="panel"><h3>1. Source files</h3><div class="drop">Element PDF<br><input type="file" accept=".pdf"></div><br><div class="drop">Element CDV / CSV<br><input type="file" accept=".csv,.txt,.cdv"></div><div class="notice">The production build will read these files automatically. For now this screen is the workflow/checklist.</div></div><div class="panel"><h3>2. Audit checklist</h3>' +
    check(['Invoice ready by the 1st', 'Fleet export uploaded', 'Element invoice data processed', 'VIN matched to fleet', 'Amazon Lease / Amazon owned identified', 'Charges summarized', 'VIN-level review completed', 'Client review sent by the 15th', 'Maintenance charges sent to Element and marked pending']) +
    '</div></div><div class="panel" style="margin-top:14px"><h3>3. Audit record</h3>' +
    form([['month', 'Invoice Month'], ['total', 'Invoice Total'], ['status', 'Status'], ['notes', 'Notes']], 'saveElement') + '</div>';
}

function saveElement() {
  state.elementAudits.push({
    clientId: currentClientId,
    month: $('f_month').value,
    total: $('f_total').value,
    status: $('f_status').value,
    notes: $('f_notes').value
  });
  save();
  alert('Element audit saved.');
  go('dashboard');
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
