/**
 * Render Fleet & Grounded and connect its upload and manual-entry controls.
 * Classic script module; shared services and state are loaded by index.html.
 */

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
    '<div class="panel" data-layout="space-top-14"><h3>Grounded Vehicles</h3>' +
    fleetTable(grounded, 'groundedVehicles', GROUNDED_COLUMNS) + '</div>' +
    (noLongerPresent.length
      ? '<div class="panel" data-layout="space-top-14"><h3>Not Present in Latest Amazon Export</h3>' +
        '<p class="muted">These records are retained for history and are not included in the latest export.</p>' +
        fleetTable(noLongerPresent, 'missingFleetRecords') + '</div>'
      : '') +
    '<div class="panel" id="groundedForm" data-layout="space-top-14"><h3>Add grounded vehicle</h3>' +
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
