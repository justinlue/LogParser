export function formatRecord(record, dictionary) {
  const { rawTimestamp, eventId, params } = record;
  const time = formatTimestamp(rawTimestamp);
  const entry = dictionary.get(eventId);

  if (!entry) {
    return {
      time,
      eventId,
      message: `[unknown event ${eventId}]: ${params.join(', ')}`,
    };
  }

  return { time, eventId, message: buildMessage(entry, params) };
}

function buildMessage({ paramType, description }, params) {
  if (paramType === 'BYTES') {
    const hex = params[0] || '';
    const bytes = hex.match(/.{1,2}/g) || [];
    return description + bytes.map(b => b.toUpperCase()).join(',');
  }
  if (paramType === 'NONE') {
    return params.length > 0
      ? `${description} (+ extra: ${params.join(', ')})`
      : description;
  }
  if (paramType === 'INT32') {
    let idx = 0;
    const result = description.replace(/%[dx]/g, match => {
      if (idx >= params.length) return match;
      const n = parseInt(params[idx++], 10);
      if (Number.isNaN(n)) return params[idx - 1];
      return match === '%d' ? String(n) : n.toString(16);
    });
    return idx < params.length
      ? result + ` (+ extra: ${params.slice(idx).join(', ')})`
      : result;
  }
  if (paramType === 'STRING') {
    let idx = 0;
    const result = description.replace(/%s/g, () =>
      idx < params.length ? params[idx++] : '%s'
    );
    return idx < params.length
      ? result + ` (+ extra: ${params.slice(idx).join(', ')})`
      : result;
  }
  return description;
}

function formatTimestamp(rawTimestamp) {
  if (typeof rawTimestamp !== 'number' || !Number.isFinite(rawTimestamp)) {
    return '[invalid time]';
  }
  const d = new Date(rawTimestamp * 1000);
  if (Number.isNaN(d.getTime())) return '[invalid time]';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
