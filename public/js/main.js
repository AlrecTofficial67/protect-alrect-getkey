// =============================================
// PROTECT by Alrect GET Key - Frontend Logic
// =============================================

// State
let currentHWID = null;
let cp1Token = null;
let cp2Token = null;
let cp1RedirectUrl = null;
let cp2RedirectUrl = null;
let currentStep = 0; // 0=start, 1=cp1, 2=cp2, 3=generate

// =============================================
// TAB SYSTEM
// =============================================
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach((btn, i) => {
    const tabs = ["get-key", "verify", "info"];
    btn.classList.toggle("active", tabs[i] === tabId);
  });
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });
  document.getElementById("tab-" + tabId).classList.add("active");
}

// =============================================
// STEP INDICATOR
// =============================================
function updateSteps(step) {
  currentStep = step;
  for (let i = 0; i <= 3; i++) {
    const el = document.getElementById("cp-step-" + i);
    if (!el) continue;
    el.classList.remove("active", "done");
    if (i < step) el.classList.add("done");
    else if (i === step) el.classList.add("active");
  }
}

// =============================================
// STATUS BOX
// =============================================
function showStatus(containerId, type, title, detail) {
  const icons = { valid: "✓", invalid: "✗", warning: "⚠", info: "ℹ" };
  const box = document.getElementById(containerId);
  box.className = "status-box show " + type;
  box.innerHTML = `
    <span class="status-icon">${icons[type] || "ℹ"}</span>
    <div class="status-content">
      <div class="status-title">${title}</div>
      ${detail ? `<div class="status-detail">${detail}</div>` : ""}
    </div>
  `;
}

function hideStatus(containerId) {
  const box = document.getElementById(containerId);
  box.className = "status-box";
}

// =============================================
// BUTTON LOADING STATE
// =============================================
function setLoading(btn, loading) {
  if (loading) {
    btn.classList.add("loading");
    btn.disabled = true;
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// =============================================
// CHECKPOINT FLOW
// =============================================

async function startCheckpoint() {
  const hwidInput = document.getElementById("hwid-input").value.trim();
  if (!hwidInput) {
    showStatus("cp-status", "invalid", "HWID Kosong", "Masukkan HWID perangkat kamu terlebih dahulu.");
    return;
  }

  const btn = document.getElementById("start-btn");
  setLoading(btn, true);
  showStatus("cp-status", "info", "Memproses...", "Menghubungi server...");

  try {
    const res = await fetch("/api/checkpoint/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hwid: hwidInput }),
    });
    const data = await res.json();

    if (data.success) {
      currentHWID = hwidInput;

      if (data.status === "CHECKPOINT_COMPLETE") {
        // Sudah selesai semua, langsung ke generate
        showStatus("cp-status", "valid", "CHECKPOINT SUDAH SELESAI", "Kamu sudah melewati semua checkpoint. Generate key langsung!");
        updateSteps(3);
        showSection("generate-section");
        return;
      }

      if (data.redirectUrl) {
        cp1RedirectUrl = data.redirectUrl;
      }

      showStatus("cp-status", "info", "CHECKPOINT 1 DIMULAI", "Klik tombol buka checkpoint 1 untuk melanjutkan.");
      updateSteps(1);
      showSection("cp1-section");

      // Enable tombol verify CP1 setelah 5 detik (beri waktu buka halaman)
      setTimeout(() => {
        const verifyBtn = document.getElementById("cp1-verify-btn");
        if (verifyBtn) verifyBtn.disabled = false;
      }, 5000);
    } else {
      showStatus("cp-status", "invalid", data.status || "ERROR", data.message || "Gagal memulai checkpoint.");
    }
  } catch (e) {
    showStatus("cp-status", "invalid", "NETWORK ERROR", "Tidak bisa terhubung ke server. Coba lagi.");
  } finally {
    setLoading(btn, false);
  }
}

function openCheckpoint1() {
  if (!cp1RedirectUrl) {
    showStatus("cp-status", "warning", "URL BELUM ADA", "Mulai checkpoint terlebih dahulu.");
    return;
  }
  const win = window.open(cp1RedirectUrl, "_blank", "width=520,height=620");
  if (!win) {
    showStatus("cp-status", "warning", "POPUP BLOCKED", `Buka link ini secara manual: ${cp1RedirectUrl}`);
  }
  // Enable verify button setelah buka
  setTimeout(() => {
    const verifyBtn = document.getElementById("cp1-verify-btn");
    if (verifyBtn) verifyBtn.disabled = false;
  }, 3000);
}

async function verifyCheckpoint1() {
  if (!currentHWID) {
    showStatus("cp-status", "invalid", "HWID TIDAK ADA", "Mulai proses dari awal.");
    return;
  }

  const btn = document.getElementById("cp1-verify-btn");
  setLoading(btn, true);
  showStatus("cp-status", "info", "MEMVERIFIKASI CP1...", "Menghubungi server...");

  try {
    // Cek status checkpoint
    const res = await fetch(`/api/checkpoint/status?hwid=${encodeURIComponent(currentHWID)}`);
    const data = await res.json();

    if (data.checkpoint1Done) {
      showStatus("cp-status", "valid", "CHECKPOINT 1 VERIFIED ✓", "Lanjutkan ke Checkpoint 2.");
      updateSteps(2);
      showSection("cp2-section");

      // Ambil CP2 URL
      const startRes = await fetch("/api/checkpoint/verify1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hwid: currentHWID, token: "status_check" }),
      });
      // (akan gagal token, tapi yang penting kita ambil dari direct check)

      // Generate CP2 URL berdasarkan pola
      if (cp1RedirectUrl) {
        cp2RedirectUrl = cp1RedirectUrl.replace("checkpoint1", "checkpoint2");
      }

      // Enable CP2 verify btn setelah delay
      setTimeout(() => {
        const cp2Btn = document.getElementById("cp2-verify-btn");
        if (cp2Btn) cp2Btn.disabled = false;
      }, 5000);
    } else {
      showStatus("cp-status", "warning", "CHECKPOINT 1 BELUM SELESAI", "Selesaikan halaman checkpoint 1 terlebih dahulu, lalu klik verifikasi lagi.");
    }
  } catch (e) {
    showStatus("cp-status", "invalid", "NETWORK ERROR", "Tidak bisa terhubung ke server.");
  } finally {
    setLoading(btn, false);
  }
}

