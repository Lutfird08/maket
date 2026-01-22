// ==========================================
//  SMART HOME CONTROLLER - ULTIMATE VERSION
// ==========================================

// --- 1. KONFIGURASI ---
const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'smart_home/';

// --- 2. VARIABEL GLOBAL ---
let client = null;
let isConnected = false;

// Mapping ID HTML ke Perintah Arduino
// Format: { id_tombol: [IndexArduino, NamaPerangkat] }
// Pastikan ID di HTML Anda sesuai dengan kunci di sini!
const deviceMap = {
    'btn-lampu-utama':  { index: 0, name: 'Lampu Utama' },
    'btn-lampu-kamar':  { index: 1, name: 'Lampu Kamar' },
    'btn-lampu-tamu':   { index: 2, name: 'Lampu Tamu' },
    'btn-terminal':     { index: 3, name: 'Colokan Terminal' },
    'btn-kipas':        { index: 6, name: 'Kipas' },
    'btn-pompa':        { index: 7, name: 'Pompa' },
    'btn-valve':        { index: 8, name: 'Valve' },
    'btn-door':         { index: 9, name: 'Pintu' },
    'btn-tirai-buka':   { command: 'TIRAIBUKA', name: 'Tirai' },
    'btn-tirai-tutup':  { command: 'TIRAITUTUP', name: 'Tirai' }
};

// --- 3. INISIALISASI SAAT LOAD ---
window.onload = function() {
    startClock();       // Jalankan Jam
    connectMQTT();      // Jalankan MQTT
    setupEventListeners(); // Siapkan tombol
};

// --- 4. FITUR JAM & TANGGAL (REAL TIME) ---
function startClock() {
    updateTime(); // Jalankan sekali di awal
    setInterval(updateTime, 1000); // Update tiap 1 detik
}

function updateTime() {
    const now = new Date();
    
    // Format Jam (14:05:30)
    const timeString = now.toLocaleTimeString('id-ID', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });
    
    // Format Tanggal (Kamis, 22 Januari 2026)
    const dateString = now.toLocaleDateString('id-ID', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });

    // Update ke HTML (Pastikan ada elemen dengan class/id ini)
    const elTime = document.getElementById('jam-digital') || document.querySelector('.time');
    const elDate = document.getElementById('tanggal-digital') || document.querySelector('.date');

    if (elTime) elTime.innerText = timeString;
    if (elDate) elDate.innerText = dateString;
}

// --- 5. KONEKSI MQTT ---
function connectMQTT() {
    updateStatusConn("Menghubungkan...", "orange");

    const options = {
        clientId: 'Web_' + Math.random().toString(16).substr(2, 8),
        clean: true,
        reconnectPeriod: 5000,
    };

    // Pastikan library mqtt.min.js terload di HTML
    client = mqtt.connect(MQTT_BROKER, options);

    client.on('connect', () => {
        console.log("✅ MQTT Terhubung!");
        isConnected = true;
        updateStatusConn("Online", "limegreen");

        // Subscribe Topik
        client.subscribe(TOPIC_PREFIX + 'response'); // Balasan perintah
        client.subscribe(TOPIC_PREFIX + 'status');   // Status alat
        client.subscribe(TOPIC_PREFIX + 'sensor');   // Data sensor
        client.subscribe(TOPIC_PREFIX + 'voice_reply'); // Suara bot

        // Minta Status Awal ke Arduino (Supaya tidak loading terus)
        setTimeout(() => { publishCommand("STATUS"); }, 1000);
    });

    client.on('message', (topic, message) => {
        handleMessage(topic, message.toString());
    });

    client.on('close', () => {
        isConnected = false;
        updateStatusConn("Offline", "red");
    });
    
    client.on('error', (err) => {
        console.error("MQTT Error: ", err);
        updateStatusConn("Error", "red");
    });
}

// --- 6. PENGOLAHAN PESAN MASUK (LOGIC UTAMA) ---
function handleMessage(topic, msg) {
    console.log(`Pesan [${topic}]: ${msg}`);

    // A. SUARA DARI PYTHON
    if (topic.includes('voice_reply')) {
        addLog('Bot', msg);
        speak(msg);
    }
    
    // B. DATA SENSOR
    else if (topic.includes('sensor')) {
        // Format: "SENSOR: LDR:100, Soil:200..."
        if (msg.startsWith("SENSOR:")) {
            const data = msg.replace("SENSOR:", "").trim();
            updateSensorUI(data); // Update tampilan sensor
        }
    }
    
    // C. STATUS PERANGKAT
    else if (topic.includes('response') || topic.includes('status')) {
        // Abaikan pesan sistem internal
        if (msg.includes("SISTEM") || msg.includes("Catatan:")) return;
        
        // Cek Format "Nama Alat: ON/OFF"
        if (msg.includes(":")) {
            const parts = msg.split(":");
            const devName = parts[0].trim(); // Misal: "Lampu Utama"
            const devStatus = parts[1].trim(); // Misal: "ON"
            
            updateDeviceUI(devName, devStatus); // Ubah warna tombol
            addLog('System', `${devName} -> ${devStatus}`);
        } else {
            addLog('System', msg);
        }
    }
}

