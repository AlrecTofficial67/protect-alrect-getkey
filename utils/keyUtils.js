const crypto = require("crypto");

// Format key: alrect-(5 angka)-(4 angka)
// Contoh: alrect-47823-9152

function generateKey() {
  // Generate 5 digit angka (10000 - 99999)
  const part1 = Math.floor(10000 + Math.random() * 90000).toString();
  // Generate 4 digit angka (1000 - 9999)
  const part2 = Math.floor(1000 + Math.random() * 9000).toString();
  return `alrect-${part1}-${part2}`;
}

// Validasi format key
function isValidKeyFormat(key) {
  return /^alrect-\d{5}-\d{4}$/.test(key);
}

// Hash HWID untuk storage (tidak simpan raw HWID)
function hashHWID(hwid) {
  return crypto.createHash("sha256").update(hwid + (process.env.HWID_SALT || "alrect_salt_2024")).digest("hex");
}

// Validasi HWID format (minimal 8 karakter, alphanumeric/dash/underscore)
function isValidHWID(hwid) {
  if (!hwid || typeof hwid !== "string") return false;
  if (hwid.length < 8 || hwid.length > 128) return false;
  return /^[a-zA-Z0-9\-_]+$/.test(hwid);
}

// Hitung waktu expired: 3 hari dari sekarang (dalam ms)
function getExpiryTime() {
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  return Date.now() + THREE_DAYS_MS;
}

// Cek apakah key sudah expired
function isExpired(expiresAt) {
  return Date.now() > expiresAt;
}

// Format timestamp ke string readable
function formatExpiry(expiresAt) {
  return new Date(expiresAt).toISOString();
}

// Sisa waktu expired dalam format human-readable
function getTimeRemaining(expiresAt) {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

module.exports = {
  generateKey,
  isValidKeyFormat,
  hashHWID,
  isValidHWID,
  getExpiryTime,
  isExpired,
  formatExpiry,
  getTimeRemaining,
};
