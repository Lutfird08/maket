// ==========================================
// 🔗 KONFIGURASI KONEKSI (NGROK)
// ==========================================
// ⚠️ GANTI LINK INI SETIAP KALI NGROK DI-RESTART
const API_BASE_URL = "https://renascent-scoffingly-kimiko.ngrok-free.dev"; 

// ==========================================
// 🗺️ MAPPING PERANGKAT (Python Key -> HTML ID)
// ==========================================
const deviceMap = {
    "lampu_utama": "lamp1",
    "lampu_kamar": "lamp2",
    "lampu_tamu":  "lamp3",
    "ac_status":   "status-ac",
    "kipas":       "fan",
    "pintu":       "door",
    "tirai":       "curtain",
    "terminal":    "socket",
    "pompa":       "pump",
    "kran":        "valve"
};

// ==========================================
// 🔊 FUNGSI SUARA (TEXT TO SPEECH) -- [BARU DITAMBAHKAN]
// ==========================================
let indoVoice = null;

// 1. Muat Daftar Suara dari Browser
function loadVoices() {
    const voices = window.speechSynthesis.getVoices();
    // Cari suara Bahasa Indonesia, atau fallback ke default
    indoVoice = voices.find(v => v.lang === 'id-ID') || voices.find(v => v.lang === 'id_ID') || null;
}

// Pastikan suara termuat (Browser kadang butuh waktu)
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
}

// 2. Fungsi Bicara
function speak(text) {
    if (!('speechSynthesis' in window)) return;

    // Hentikan suara sebelumnya (biar gak numpuk)
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID'; // Set Bahasa Indonesia
    utterance.rate = 1.0;     // Kecepatan Bicara (0.1 - 10)
    utterance.pitch = 1.0;    // Nada (0 - 2)

    // Pakai suara Google Indonesia jika ada
    if (indoVoice) utterance.voice = indoVoice;

    window.speechSynthesis.speak(utterance);
}

// ==========================================
// 📡 FUNGSI KIRIM PERINTAH
// ==========================================
async function sendToPython(command) {
    console.log("Mengirim:", command);
    addChatMessage("Anda", command);

    try {
        const response = await fetch(`${API_BASE_URL}/chat?q=${encodeURIComponent(command)}`, {
            method: "GET",
            headers: { "ngrok-skip-browser-warning": "true" }
        });

        const reply = await response.text();
        
        // 1. Tampilkan Teks Balasan
        addChatMessage("🤖 Sistem", reply);
        
        // 2. BACAKAN BALASAN (SUARA) -- [INI YANG TADI HILANG]
        speak(reply);

        // 3. Update Status Visual
        setTimeout(fetchStatus, 500); 

    } catch (error) {
        console.error("Error:", error);
        const errText = "Gagal terhubung. Cek Ngrok.";
        addChatMessage("⚠️ Error", errText);
        speak(errText);
    }
}

// Wrapper Tombol Kirim
function sendMessage() {
    const input = document.getElementById("userInput");
    if (input && input.value.trim() !== "") {
        sendToPython(input.value.trim());
        input.value = "";
    }
}

// ==========================================
// 📊 FUNGSI UPDATE STATUS OTOMATIS
// ==========================================
async function fetchStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/status`, {
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        const data = await response.json(); 

        for (const [key, elementId] of Object.entries(deviceMap)) {
            if (data[key]) updateElement(elementId, data[key]);
        }
        
        // Update Dashboard Utama
        if (data.lampu_utama) updateElement("lamp", data.lampu_utama);
        if (data.pintu) updateElement("door", data.pintu);

        // Update Suhu
        if (data.ac_suhu && document.getElementById("temp-val")) {
            document.getElementById("temp-val").innerText = data.ac_suhu + "°C";
        }

    } catch (error) {
        // Silent error
    }
}

function updateElement(elementId, statusValue) {
    const el = document.getElementById(elementId);
    if (el) {
        el.innerText = statusValue;
        const val = statusValue.toString().toUpperCase();
        if (val.includes("HIDUP") || val.includes("ON") || val.includes("BUKA") || val.includes("TERBUKA") || val.includes("NYALA")) {
            el.style.color = "#4CAF50"; 
            el.style.fontWeight = "bold";
        } else {
            el.style.color = "#f44336"; 
            el.style.fontWeight = "bold";
        }
    }
}

setInterval(fetchStatus, 2000);

// ==========================================
// 🎤 VOICE RECOGNITION (WEB SPEECH API)
// ==========================================
function startVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Browser tidak mendukung suara. Gunakan Chrome.");
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    
    recognition.onstart = () => {
        const input = document.getElementById("userInput");
        if(input) input.placeholder = "Mendengarkan...";
    };

    recognition.onresult = (event) => {
        const command = event.results[0][0].transcript;
        const input = document.getElementById("userInput");
        if(input) {
            input.value = command;
            input.placeholder = "Ketik perintah...";
        }
        sendToPython(command); // Kirim otomatis
    };
    recognition.start();
}

// ==========================================
// 🕒 JAM & LAINNYA
// ==========================================
function updateTime() {
    const timeEl = document.querySelector('.time');
    const dateEl = document.querySelector('.date');
    if(timeEl && dateEl) {
        const now = new Date();
        timeEl.innerText = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        dateEl.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    }
}
setInterval(updateTime, 1000);

function addChatMessage(sender, text) {
    const chatBox = document.getElementById("chatMessages");
    if (!chatBox) return;

    const div = document.createElement("div");
    if (sender === "Anda") {
        div.style.textAlign = "right";
        div.innerHTML = `<span style="background:#007bff; color:white; padding:8px 15px; border-radius:15px 15px 0 15px; display:inline-block; margin:5px;">${text}</span>`;
    } else {
        div.style.textAlign = "left";
        div.innerHTML = `<span style="background:#e9ecef; color:black; padding:8px 15px; border-radius:15px 15px 15px 0; display:inline-block; margin:5px;">🤖 ${text}</span>`;
    }
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function toggleMenu() {
    const menu = document.getElementById('hamburgerMenu');
    if(menu) menu.classList.toggle('active');
}

window.onload = function() {
    updateTime();
    fetchStatus();
    loadVoices(); // Muat suara saat awal
    
    const input = document.getElementById("userInput");
    if(input) {
        input.addEventListener("keypress", function(e) {
            if (e.key === "Enter") sendMessage();
        });
    }
};
