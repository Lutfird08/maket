// ==========================================
// 🔗 KONFIGURASI KONEKSI (NGROK)
// ==========================================
// ⚠️ PENTING: Ganti link ini setiap kali Ngrok di-restart!
const API_BASE_URL = "https://renascent-scoffingly-kimiko.ngrok-free.dev"; 

// ==========================================
// 🗺️ MAPPING PERANGKAT (Python Key -> HTML ID)
// ==========================================
// Kiri: Nama Key di JSON Python | Kanan: ID di HTML
const deviceMap = {
    "lampu_utama": "lamp1",  // Di status.html
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
// 📡 FUNGSI 1: KIRIM PERINTAH (CHAT & TOMBOL)
// ==========================================
async function sendToPython(command) {
    console.log("Mengirim perintah:", command);

    // 1. Tampilkan di Chatbox (Jika ada)
    addChatMessage("Anda", command);

    try {
        // 2. Kirim ke Raspberry Pi via Ngrok
        const response = await fetch(`${API_BASE_URL}/chat?q=${encodeURIComponent(command)}`, {
            method: "GET",
            headers: { "ngrok-skip-browser-warning": "true" }
        });

        const reply = await response.text();
        
        // 3. Tampilkan Balasan Bot
        addChatMessage("🤖 Sistem", reply);

        // 4. Update status visual seketika (biar cepat)
        setTimeout(fetchStatus, 500); 

    } catch (error) {
        console.error("Error:", error);
        addChatMessage("⚠️ Error", "Gagal terhubung ke Rumah. Cek Ngrok/Pi.");
    }
}

// Wrapper untuk tombol Chat
function sendMessage() {
    const input = document.getElementById("userInput");
    if (input && input.value.trim() !== "") {
        sendToPython(input.value.trim());
        input.value = "";
    }
}

// ==========================================
// 📊 FUNGSI 2: UPDATE STATUS OTOMATIS
// ==========================================
async function fetchStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/status`, {
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        
        // Data diterima dari Python (JSON)
        // Contoh: { "lampu_utama": "Hidup", "suhu": 25 }
        const data = await response.json(); 

        // 1. Update Semua Perangkat Berdasarkan Mapping
        for (const [key, elementId] of Object.entries(deviceMap)) {
            if (data[key]) {
                updateElement(elementId, data[key]);
            }
        }

        // 2. Update Khusus Dashboard Utama (home.html)
        // Karena di home.html ID-nya beda ("lamp" dan "door")
        if (data.lampu_utama) updateElement("lamp", data.lampu_utama);
        if (data.pintu) updateElement("door", data.pintu);

        // 3. Update Suhu AC (Jika ada)
        if (data.ac_suhu && document.getElementById("temp-val")) {
            document.getElementById("temp-val").innerText = data.ac_suhu + "°C";
        }

    } catch (error) {
        // Error silent (biar console gak penuh merah kalau koneksi putus sebentar)
    }
}

// Fungsi bantu ubah Warna & Teks
function updateElement(elementId, statusValue) {
    const el = document.getElementById(elementId);
    if (el) {
        el.innerText = statusValue; // Ubah teks
        
        // Logika Warna
        const val = statusValue.toString().toUpperCase();
        if (val.includes("HIDUP") || val.includes("ON") || val.includes("BUKA") || val.includes("TERBUKA")) {
            el.style.color = "#4CAF50"; // Hijau
            el.style.fontWeight = "bold";
        } else {
            el.style.color = "#f44336"; // Merah
            el.style.fontWeight = "bold";
        }
    }
}

// Update otomatis setiap 2 detik
setInterval(fetchStatus, 2000);

// ==========================================
// 🎤 FUNGSI 3: VOICE RECOGNITION
// ==========================================
function startVoiceRecognition() {
    // Cek dukungan browser
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        alert("Browser ini tidak mendukung fitur suara. Gunakan Google Chrome.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID'; // Bahasa Indonesia
    
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
// 🕒 FUNGSI 4: JAM & UI HELPER
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
    // Style pesan User vs Bot
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
    if(menu) menu.classList.toggle('active'); // Pastikan CSS .active ada
    
    // Fallback jika class active belum diatur di CSS
    if(menu && menu.style.display === "block") {
        menu.style.display = "none";
    } else if(menu) {
        menu.style.display = "block";
    }
}

// Inisialisasi
window.onload = function() {
    updateTime();
    fetchStatus();
    
    // Listener Enter di Input
    const input = document.getElementById("userInput");
    if(input) {
        input.addEventListener("keypress", function(e) {
            if (e.key === "Enter") sendMessage();
        });
    }
};
