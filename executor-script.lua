--[[
    ╔══════════════════════════════════════════════════════════╗
    ║            PROTECT by Alrect GET Key System              ║
    ║                   Roblox Executor Script                 ║
    ║                      Version 1.0.0                       ║
    ╚══════════════════════════════════════════════════════════╝

    CARA PAKAI:
    1. Ubah SERVER_URL ke URL backend kamu
    2. Execute script ini di Roblox executor yang kamu pakai
    3. Masukkan key format: alrect-XXXXX-XXXX
    4. Klik Verify

    CATATAN: Script ini hanya berjalan di executor yang support:
    - HttpService / syn.request / request()
    - Drawing API (untuk UI)
    - getmachineidentity() atau HWID method
--]]

-- =============================================
-- KONFIGURASI (WAJIB DIUBAH)
-- =============================================
local SERVER_URL = "https://nama-project-kamu.vercel.app" -- Ganti dengan URL backend kamu!

-- =============================================
-- GET HWID
-- =============================================
local function getHWID()
    -- Method 1: getmachineidentity (sebagian besar executor modern)
    if getmachineidentity then
        local success, result = pcall(getmachineidentity)
        if success and result and #result > 5 then
            return result
        end
    end

    -- Method 2: syn.get_hwid (Synapse X)
    if syn and syn.get_hwid then
        local success, result = pcall(syn.get_hwid)
        if success and result and #result > 5 then
            return result
        end
    end

    -- Method 3: identifyexecutor + random fallback (terakhir)
    -- Hasilkan ID semi-unik berdasarkan game + player
    local plr = game:GetService("Players").LocalPlayer
    local userId = tostring(plr.UserId)
    local gameId = tostring(game.GameId)
    -- Kombinasikan informasi yang tersedia
    local hwid = "rblx-" .. userId .. "-" .. gameId
    return hwid
end

-- =============================================
-- HTTP REQUEST
-- =============================================
local function httpRequest(url, method, body)
    local requestFunc = nil

    -- Deteksi function yang tersedia
    if syn and syn.request then
        requestFunc = syn.request
    elseif http and http.request then
        requestFunc = http.request
    elseif request then
        requestFunc = request
    elseif HttpService then
        -- Fallback HttpService (terbatas)
        if method == "POST" then
            local success, result = pcall(function()
                return game:GetService("HttpService"):PostAsync(url, game:GetService("HttpService"):JSONEncode(body), Enum.HttpContentType.ApplicationJson)
            end)
            if success then
                return { StatusCode = 200, Body = result }
            end
        end
        return nil
    end

    if not requestFunc then
        return nil
    end

    local payload = {
        Url = url,
        Method = method or "GET",
        Headers = {
            ["Content-Type"] = "application/json",
            ["User-Agent"] = "AlrectExecutor/1.0"
        }
    }

    if body then
        payload.Body = game:GetService("HttpService"):JSONEncode(body)
    end

    local success, result = pcall(requestFunc, payload)
    if success then
        return result
    end
    return nil
end

-- =============================================
-- VERIFY KEY KE SERVER
-- =============================================
local function verifyKey(key, hwid, callback)
    local url = SERVER_URL .. "/api/verify"
    local body = { key = key, hwid = hwid }

    local response = httpRequest(url, "POST", body)

    if not response then
        callback(false, "NETWORK_ERROR", "Tidak bisa terhubung ke server.")
        return
    end

    local success, data = pcall(function()
        return game:GetService("HttpService"):JSONDecode(response.Body)
    end)

    if not success then
        callback(false, "PARSE_ERROR", "Gagal membaca respons server.")
        return
    end

    if response.StatusCode == 200 and data.success then
        callback(true, data.status, data.message, data)
    else
        callback(false, data.status or "ERROR", data.message or "Verifikasi gagal.")
    end
end

-- =============================================
-- DRAWING UTILITIES
-- =============================================
local Drawings = {}

local function newDrawing(type, props)
    local obj = Drawing.new(type)
    for k, v in pairs(props) do
        pcall(function() obj[k] = v end)
    end
    table.insert(Drawings, obj)
    return obj
end

local function removeAllDrawings()
    for _, d in ipairs(Drawings) do
        pcall(function() d:Remove() end)
    end
    Drawings = {}
end

-- =============================================
-- UI COLORS
-- =============================================
local C = {
    bg         = Color3.fromRGB(5, 5, 8),
    card       = Color3.fromRGB(13, 13, 20),
    border     = Color3.fromRGB(26, 26, 46),
    accent     = Color3.fromRGB(0, 229, 255),
    accent2    = Color3.fromRGB(124, 58, 237),
    text       = Color3.fromRGB(232, 234, 246),
    textMuted  = Color3.fromRGB(121, 134, 203),
    success    = Color3.fromRGB(0, 230, 118),
    error      = Color3.fromRGB(255, 45, 85),
    warning    = Color3.fromRGB(255, 215, 64),
    white      = Color3.fromRGB(255, 255, 255),
    black      = Color3.fromRGB(0, 0, 0),
    btnBg      = Color3.fromRGB(0, 140, 180),
    transparent = Color3.fromRGB(0, 0, 0),
}

