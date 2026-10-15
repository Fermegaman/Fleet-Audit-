/**
 * Toggle the navigation rail without changing the active page.
 * Remember the preferred mode separately from fleet and audit data.
 */
(function initializeSidebar() {
  const app = document.querySelector('.app');
  const toggle = document.getElementById('sidebarToggle');

  if (!app || !toggle) return;

  const storageKey = 'FleetAuditHub_sidebarCollapsed_v1';

  // Start compact on phones unless the user has saved a preference.
  let collapsed =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 760px)').matches;

  try {
    const savedPreference = localStorage.getItem(storageKey);

    if (savedPreference === 'true' || savedPreference === 'false') {
      collapsed = savedPreference === 'true';
    }
  } catch (error) {
    // Restricted storage should not prevent the menu from working.
  }

  function renderSidebar() {
    app.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';

    toggle.setAttribute('aria-expanded', String(!collapsed));

    const label = collapsed
      ? 'Expand navigation'
      : 'Collapse navigation';

    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }

  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    renderSidebar();

    try {
      localStorage.setItem(storageKey, String(collapsed));
    } catch (error) {
      // The selected mode still works for this session.
    }
  });

  renderSidebar();
})();