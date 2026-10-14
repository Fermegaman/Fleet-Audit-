/**
 * Read the active client, its fleet and its original workbook sheets. These helpers keep client boundaries consistent.
 * Classic script module; shared services and state are loaded by index.html.
 */

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
