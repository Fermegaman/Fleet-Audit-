/**
 * Read the saved workspace once. Feature modules share this state so client selection and drafts stay consistent.
 * Classic script module; shared services and state are loaded by index.html.
 */

const seed = WORKBOOK_SEED;
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
let currentClientId;
let currentView = 'dashboard';
const fleetSortByClient = {};
function save() {
  state.selectedClientId = currentClientId;
  localStorage.setItem(KEY, JSON.stringify(state));
}
