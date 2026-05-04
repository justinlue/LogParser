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
  if (paramType === 'array') {
    return description + params.map(toHexByte).join(',');
  }
  if (paramType === 'none') {
    return params.length > 0
      ? `${description} (+ extra: ${params.join(', ')})`
      : description;
  }
  if (paramType === 'int') {
    return fillPlaceholders(description, '%d', params, toIntStr);
  }
  if (paramType === 'str') {
    return fillPlaceholders(description, '%s', params, p => p);
  }
  return description;
}

function fillPlaceholders(description, placeholder, params, transform) {
  const parts = description.split(placeholder);
  let result = parts[0];
  let used = 0;
  for (let i = 1; i < parts.length; i++) {
    if (used < params.length) {
      result += transform(params[used++]);
    } else {
      result += placeholder;
    }
    result += parts[i];
  }
  if (used < params.length) {
    result += ` (+ extra: ${params.slice(used).join(', ')})`;
  }
  return result;
}

function toIntStr(p) {
  const n = parseInt(p, 10);
  return Number.isNaN(n) ? p : String(n);
}

function toHexByte(p) {
  const n = parseInt(p, 10);
  return Number.isNaN(n) ? p : n.toString(16).padStart(2, '0').toUpperCase();
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
