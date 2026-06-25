# VIN → SN Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user enter a vehicle VIN in the REMOTE_FETCH panel; the system resolves it to the device SN via an Aliyun full-text lookup, then fetches all logs for that SN through the existing SN search path.

**Architecture:** `query.py` gains a `--vin` mode that runs a `size=1` full-text lookup over the same time window as the search, reads `__tag__:sn` from the first hit, and then runs the normal `__tag__:sn:<SN>` search. It always prints the resolved `sn` on stdout so `server.js` can build the converted-CSV filename from the real 15-char SN (which keeps `sn.js`'s regex happy). The frontend adds a separate VIN input that takes precedence over the SN box.

**Tech Stack:** Node.js + Express (`server.js`), Python 3 + `aliyun.log` SDK (`query.py`), vanilla HTML/CSS/JS frontend (`public/`). ES modules. No bundler.

## Global Constraints

- ES modules throughout (`"type": "module"` in package.json); no CommonJS `require`.
- VIN takes precedence over SN when both are filled; exactly one is used per fetch.
- The resolve lookup uses the **same** `from_time`/`to_time` as the search (no separate window).
- Response shape stays `{ sn: string, records: [...] }`; `sn` is the resolved SN.
- No new runtime dependencies. No VIN checksum/format validation beyond non-empty.
- This feature lives in the integration layer (`query.py` spawned by `server.js`, browser frontend). The repo's `node:test` suite only covers pure modules and there is no Python/browser test harness, so each task is verified by an explicit **manual** check, consistent with the existing project. Do not scaffold a new test framework.

---

### Task 1: `query.py` — add `--vin` two-step resolve

**Files:**
- Modify: `query.py` (argparse block ~52-58; resolve insert after ~125; search ~127-132; result assembly ~151-161)

**Interfaces:**
- Consumes: nothing new (Aliyun `LogClient.get_log`, already used).
- Produces: CLI now accepts `--vin <VIN>` as an alternative to `--sn <SN>`. On success prints `{"saved": "<abspath>", "sn": "<resolvedSN>"}` (the `sn` key is new and always present). On the in-memory fallback print, the JSON object gains an `"sn"` key too. On resolve failure prints `{"error": "could not resolve SN from VIN <vin>"}` and exits non-zero.

- [ ] **Step 1: Make `--sn` optional, add `--vin`, require exactly one**

Replace the argparse block (currently):

```python
    parser.add_argument('--sn', required=True, help='device SN, e.g. NSBB22100D59F7B')
    parser.add_argument('--start', help='start date in YYYY-MM-DD')
    parser.add_argument('--end', help='end date in YYYY-MM-DD')
    args = parser.parse_args()

    dbg(f'Starting query for SN={args.sn} start={args.start} end={args.end}')
```

with:

```python
    parser.add_argument('--sn', help='device SN, e.g. NSBB22100D59F7B')
    parser.add_argument('--vin', help='vehicle VIN (17-char); resolved to SN before searching')
    parser.add_argument('--start', help='start date in YYYY-MM-DD')
    parser.add_argument('--end', help='end date in YYYY-MM-DD')
    args = parser.parse_args()

    if bool(args.sn) == bool(args.vin):
        print(json.dumps({'error': 'provide exactly one of --sn or --vin'}))
        return 2

    dbg(f'Starting query for sn={args.sn} vin={args.vin} start={args.start} end={args.end}')
```

- [ ] **Step 2: Insert the VIN→SN resolve step (after `to_time` is computed)**

Immediately after these existing lines:

```python
        from_time = to_epoch_local(args.start, end_of_day=False)
        to_time = to_epoch_local(args.end, end_of_day=True)
```

insert:

```python
        if args.vin:
            dbg(f'Resolving SN from VIN={args.vin} (size=1, same window)')
            lookup = client.get_log(project, logstore,
                                    from_time=from_time,
                                    to_time=to_time,
                                    query=args.vin,
                                    size=1)
            resolved_sn = None
            try:
                for g in lookup.get_logs():
                    contents = getattr(g, 'contents', {}) or {}
                    if contents.get('__tag__:sn'):
                        resolved_sn = contents.get('__tag__:sn')
                        break
            except Exception:
                dbg('Could not iterate VIN lookup response')
            if not resolved_sn:
                dbg('VIN lookup returned no __tag__:sn')
                print(json.dumps({'error': f'could not resolve SN from VIN {args.vin}'}))
                return 2
            dbg(f'Resolved VIN {args.vin} -> SN {resolved_sn}')
        else:
            resolved_sn = args.sn
```

- [ ] **Step 3: Use `resolved_sn` in the search query**

Replace:

```python
        dbg(f'Calling get_log with from_time={from_time} to_time={to_time} query=__tag__:sn: {args.sn}')
        log_datas = client.get_log(project, logstore,
                                   from_time=from_time,
                                   to_time=to_time,
                                   query='__tag__:sn: '+args.sn,
                                   size=-1)
```

with:

```python
        dbg(f'Calling get_log with from_time={from_time} to_time={to_time} query=__tag__:sn: {resolved_sn}')
        log_datas = client.get_log(project, logstore,
                                   from_time=from_time,
                                   to_time=to_time,
                                   query='__tag__:sn: '+resolved_sn,
                                   size=-1)
```

- [ ] **Step 4: Put `resolved_sn` into the saved filename and stdout payloads**

Replace:

```python
        log_datas_info = {'datas': log_datas_list, 'count': getattr(log_datas, 'get_count', lambda: None)(), 'total_size': nums}
```

with:

```python
        log_datas_info = {'datas': log_datas_list, 'count': getattr(log_datas, 'get_count', lambda: None)(), 'total_size': nums, 'sn': resolved_sn}
```

Replace:

```python
        out_fname = os.path.join(downloads, 'raw_{}_{}.json'.format(args.sn, int(time.time())))
```

with:

```python
        out_fname = os.path.join(downloads, 'raw_{}_{}.json'.format(resolved_sn, int(time.time())))
```

Replace:

```python
            print(json.dumps({'saved': os.path.abspath(out_fname)}))
```

with:

```python
            print(json.dumps({'saved': os.path.abspath(out_fname), 'sn': resolved_sn}))
```

- [ ] **Step 5: Manually verify the SN path is unchanged (regression)**

Run (uses a real SN; expects the same behavior as before):

```bash
python query.py --sn NSB306115BD8208 --start 2026-06-01 --end 2026-06-25
```

Expected: stdout is a single JSON line now containing both `saved` and `sn`, e.g.
`{"saved": "D:\\Workshop\\LogParse\\downloads\\raw_NSB306115BD8208_...json", "sn": "NSB306115BD8208"}`.
(If the Aliyun SDK/credentials are unavailable in this environment, expect instead the existing fallback JSON — still valid; the change is additive.)

- [ ] **Step 6: Manually verify the VIN path resolves**

Run:

```bash
python query.py --vin LSV2BDDG6SN016885 --start 2026-06-01 --end 2026-06-25
```

Expected stderr (debug) shows `Resolved VIN LSV2BDDG6SN016885 -> SN NSB306115BD8208`; stdout JSON `sn` field is `NSB306115BD8208`. For a VIN with no logs in range, expect stdout `{"error": "could not resolve SN from VIN ..."}` and a non-zero exit.

- [ ] **Step 7: Commit**

```bash
git add query.py
git commit -m "feat(query): add --vin to resolve SN before searching"
```

---

### Task 2: `server.js` — accept `vin`, search by resolved SN, surface resolve errors

**Files:**
- Modify: `server.js` (`GET /api/query` handler: param read ~52-59; add `effectiveSn` after JSON parse ~68; filename uses ~139/143/153/160/204; catch block ~209-212)

**Interfaces:**
- Consumes: query.py stdout JSON with new `sn` field (Task 1); on python non-zero exit, the error JSON is on `err.stdout`.
- Produces: `GET /api/query` now accepts `?vin=<VIN>` as an alternative to `?sn=<SN>`. Response body unchanged (`{ sn, records }`), `sn` = resolved SN.

- [ ] **Step 1: Read `vin`, allow sn OR vin, pass the right flag**

Replace:

```javascript
app.get('/api/query', (req, res) => {
  const sn = req.query.sn;
  const start = req.query.start;
  const end = req.query.end;
  if (!sn) return res.status(400).json({ error: 'missing sn query parameter' });
  try {
    const args = ['query.py', '--sn', sn];
    if (start) args.push('--start', start);
    if (end) args.push('--end', end);
```

with:

```javascript
app.get('/api/query', (req, res) => {
  const sn = req.query.sn;
  const vin = req.query.vin;
  const start = req.query.start;
  const end = req.query.end;
  if (!sn && !vin) return res.status(400).json({ error: 'missing sn or vin query parameter' });
  try {
    const args = vin ? ['query.py', '--vin', vin] : ['query.py', '--sn', sn];
    if (start) args.push('--start', start);
    if (end) args.push('--end', end);
```

- [ ] **Step 2: Derive `effectiveSn` from query.py's resolved SN**

Immediately after the block that parses `result` (the `try { result = JSON.parse(out); } catch ... }`), add:

```javascript
    const effectiveSn = (result && result.sn) || sn;
```

- [ ] **Step 3: Use `effectiveSn` for every generated filename**

In the same handler, make these five replacements (all currently use the `sn` variable):

```javascript
        const savedCsvPath = `${downloadsDir}\\raw_${effectiveSn}_converted_${Date.now()}.csv`;
```
```javascript
          const { status, body } = handleParseRequest(`raw_${effectiveSn}.csv`, buffer, dictionary);
```
(the line above is the one inside the `parsed.datas` branch, immediately before `if (body && typeof body === 'object') body._saved_csv = savedCsvPath;`)

```javascript
      const { status, body } = handleParseRequest(`raw_${effectiveSn}.csv`, buffer, dictionary);
```
(the "treat as raw csv/text" branch)

```javascript
      const { status, body } = handleParseRequest(`raw_${effectiveSn}.csv`, buffer, dictionary);
```
(the legacy `result.content` branch)

```javascript
      const { status, body } = handleParseRequest(`raw_${effectiveSn}.log`, buffer, dictionary);
```
(the `result.datas` branch)

- [ ] **Step 4: Surface query.py's stdout error in the catch block**

Replace:

```javascript
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message, details: err.stderr ? err.stderr.toString() : undefined });
  }
```

with:

```javascript
  } catch (err) {
    console.error(err);
    let body = { error: err.message };
    if (err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout.toString());
        if (parsed && parsed.error) body = parsed;
      } catch (_) { /* stdout was not JSON */ }
    }
    if (err.stderr) body.details = err.stderr.toString();
    return res.status(500).json(body);
  }
```

- [ ] **Step 5: Smoke-test the server boots**

Run:

```bash
node --check server.js
```

Expected: no output, exit 0 (syntax valid). If Python + Aliyun are available, also run `npm start` and confirm `LogParse listening on http://localhost:3000`.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(server): accept vin param, search by resolved SN, surface resolve errors"
```

---

### Task 3: Frontend — VIN input box and precedence in the FETCH handler

**Files:**
- Modify: `public/index.html` (REMOTE_FETCH section ~37-45)
- Modify: `public/app.js` (element refs ~6; handler ~46-61)

**Interfaces:**
- Consumes: `GET /api/query?vin=<VIN>` (Task 2).
- Produces: a `#vinInput` element; the FETCH handler sends `vin` when present, else `sn`.

- [ ] **Step 1: Add the VIN input beside the SN input**

In `public/index.html`, replace:

```html
        <div class="fetch-area">
          <input id="snInput" placeholder="SN e.g. NSBB22100D59F7B" aria-label="Device SN">
```

with:

```html
        <div class="fetch-area">
          <input id="snInput" placeholder="SN e.g. NSBB22100D59F7B" aria-label="Device SN">
          <input id="vinInput" placeholder="VIN e.g. LSV2BDDG6SN016885" aria-label="Vehicle VIN">
```

- [ ] **Step 2: Add the element reference in `app.js`**

Replace:

```javascript
const snInput    = document.getElementById('snInput');
```

with:

```javascript
const snInput    = document.getElementById('snInput');
const vinInput   = document.getElementById('vinInput');
```

- [ ] **Step 3: Read VIN first and send the right param**

Replace:

```javascript
queryBtn.addEventListener('click', async () => {
  const sn = (snInput.value || '').trim();
  if (!sn) {
    showError('Please enter device SN (e.g. NSBB22100D59F7B)');
    return;
  }
```

with:

```javascript
queryBtn.addEventListener('click', async () => {
  const sn = (snInput.value || '').trim();
  const vin = (vinInput.value || '').trim();
  if (!sn && !vin) {
    showError('Please enter a device SN or a VIN');
    return;
  }
```

Then replace:

```javascript
  const params = new URLSearchParams();
  params.set('sn', sn);
```

with:

```javascript
  const params = new URLSearchParams();
  if (vin) params.set('vin', vin);
  else params.set('sn', sn);
```

- [ ] **Step 4: Manual end-to-end verification**

Start the server (`npm start`) and open `http://localhost:3000`. Then:
1. Enter VIN `LSV2BDDG6SN016885`, leave SN blank, pick a date range, click FETCH.
   Expected: DEVICE_ID banner shows resolved SN `NSB306115BD8208`; the log table populates.
2. Enter SN `NSB306115BD8208` (VIN blank), FETCH. Expected: identical results — no regression.
3. Leave both blank, FETCH. Expected: inline error "Please enter a device SN or a VIN".
4. Enter a VIN with no logs in range. Expected: error banner "could not resolve SN from VIN …".

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js
git commit -m "feat(ui): add VIN input that resolves to SN on remote fetch"
```

---

## Self-Review

**Spec coverage:**
- Frontend separate VIN box + precedence → Task 3. ✓
- `query.py --vin`, same-window `size=1` resolve, `__tag__:sn` extraction, resolved-sn search, `sn` in stdout → Task 1. ✓
- `server.js` accepts `vin`, `effectiveSn` for all filenames, surfaces resolve error → Task 2. ✓
- `sn.js` unchanged (resolved 15-char SN passes the regex) → no task needed; verified by Task 3 manual step 1. ✓
- Error handling (no record / no `__tag__:sn`) → Task 1 Step 2 + Task 2 Step 4. ✓
- Testing = manual E2E (no unit harness in repo) → each task has explicit manual checks. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are concrete full replacements. ✓

**Type/name consistency:** `resolved_sn` (Python) used consistently in Task 1; stdout key `sn` (Task 1) consumed as `result.sn` → `effectiveSn` (Task 2); `vin` query param produced by Task 3, consumed by Task 2; `#vinInput` / `vinInput` consistent in Task 3. ✓
