import fs from 'fs';
import path from 'path';

// One converted CSV per device: the SN is the unique identifier, so fetching
// the same SN again (directly or via a VIN that resolves to it) overwrites.
export function saveConvertedCsv(dir, sn, csvText) {
  fs.mkdirSync(dir, { recursive: true });
  const savedPath = path.join(dir, `raw_${sn}_converted.csv`);
  fs.writeFileSync(savedPath, csvText, 'utf8');
  return savedPath;
}
