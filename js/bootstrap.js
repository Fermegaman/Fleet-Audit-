/**
 * Start the app after every module has loaded. Keep this script last in index.html.
 * Classic script module; shared services and state are loaded by index.html.
 */

initializeState();
currentClientId = state.selectedClientId;
migrateElementAuditChargeCategories();
initializeApplication();
