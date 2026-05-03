# LogParse Design

**Date:** 2026-05-03
**Status:** Approved

## Goal

Build a Node.js web tool that lets a user upload a raw embedded-device log (`raw.txt`) and view a reconstructed, human-readable log table. Each raw line is matched against a server-side dictionary (`event_trace.csv`) by event ID; descriptions are filled with the raw line's parameters. Designed to be deployed on a remote Node host.

## Inputs

### `event_trace.csv` (server-side, ships with app)

Columns: `event_id, param_cnt, param_type, description`

| Type | Behavior |
|---|---|
| `int` | Description contains `%d` placeholders; fill in order with parameters coerced to integers |
| `str` | Description contains `%s` placeholders; fill in order with parameter strings |
| `array` | Description has no placeholder; append parameters as 2-digit uppercase hex bytes joined by commas (e.g. `F7,80,25,14,B0,1D`) |
| `none` | No parameters; emit description verbatim |

### `raw.txt` (uploaded by user)

Comma-separated, one log line per row:
- Field 1: Unix epoch seconds (UTC)
- Field 2: event_id
- Fields 3+: variable-length parameters specific to event_id

Blank lines are skipped.

## Architecture

JSON API + client renders. Two clean halves:

- **Server (Node.js + Express + multer)** — loads dictionary at startup, exposes one endpoint that accepts an upload and returns parsed records as JSON.
- **Client (vanilla HTML/CSS/JS)** — uploads file, receives JSON, renders into a searchable table.

This separation makes the parsing pipeline pure and unit-testable, and keeps the API reusable for future clients (CLI, other UIs).

## Project Structure

```
LogParse/
  package.json
  server.js                 # Express bootstrap
  src/
    dictionary.js           # Load + parse event_trace.csv at startup
    parser.js               # Parse raw.txt content → structured records
    formatter.js            # Apply description template, format params
    routes.js               # POST /api/parse handler
  public/
    index.html              # Upload UI + table + search
    app.js                  # Client logic
    styles.css
  event_trace.csv           # Server-side dictionary
  raw.txt                   # Sample
  tests/
    dictionary.test.js
    parser.test.js
    formatter.test.js
```

## Parsing Pipeline (3 pure modules)

### `dictionary.js`

```
loadDictionary(csvPath) → Map<eventId: number, { paramCount, paramType, description }>
```

Parses CSV at startup. Skips header row. Handles quoted descriptions that may contain commas. Returns a `Map` keyed by event_id (number) for O(1) lookup.

### `parser.js`

```
parseRawText(text) → Array<{ rawTimestamp: number, eventId: number, params: string[] }>
```

Splits on newlines. Skips blank lines and lines without at least 2 fields. Each line: split on commas; first field → `rawTimestamp` (parsed as integer); second → `eventId` (integer); remaining fields → `params` as raw strings (formatter coerces them per type). Returns structured records — no formatting yet.

### `formatter.js`

```
formatRecord(record, dictionary) → { time, eventId, message }
```

- `time`: convert `rawTimestamp * 1000` to `Date`, then format as `YYYY-MM-DD HH:mm:ss` in UTC. Non-numeric timestamp → string `"[invalid time]"`.
- `eventId`: pass-through (number).
- `message`: lookup dictionary by eventId.
  - **Unknown event** → `"[unknown event <id>]: <param1>, <param2>, ..."`
  - **`int`** → coerce each param via `parseInt`, fill `%d` placeholders left-to-right (one per occurrence). Non-integer params pass through as raw string into the placeholder.
  - **`str`** → fill `%s` placeholders left-to-right with raw param strings.
  - **`array`** → take description verbatim, then append `params.map(p => parseInt(p,10).toString(16).padStart(2,'0').toUpperCase()).join(',')`. All available params are formatted; `param_cnt` is informational for this type, no extras-handling applies.
  - **`none`** → description verbatim. If the raw line has unexpected extra params, append them as ` (+ extra: <p>, <p>, ...)`.
  - **Param count mismatch for `int`/`str` (fewer params than placeholders)** → fill what's available; leftover `%d`/`%s` remain in the output literally.
  - **Param count mismatch for `int`/`str` (more params than placeholders)** → unused extras appended as ` (+ extra: <p>, <p>, ...)`.