function openCheckpoint2() {
  // CP2 URL diambil dari start response atau dibangun manual
  const baseUrl = window.location.origin;
  if (!currentHWID) {
    showStatus("cp-status", "warning", "HWID TIDAK ADA", "Mulai dari awal.");
    return;
  }

  // Untuk CP2, kita perlu token dari server - ambil via start fresh
  fetch("/api/checkpoint/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hwid: currentHWID }),
  }).then(r => r.json()).then(data => {
    // Jika sudah CP1 done, server kasih CP2 redirect di verify1 response
    // Atau kita buka manual URL
    const cp2Url = data.redirectUrl
      ? data.redirectUrl.replace("checkpoint1", "checkpoint2")
      : (cp2RedirectUrl || `${baseUrl}/checkpoint2?hwid=${encodeURIComponent(currentHWID)}&token=manual`);

    const win = window.open(cp2Url, "_blank", "width=520,height=680");
    if (!win) {
      showStatus("cp-status", "warning", "POPUP BLOCKED", `Buka secara manual: ${cp2Url}`);
    }
    setTimeout(() => {
      const btn = document.getElementById("cp2-verify-btn");
      if (btn) btn.disabled = false;
    }, 3000);
  }).catch(() => {
    showStatus("cp-status", "invalid", "ERROR", "Gagal mendapatkan URL checkpoint 2.");
  });
}

async function verifyCheckpoint2() {
  if (!currentHWID) {
    showStatus("cp-status", "invalid", "HWID TIDAK ADA", "Mulai dari awal.");
    return;
  }

  const btn = document.getElementById("cp2-verify-btn");
  setLoading(btn, true);
  showStatus("cp-status", "info", "MEMVERIFIKASI CP2...", "Menghubungi server...");

  try {
    const res = await fetch(`/api/checkpoint/status?hwid=${encodeURIComponent(currentHWID)}`);
    const data = await res.json();

    if (data.checkpoint2Done && data.readyToGenerate) {
      showStatus("cp-status", "valid", "SEMUA CHECKPOINT SELESAI ✓✓", "Kamu siap generate key!");
      updateSteps(3);
      showSection("generate-section");
    } else if (data.checkpoint1Done && !data.checkpoint2Done) {
      showStatus("cp-status", "warning", "CHECKPOINT 2 BELUM SELESAI", "Selesaikan halaman checkpoint 2 terlebih dahulu.");
    } else {
      showStatus("cp-status", "invalid", "CHECKPOINT TIDAK LENGKAP", "Status: CP1=" + (data.checkpoint1Done ? "✓" : "✗") + " CP2=" + (data.checkpoint2Done ? "✓" : "✗"));
    }
  } catch (e) {
    showStatus("cp-status", "invalid", "NETWORK ERROR", "Tidak bisa terhubung ke server.");
  } finally {
    setLoading(btn, false);
  }
}

