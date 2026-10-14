/**
 * Summarize the selected client and render the dashboard shortcuts.
 * Classic script module; shared services and state are loaded by index.html.
 */

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
    '<div class="panel" data-layout="space-top-14"><h3>Current fleet</h3>' +
    fleetTable(fleet.slice(0, 20), 'dashboardFleet') + '</div>';
  wireFleetTable('dashboardFleet', fleet.slice(0, 20));
}
