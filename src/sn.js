const SN_REGEX = /^raw_([A-Za-z0-9]{15})\.(txt|log|csv)$/;

export function extractSn(filename) {
  const match = filename.match(SN_REGEX);
  if (!match) {
    throw new Error('filename must match raw_<15-char SN>.{txt|log|csv}');
  }
  return match[1];
}
