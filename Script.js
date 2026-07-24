// @ts-nocheck
// (Html5Qrcode comes from an external <script> in index.html, not an import,
// so the editor's type checker can't see its shape — this line just silences
// those "unknown type" yellow hints. No effect on how the code runs.)

// ==========================================
// 0. ON-PAGE ERROR DISPLAY
// ==========================================
function showFatalError(message) {
    console.error(message);
    let banner = document.getElementById("fatalErrorBanner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "fatalErrorBanner";
        banner.style.cssText =
            "position:fixed;top:0;left:0;right:0;z-index:99999;" +
            "background:#b00020;color:#fff;padding:12px 16px;" +
            "font-family:sans-serif;font-size:14px;line-height:1.4;white-space:pre-wrap;";
        document.body.prepend(banner);
    }
    banner.textContent = "⚠ " + message;
}

// ==========================================
// 1. CONFIGURATION & ENDPOINTS
// ==========================================
const CONFIG = {
    excelWebhookUrl: "https://hook.us2.make.com/ax3qha2fmwg8b8h2ia4m92ru35cyr6jy",
    googleSheetsUrl: "", // FILL THIS IN with your Google Sheets Web App URL
    scanCooldownMs: 3000,
    storageKey: "attendance_scan_history",
    dateKey: "attendance_last_saved_date"
};

// ==========================================
// 2. STATE MANAGEMENT & STORAGE
// ==========================================
let scanHistory = [];
try {
    scanHistory = JSON.parse(localStorage.getItem(CONFIG.storageKey)) || [];
} catch (e) {
    console.warn("Saved scan history was unreadable, starting fresh.", e);
    scanHistory = [];
}

function getIsoDate() {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function initializeDailyReset() {
    const currentDate = getIsoDate();
    const lastSavedDate = localStorage.getItem(CONFIG.dateKey);

    if (lastSavedDate && lastSavedDate !== currentDate) {
        localStorage.removeItem(CONFIG.storageKey);
        scanHistory = [];
    }
    localStorage.setItem(CONFIG.dateKey, currentDate);
}
initializeDailyReset();

// ==========================================
// 3. UI CONTROLLER (LED & TABLE)
// ==========================================
function setLedStatus(state) {
    const led = document.getElementById("cyberLed");
    const ledText = document.getElementById("ledText");

    if (!led || !ledText) return;

    if (state === "ready") {
        led.className = "led-light red-blink";
        ledText.textContent = "WAITING FOR QR...";
        ledText.style.color = "#ff0055";
    } else if (state === "success") {
        led.className = "led-light green-solid";
        ledText.textContent = "ACCESS GRANTED - SYNCED";
        ledText.style.color = "#00ffcc";
    }
}

function escapeHtml(str) {
    return String(str).replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function updateUI() {
    const tbody = document.getElementById("historyBody");
    if (!tbody) return;

    if (scanHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #888;">No attendance records yet today.</td></tr>`;
        return;
    }

    tbody.innerHTML = scanHistory.map((item, index) => `
        <tr>
            <td>${String(index + 1).padStart(2, '0')}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.date)}</td>
            <td>${escapeHtml(item.time)}</td>
        </tr>
    `).join('');
}

// ==========================================
// 4. NETWORK SERVICES (Data Sync)
// ==========================================
function sendPayload(endpointUrl, payloadData) {
    if (!endpointUrl || endpointUrl.trim() === "") return;

    const queryParams = new URLSearchParams(payloadData).toString();
    const fullUrl = `${endpointUrl}?${queryParams}`;

    fetch(fullUrl, { method: 'GET', mode: 'no-cors' })
        .catch(() => console.warn("Sync warning: Operating in offline mode."));
}

function syncAttendanceData(name, date, time) {
    const payload = { name, date, time };
    sendPayload(CONFIG.excelWebhookUrl, payload);
    sendPayload(CONFIG.googleSheetsUrl, payload);
}

// ==========================================
// 5. END-OF-DAY EXPORT FUNCTION
// ==========================================
function exportTodayAttendance() {
    if (scanHistory.length === 0) {
        alert("No attendance records to export today.");
        return;
    }

    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.textContent = "EXPORTING...";
    }

    let successCount = 0;
    let failCount = 0;

    scanHistory.forEach((record) => {
        const payload = {
            name: record.name,
            date: record.date,
            time: record.time
        };

        if (CONFIG.googleSheetsUrl && CONFIG.googleSheetsUrl.trim() !== "") {
            const queryParams = new URLSearchParams(payload).toString();
            const fullUrl = `${CONFIG.googleSheetsUrl}?${queryParams}`;

            fetch(fullUrl, { method: 'GET', mode: 'no-cors' })
                .then(() => {
                    successCount++;
                })
                .catch(err => {
                    failCount++;
                    console.error("Export error:", err);
                });
        }
    });

    if (CONFIG.excelWebhookUrl) {
        scanHistory.forEach(record => {
            sendPayload(CONFIG.excelWebhookUrl, {
                name: record.name,
                date: record.date,
                time: record.time
            });
        });
    }

    setTimeout(() => {
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = "EXPORT TODAY'S ATTENDANCE";
        }
        alert(`✓ Export complete! ${scanHistory.length} records sent to sheets.`);
    }, 2000);
}

