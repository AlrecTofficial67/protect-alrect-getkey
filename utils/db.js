const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");
const CHECKPOINTS_FILE = path.join(DATA_DIR, "checkpoints.json");

// Pastikan folder & file ada
function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(KEYS_FILE)) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({}), "utf8");
  }
  if (!fs.existsSync(CHECKPOINTS_FILE)) {
    fs.writeFileSync(CHECKPOINTS_FILE, JSON.stringify({}), "utf8");
  }
}

ensureFiles();

// Read JSON safely
function readJSON(filepath) {
  try {
    const raw = fs.readFileSync(filepath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

// Write JSON safely (atomic-style dengan temp file)
function writeJSON(filepath, data) {
  const tmpPath = filepath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filepath);
}

// ============ KEYS ============

function getAllKeys() {
  return readJSON(KEYS_FILE);
}

function getKey(keyString) {
  const keys = readJSON(KEYS_FILE);
  return keys[keyString] || null;
}

function saveKey(keyString, keyData) {
  const keys = readJSON(KEYS_FILE);
  keys[keyString] = keyData;
  writeJSON(KEYS_FILE, keys);
}

function deleteKey(keyString) {
  const keys = readJSON(KEYS_FILE);
  delete keys[keyString];
  writeJSON(KEYS_FILE, keys);
}

function getKeyByHWID(hwid) {
  const keys = readJSON(KEYS_FILE);
  for (const [k, v] of Object.entries(keys)) {
    if (v.hwid === hwid) return { key: k, ...v };
  }
  return null;
}

// ============ CHECKPOINTS ============

function getAllCheckpoints() {
  return readJSON(CHECKPOINTS_FILE);
}

function getCheckpoint(hwid) {
  const cps = readJSON(CHECKPOINTS_FILE);
  return cps[hwid] || null;
}

function saveCheckpoint(hwid, data) {
  const cps = readJSON(CHECKPOINTS_FILE);
  cps[hwid] = data;
  writeJSON(CHECKPOINTS_FILE, cps);
}

function deleteCheckpoint(hwid) {
  const cps = readJSON(CHECKPOINTS_FILE);
  delete cps[hwid];
  writeJSON(CHECKPOINTS_FILE, cps);
}

// ============ CLEANUP (expired keys) ============

function cleanupExpired() {
  const keys = readJSON(KEYS_FILE);
  const now = Date.now();
  let cleaned = 0;
  for (const [k, v] of Object.entries(keys)) {
    if (v.expiresAt && v.expiresAt < now) {
      delete keys[k];
      cleaned++;
    }
  }
  if (cleaned > 0) {
    writeJSON(KEYS_FILE, keys);
    console.log(`[CLEANUP] Removed ${cleaned} expired keys.`);
  }

  const cps = readJSON(CHECKPOINTS_FILE);
  let cpCleaned = 0;
  for (const [hwid, cp] of Object.entries(cps)) {
    // Checkpoint expired setelah 2 jam
    if (cp.createdAt && Date.now() - cp.createdAt > 2 * 60 * 60 * 1000) {
      delete cps[hwid];
      cpCleaned++;
    }
  }
  if (cpCleaned > 0) {
    writeJSON(CHECKPOINTS_FILE, cps);
    console.log(`[CLEANUP] Removed ${cpCleaned} expired checkpoints.`);
  }
}

// Jalankan cleanup setiap 10 menit
setInterval(cleanupExpired, 10 * 60 * 1000);

module.exports = {
  getAllKeys,
  getKey,
  saveKey,
  deleteKey,
  getKeyByHWID,
  getAllCheckpoints,
  getCheckpoint,
  saveCheckpoint,
  deleteCheckpoint,
  cleanupExpired,
};
