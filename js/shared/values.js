/**
 * Normalize source values and format dates and money without changing the imported billing amounts.
 * Classic script module; shared services and state are loaded by index.html.
 */

const $ = id => document.getElementById(id);
const esc = value => String(value == null ? '' : value)
  .replace(/[&<>"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[character]));

function normalizedKey(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeVin(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .toUpperCase();
}

function clientIdForCode(code) {
  return 'client-' + String(code || '').trim().toLowerCase();
}

function vehicleIdForVin(vin, clientId) {
  return 'vehicle-' + encodeURIComponent(clientId) + '-' + encodeURIComponent(vin);
}

function todayDate() {
  const today = new Date();
  return today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
}

function parseNumeric(value) {
  if (value == null || value === '') return 0;
  const cleaned = String(value).replace(/[$,\s]/g, '').replace(/\((.*)\)/, '-$1');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseEnteredMoney(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  const normalized = raw.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  const amount = typeof value === 'number' ? value : parseNumeric(value);
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
