import fs from 'node:fs';

export function loadDictionary(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8');
  return parseDictionaryCsv(text);
}

export function parseDictionaryCsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const dict = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\d+),(\d+),(\w+),(.*)$/);
    if (!match) continue;
    const [, idStr, cntStr, type, descRaw] = match;
    const description = descRaw.replace(/^"(.*)"$/, '$1');
    dict.set(parseInt(idStr, 10), {
      paramCount: parseInt(cntStr, 10),
      paramType: type,
      description,
    });
  }
  return dict;
}
