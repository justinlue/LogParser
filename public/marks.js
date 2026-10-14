// Entries for the MARKS drop-down: one per block of adjacent marked lines, in
// line order, so the user can jump between highlights. Pure — app.js owns the DOM.

const MESSAGE_PREVIEW_CHARS = 60;

// Shared with the table's # cell so the drop-down and the table agree.
export function formatLineNum(lineNum) {
  return String(lineNum).padStart(4, '0');
}

// Each entry is { lineNum, lastLine, label }: lineNum is the block's first line
// (the jump target), lastLine its last.
export function markEntries(markedLines, records, maxMessage = MESSAGE_PREVIEW_CHARS) {
  const byLine = new Map(records.map(r => [r.lineNum, r]));
  const lines = [...markedLines].filter(n => byLine.has(n)).sort((a, b) => a - b);

  const blocks = [];
  for (const n of lines) {
    const last = blocks[blocks.length - 1];
    if (last && n === last.lastLine + 1) last.lastLine = n;
    else blocks.push({ lineNum: n, lastLine: n });
  }

  return blocks.map(({ lineNum, lastLine }) => {
    const r = byLine.get(lineNum);
    const range = lastLine === lineNum
      ? formatLineNum(lineNum)
      : `${formatLineNum(lineNum)}-${formatLineNum(lastLine)}`;
    const msg = r.message.length > maxMessage
      ? r.message.slice(0, maxMessage) + '…'
      : r.message;
    return { lineNum, lastLine, label: `${range} │ ${r.time} │ ${r.eventId} │ ${msg}` };
  });
}
