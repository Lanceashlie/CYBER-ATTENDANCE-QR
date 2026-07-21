// ==========================================
// 1. GOOGLE SHEETS URL (PALITAN ITO NG LINK MO)
// ==========================================
var GOOGLE_SCRIPT_URL = "DITO_IPASTE_ANG_GOOGLE_SCRIPT_URL";

// ==========================================
// 2. LOAD LOCAL HISTORY
// ==========================================
var scanHistory = JSON.parse(localStorage.getItem("myScans")) || [];

// ==========================================
// 3. AUTO-RESET LOGIC (Tuwing bagong araw)
// ==========================================
function checkAutoReset() {
    var today = new Date().toLocaleDateString();
    var lastSavedDate = localStorage.getItem("lastSavedDate");

    if (lastSavedDate && lastSavedDate !== today) {
        localStorage.removeItem("myScans");
        scanHistory = [];
    }
    localStorage.setItem("lastSavedDate", today);
}
checkAutoReset();

// ==========================================
// 4. LED STATUS CONTROLLER (Red = Standby, Green = Success)
// ==========================================
function setLedStatus(state) {
    var led = document.getElementById("cyberLed");
    var ledText = document.getElementById("ledText");
    
    if (!led || !ledText) return;

    if (state === "ready") {
        led.className = "led-light red-blink";
        ledText.innerHTML = "WAITING FOR QR...";
        ledText.style.color = "#ff0055";
    } else if (state === "success") {
        led.className = "led-light green-solid";
        ledText.innerHTML = "ACCESS GRANTED - SYNCED";
        ledText.style.color = "#00ffcc";
    }
}

// ==========================================
// 5. UPDATE TABLE UI
// ==========================================
function updateUI() {
    var tbody = document.getElementById("historyBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    for (var i = 0; i < scanHistory.length; i++) {
        var item = scanHistory[i];
        tbody.innerHTML += `
            <tr>
                <td>0${i + 1}</td>
                <td>${item.name}</td>
                <td>${item.date}</td>
                <td>${item.time}</td>
            </tr>
        `;
    }
}

// ==========================================
// 6. SEND DATA TO GOOGLE SHEETS
// ==========================================
function sendToGoogleSheets(name, date, time) {
    var statusDiv = document.getElementById("status");
    
    if (GOOGLE_SCRIPT_URL === "DITO_IPASTE_ANG_GOOGLE_SCRIPT_URL") {
        if (statusDiv) statusDiv.innerHTML = "<span style='color:#ff0055'>⚠️ Google URL Missing!</span>";
        return;
    }

    if (statusDiv) statusDiv.innerHTML = "⚡ UPLOADING DATA TO CLOUD...";

    var fullUrl = `${GOOGLE_SCRIPT_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;

    fetch(fullUrl)
        .then(response => {
            if (statusDiv) statusDiv.innerHTML = "✅ SYNC SUCCESSFUL";
        })
        .catch(error => {
            if (statusDiv) statusDiv.innerHTML = "⚠️ SAVED LOCALLY (OFFLINE)";
        });
}

// ==========================================
// 7. ON SCAN SUCCESS
// ==========================================
function onScanSuccess(decodedText) {
    checkAutoReset();

    var scannedValue = String(decodedText).trim();
    var today = new Date().toLocaleDateString();
    var currentTime = new Date().toLocaleTimeString();

    var alreadyScanned = scanHistory.some(item => String(item.name).trim() === scannedValue && item.date === today);

    if (alreadyScanned) {
        alert("⚠️ Na-scan na ito ngayong araw!");
    } else {
        var record = { name: scannedValue, date: today, time: currentTime };
        scanHistory.push(record);
        localStorage.setItem("myScans", JSON.stringify(scanHistory));
        updateUI();
        sendToGoogleSheets(scannedValue, today, currentTime);
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
