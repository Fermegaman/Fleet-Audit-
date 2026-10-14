/**
 * Edit fleet-team fields and show grounding history without overwriting Amazon source values.
 * Classic script module; shared services and state are loaded by index.html.
 */

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
    '<form id="manualVehicleForm" class="panel" data-layout="space-top-14"><h3>FLEET TEAM INFORMATION</h3><div class="formgrid">' +
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
    }).join('') +     '</div><div class="toolbar" data-layout="space-top-14"><button class="btn" type="submit">Save Changes</button></div></form>' +
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
  return '<div class="panel" data-layout="space-top-14"><h3>GROUNDING HISTORY</h3><div class="table"><table><thead><tr>' +
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
