/**
 * Render the invoice workflow overview and links to each audit.
 * Classic script module; shared services and state are loaded by index.html.
 */

function invoices() {
  setTitle('Invoice Audits', 'Two workflows based directly on the provided SOPs.');
  $('content').innerHTML = '<div class="grid2"><div class="panel"><h3>Element Invoice</h3><p class="muted">PDF + CDV + fleet matching workflow.</p><button class="btn" onclick="go(\'element\')">Open Element Audit</button></div>' +
    '<div class="panel"><h3>LeasePlan / Wheels</h3><p class="muted">PDF summary and VIN-level review workflow.</p><button class="btn" onclick="go(\'leaseplan\')">Open LeasePlan Audit</button></div></div>';
}
