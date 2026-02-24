const express = require("express");
const router = express.Router();
const db = require("../utils/db");
const { requireAdmin } = require("../middleware/auth");
const { isValidKeyFormat, isExpired, formatExpiry, getTimeRemaining, hashHWID, isValidHWID } = require("../utils/keyUtils");

// Semua route admin butuh token
router.use(requireAdmin);

// GET /api/admin/keys - Lihat semua key
router.get("/keys", (req, res) => {
  const keys = db.getAllKeys();
  const result = [];

  for (const [k, v] of Object.entries(keys)) {
    result.push({
      key: k,
      hwid: v.hwid ? v.hwid.slice(0, 12) + "..." : "unknown",
      createdAt: formatExpiry(v.createdAt),
      expiresAt: formatExpiry(v.expiresAt),
      expired: isExpired(v.expiresAt),
      timeRemaining: getTimeRemaining(v.expiresAt),
      useCount: v.useCount || 0,
      lastUsed: v.lastUsed ? formatExpiry(v.lastUsed) : "Never",
    });
  }

  return res.status(200).json({
    success: true,
    total: result.length,
    active: result.filter((k) => !k.expired).length,
    expired: result.filter((k) => k.expired).length,
    keys: result,
  });
});

// DELETE /api/admin/keys/:key - Hapus key tertentu
router.delete("/keys/:key", (req, res) => {
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

  db.deleteKey(key);
  console.log(`[ADMIN] Key deleted: ${key}`);

  return res.status(200).json({
    success: true,
    status: "KEY_DELETED",
    message: `Key ${key} berhasil dihapus.`,
  });
});

// POST /api/admin/cleanup - Bersihkan key expired
router.post("/cleanup", (req, res) => {
  db.cleanupExpired();
  return res.status(200).json({
    success: true,
    status: "CLEANUP_DONE",
    message: "Cleanup selesai.",
  });
});

// GET /api/admin/stats - Statistik sistem
router.get("/stats", (req, res) => {
  const keys = db.getAllKeys();
  const checkpoints = db.getAllCheckpoints();

  let active = 0;
  let expired = 0;
  let totalUses = 0;

  for (const v of Object.values(keys)) {
    if (isExpired(v.expiresAt)) expired++;
    else active++;
    totalUses += v.useCount || 0;
  }

  return res.status(200).json({
    success: true,
    stats: {
      totalKeys: Object.keys(keys).length,
      activeKeys: active,
      expiredKeys: expired,
      totalVerifications: totalUses,
      activeCheckpoints: Object.keys(checkpoints).length,
    },
  });
});

// DELETE /api/admin/checkpoint/:hwid - Reset checkpoint untuk HWID
router.delete("/checkpoint/:hwid", (req, res) => {
  const { hwid } = req.params;

  if (!isValidHWID(hwid)) {
    return res.status(400).json({
      success: false,
      status: "INVALID_HWID",
      message: "HWID tidak valid.",
    });
  }

  const hashedHWID = hashHWID(hwid);
  db.deleteCheckpoint(hashedHWID);

  return res.status(200).json({
    success: true,
    status: "CHECKPOINT_RESET",
    message: "Checkpoint berhasil direset untuk HWID tersebut.",
  });
});

module.exports = router;