// ==========================================
// 6. QR SCANNER
// ==========================================
let html5QrCode = null;
let isCooldown = false;

function handleScanSuccess(decodedText) {
    if (isCooldown) return;
    isCooldown = true;

    initializeDailyReset();

    const sanitizedText = String(decodedText).trim();
    const [studentName] = sanitizedText.split("|");
    const finalName = studentName ? studentName.trim() : sanitizedText;

    if (!finalName) {
        isCooldown = false;
        setLedStatus("ready");
        return;
    }

    const today = getIsoDate();
    const currentTime = new Date().toLocaleTimeString();

    const isAlreadyScanned = scanHistory.some(item => item.name === finalName && item.date === today);

    if (isAlreadyScanned) {
        alert(`ALREADY SCANNED: ${finalName}`);
    } else {
        const attendanceRecord = { name: finalName, date: today, time: currentTime };
        scanHistory.push(attendanceRecord);
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(scanHistory));
        updateUI();

        // REMOVED: No longer sync on each individual scan.
    // Instead, will sync ALL records at end of day via the EXPORT button.
    // syncAttendanceData(finalName, today, currentTime);
    }

    setLedStatus("success");
    
    try {
        if (html5QrCode) {
            html5QrCode.pause(true);
        }
    } catch (e) {
        console.error(e);
    }

    const scanAgainBtn = document.getElementById("scanAgainBtn");
    if (scanAgainBtn) scanAgainBtn.style.display = "inline-block";

    setTimeout(() => {
        // FIX: html5-qrcode's resume() is synchronous — it returns void, not a
        // Promise — and it THROWS if called when the scanner isn't paused.
        // The old code did `resume().catch(...)`, which crashed with
        // "Cannot read properties of undefined (reading 'catch')" every time.
        // That crash skipped the 3 lines below, so isCooldown never went back
        // to false — the scanner would stop responding after the first scan.
        try {
            if (html5QrCode) {
                html5QrCode.resume();
            }
        } catch (e) {
            console.warn("Resume skipped:", e);
        }
        if (scanAgainBtn) scanAgainBtn.style.display = "none";
        setLedStatus("ready");
        isCooldown = false;
    }, CONFIG.scanCooldownMs);
}

// ==========================================
// 5.5. EXPORT FUNCTION (End-of-Day Sync)
// ==========================================
function exportAttendanceData() {
    if (scanHistory.length === 0) {
        alert("No attendance records to export today.");
        return;
    }

    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) exportBtn.disabled = true;

    // Send all records at once to the webhook
    const payload = {
        records: JSON.stringify(scanHistory),
        date: getIsoDate(),
        count: scanHistory.length,
        timestamp: new Date().toLocaleTimeString()
    };

    sendPayload(CONFIG.excelWebhookUrl, payload);

    setTimeout(() => {
        alert(`✓ Exported ${scanHistory.length} attendance record(s) for ${getIsoDate()}`);
        if (exportBtn) exportBtn.disabled = false;
    }, 500);
}

