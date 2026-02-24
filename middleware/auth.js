function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

  if (!ADMIN_TOKEN) {
    return res.status(503).json({
      success: false,
      status: "ADMIN_NOT_CONFIGURED",
      message: "Admin token belum dikonfigurasi di environment.",
    });
  }

  if (!token || token !== ADMIN_TOKEN) {
    return res.status(403).json({
      success: false,
      status: "UNAUTHORIZED",
      message: "Token admin tidak valid.",
    });
  }

  next();
}

module.exports = { requireAdmin };
