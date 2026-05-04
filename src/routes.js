import { extractSn } from './sn.js';
import { parseRawText } from './parser.js';
import { formatRecord } from './formatter.js';

export function handleParseRequest(filename, buffer, dictionary) {
  let sn;
  try {
    sn = extractSn(filename);
  } catch (err) {
    return { status: 400, body: { error: err.message } };
  }
  const text = buffer.toString('utf8');
  const records = parseRawText(text).map(r => formatRecord(r, dictionary));
  return { status: 200, body: { sn, records } };
}
