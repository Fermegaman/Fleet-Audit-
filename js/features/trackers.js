/**
 * Display the rental, maintenance, FIF, toll, PAVE and recall workbook views.
 * Classic script module; shared services and state are loaded by index.html.
 */

function rentals() {
  setTitle('Rentals', 'Centralized rental tracker.');
  $('content').innerHTML = '<div class="panel"><div class="toolbar"><button class="btn" onclick="alert(\'Rental entry form is ready for the database build.\')">+ Add rental</button></div>' +
    workbookTable(data('Rental Tracker')) + '</div>';
}

function maintenance() {
  setTitle('PM / Maintenance', 'Preventative maintenance and repair tracking.');
  $('content').innerHTML = '<div class="panel"><div class="toolbar"><button class="btn" onclick="alert(\'PM entry form is ready for the database build.\')">+ Add PM item</button></div>' +
    workbookTable(data('PMS')) + '</div>';
}

function fif() {
  setTitle('FIF', 'Fleet Improvement Fund tracking.');
  $('content').innerHTML = '<div class="panel"><div class="toolbar"><button class="btn" onclick="alert(\'FIF entry form is ready for the database build.\')">+ Add claim</button></div>' +
    workbookTable(data('FIF Tracker')) + '</div>';
}

function tolls() {
  setTitle('Toll Claims', 'Expected, approved and resolved toll reimbursement.');
  $('content').innerHTML = '<div class="panel"><div class="toolbar"><button class="btn" onclick="alert(\'Toll entry form is ready for the database build.\')">+ Add claim</button></div>' +
    workbookTable(data('Toll Tracker')) + '</div>';
}

function pave() {
  setTitle('PAVE', 'Inspection due-date tracking.');
  $('content').innerHTML = '<div class="panel">' + workbookTable(data('Pave')) + '</div>';
}

function recalls() {
  setTitle('Recalls', 'Recall status.');
  $('content').innerHTML = '<div class="panel">' + workbookTable(data('Recalls')) + '</div>';
}
