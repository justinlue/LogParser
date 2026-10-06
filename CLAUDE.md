# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies (first time only)
npm start          # start server on http://localhost:3000 (PORT env var overrides) and open it in Chrome; NO_OPEN=1 skips the browser
npm test           # run all tests with node:test runner
```

Run a single test file:
```bash
node --test tests/formatter.test.js
```

No build step. No linter configured. Uses ES modules (`"type": "module"` in package.json).

## Architecture

**Server-side pipeline** — four pure modules compose sequentially; `routes.js` wires them together and `server.js` adds Express + multer:

```
uploaded buffer → handleParseRequest (routes.js)
                    ├─ extractSn(filename)         → SN string or throws → 400
                    ├─ parseRawText(text)           → Array<{ rawTimestamp, eventId, params[] }>
                    └─ formatRecord(record, dict)   → { time, eventId, message }
```

- `src/dictionary.js` — reads `event_trace.csv` once at startup into `Map<number, { paramCount, paramType, description }>`. Keys are numeric event IDs.
- `src/parser.js` — splits raw log text on newlines; each line is comma-separated (`timestamp, eventId, ...params`). Lines with fewer than 2 fields or blank lines are silently dropped.
- `src/formatter.js` — dispatches on `paramType`: `int` fills `%d` placeholders via `parseInt`, `str` fills `%s` placeholders verbatim, `array` appends all params as comma-joined 2-digit uppercase hex bytes (e.g. `F7,80,25,14,B0,1D`), `none` emits description verbatim. Extra params append ` (+ extra: ...)` for `int`/`str`/`none`; missing params leave placeholders literal. Non-numeric timestamps produce `[invalid time]`.
- `src/sn.js` — validates upload filename against `/^raw_([A-Za-z0-9]{15})\.(txt|log)$/`; throws on mismatch.
- `src/routes.js` — pure function `handleParseRequest(filename, buffer, dictionary) → { status, body }`. No Express coupling; independently testable.
- `src/browser.js` — `openInChrome(url)`, called once the server is listening unless `NO_OPEN` is set. Best effort: a launch failure only logs a warning.
- `server.js` — Express bootstrap: loads dictionary, mounts multer (5 MB limit, `memoryStorage`), serves `public/` as static, handles `POST /api/parse` and `GET /api/query`, includes an error middleware for `LIMIT_FILE_SIZE → 413`.

**Frontend** (`public/`) — vanilla HTML/CSS/JS, no framework or bundler. `app.js` POSTs to `/api/parse`, receives `{ sn, records }`, shows a device SN banner, populates a monospace table, and filters rows live on search input. Rows for events 3025 (`key: value;` pairs) and 1380/2152 (`%d` templates, split on numbers via `NUMERIC_DIFF_EVENTS`) highlight fields whose value differs from the previous rendered row of the same event ID (`.changed-field`). The REMOTE_FETCH panel also GETs `/api/query` to pull logs from Aliyun without a local file. `app.js` is loaded as an ES module so it can import `public/shortcuts.js`: six filter-shortcut slots (Alt+1..6) that each store a filter-bar text plus an optional user-chosen name. The lasting copy is `shortcuts.json` at the project root (git-ignored), read and written through `GET`/`PUT /api/shortcuts` (`src/shortcutStore.js`); `localStorage` (`logparse.shortcuts`) is only the copy on hand before the server answers. On load the server's slots win; if the server has none, the browser's are uploaded. `shortcuts.js` is pure (storage injected, no DOM) and is the one frontend file under test; the slot row under the filter bar is rendered by `app.js`.

## Key Data Contracts

- Upload field name: `logfile`
- Response shape: `{ sn: string, records: Array<{ time: string, eventId: number, message: string }> }`
- Time format: `YYYY-MM-DD HH:mm:ss` UTC, derived from Unix epoch seconds × 1000
- Dictionary CSV columns: `event_id, param_cnt, param_type, description` (quoted descriptions with embedded commas are handled)

## Remote Fetch (Aliyun)

The REMOTE_FETCH panel queries Aliyun SLS without requiring a local file upload.

**Endpoint:** `GET /api/query?sn=<SN>&start=<YYYY-MM-DD>&end=<YYYY-MM-DD>`
- `sn` / `vin` — at least one required. `sn` is the 15-char alphanumeric device serial number; a `vin` alone is resolved to its SN first. With both, the SN is the sole search criterion and the VIN is only checked against it: if it resolves to another SN, the response carries `warning: "The current SN and VIN do not match."`, which the frontend shows in the error box above the SN's logs. A VIN that resolves to nothing in the time window raises no warning.
- `start` / `end` — optional date range (inclusive). When omitted the server fetches all available logs.

**How it works:** `server.js` spawns `query.py` via `execFileSync` with the arguments from `buildQueryArgs` (`src/remoteQuery.js`): `--sn` and/or `--vin`, `--start`, `--end`, `--source`. `query.py` reports the SN a VIN resolves to as `vin_sn`, which `snVinMismatchWarning` compares with the entered SN. `query.py` authenticates with Aliyun SLS and returns a JSON object. The server converts the structured response to CSV, runs it through `handleParseRequest`, saves a copy to `downloads/raw_<sn>_converted.csv` (via `src/downloads.js`), and returns `{ sn, records }` in the same shape as `/api/parse`.

**Environment:**
- `TIMEZONE_OFFSET_HOURS` — integer hours to shift timestamps (e.g. `8` for CST). Defaults to `0` (UTC) if unset.

**Same-day date behaviour:** When the user enters the same date for both from and to, the frontend automatically adds one day to the end date before sending the request. This compensates for the remote server always starting from `00:00:00` of that day, which would otherwise return an empty range.

**`downloads/`** — created automatically on first fetch; stores the raw query result (`raw_<sn>.json`, written by `query.py`) and the converted CSV (`raw_<sn>_converted.csv`) for debugging. The SN is the unique identifier: there is one pair of files per device, a re-fetch overwrites them, and VIN queries are saved under the SN the VIN resolves to.

## Dictionary Updates

`event_trace.csv` lives at the project root and is read once at startup. Edit the CSV and restart the server to apply changes.

## Testing

Tests use Node's built-in `node:test` — zero extra dependencies. Coverage per file:
- `dictionary.test.js` — CSV parsing, quoted descriptions, numeric key types
- `parser.test.js` — field extraction, blank/short line skipping, CRLF handling
- `formatter.test.js` — all four `paramType` branches, edge cases (too few/many params, invalid timestamp, non-numeric int param)
- `sn.test.js` — valid `.txt`/`.log`, rejects wrong prefix, wrong extension, non-15-char SN, non-alphanumeric
- `downloads.test.js` — same-SN save overwrites, one file per SN, directory creation
- `browser.test.js` — per-platform Chrome launch command (`src/browser.js`)
- `shortcutStore.test.js` — `shortcuts.json` round-trip, missing/corrupt file, cleaning and rejecting bad input
- `remoteQuery.test.js` — `query.py` arguments for SN, VIN and both; SN/VIN mismatch warning (different SN, same SN, unresolved VIN, single input)
- `routes.test.js` — end-to-end pipeline through `handleParseRequest` without Express
- `shortcuts.test.js` — filter-shortcut slots (`public/shortcuts.js`): persistence, rename/label fallback, clear, six-slot limit, corrupt storage, Alt+1..6 key mapping
