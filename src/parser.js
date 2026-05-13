export function parseRawText(text) {
  const logContent = extractFg0Content(text);
  return logContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(parseLogLine)
    .filter(r => r !== null);
}

function extractFg0Content(csvText) {
  const segments = [];
  let i = 0;
  const n = csvText.length;

  // Skip header row
  while (i < n && csvText[i] !== '\n') i++;
  if (i < n) i++;

  while (i < n) {
    if (csvText[i] === '"') {
      i++; // skip opening quote
      let segment = '';
      while (i < n) {
        if (csvText[i] === '"' && csvText[i + 1] === '"') {
          segment += '"';
          i += 2;
        } else if (csvText[i] === '"') {
          i++;
          break;
        } else {
          segment += csvText[i++];
        }
      }
      segments.push(segment);
    }
    // Skip rest of row to next newline
    while (i < n && csvText[i] !== '\n') i++;
    if (i < n) i++;
  }

  return segments.join('\n');
}

function parseLogLine(line) {
  const fields = line.split(/\s+/);
  if (fields.length < 5) return null;
  const rawTimestamp = parseInt(fields[0], 10);
  if (Number.isNaN(rawTimestamp)) return null;
  const eventId = parseInt(fields[2], 10);
  if (Number.isNaN(eventId)) return null;
  const typeCode = parseInt(fields[3], 10);
  const paramCount = parseInt(fields[4], 10);
  let params;
  if (typeCode === 0) {
    params = [];
  } else if (typeCode === 1) {
    params = fields.length > 5 ? [fields.slice(5).join(' ')] : [];
  } else if (typeCode === 2) {
    params = fields.slice(5, 5 + paramCount);
  } else if (typeCode === 3) {
    params = fields.length > 5 ? [fields[5]] : [];
  } else {
    params = fields.slice(5);
  }
  return { rawTimestamp, eventId, params };
}
