/**
 * List clients, show their details and create client workspaces.
 * Classic script module; shared services and state are loaded by index.html.
 */

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
    '<div class="panel" data-layout="space-top-14"><h3>Current Fleet</h3>' +
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