// --- 7. UPDATE TAMPILAN (UI) REAL-TIME ---

// Mengubah Warna Tombol/Status Card berdasarkan respon Arduino
function updateDeviceUI(name, status) {
    const isON = (status === 'ON' || status === 'Terbuka');
    
    // Loop mapping untuk mencari tombol yang cocok dengan nama perangkat
    for (const [btnID, config] of Object.entries(deviceMap)) {
        if (config.name && config.name.toLowerCase() === name.toLowerCase()) {
            const btn = document.getElementById(btnID);
            if (btn) {
                // Ubah Tampilan Tombol
                if (isON) {
                    btn.classList.add('active'); // Tambah class CSS 'active'
                    btn.style.backgroundColor = "#2ecc71"; // Hijau
                    btn.innerText = "NYALA / BUKA";
                } else {
                    btn.classList.remove('active');
                    btn.style.backgroundColor = "#e74c3c"; // Merah
                    btn.innerText = "MATI / TUTUP";
                }
            }
            
            // Jika ada teks status terpisah
            const statusText = document.getElementById(`status-${btnID}`);
            if (statusText) {
                statusText.innerText = status;
                statusText.style.color = isON ? "green" : "red";
            }
        }
    }
}

// Update Angka Sensor di Web
function updateSensorUI(dataString) {
    // Input: "LDR:800, Soil:1000, Temp:29.50"
    addLog('Sensor', dataString);
    
    // Parsing manual (Sederhana)
    const parts = dataString.split(",");
    parts.forEach(part => {
        if (part.includes("Temp:")) {
            const val = part.split(":")[1].trim();
            const el = document.getElementById('nilai-suhu');
            if(el) el.innerText = val + " °C";
        }
        if (part.includes("LDR:")) {
            const val = part.split(":")[1].trim();
            const el = document.getElementById('nilai-cahaya');
            if(el) el.innerText = val;
        }
    });
}

function updateStatusConn(text, color) {
    const el = document.getElementById('status-koneksi');
    if (el) {
        el.innerText = text;
        el.style.color = color;
    }
}

function addLog(sender, msg) {
    const box = document.getElementById('chat-box'); // Pastikan ID ini ada
    if (box) {
        const div = document.createElement('div');
        div.innerHTML = `<b>${sender}:</b> ${msg}`;
        div.style.borderBottom = "1px solid #eee";
        div.style.padding = "2px";
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    }
}

// --- 8. KONTROL & PERINTAH ---

function publishCommand(cmd) {
    if (isConnected) {
        client.publish(TOPIC_PREFIX + 'control', cmd);
        console.log("Kirim:", cmd);
    } else {
        alert("Koneksi MQTT Terputus!");
    }
}

// Fungsi Panggil Perangkat via Tombol
function toggleDevice(btnID) {
    const config = deviceMap[btnID];
    if (!config) return;

    // Jika Tirai (Punya command khusus)
    if (config.command) {
        publishCommand(config.command);
    } 
    // Jika Pintu
    else if (config.index === 9) {
        publishCommand("SOLENOID_DOOR");
    }
    // Jika Perangkat Biasa (Lampu/Kipas/dll)
    else {
        // Cek status saat ini dari warna tombol atau class
        const btn = document.getElementById(btnID);
        const isCurrentlyOn = btn.style.backgroundColor === "rgb(46, 204, 113)"; // Cek warna hijau
        
        // Kirim kebalikan status
        const action = isCurrentlyOn ? "OFF" : "ON";
        
        // Khusus Kipas
        if (config.index === 6) {
             publishCommand(isCurrentlyOn ? "KIPASOFF" : "KIPASON");
        } else {
             publishCommand(`${action} ${config.index}`);
        }
    }
}

// Setup Klik Tombol Otomatis (Event Listener)
function setupEventListeners() {
    // Cari semua tombol yang ada di deviceMap dan beri fungsi klik
    for (const btnID of Object.keys(deviceMap)) {
        const btn = document.getElementById(btnID);
        if (btn) {
            btn.addEventListener('click', () => toggleDevice(btnID));
        }
    }
    
    // Tombol Mic
    const btnMic = document.getElementById('btn-mic');
    if(btnMic) btnMic.addEventListener('click', startVoiceRecognition);
}

// --- 9. SUARA (VOICE FEATURES) ---

function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'id-ID';
        window.speechSynthesis.speak(u);
    }
}

function startVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Browser tidak support suara."); return;
    }
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Rec();
    recognition.lang = 'id-ID';
    recognition.start();

    document.getElementById('btn-mic').innerText = "👂...";

    recognition.onresult = (e) => {
        const txt = e.results[0][0].transcript;
        addLog('Anda', txt);
        
        // Kirim ke Python
        if(isConnected) client.publish(TOPIC_PREFIX + 'voice_input', txt.toLowerCase());
        
        document.getElementById('btn-mic').innerText = "🎤";
    };
    
    recognition.onend = () => {
         document.getElementById('btn-mic').innerText = "🎤";
    };
}
