// Command-line arguments for query.py. The SN is the search criterion whenever
// it is given; a VIN passed alongside it is only checked against that SN.
export function buildQueryArgs({ sn, vin, start, end, source }) {
  const args = ['query.py'];
  if (sn) args.push('--sn', sn);
  if (vin) args.push('--vin', vin);
  if (start) args.push('--start', start);
  if (end) args.push('--end', end);
  if (source) args.push('--source', source);
  return args;
}

// Message for the error box when an SN and a VIN were entered together but the
// VIN resolves (vinSn, reported by query.py) to another device. null otherwise.
export function snVinMismatchWarning({ sn, vin, vinSn }) {
  if (!sn || !vin || !vinSn) return null;
  if (String(vinSn).toUpperCase() === String(sn).toUpperCase()) return null;
  return 'The current SN and VIN do not match.';
}
