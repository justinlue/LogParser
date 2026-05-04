export function parseRawText(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const fields = line.split(',');
      if (fields.length < 2) return null;
      return {
        rawTimestamp: parseInt(fields[0], 10),
        eventId: parseInt(fields[1], 10),
        params: fields.slice(2),
      };
    })
    .filter(r => r !== null);
}
