import express from 'express';
import multer from 'multer';
import { loadDictionary } from './src/dictionary.js';
import { handleParseRequest } from './src/routes.js';
import { setTimezoneOffsetHours } from './src/formatter.js';
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';

// Detect the real Python interpreter path.
// We intentionally use execSync (which goes through cmd.exe shell) so that
// pyenv shims, conda activations, and .bat wrappers are all handled correctly.
// Python's own sys.executable then tells us the absolute path to the real .exe,
// which is what execFileSync (no shell) can actually spawn.
function detectPython() {
  for (const cmd of ['py', 'python3', 'python']) {
    try {
      const exe = execSync(
        `${cmd} -c "import sys; print(sys.executable)"`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
      if (exe && fs.existsSync(exe)) {
        return exe;
      }
    } catch {
      // not available, try next
    }
  }
  throw new Error('Python not found. Please install Python and ensure it is in your PATH.');
}
const PYTHON = detectPython();
console.log(`Using Python executable: ${PYTHON}`);

const app = express();
const dictionary = loadDictionary('./event_trace.csv');
console.log(`Loaded ${dictionary.size} events from event_trace.csv`);

// configure timezone offset (hours) from env, default handled in formatter
if (process.env.TIMEZONE_OFFSET_HOURS !== undefined) {
  setTimezoneOffsetHours(process.env.TIMEZONE_OFFSET_HOURS);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(express.static('public'));

// New endpoint: fetch logs from Aliyun using local query.py helper.
// Query params: sn (required), start (optional, YYYY-MM-DD), end (optional, YYYY-MM-DD)
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
    const opts = { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 };
    const out = execFileSync(PYTHON, args, opts);
    let result;
    try {
      result = JSON.parse(out);
    } catch (e) {
      console.error('Failed to parse python stdout as JSON', e);
      return res.status(500).json({ error: 'invalid response from query.py' });
    }
    const effectiveSn = (result && result.sn) || sn;

    // If python saved the query result to a file, read it and parse
    if (result && result.saved) {
      const savedPath = result.saved;
      if (!fs.existsSync(savedPath)) {
        return res.status(500).json({ error: 'saved file not found', path: savedPath });
      }
      const content = fs.readFileSync(savedPath, 'utf8');
      // try parse as JSON (saved structured log)
      try {
        const parsed = JSON.parse(content);
        if (parsed && parsed.datas) {
          // filter parsed.datas by requested start/end (use __tag__:__receive_time__ if present)
          const startParam = req.query.start;
          const endParam = req.query.end;
          let startEpoch = null;
          let endEpoch = null;
          if (startParam) {
            // interpret provided date as local midnight (UTC+8)
            const s = new Date(startParam + 'T00:00:00+08:00');
            if (!isNaN(s)) startEpoch = Math.floor(s.getTime() / 1000);
          }
          if (endParam) {
            const eDate = new Date(endParam + 'T23:59:59+08:00');
            if (!isNaN(eDate)) endEpoch = Math.floor(eDate.getTime() / 1000);
          }
          const filtered = parsed.datas.filter(d => {
            const recv = d['__tag__:__receive_time__'] || d['__tag__:__receive_time__'];
            if (recv) {
              const r = parseInt(String(recv).replace(/\D/g, ''), 10);
              if (!isNaN(r)) {
                if (startEpoch !== null && r < startEpoch) return false;
                if (endEpoch !== null && r > endEpoch) return false;
                return true;
              }
            }
            // fallback: try __tag__:t string parse
            if (d['__tag__:t']) {
              const dt = new Date(d['__tag__:t'] + 'Z');
              if (!isNaN(dt)) {
                const rv = Math.floor(dt.getTime() / 1000);
                if (startEpoch !== null && rv < startEpoch) return false;
                if (endEpoch !== null && rv > endEpoch) return false;
                return true;
              }
            }
            // if no time info, include
            return true;
          });

          // convert structured datas -> raw CSV with header matching existing raw files
          const header = 'FG_log_0,__source__,__tag__:__client_ip__,__tag__:__pack_id__,__tag__:__receive_time__,__tag__:e,__tag__:sn,__tag__:t,__time__,__topic__';
          const rows = filtered.map(d => {
            const fg = (d.FG_log_0 || '').replace(/"/g, '""');
            const src = d.__source__ || '';
            const client_ip = d['__tag__:__client_ip__'] || '';
            const pack_id = d['__tag__:__pack_id__'] || '';
            const receive_time = d['__tag__:__receive_time__'] || '';
            const e = d['__tag__:e'] || '';
            const snTag = d['__tag__:sn'] || '';
            const t = d['__tag__:t'] || '';
            const timecol = d['__time__'] || '';
            const topic = d['__topic__'] || '';
            // wrap FG_log_0 in double quotes; other fields are raw
            return '"' + fg + '",' + [src, client_ip, pack_id, receive_time, e, snTag, t, timecol, topic].map(x => (x === undefined ? '' : String(x))).join(',');
          }).join('\n');
          const csvText = header + '\n' + rows;
          // save converted CSV to downloads
          const downloadsDir = 'downloads';
          if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
          const savedCsvPath = `${downloadsDir}\\raw_${effectiveSn}_converted_${Date.now()}.csv`;
          fs.writeFileSync(savedCsvPath, csvText, 'utf8');
          console.log(`Saved converted CSV to ${savedCsvPath}`);
          const buffer = Buffer.from(csvText, 'utf8');
          const { status, body } = handleParseRequest(`raw_${effectiveSn}.csv`, buffer, dictionary);
          // include saved path in response for visibility
          if (body && typeof body === 'object') body._saved_csv = savedCsvPath;
          return res.status(status).json(body);
        }
      } catch (e) {
        // not JSON, treat as plain CSV/text
      }
      // treat as raw csv/text
      const buffer = Buffer.from(content, 'utf8');
      const { status, body } = handleParseRequest(`raw_${effectiveSn}.csv`, buffer, dictionary);
      return res.status(status).json(body);
    }

    // legacy fields
    if (result && result.content) {
      const buffer = Buffer.from(result.content, 'utf8');
      const { status, body } = handleParseRequest(`raw_${effectiveSn}.csv`, buffer, dictionary);
      return res.status(status).json(body);
    }

    if (result && result.datas) {
      // filter datas by requested start/end (treat dates as local midnight UTC+8)
      let datas = result.datas;
      const startParam = req.query.start;
      const endParam = req.query.end;
      if (startParam || endParam) {
        let startEpoch = null;
        let endEpoch = null;
        if (startParam) {
          const s = new Date(startParam + 'T00:00:00+08:00');
          if (!isNaN(s)) startEpoch = Math.floor(s.getTime() / 1000);
        }
        if (endParam) {
          const eDate = new Date(endParam + 'T23:59:59+08:00');
          if (!isNaN(eDate)) endEpoch = Math.floor(eDate.getTime() / 1000);
        }
        datas = datas.filter(d => {
          const recv = d['__tag__:__receive_time__'] || d['__tag__:__receive_time__'];
          if (recv) {
            const r = parseInt(String(recv).replace(/\D/g, ''), 10);
            if (!isNaN(r)) {
              if (startEpoch !== null && r < startEpoch) return false;
              if (endEpoch !== null && r > endEpoch) return false;
              return true;
            }
          }
          if (d['__tag__:t']) {
            const dt = new Date(d['__tag__:t'] + 'Z');
            if (!isNaN(dt)) {
              const rv = Math.floor(dt.getTime() / 1000);
              if (startEpoch !== null && rv < startEpoch) return false;
              if (endEpoch !== null && rv > endEpoch) return false;
              return true;
            }
          }
          return true;
        });
      }
      const csvText = datas.map(d => JSON.stringify(d)).join('\n');
      const buffer = Buffer.from(csvText, 'utf8');
      const { status, body } = handleParseRequest(`raw_${effectiveSn}.log`, buffer, dictionary);
      return res.status(status).json(body);
    }

    return res.status(500).json({ error: 'unexpected response from query.py', result });
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
});

app.post('/api/parse', upload.single('logfile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'no file' });
  }
  try {
    const { status, body } = handleParseRequest(
      req.file.originalname,
      req.file.buffer,
      dictionary
    );
    res.status(status).json(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file too large (max 5 MB)' });
  }
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LogParse listening on http://localhost:${PORT}`));