The full pipeline composes as: `text → parseRawText → records → records.map(formatRecord) → JSON array`.

## HTTP Layer

### `server.js`

- Loads dictionary once at startup via `loadDictionary('./event_trace.csv')`. Logs the count of loaded events.
- Serves static files from `public/`.
- Mounts `routes.js` under `/api`.
- Listens on `process.env.PORT || 3000`.

### `routes.js`

```
POST /api/parse
  Content-Type: multipart/form-data
  Field: "logfile"

  → 200 OK
    [
      { "time": "2026-05-03 12:51:02", "eventId": 2004, "message": "Ble send pkt len: 128 to mcu" },
      ...
    ]
```

Implementation:
1. `multer` with `memoryStorage()`, 5 MB file-size limit, single field `logfile`.
2. Read `req.file.buffer` as UTF-8 text.
3. Run pipeline: `parseRawText(text).map(r => formatRecord(r, dictionary))`.
4. `res.json(...)`.

**HTTP-level errors:**
- No file → `400 { error: "no file" }`
- File too large → multer's default 413 response
- Unhandled exception → `500 { error: <message> }`

## Frontend

### `public/index.html` — three regions

1. **Upload area** — `<input type="file" accept=".txt,.log">` and a Parse button.
2. **Search bar** — `<input type="search">` for live filtering.
3. **Results table** — columns `Time | Event ID | Message`, monospace.

### `public/app.js` flow

```
on Parse click:
  1. POST /api/parse with FormData containing the file
  2. Receive JSON array
  3. Store in module-level allRecords
  4. Render full table

on search input:
  1. Lowercase query
  2. Filter allRecords where any field's lowercase form includes query
  3. Re-render filtered subset

UI states:
  - while uploading: button disabled, label "Parsing…"
  - on error: red error message div above table
  - on success: error div hidden, table populated
```

### `public/styles.css`

Monospace table, alternating row colors, sticky header, full-width container.

## Error Model Summary

The parsing pipeline is **forgiving** — corrupt lines don't kill the batch:

| Edge case | Behavior |
|---|---|
| Blank line | Skipped silently |
| Line with <2 fields | Skipped silently |
| Unknown event_id | `"[unknown event <id>]: <raw params>"` |
| Too few params for type | Fill available; leftover placeholders remain literal |
| Too many params for type | Extras appended as ` (+ extra: ...)` |
| Non-numeric timestamp | `"[invalid time]"` in time column; row still emitted |
| Non-integer param for `int` | Raw string substituted into placeholder |
| Malformed `event_trace.csv` at startup | Server fails to start with stderr message |

Per-line issues become visible content; only file-level upload failures return HTTP errors.

## Testing

Use Node's built-in `node:test` (zero dependencies). Run via `npm test` → `node --test tests/`.

| Test file | Coverage |
|---|---|
| `dictionary.test.js` | All 5 sample events parsed; types/counts correct; quoted descriptions handled |
| `parser.test.js` | Sample raw.txt → 5 records; blank lines skipped; short lines skipped |
| `formatter.test.js` | One test per branch: `int` (event 2004, 2008), `str` (2015), `array` produces `F7,80,25,14,B0,1D` (2000), `none` (2075), unknown event, fewer/more params, invalid timestamp |

## Deployment

`package.json`:

```json
{
  "name": "logparse",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "express": "^4.21.0",
    "multer": "^1.4.5-lts.1"
  }
}
```

- Local: `npm install && npm start` → `http://localhost:3000`
- Remote: any Node-capable host. Honors `PORT` env var. No build step.
- Dictionary updates: replace `event_trace.csv` and restart.

## CLAUDE.md Update

Replace the LogParse one-line entry with a short section under `## LogParse Project` matching the style of the existing `## Quant Project` and `## Webtravel Project` sections. Include:
- Run instructions (`npm install && npm start`)
- API endpoint summary
- Module layout
- How to update the dictionary
