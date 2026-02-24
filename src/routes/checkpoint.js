const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const db = require("../utils/db");
const { hashHWID, isValidHWID } = require("../utils/keyUtils");

// Token rahasia untuk verifikasi checkpoint (TIDAK pernah dikirim ke client)
const CP1_SECRET = process.env.CP1_SECRET || crypto.randomBytes(32).toString("hex");
const CP2_SECRET = process.env.CP2_SECRET || crypto.randomBytes(32).toString("hex");

// Generate token challenge untuk checkpoint
function generateChallengeToken(hwid, step, secret) {
  const timestamp = Math.floor(Date.now() / (5 * 60 * 1000)); // Valid 5 menit
  return crypto
    .createHmac("sha256", secret)
    .update(`${hwid}:${step}:${timestamp}`)
    .digest("hex");
}

// Verifikasi token challenge (cek timestamp sekarang dan sebelumnya)
function verifyChallengeToken(hwid, step, token, secret) {
  const now = Math.floor(Date.now() / (5 * 60 * 1000));
  const tokenNow = crypto.createHmac("sha256", secret).update(`${hwid}:${step}:${now}`).digest("hex");
  const tokenPrev = crypto.createHmac("sha256", secret).update(`${hwid}:${step}:${now - 1}`).digest("hex");
  // Constant-time comparison
  const matchNow = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(tokenNow));
  const matchPrev = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(tokenPrev));
  return matchNow || matchPrev;
}

// ============================================================
// CHECKPOINT 1: User memulai proses get key
// POST /api/checkpoint/start
// Body: { hwid: string }
// Response: { token: string, redirectUrl: string }
// ============================================================
router.post("/start", (req, res) => {
  const { hwid } = req.body;

  if (!isValidHWID(hwid)) {
    return res.status(400).json({
      success: false,
      status: "INVALID_HWID",
      message: "HWID tidak valid.",
    });
  }

  const hashedHWID = hashHWID(hwid);

  // Buat atau update checkpoint record
  const existing = db.getCheckpoint(hashedHWID);
  if (existing && existing.checkpoint1Done && existing.checkpoint2Done) {
    // Jika sudah selesai semua tapi belum generate key
    return res.status(200).json({
      success: true,
      status: "CHECKPOINT_COMPLETE",
      message: "Checkpoint sudah selesai. Silakan generate key.",
      readyToGenerate: true,
    });
  }

  db.saveCheckpoint(hashedHWID, {
    hwid: hashedHWID,
    createdAt: Date.now(),
    checkpoint1Done: false,
    checkpoint2Done: false,
    step: 1,
  });

  // Generate CP1 token
  const cp1Token = generateChallengeToken(hashedHWID, "cp1", CP1_SECRET);

  // URL checkpoint 1 - link ke halaman ads/offerwall dummy (bisa dikustomisasi)
  // User harus mengunjungi URL ini, lalu sistem akan verify
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const redirectUrl = `${baseUrl}/checkpoint1?hwid=${encodeURIComponent(hwid)}&token=${cp1Token}`;

  console.log(`[CHECKPOINT] Start | HWID: ${hashedHWID.slice(0, 8)}... | CP1 initiated`);

  return res.status(200).json({
    success: true,
    status: "CHECKPOINT_1_STARTED",
    message: "Checkpoint 1 dimulai. Kunjungi link berikut untuk melanjutkan.",
    step: 1,
    redirectUrl: redirectUrl,
    expiresIn: "5 menit",
  });
});

// ============================================================
// VERIFY CHECKPOINT 1
// POST /api/checkpoint/verify1
// Body: { hwid: string, token: string }
// ============================================================
router.post("/verify1", (req, res) => {
  const { hwid, token } = req.body;

  if (!isValidHWID(hwid) || !token) {
    return res.status(400).json({
      success: false,
      status: "INVALID_PARAMS",
      message: "HWID atau token tidak valid.",
    });
  }

  if (typeof token !== "string" || token.length !== 64) {
    return res.status(400).json({
      success: false,
      status: "INVALID_TOKEN_FORMAT",
      message: "Format token tidak valid.",
    });
  }

  const hashedHWID = hashHWID(hwid);
  const checkpoint = db.getCheckpoint(hashedHWID);

  if (!checkpoint) {
    return res.status(403).json({
      success: false,
      status: "CHECKPOINT_NOT_STARTED",
      message: "Checkpoint belum dimulai. Panggil /api/checkpoint/start terlebih dahulu.",
    });
  }

  if (checkpoint.checkpoint1Done) {
    // Sudah selesai CP1, lanjut ke CP2
    const cp2Token = generateChallengeToken(hashedHWID, "cp2", CP2_SECRET);
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const redirectUrl = `${baseUrl}/checkpoint2?hwid=${encodeURIComponent(hwid)}&token=${cp2Token}`;

    return res.status(200).json({
      success: true,
      status: "CHECKPOINT_1_ALREADY_DONE",
      message: "Checkpoint 1 sudah selesai. Lanjutkan ke Checkpoint 2.",
      step: 2,
      redirectUrl: redirectUrl,
    });
  }

  // Verifikasi token CP1
  const isValid = verifyChallengeToken(hashedHWID, "cp1", token, CP1_SECRET);

  if (!isValid) {
    return res.status(403).json({
      success: false,
      status: "INVALID_TOKEN",
      message: "Token checkpoint 1 tidak valid atau kadaluarsa. Mulai ulang proses.",
    });
  }

  // Tandai CP1 selesai
  checkpoint.checkpoint1Done = true;
  checkpoint.checkpoint1At = Date.now();
  db.saveCheckpoint(hashedHWID, checkpoint);

  // Generate CP2 token
  const cp2Token = generateChallengeToken(hashedHWID, "cp2", CP2_SECRET);
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const redirectUrl = `${baseUrl}/checkpoint2?hwid=${encodeURIComponent(hwid)}&token=${cp2Token}`;

  console.log(`[CHECKPOINT] CP1 done | HWID: ${hashedHWID.slice(0, 8)}...`);

  return res.status(200).json({
    success: true,
    status: "CHECKPOINT_1_DONE",
    message: "Checkpoint 1 berhasil! Lanjutkan ke Checkpoint 2.",
    step: 2,
    redirectUrl: redirectUrl,
    expiresIn: "5 menit",
  });
});