async function generateKey() {
  if (!currentHWID) {
    showStatus("cp-status", "invalid", "HWID TIDAK ADA", "Mulai dari awal.");
    return;
  }

  const btn = document.getElementById("generate-btn");
  setLoading(btn, true);
  showStatus("cp-status", "info", "GENERATING KEY...", "Membuat key unik untuk perangkat kamu...");

  try {
    const res = await fetch("/api/key/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hwid: currentHWID }),
    });
    const data = await res.json();

    if (data.success) {
      const keyDisplay = document.getElementById("generated-key");
      keyDisplay.textContent = data.key;
      keyDisplay.classList.add("show");

      document.getElementById("key-hint").style.display = "block";
      document.getElementById("key-info").style.display = "block";
      document.getElementById("key-expires").textContent = data.expiresAt;
      document.getElementById("key-remaining").textContent = data.timeRemaining;

      showStatus(
        "cp-status",
        "valid",
        data.status === "KEY_ALREADY_EXISTS" ? "KEY SUDAH ADA" : "KEY BERHASIL DIBUAT!",
        data.message
      );

      btn.disabled = true;
      btn.querySelector(".btn-text").textContent = "✓ KEY SUDAH DIBUAT";
    } else {
      showStatus("cp-status", "invalid", data.status || "ERROR", data.message || "Gagal generate key.");
    }
  } catch (e) {
    showStatus("cp-status", "invalid", "NETWORK ERROR", "Tidak bisa terhubung ke server.");
  } finally {
    setLoading(btn, false);
  }
}

// =============================================
// VERIFY KEY TAB
// =============================================
async function verifyKey() {
  const key = document.getElementById("verify-key").value.trim();
  const hwid = document.getElementById("verify-hwid").value.trim();

  if (!key || !hwid) {
    showStatus("verify-status", "invalid", "INPUT KOSONG", "Key dan HWID wajib diisi.");
    return;
  }

  const btn = event.target.closest("button");
  setLoading(btn, true);
  showStatus("verify-status", "info", "MEMVERIFIKASI...", "Mengecek key ke server...");
  document.getElementById("verify-details").style.display = "none";

  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, hwid }),
    });
    const data = await res.json();

    if (data.success && data.status === "KEY_VALID") {
      showStatus("verify-status", "valid", "KEY VALID ✓", data.message);
      document.getElementById("verify-details").style.display = "block";
      document.getElementById("vd-status").textContent = data.status;
      document.getElementById("vd-expires").textContent = data.expiresAt;
      document.getElementById("vd-remaining").textContent = data.timeRemaining;
    } else {
      const typeMap = {
        KEY_EXPIRED: "warning",
        HWID_MISMATCH: "invalid",
        KEY_NOT_FOUND: "invalid",
        INVALID_KEY_FORMAT: "invalid",
        KEY_USED: "warning",
      };
      const type = typeMap[data.status] || "invalid";
      showStatus("verify-status", type, data.status || "INVALID", data.message || "Key tidak valid.");
    }
  } catch (e) {
    showStatus("verify-status", "invalid", "NETWORK ERROR", "Tidak bisa terhubung ke server.");
  } finally {
    setLoading(btn, false);
  }
}

// =============================================
// HELPERS
// =============================================
function showSection(id) {
  const sections = ["cp1-section", "cp2-section", "generate-section"];
  sections.forEach((s) => {
    const el = document.getElementById(s);
    if (el) el.style.display = s === id ? "block" : "none";
  });
}

function copyKey(el) {
  const text = el.textContent;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      const orig = el.textContent;
      el.textContent = "✓ TERSALIN!";
      setTimeout(() => {
        el.textContent = orig;
      }, 1500);
    })
    .catch(() => {
      // Fallback
      const range = document.createRange();
      range.selectNode(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
}

// Init
updateSteps(0);
