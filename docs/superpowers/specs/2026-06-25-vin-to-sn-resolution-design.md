# VIN → SN Resolution for Remote Fetch

**Date:** 2026-06-25
**Status:** Approved (pending spec review)

## Problem

The REMOTE_FETCH panel queries Aliyun SLS by device **SN** (15-char alphanumeric).
`query.py` builds the SLS query as `__tag__:sn: <SN>` (line 131). Users sometimes only
have the vehicle **VIN** (17-char), not the SN.

Observed today when a VIN is entered into the SN box:
- `query.py` builds `__tag__:sn: <VIN>`, which does not match the SN tag.
- (When the query line is changed to a bare `query=<VIN>`, SLS does a full-text search
  that *does* return records, each carrying the real `"__tag__:sn": "NSB306115BD8208"`.)
- The JSON downloads, but `server.js` then calls `handleParseRequest('raw_<VIN>.csv', …)`,
  and `extractSn` in `sn.js` rejects the 17-char VIN against its 15-char regex → HTTP 400.

## Goal

Let a user enter a VIN, resolve it to the device SN via an Aliyun full-text lookup, then
fetch **all logs for that SN** by reusing the existing SN search path unchanged.

## Decisions

- **Input:** a separate **VIN** box beside the existing **SN** box (explicit intent; no
  classifier). Exactly one of SN/VIN is used per fetch; VIN takes precedence if both filled.
- **Scope:** two-step — resolve SN from VIN, then query `__tag__:sn:<SN>` for the full
  result set over the user's date range.
- **Location:** resolution lives in `query.py`, next to the Aliyun SDK calls.
- **Lookup window:** the VIN→SN resolve query uses the **same** `from_time`/`to_time` as the
  main search (respects the entered `--start`/`--end`; all-time when omitted).

## Design

### 1. Frontend — `public/index.html` + `public/app.js`

`index.html`: add a VIN input in the REMOTE_FETCH panel beside `#snInput`:

```html
<input id="vinInput" placeholder="VIN e.g. LSV2BDDG6SN016885" aria-label="Vehicle VIN">
```

`app.js` FETCH handler (`queryBtn` click):
- Read `vin = vinInput.value.trim()` and `sn = snInput.value.trim()`.
- If `vin` is non-empty → set `params.set('vin', vin)` (ignore SN box).
- Else if `sn` is non-empty → existing `params.set('sn', sn)` behavior.
- Else → `showError('Please enter a device SN or a VIN')` and abort.
- The DEVICE_ID banner already renders `json.sn || sn`; after a VIN fetch `json.sn` is the
  resolved SN, so the banner shows it with no further change.

### 2. `query.py` — add `--vin`

- Add `--vin` argument. Require **exactly one** of `--sn` / `--vin` (error otherwise).
- Compute `from_time`/`to_time` from `--start`/`--end` as today.
- **Resolve (only when `--vin` given):** run `client.get_log(project, logstore,
  from_time=from_time, to_time=to_time, query=<VIN>, size=1)`. Read `__tag__:sn` from the
  first returned log group's `contents`. That value is `resolved_sn`.
  - If no record or no `__tag__:sn` → print `{"error": "could not resolve SN from VIN <vin>"}`
    and return non-zero.
- **Search:** set `resolved_sn = args.sn` when `--sn` was given; otherwise use the value
  from the resolve step. Run the existing search with `query='__tag__:sn: ' + resolved_sn`
  over the same `from_time`/`to_time`.
- The saved-result stdout JSON gains `"sn": resolved_sn`, e.g.
  `print(json.dumps({'saved': abspath, 'sn': resolved_sn}))`, so the caller always learns
  the real SN. Saved JSON filename uses `resolved_sn`.

### 3. `server.js` — `GET /api/query`

- Read `const vin = req.query.vin`. Require `sn` **or** `vin`; else 400.
- Build args: `['query.py', '--vin', vin]` when `vin` is present, else `['query.py', '--sn', sn]`;
  then append `--start`/`--end` as today.
- After `result = JSON.parse(out)`, compute `const effectiveSn = result.sn || sn` and use
  `effectiveSn` in place of `sn` for:
  - the converted-CSV filename `downloads/raw_<effectiveSn>_converted_<ts>.csv`,
  - every `handleParseRequest('raw_<effectiveSn>.csv', …)` / `.log` call.
- Response body shape `{ sn, records }` is unchanged; `sn` is the resolved SN (set by
  `extractSn` from the resolved-SN filename).

### 4. `sn.js` — unchanged

The filename is built from the resolved 15-char SN, so `extractSn`'s regex passes. The
original 400 came from feeding the 17-char VIN into the filename; resolving first avoids it.

## Error Handling

- VIN with no matching record / no `__tag__:sn` → `query.py` returns the resolve error;
  `server.js` surfaces it (500 with the error message) and the UI shows it.
- Existing Aliyun-failure and local `raw_<SN>.csv` fallback paths are unchanged. The local
  fallback applies only to the `--sn` path (a VIN has no `raw_<VIN>.csv`).

## Testing

The existing `node:test` suite covers only the pure modules (`dictionary`, `parser`,
`formatter`, `sn`, `routes`). `query.py` (Aliyun SDK + network) and `server.js` (spawns
Python) are not unit-tested today, and this feature lives entirely in that integration layer.
No pure logic worth extracting is introduced — intent comes from the separate VIN field, not
a classifier.

**Manual end-to-end verification:**
1. Start the server (`npm start`).
2. In REMOTE_FETCH, enter VIN `LSV2BDDG6SN016885`, leave SN blank, set the date range, FETCH.
3. Expect: DEVICE_ID banner shows resolved SN `NSB306115BD8208`; the log table populates.
4. Regression: enter SN `NSB306115BD8208` (VIN blank) → identical results, no behavior change.
5. Error: enter a VIN with no logs in range → UI shows "could not resolve SN from VIN …".

## Out of Scope (YAGNI)

- VIN checksum / format validation beyond non-empty.
- Caching VIN→SN mappings.
- Handling multiple devices sharing a VIN (take the first resolved SN).
