const express = require("express");
const router = express.Router();
const db = require("../utils/db");
const {
  generateKey,
  isValidKeyFormat,
  hashHWID,
  isValidHWID,
  getExpiryTime,
  isExpired,
  formatExpiry,
  getTimeRemaining,
} = require("../utils/keyUtils");

// POST /api/key/generate
// Body: { hwid: string }
// Dipanggil setelah checkpoint 2 selesai
router.post("/generate", (req, res) => {
  const { hwid } = req.body;

  // Validasi HWID
  if (!isValidHWID(hwid)) {
    return res.status(400).json({
      success: false,
      status: "INVALID_HWID",
      message: "HWID tidak valid atau tidak ada.",
    });
  }

  const hashedHWID = hashHWID(hwid);

  // Cek checkpoint - harus sudah melewati checkpoint 2
  const checkpoint = db.getCheckpoint(hashedHWID);
  if (!checkpoint) {
    return res.status(403).json({
      success: false,
      status: "CHECKPOINT_REQUIRED",
      message: "Kamu harus menyelesaikan checkpoint terlebih dahulu.",
    });
  }

  if (!checkpoint.checkpoint1Done || !checkpoint.checkpoint2Done) {
    return res.status(403).json({
      success: false,
      status: "CHECKPOINT_INCOMPLETE",
      message: `Checkpoint belum selesai. CP1: ${checkpoint.checkpoint1Done ? "✓" : "✗"}, CP2: ${checkpoint.checkpoint2Done ? "✓" : "✗"}`,
    });
  }

  // Cek apakah HWID sudah punya key aktif
  const existingByHWID = db.getKeyByHWID(hashedHWID);
  if (existingByHWID) {
    if (!isExpired(existingByHWID.expiresAt)) {
      return res.status(200).json({
        success: true,
        status: "KEY_ALREADY_EXISTS",
        message: "HWID kamu sudah memiliki key aktif.",
        key: existingByHWID.key,
        expiresAt: formatExpiry(existingByHWID.expiresAt),
        timeRemaining: getTimeRemaining(existingByHWID.expiresAt),
      });
    }
    // Key lama expired, hapus
    db.deleteKey(existingByHWID.key);
  }

  // Generate key unik
  let newKey;
  let attempts = 0;
  do {
    newKey = generateKey();
    attempts++;
    if (attempts > 100) {
      return res.status(500).json({
        success: false,
        status: "SERVER_ERROR",
        message: "Gagal generate key unik. Coba lagi.",
      });
    }
  } while (db.getKey(newKey) !== null);

  const expiresAt = getExpiryTime();
  const keyData = {
    hwid: hashedHWID,
    createdAt: Date.now(),
    expiresAt: expiresAt,
    used: false,
    ip: req.ip,
  };

  db.saveKey(newKey, keyData);

  // Hapus checkpoint setelah key digenerate (tidak bisa generate lagi tanpa checkpoint baru)
  db.deleteCheckpoint(hashedHWID);

  console.log(`[KEY GENERATED] ${newKey} | HWID: ${hashedHWID.slice(0, 8)}... | Expires: ${formatExpiry(expiresAt)}`);

  return res.status(200).json({
    success: true,
    status: "KEY_GENERATED",
    message: "Key berhasil dibuat!",
    key: newKey,
    expiresAt: formatExpiry(expiresAt),
    timeRemaining: getTimeRemaining(expiresAt),
  });
});

// POST /api/verify
// Body: { key: string, hwid: string }
// Dipanggil oleh Roblox executor untuk verifikasi key
router.post("/", (req, res) => {
  const { key, hwid } = req.body;

  // Validasi input dasar
  if (!key || !hwid) {
    return res.status(400).json({
      success: false,
      status: "MISSING_PARAMS",
      message: "Key dan HWID wajib dikirim.",
    });
  }

  // Validasi format key
  if (!isValidKeyFormat(key)) {
    return res.status(400).json({
      success: false,
      status: "INVALID_KEY_FORMAT",
      message: "Format key tidak valid.",
    });
  }

  // Validasi HWID
  if (!isValidHWID(hwid)) {
    return res.status(400).json({
      success: false,
      status: "INVALID_HWID",
      message: "HWID tidak valid.",
    });
  }

  const hashedHWID = hashHWID(hwid);

  // Ambil data key dari database
  const keyData = db.getKey(key);

  if (!keyData) {
    return res.status(404).json({
      success: false,
      status: "KEY_NOT_FOUND",
      message: "Key tidak ditemukan di database.",
    });
  }

  // Cek expired
  if (isExpired(keyData.expiresAt)) {
    return res.status(403).json({
      success: false,
      status: "KEY_EXPIRED",
      message: "Key sudah kadaluarsa. Silakan generate key baru.",
      expiredAt: formatExpiry(keyData.expiresAt),
    });
  }

  // Cek HWID match
  if (keyData.hwid !== hashedHWID) {
    console.warn(`[HWID MISMATCH] Key: ${key} | Expected: ${keyData.hwid.slice(0, 8)}... | Got: ${hashedHWID.slice(0, 8)}...`);
    return res.status(403).json({
      success: false,
      status: "HWID_MISMATCH",
      message: "Key ini tidak terdaftar untuk perangkat kamu.",
    });
  }

  // Key valid!
  // Update last used
  keyData.lastUsed = Date.now();
  keyData.useCount = (keyData.useCount || 0) + 1;
  db.saveKey(key, keyData);

  console.log(`[KEY VERIFIED] ${key} | HWID: ${hashedHWID.slice(0, 8)}... | Uses: ${keyData.useCount}`);

  return res.status(200).json({
    success: true,
    status: "KEY_VALID",
    message: "Key valid! Executor siap digunakan.",
    key: key,
    expiresAt: formatExpiry(keyData.expiresAt),
    timeRemaining: getTimeRemaining(keyData.expiresAt),
    useCount: keyData.useCount,
  });
});

// GET /api/key/status/:key
// Cek status key (tanpa HWID - hanya info umum)
router.get("/status/:key", (req, res) => {
  const { key } = req.params;

  if (!isValidKeyFormat(key)) {
    return res.status(400).json({
      success: false,
      status: "INVALID_KEY_FORMAT",
      message: "Format key tidak valid.",
    });
  }

  const keyData = db.getKey(key);

  if (!keyData) {
    return res.status(404).json({
      success: false,
      status: "KEY_NOT_FOUND",
      message: "Key tidak ditemukan.",
    });
  }

  const expired = isExpired(keyData.expiresAt);

  return res.status(200).json({
    success: true,
    status: expired ? "KEY_EXPIRED" : "KEY_EXISTS",
    expired: expired,
    expiresAt: formatExpiry(keyData.expiresAt),
    timeRemaining: expired ? "Expired" : getTimeRemaining(keyData.expiresAt),
    createdAt: formatExpiry(keyData.createdAt),
  });
});

module.exports = router;
