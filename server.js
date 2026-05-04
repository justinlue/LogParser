import express from 'express';
import multer from 'multer';
import { loadDictionary } from './src/dictionary.js';
import { handleParseRequest } from './src/routes.js';

const app = express();
const dictionary = loadDictionary('./event_trace.csv');
console.log(`Loaded ${dictionary.size} events from event_trace.csv`);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(express.static('public'));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LogParse listening on http://localhost:${PORT}`));
