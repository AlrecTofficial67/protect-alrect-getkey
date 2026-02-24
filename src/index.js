require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const keyRoutes = require("./routes/keys");
const checkpointRoutes = require("./routes/checkpoint");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
      },
    },
  })
);

// CORS - allow all origins for executor compatibility
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-Admin-Token"],
  })
);

// Rate limiting - global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, status: "RATE_LIMITED", message: "Terlalu banyak request. Coba lagi dalam 15 menit." },
});

// Rate limiting - key generation (lebih ketat)
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, status: "RATE_LIMITED", message: "Batas generate key tercapai. Coba lagi dalam 1 jam." },
});

// Rate limiting - verify
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, status: "RATE_LIMITED", message: "Terlalu banyak percobaan verifikasi." },
});

app.use(globalLimiter);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false }));

// Serve static frontend
app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.use("/api/key", generateLimiter, keyRoutes);
app.use("/api/verify", verifyLimiter, keyRoutes);
app.use("/api/checkpoint", checkpointRoutes);
app.use("/api/admin", adminRoutes);

// Root - serve dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, status: "NOT_FOUND", message: "Endpoint tidak ditemukan." });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.stack);
  res.status(500).json({ success: false, status: "SERVER_ERROR", message: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   PROTECT by Alrect GET Key System   ║`);
  console.log(`║   Server running on port ${PORT}         ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});

module.exports = app;