// ==========================================
// 6. EVENT HANDLERS & BOOTSTRAP
// ==========================================
function startScanner() {
    if (typeof Html5Qrcode === "undefined") {
        showFatalError(
            "The QR scanning library didn't load. Check that index.html includes " +
            "the html5-qrcode <script> tag and that the device has internet."
        );
        return;
    }

    if (!document.getElementById("reader")) {
        showFatalError('No element with id="reader" exists in the HTML.');
        return;
    }

    html5QrCode = new Html5Qrcode("reader");

    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        handleScanSuccess
    ).catch(err => {
        const msg = String(err && err.message ? err.message : err);
        if (location.protocol === "file:") {
            showFatalError("Camera blocked: Open over https:// or localhost instead of file://.");
        } else if (/NotAllowedError|Permission/i.test(msg)) {
            showFatalError("Camera permission was denied.");
        } else if (/NotFoundError/i.test(msg)) {
            showFatalError("No camera found.");
        } else {
            showFatalError("Scanner failed: " + msg);
        }
        console.error("Scanner initialization failed:", err);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    updateUI();
    startScanner();
    setLedStatus("ready");

    const scanAgainBtn = document.getElementById("scanAgainBtn");
    if (scanAgainBtn) {
        scanAgainBtn.addEventListener("click", () => {
            // Same fix as above: resume() throws instead of rejecting.
            try {
                if (html5QrCode) {
                    html5QrCode.resume();
                }
            } catch (e) {
                console.warn("Resume skipped:", e);
            }
            scanAgainBtn.style.display = "none";
            setLedStatus("ready");
            isCooldown = false;
        });
    }

    const deleteBtn = document.getElementById("deleteBtn");
    if (deleteBtn) {
        deleteBtn.addEventListener("click", () => {
            if (confirm("Clear today's attendance records?")) {
                scanHistory = [];
                localStorage.removeItem(CONFIG.storageKey);
                updateUI();
            }
        });
    }

    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            if (confirm(`Export ${scanHistory.length} attendance record(s)?`)) {
                exportAttendanceData();
            }
        });
    }
});

window.addEventListener("beforeunload", () => {
    if (html5QrCode && typeof html5QrCode.isScanning === "boolean" && html5QrCode.isScanning) {
        html5QrCode.stop().catch(() => {});
    }
});
    }

    // 🟢 Magiging Green ang LED kapag may tagumpay na scan!
    setLedStatus("success");

    html5QrCode.pause();
    var scanBtn = document.getElementById("scanAgainBtn");
    if (scanBtn) scanBtn.style.display = "inline-block";
}

// ==========================================
// 8. START BACK CAMERA AUTOMATICALLY
// ==========================================
const html5QrCode = new Html5Qrcode("reader");

function startScanner() {
    html5QrCode.start(
        { facingMode: "environment" }, // Automatic Back Camera
        {
            fps: 10,
            qrbox: 250
        },
        onScanSuccess
    ).catch(err => {
        var statusDiv = document.getElementById("status");
        if (statusDiv) statusDiv.innerHTML = "<span style='color:#ff0055'>⚠️ Camera Error / Perms Denied</span>";
    });
}

startScanner();
setLedStatus("ready"); // Naka-red blink habang naghihintay

// ==========================================
// 9. BUTTON CONTROLS
// ==========================================
var scanAgainBtn = document.getElementById("scanAgainBtn");
if (scanAgainBtn) {
    scanAgainBtn.onclick = function() {
        html5QrCode.resume(); 
        scanAgainBtn.style.display = "none";
        var statusDiv = document.getElementById("status");
        if (statusDiv) statusDiv.innerHTML = "STANDBY FOR SCAN...";
        
        // 🔴 Balik sa Red Blink kapag handa na ulit mag-scan
        setLedStatus("ready");
    };
}

var deleteBtn = document.getElementById("deleteBtn");
if (deleteBtn) {
    deleteBtn.onclick = function() {
        if (confirm("Sigurado ka bang lilinisin ang screen view?")) {
            localStorage.removeItem("myScans");
            scanHistory = [];
            updateUI();
            var statusDiv = document.getElementById("status");
            if (statusDiv) statusDiv.innerHTML = "SYSTEM CLEARED.";
            setLedStatus("ready");
        }
    };
}

updateUI();
