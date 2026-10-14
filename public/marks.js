// Entries for the MARKS drop-down: one per marked line, in line order, so the
// user can jump between highlights. Pure — app.js owns the DOM.

const MESSAGE_PREVIEW_CHARS = 60;

// Shared with the table's # cell so the drop-down and the table agree.
export function formatLineNum(lineNum) {
  return String(lineNum).padStart(4, '0');
}

export function markEntries(markedLines, records, maxMessage = MESSAGE_PREVIEW_CHARS) {
  const byLine = new Map(records.map(r => [r.lineNum, r]));
  return [...markedLines]
    .filter(lineNum => byLine.has(lineNum))
    .sort((a, b) => a - b)
    .map(lineNum => {
      const r = byLine.get(lineNum);
      const msg = r.message.length > maxMessage
        ? r.message.slice(0, maxMessage) + '…'
        : r.message;
      return {
        lineNum,
        label: `${formatLineNum(lineNum)} │ ${r.time} │ ${r.eventId} │ ${msg}`,
      };
    });
}