// ============================================================
// VERIFY CHECKPOINT 2 (Final)
// POST /api/checkpoint/verify2
// Body: { hwid: string, token: string }
// ============================================================
router.post("/verify2", (req, res) => {
  const { hwid, token } = req.body;

  if (!isValidHWID(hwid) || !token) {
    return res.status(400).json({
      success: false,
      status: "INVALID_PARAMS",
      message: "HWID atau token tidak valid.",
    });
  }

  if (typeof token !== "string" || token.length !== 64) {
    return res.status(400).json({
      success: false,
      status: "INVALID_TOKEN_FORMAT",
      message: "Format token tidak valid.",
    });
  }

  const hashedHWID = hashHWID(hwid);
  const checkpoint = db.getCheckpoint(hashedHWID);

  if (!checkpoint) {
    return res.status(403).json({
      success: false,
      status: "CHECKPOINT_NOT_STARTED",
      message: "Checkpoint belum dimulai.",
    });
  }

  if (!checkpoint.checkpoint1Done) {
    return res.status(403).json({
      success: false,
      status: "CHECKPOINT_1_REQUIRED",
      message: "Kamu harus menyelesaikan Checkpoint 1 terlebih dahulu.",
    });
  }

  if (checkpoint.checkpoint2Done) {
    return res.status(200).json({
      success: true,
      status: "CHECKPOINT_COMPLETE",
      message: "Semua checkpoint selesai! Silakan generate key.",
      readyToGenerate: true,
    });
  }

  // Verifikasi token CP2
  const isValid = verifyChallengeToken(hashedHWID, "cp2", token, CP2_SECRET);

  if (!isValid) {
    return res.status(403).json({
      success: false,
      status: "INVALID_TOKEN",
      message: "Token checkpoint 2 tidak valid atau kadaluarsa. Ulangi dari checkpoint 1.",
    });
  }

  // Tandai CP2 selesai
  checkpoint.checkpoint2Done = true;
  checkpoint.checkpoint2At = Date.now();
  db.saveCheckpoint(hashedHWID, checkpoint);

  console.log(`[CHECKPOINT] CP2 done | HWID: ${hashedHWID.slice(0, 8)}... | READY TO GENERATE`);

  return res.status(200).json({
    success: true,
    status: "CHECKPOINT_COMPLETE",
    message: "Semua checkpoint selesai! Kamu sekarang bisa generate key.",
    readyToGenerate: true,
  });
});

// GET /api/checkpoint/status
// Body: { hwid }
router.get("/status", (req, res) => {
  const { hwid } = req.query;

  if (!isValidHWID(hwid)) {
    return res.status(400).json({
      success: false,
      status: "INVALID_HWID",
      message: "HWID tidak valid.",
    });
  }

  const hashedHWID = hashHWID(hwid);
  const checkpoint = db.getCheckpoint(hashedHWID);

  if (!checkpoint) {
    return res.status(200).json({
      success: true,
      status: "NO_CHECKPOINT",
      checkpoint1Done: false,
      checkpoint2Done: false,
      readyToGenerate: false,
    });
  }

  return res.status(200).json({
    success: true,
    status: "CHECKPOINT_STATUS",
    checkpoint1Done: checkpoint.checkpoint1Done || false,
    checkpoint2Done: checkpoint.checkpoint2Done || false,
    readyToGenerate: checkpoint.checkpoint1Done && checkpoint.checkpoint2Done,
    startedAt: new Date(checkpoint.createdAt).toISOString(),
  });
});

module.exports = router;
