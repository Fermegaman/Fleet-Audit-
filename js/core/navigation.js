/**
 * Map sidebar destinations to page renderers and keep the active navigation state in sync.
 * Classic script module; shared services and state are loaded by index.html.
 */

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
