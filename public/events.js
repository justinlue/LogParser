// app.js announces which device's logs are now on screen so other panels can
// drop state belonging to a device the user has navigated away from.
export const RECORDS_LOADED_EVENT = 'logparse:records-loaded';

export function announceRecordsLoaded(sn) {
  document.dispatchEvent(new CustomEvent(RECORDS_LOADED_EVENT, { detail: { sn } }));
}
