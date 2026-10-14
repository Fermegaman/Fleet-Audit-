/**
 * Show and add follow-up actions for the selected client.
 * Classic script module; shared services and state are loaded by index.html.
 */

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
