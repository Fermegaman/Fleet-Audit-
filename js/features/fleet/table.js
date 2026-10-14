/**
 * Render sortable fleet tables and connect their vehicle editing buttons.
 * Classic script module; shared services and state are loaded by index.html.
 */

const FLEET_COLUMNS = [
  ['vin', 'VIN', vehicle => vehicle.vin],
  ['vehicleName', 'Vehicle Name', vehicle => vehicle.amazon.vehicleName],
  ['licensePlateNumber', 'License Plate', vehicle => vehicle.amazon.licensePlateNumber],
  ['make', 'Make', vehicle => vehicle.amazon.make],
  ['model', 'Model', vehicle => vehicle.amazon.model],
  ['operationalStatus', 'Operational Status', vehicle => vehicle.amazon.operationalStatus],
  ['amazonStatus', 'Amazon Status', vehicle => vehicle.amazon.status],
  ['vehicleProvider', 'Vehicle Provider', vehicle => vehicle.amazon.vehicleProvider],
  ['repairIssue', 'Repair / Issue', vehicle => vehicle.manual.repairIssue],
  ['location', 'Location', vehicle => vehicle.manual.location],
  ['repairStatus', 'Repair Status', vehicle => vehicle.manual.repairStatus],
  ['status', 'Status', vehicle => vehicle.manual.status],
  ['notes', 'Notes', vehicle => vehicle.manual.notes]
];
const GROUNDED_COLUMNS = [
  ...FLEET_COLUMNS.slice(0, 6),
  FLEET_COLUMNS[7],
  ['dateGrounded', 'Date Grounded', vehicle => vehicle.manual.dateGrounded],
  FLEET_COLUMNS[8],
  ['atDealership', 'At Dealership', vehicle => vehicle.manual.atDealership],
  FLEET_COLUMNS[9],
  ['afsEligible', 'AFS Eligible', vehicle => vehicle.manual.afsEligible],
  FLEET_COLUMNS[10],
  FLEET_COLUMNS[11],
  FLEET_COLUMNS[12]
];
const fleetCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function fleetTable(records, tableId, columns = FLEET_COLUMNS) {
  const sort = fleetSortByClient[currentClientId] && fleetSortByClient[currentClientId][tableId];
  const column = columns.find(item => item[0] === (sort && sort.column));
  const sorted = records.slice();
  if (column && sort) {
    sorted.sort((left, right) => {
      const result = fleetCollator.compare(
        String(column[2](left) == null ? '' : column[2](left)),
        String(column[2](right) == null ? '' : column[2](right))
      );
      return sort.direction === 'desc' ? -result : result;
    });
  }
  if (!sorted.length) return '<div class="empty">No records yet.</div>';
  const headers = columns.map(([key, label]) => {
    const active = sort && sort.column === key;
    const indicator = active ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : '';
    return '<th><button type="button" class="sort-header" data-sort-column="' + key +
      '" aria-sort="' + (active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none') +
      '">' + esc(label + indicator) + '</button></th>';
  }).join('') + '<th>Action</th>';
  return '<div class="table" data-fleet-table="' + esc(tableId) + '"><table><thead><tr>' + headers +
    '</tr></thead><tbody>' + sorted.map(vehicle => {
      const absent = hasAmazonFleetImport() && !vehicle.presentInLatestExport;
      const vinCell = esc(vehicle.vin) + (absent
        ? '<br><span class="small">Not in latest Amazon export</span>'
        : '');
      const inactive = isInactiveStatus(vehicle.amazon.status);
      const groundedActive = !inactive && isActiveStatus(vehicle.amazon.status) && isGrounded(vehicle);
      return '<tr class="fleet-row' + (absent ? ' absent' : inactive ? ' inactive' : groundedActive ? ' grounded' : '') + '">' +
        columns.map(([key, , getValue]) => '<td>' +
          (key === 'vin' ? vinCell : esc(key === 'operationalStatus' &&
            vehicle.lastOperationalChange === 'GROUNDED->OPERATIONAL'
            ? String(getValue(vehicle) || '') + ' — Returned to service'
            : key === 'amazonStatus' && inactive
              ? 'INACTIVE'
              : getValue(vehicle))) + '</td>').join('') +
        '<td><button class="btn secondary" data-edit-vin="' + esc(vehicle.vin) + '">View/Edit</button></td>' +
        '</tr>';
    }).join('') + '</tbody></table></div>';
}

function wireFleetTableSorting(tableId, records, columns = FLEET_COLUMNS) {
  const holder = document.querySelector('[data-fleet-table="' + tableId + '"]');
  if (!holder) return;
  holder.querySelectorAll('[data-sort-column]').forEach(button => {
    button.addEventListener('click', () => {
      const clientSort = fleetSortByClient[currentClientId] || (fleetSortByClient[currentClientId] = {});
      const previous = clientSort[tableId];
      const column = button.dataset.sortColumn;
      clientSort[tableId] = {
        column,
        direction: previous && previous.column === column && previous.direction === 'asc' ? 'desc' : 'asc'
      };
      holder.outerHTML = fleetTable(records, tableId, columns);
      const updatedHolder = document.querySelector('[data-fleet-table="' + tableId + '"]');
      wireFleetTableSorting(tableId, records, columns);
      wireVehicleEditors(updatedHolder);
    });
  });
}

function wireFleetTable(tableId, records, columns = FLEET_COLUMNS) {
  wireFleetTableSorting(tableId, records, columns);
  const holder = document.querySelector('[data-fleet-table="' + tableId + '"]');
  wireVehicleEditors(holder);
}

function wireVehicleEditors(root = document) {
  if (!root) return;
  root.querySelectorAll('[data-edit-vin]').forEach(button =>
    button.addEventListener('click', () => editVehicle(button.dataset.editVin))
  );
}