-- =============================================
-- UI STATE
-- =============================================
local UI = {
    visible = true,
    dragging = false,
    dragOffsetX = 0,
    dragOffsetY = 0,
    x = 50,
    y = 50,
    width = 400,
    height = 280,
    keyText = "",
    status = "IDLE",  -- IDLE | CHECKING | VALID | INVALID | EXPIRED | HWID_ERROR | ERROR
    statusMessage = "",
    hwid = getHWID(),
    keyVerified = false,
}

-- =============================================
-- DRAW UI
-- =============================================
local UIElements = {}

local function buildUI()
    -- Clear existing
    for _, d in ipairs(UIElements) do
        pcall(function() d:Remove() end)
    end
    UIElements = {}
    Drawings = {}

    if not UI.visible then return end

    local x, y = UI.x, UI.y
    local w, h = UI.width, UI.height

    local function add(type, props)
        local obj = Drawing.new(type)
        for k, v in pairs(props) do
            pcall(function() obj[k] = v end)
        end
        table.insert(UIElements, obj)
        table.insert(Drawings, obj)
        return obj
    end

    -- Main background
    add("Square", {
        Position = Vector2.new(x, y),
        Size = Vector2.new(w, h),
        Color = C.bg,
        Filled = true,
        Thickness = 1,
        Transparency = 0.05,
        ZIndex = 1,
    })

    -- Border
    add("Square", {
        Position = Vector2.new(x, y),
        Size = Vector2.new(w, h),
        Color = C.border,
        Filled = false,
        Thickness = 1,
        ZIndex = 2,
    })

    -- Top accent line
    add("Line", {
        From = Vector2.new(x + 1, y + 1),
        To = Vector2.new(x + w - 1, y + 1),
        Color = C.accent,
        Thickness = 1.5,
        Transparency = 0.7,
        ZIndex = 3,
    })

    -- Header background
    add("Square", {
        Position = Vector2.new(x, y),
        Size = Vector2.new(w, 38),
        Color = C.card,
        Filled = true,
        Thickness = 0,
        ZIndex = 2,
    })

    -- Title - PROTECT by Alrect
    add("Text", {
        Position = Vector2.new(x + 14, y + 8),
        Text = "PROTECT by Alrect",
        Color = C.accent,
        Size = 13,
        Font = 2,  -- GothamBold
        ZIndex = 4,
    })

    -- Subtitle
    add("Text", {
        Position = Vector2.new(x + 14, y + 22),
        Text = "GET Key · v1.0.0",
        Color = C.textMuted,
        Size = 11,
        Font = 1,
        ZIndex = 4,
    })

    -- Close hint
    add("Text", {
        Position = Vector2.new(x + w - 60, y + 12),
        Text = "[HIDE]",
        Color = C.textMuted,
        Size = 11,
        Font = 2,
        ZIndex = 4,
    })

    -- Divider after header
    add("Line", {
        From = Vector2.new(x, y + 38),
        To = Vector2.new(x + w, y + 38),
        Color = C.border,
        Thickness = 1,
        ZIndex = 3,
    })

    -- KEY label
    add("Text", {
        Position = Vector2.new(x + 14, y + 52),
        Text = "KEY ALRECT",
        Color = C.textMuted,
        Size = 10,
        Font = 2,
        ZIndex = 4,
    })

    -- Key input box background
    UIElements.keyBox = add("Square", {
        Position = Vector2.new(x + 14, y + 66),
        Size = Vector2.new(w - 28, 32),
        Color = Color3.fromRGB(8, 8, 15),
        Filled = true,
        Thickness = 0,
        ZIndex = 3,
    })

    -- Key input border
    UIElements.keyBorder = add("Square", {
        Position = Vector2.new(x + 14, y + 66),
        Size = Vector2.new(w - 28, 32),
        Color = C.border,
        Filled = false,
        Thickness = 1,
        ZIndex = 4,
    })

    -- Key input display text
    local displayKey = UI.keyText
    if #displayKey == 0 then
        displayKey = "alrect-XXXXX-XXXX"
    end

    UIElements.keyTextObj = add("Text", {
        Position = Vector2.new(x + 22, y + 75),
        Text = displayKey,
        Color = #UI.keyText > 0 and C.accent or C.textMuted,
        Size = 13,
        Font = 2,
        ZIndex = 5,
    })

    -- HWID info
    local hwidShort = UI.hwid and (#UI.hwid > 20 and UI.hwid:sub(1, 18) .. "..." or UI.hwid) or "Unknown"
    add("Text", {
        Position = Vector2.new(x + 14, y + 108),
        Text = "HWID: " .. hwidShort,
        Color = C.textMuted,
        Size = 10,
        Font = 1,
        ZIndex = 4,
    })

    -- Verify button
    local btnY = y + 126
    UIElements.verifyBtn = add("Square", {
        Position = Vector2.new(x + 14, btnY),
        Size = Vector2.new(w - 28, 34),
        Color = UI.status == "CHECKING" and Color3.fromRGB(40, 80, 100) or C.btnBg,
        Filled = true,
        Thickness = 0,
        ZIndex = 3,
    })

    local btnText = "VERIFY KEY"
    if UI.status == "CHECKING" then btnText = "MEMVERIFIKASI..."
    elseif UI.status == "VALID" then btnText = "✓ KEY VALID"
    end

    UIElements.verifyBtnText = add("Text", {
        Position = Vector2.new(x + (w / 2) - 35, btnY + 10),
        Text = btnText,
        Color = C.black,
        Size = 13,
        Font = 2,
        ZIndex = 5,
    })

    -- Status area
    local statusY = y + 170
    add("Square", {
        Position = Vector2.new(x + 14, statusY),
        Size = Vector2.new(w - 28, 54),
        Color = Color3.fromRGB(8, 8, 15),
        Filled = true,
        Thickness = 0,
        ZIndex = 3,
    })

    add("Square", {
        Position = Vector2.new(x + 14, statusY),
        Size = Vector2.new(w - 28, 54),
        Color = C.border,
        Filled = false,
        Thickness = 1,
        ZIndex = 4,
    })

    -- Status badge
    local statusColors = {
        IDLE       = C.textMuted,
        CHECKING   = C.accent,
        VALID      = C.success,
        INVALID    = C.error,
        EXPIRED    = C.warning,
        HWID_ERROR = C.error,
        ERROR      = C.error,
    }

    local statusLabels = {
        IDLE       = "● IDLE",
        CHECKING   = "● CHECKING...",
        VALID      = "● KEY_VALID",
        INVALID    = "● KEY_INVALID",
        EXPIRED    = "● KEY_EXPIRED",
        HWID_ERROR = "● HWID_MISMATCH",
        ERROR      = "● ERROR",
    }

    add("Text", {
        Position = Vector2.new(x + 22, statusY + 8),
        Text = statusLabels[UI.status] or "● IDLE",
        Color = statusColors[UI.status] or C.textMuted,
        Size = 11,
        Font = 2,
        ZIndex = 5,
    })

    add("Text", {
        Position = Vector2.new(x + 22, statusY + 24),
        Text = UI.statusMessage ~= "" and UI.statusMessage or "Masukkan key dan klik VERIFY.",
        Color = C.text,
        Size = 11,
        Font = 1,
        ZIndex = 5,
    })

    -- Footer
    add("Text", {
        Position = Vector2.new(x + 14, y + h - 16),
        Text = "PROTECT by Alrect GET Key · alrect.vercel.app",
        Color = C.textMuted,
        Size = 9,
        Font = 1,
        ZIndex = 4,
    })

    return UIElements
end

-- =============================================
-- INPUT HANDLING (UserInputService)
-- =============================================
local UIS = game:GetService("UserInputService")
local runService = game:GetService("RunService")

-- Cek posisi dalam bounds
local function inBounds(pos, rx, ry, rw, rh)
    return pos.X >= rx and pos.X <= rx + rw and pos.Y >= ry and pos.Y <= ry + rh
end

-- Key input handler (karakter per karakter)
local validKeyChars = "abcdefghijklmnopqrstuvwxyz0123456789-"

local function onKeyPress(input)
    if input.UserInputType == Enum.UserInputType.Keyboard then
        if input.KeyCode == Enum.KeyCode.BackSpace then
            if #UI.keyText > 0 then
                UI.keyText = UI.keyText:sub(1, -2)
                buildUI()
            end
        elseif input.KeyCode == Enum.KeyCode.Return then
            -- Enter = trigger verify
            onVerifyClick()
        elseif input.KeyCode == Enum.KeyCode.V and UIS:IsKeyDown(Enum.KeyCode.LeftControl) then
            -- Ctrl+V paste (via clipboard jika tersedia)
            if getclipboard then
                local clip = getclipboard()
                if clip and #clip < 30 then
                    UI.keyText = clip:lower():gsub("[^a-z0-9%-]", "")
                    buildUI()
                end
            end
        else
            local char = input.KeyCode.Name:lower()
            if #char == 1 and validKeyChars:find(char, 1, true) then
                if #UI.keyText < 16 then
                    UI.keyText = UI.keyText .. char
                    buildUI()
                end
            end
        end
    end
end

function onVerifyClick()
    if UI.status == "CHECKING" then return end
    if #UI.keyText < 5 then
        UI.status = "INVALID"
        UI.statusMessage = "Key terlalu pendek!"
        buildUI()
        return
    end

    -- Basic format check client-side (bukan pengganti server check)
    local key = UI.keyText:lower()
    if not key:match("^alrect%-%d%d%d%d%d%-%d%d%d%d$") then
        UI.status = "INVALID"
        UI.statusMessage = "Format salah. Gunakan: alrect-XXXXX-XXXX"
        buildUI()
        return
    end

    UI.status = "CHECKING"
    UI.statusMessage = "Menghubungi server..."
    buildUI()

    -- Send ke server
    local hwid = getHWID()
    verifyKey(key, hwid, function(success, status, message, data)
        if success and status == "KEY_VALID" then
            UI.status = "VALID"
            UI.statusMessage = "Key valid! Expires: " .. (data and data.timeRemaining or "3 hari")
            UI.keyVerified = true
            buildUI()

            -- Jalankan script utama setelah delay singkat
            task.wait(1)
            runMainScript()
        elseif status == "KEY_EXPIRED" then
            UI.status = "EXPIRED"
            UI.statusMessage = "Key kadaluarsa. Generate key baru di website."
            buildUI()
        elseif status == "HWID_MISMATCH" then
            UI.status = "HWID_ERROR"
            UI.statusMessage = "Key bukan milik perangkat ini!"
            buildUI()
        elseif status == "NETWORK_ERROR" then
            UI.status = "ERROR"
            UI.statusMessage = "Gagal terhubung ke server. Cek koneksi."
            buildUI()
        else
            UI.status = "INVALID"
            UI.statusMessage = message or "Key tidak valid."
            buildUI()
        end
    end)
end

-- Mouse/Touch drag handler
local mouse = game:GetService("Players").LocalPlayer:GetMouse()

mouse.Button1Down:Connect(function()
    local mx, my = mouse.X, mouse.Y

    -- Check verify button click
    local btnX = UI.x + 14
    local btnY = UI.y + 126
    local btnW = UI.width - 28

    if inBounds(Vector2.new(mx, my), btnX, btnY, btnW, 34) then
        onVerifyClick()
        return
    end

    -- Check header drag area
    if inBounds(Vector2.new(mx, my), UI.x, UI.y, UI.width, 38) then
        UI.dragging = true
        UI.dragOffsetX = mx - UI.x
        UI.dragOffsetY = my - UI.y
        return
    end

    -- Check key input box click (focus)
    local kbX = UI.x + 14
    local kbY = UI.y + 66
    if inBounds(Vector2.new(mx, my), kbX, kbY, UI.width - 28, 32) then
        -- Input focus (handled by keypress)
    end
end)

mouse.Button1Up:Connect(function()
    UI.dragging = false
end)

mouse.Move:Connect(function()
    if UI.dragging then
        UI.x = mouse.X - UI.dragOffsetX
        UI.y = mouse.Y - UI.dragOffsetY

        -- Clamp to screen
        local vp = workspace.CurrentCamera.ViewportSize
        UI.x = math.clamp(UI.x, 0, vp.X - UI.width)
        UI.y = math.clamp(UI.y, 0, vp.Y - UI.height)

        buildUI()
    end
end)

UIS.InputBegan:Connect(onKeyPress)

-- =============================================
-- MAIN SCRIPT (dijalankan hanya jika key VALID)
-- =============================================
function runMainScript()
    -- TARUH SCRIPT UTAMA KAMU DI SINI
    -- Script ini hanya dieksekusi jika key valid dan HWID cocok

    print("[PROTECT by Alrect] Key verified! Running main script...")

    -- Contoh: tampilkan notifikasi berhasil
    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "PROTECT by Alrect",
        Text = "Key verified! Executor aktif.",
        Duration = 5
    })

    -- TODO: Tambahkan executor logic kamu di sini
    -- Contoh:
    -- loadstring(game:HttpGet("https://raw.githubusercontent.com/user/repo/main/script.lua"))()
end

-- =============================================
-- STARTUP
-- =============================================
print("\n[PROTECT by Alrect] Loading GET Key UI...")
print("[PROTECT by Alrect] HWID: " .. (UI.hwid or "Unknown"))
print("[PROTECT by Alrect] Server: " .. SERVER_URL)

-- Build UI awal
buildUI()

print("[PROTECT by Alrect] UI loaded. Enter your key and click VERIFY.\n")
