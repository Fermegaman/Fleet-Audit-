/**
 * Keep the storage key and source field definitions in one place. Changing these names can affect existing browser data.
 * Classic script module; shared services and state are loaded by index.html.
 */

const KEY = 'FleetAuditHub_v3';
const LEGACY_CLIENT_CODE = 'AGPL';
const AMAZON_FIELDS = [
  'vin', 'serviceType', 'vehicleName', 'licensePlateNumber', 'make', 'model',
  'subModel', 'status', 'statusPriority', 'statusReasonCode',
  'statusReasonMessage', 'operationalStatus', 'statusSearchValue',
  'subcontractorName', 'vehicleProvider', 'vehicleRegistrationType', 'year',
  'type', 'ownershipType', 'ownershipStartDate', 'ownershipEndDate', 'pmStats',
  'registrationExpiryDate', 'registeredState', 'serviceTier', 'stationCode',
  'payload', 'cubicCapacity'
];
const MANUAL_FIELDS = [
  ['dateGrounded', 'Date Grounded'],
  ['repairIssue', 'Repair / Issue'],
  ['atDealership', 'At Dealership'],
  ['location', 'Location'],
  ['afsEligible', 'AFS Eligible'],
  ['repairStatus', 'Repair Status'],
  ['status', 'Status'],
  ['notes', 'Notes']
];
// Verification-only detail sum from the supplied PDF; never used as the invoice total or billed charge.
const ELEMENT_PDF_DETAIL_REFERENCES = {
  'client-agpl|october2026|0011794022': {
    total: 845.73,
    source: 'Previously extracted from the supplied Element PDF; verify against the attached source.'
  }
};
