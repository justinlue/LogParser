# LogParse Design

**Date:** 2026-05-03
**Status:** Approved

## Goal

Build a Node.js web tool that lets a user upload a raw embedded-device log and view a reconstructed, human-readable log table. The uploaded filename encodes the device serial number (SN), which is shown alongside the parsed log. Each raw line is matched against a server-side dictionary (`event_trace.csv`) by event ID; descriptions are filled with the raw line's parameters. Designed to be deployed on a remote Node host.

## Filename / SN Convention

Uploaded files MUST be named `raw_<SN>.txt` or `raw_<SN>.log`, where `<SN>` is exactly 15 alphanumeric characters (`[A-Za-z0-9]{15}`).

Example: `raw_NSB023567819006.txt` → SN `NSB023567819006`.

A filename that does not match the strict pattern is rejected with an HTTP 400 — this catches misnamed uploads early rather than silently parsing without an SN.

## Inputs

### `event_trace.csv` (server-side, ships with app)

Columns: `event_id, param_cnt, param_type, description`

| Type | Behavior |
|---|---|
| `int` | Description contains `%d` placeholders; fill in order with parameters coerced to integers |
| `str` | Description contains `%s` placeholders; fill in order with parameter strings |
| `array` | Description has no placeholder; append parameters as 2-digit uppercase hex bytes joined by commas (e.g. `F7,80,25,14,B0,1D`) |
| `none` | No parameters; emit description verbatim |

### `raw_<SN>.txt` (uploaded by user; filename encodes SN — see "Filename / SN Convention" below)

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
    parser.js               # Parse raw log content → structured records
    formatter.js            # Apply description template, format params
    sn.js                   # Extract SN from upload filename
    routes.js               # POST /api/parse handler
  public/
    index.html              # Upload UI + SN banner + table + search
    app.js                  # Client logic
    styles.css
  event_trace.csv           # Server-side dictionary
  raw_NSB023567819006.txt   # Sample
  tests/
    dictionary.test.js
    parser.test.js
    formatter.test.js
    sn.test.js
```

## Parsing Pipeline (4 pure modules)

### `sn.js`

```
extractSn(filename) → string  // throws if pattern doesn't match
```

Validates `filename` against `/^raw_([A-Za-z0-9]{15})\.(txt|log)$/`. Returns the 15-char SN on match. Throws an `Error` with a descriptive message on mismatch — caller (routes.js) translates this into HTTP 400.

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
  Field: "logfile"   (filename must match raw_<15-char SN>.{txt|log})

  → 200 OK
    {
      "sn": "NSB023567819006",
      "records": [
        { "time": "2026-05-03 12:51:02", "eventId": 2004, "message": "Ble send pkt len: 128 to mcu" },
        ...
      ]
    }
```

Implementation:
1. `multer` with `memoryStorage()`, 5 MB file-size limit, single field `logfile`.
2. Call `extractSn(req.file.originalname)` — on throw, return 400.
3. Read `req.file.buffer` as UTF-8 text.
4. Run pipeline: `parseRawText(text).map(r => formatRecord(r, dictionary))`.
5. `res.json({ sn, records })`.

**HTTP-level errors:**
- No file → `400 { error: "no file" }`
- Filename does not match `raw_<SN>.{txt|log}` → `400 { error: "filename must match raw_<15-char SN>.{txt|log}" }`
- File too large → multer's default 413 response
- Unhandled exception → `500 { error: <message> }`

## Frontend

### `public/index.html` — four regions

1. **Upload area** — `<input type="file" accept=".txt,.log">` and a Parse button.
2. **SN banner** — heading element above the table that shows `Device SN: <sn>` after a successful parse. Hidden until the first successful response.
3. **Search bar** — `<input type="search">` for live filtering.
4. **Results table** — columns `Time | Event ID | Message`, monospace.

### `public/app.js` flow

```
on Parse click:
  1. POST /api/parse with FormData containing the file
  2. Receive JSON: { sn, records }
  3. Store in module-level state: currentSn, allRecords
  4. Show SN banner with currentSn
  5. Render full table

on search input:
  1. Lowercase query
  2. Filter allRecords where any field's lowercase form includes query
  3. Re-render filtered subset

UI states:
  - while uploading: button disabled, label "Parsing…"
  - on error: red error message div above table; SN banner hidden
  - on success: error div hidden, banner shown, table populated
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
| `parser.test.js` | Sample raw → 5 records; blank lines skipped; short lines skipped |
| `formatter.test.js` | One test per branch: `int` (event 2004, 2008), `str` (2015), `array` produces `F7,80,25,14,B0,1D` (2000), `none` (2075), unknown event, fewer/more params, invalid timestamp |
| `sn.test.js` | Valid filename (`raw_NSB023567819006.txt`) → returns SN; `.log` extension accepted; rejects too-short SN, too-long SN, missing prefix, wrong extension, non-alphanumeric SN |

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
