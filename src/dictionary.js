import fs from 'node:fs';

export function loadDictionary(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8');
  return parseDictionaryCsv(text);
}

export function parseDictionaryCsv(text) {
  const dict = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fields = parseCsvLine(trimmed);
    const idStr = (fields[0] || '').trim();
    if (!/^\d+$/.test(idStr)) continue;
    const type = (fields[2] || '').trim();
    const cntStr = (fields[3] || '').trim();
    let format = (fields[4] || '').trim();
    format = format.replace(/^"(.*)"$/s, '$1');
    dict.set(parseInt(idStr, 10), {
      paramCount: parseInt(cntStr, 10) || 0,
      paramType: type,
      description: format,
    });
  }
  return dict;
}

function parseCsvLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let value = '';
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          value += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          value += line[i++];
        }
      }
      fields.push(value);
      if (i < line.length && line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}
