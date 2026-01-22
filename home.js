// ==========================================
//  HOME.JS - SMART HOME CONTROL (FINAL)
// ==========================================

// --- 1. KONFIGURASI MQTT ---
const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'smart_home/';

// Variabel Global
let mqttClient = null;
let isConnected = false;

// Mapping Perangkat (Index Arduino -> Perintah)
const deviceCommands = {
    0: { on: 'ON 0', off: 'OFF 0' }, // Lampu Utama
    1: { on: 'ON 1', off: 'OFF 1' }, // Lampu Kamar
    2: { on: 'ON 2', off: 'OFF 2' }, // Lampu Tamu
    3: { on: 'ON 3', off: 'OFF 3' }, // Terminal
    6: { on: 'KIPASON', off: 'KIPASOFF' }, // Kipas (Otomatis Speed 2)
    7: { on: 'ON 7', off: 'OFF 7' }, // Pompa
    8: { on: 'ON 8', off: 'OFF 8' }, // Valve
    9: { on: 'SOLENOID_DOOR', off: null } // Pintu
};

// --- 2. KONEKSI MQTT (MENGGUNAKAN MQTT.JS) ---

function connectToMQTT() {
    console.log('Menghubungkan ke MQTT Broker...');
    updateStatusIndicator("Menghubungkan...", "orange");

    const options = {
        clientId: 'WebClient_' + Math.random().toString(16).substr(2, 8),
        clean: true,
        reconnectPeriod: 5000, // Coba lagi tiap 5 detik jika putus
    };

    // Pastikan library mqtt.min.js sudah diload di HTML
    mqttClient = mqtt.connect(MQTT_BROKER_URL, options);

    mqttClient.on('connect', function () {
        console.log('✅ Terhubung ke MQTT!');
        isConnected = true;
        updateStatusIndicator("Terhubung", "lime");

        // Subscribe ke Topik Penting
        mqttClient.subscribe(TOPIC_PREFIX + 'response');
        mqttClient.subscribe(TOPIC_PREFIX + 'status');
        mqttClient.subscribe(TOPIC_PREFIX + 'sensor');
        mqttClient.subscribe(TOPIC_PREFIX + 'voice_reply'); // Topik Suara dari Python
    });

    mqttClient.on('message', function (topic, message) {
        handleIncomingMessage(topic, message.toString());
    });

    mqttClient.on('error', function (error) {
        console.error('MQTT Error:', error);
        updateStatusIndicator("Error", "red");
    });

    mqttClient.on('close', function () {
        console.log('MQTT Disconnected');
        isConnected = false;
        updateStatusIndicator("Terputus", "red");
    });
}

// --- 3. HANDLER PESAN MASUK ---

function handleIncomingMessage(topic, message) {
    console.log(`Pesan Masuk [${topic}]: ${message}`);

    // A. SUARA DARI PYTHON (TTS)
    if (topic.includes('voice_reply')) {
        addChatMessage('Bot', message); // Tampilkan di Chat
        speak(message);                 // Ucapkan!
    }

    // B. DATA SENSOR (Format: "SENSOR: LDR:...")
    else if (topic.includes('sensor')) {
        if (message.startsWith("SENSOR:")) {
            const cleanMsg = message.replace("SENSOR:", "").trim();
            addChatMessage('Sensor', cleanMsg);
        } else {
            addChatMessage('Sensor', message);
        }
    }

    // C. STATUS & RESPON LAIN
    else if (topic.includes('response') || topic.includes('status')) {
        // Abaikan pesan sistem internal
        if (message.includes("SISTEM KONTROL") || message.includes("Catatan:")) return;
        
        addChatMessage('System', message);

        // Update UI Status jika formatnya "Nama: Status"
        if (message.includes(':')) {
            const parts = message.split(':');
            if (parts.length >= 2) {
                updateUIStatus(parts[0].trim(), parts[1].trim());
            }
        }
    }
}

// --- 4. FUNGSI KONTROL (KIRIM PERINTAH) ---

function sendSerialCommand(command) {
    if (!isConnected || !mqttClient) {
        addChatMessage('System', '❌ Tidak terhubung ke MQTT');
        return;
    }
    
    console.log('Mengirim:', command);
    mqttClient.publish(TOPIC_PREFIX + 'control', command);
}

// Fungsi Pintu
function openDoorLock() {
    sendSerialCommand('SOLENOID_DOOR');
    addChatMessage('You', 'Membuka Pintu...');
}

// Fungsi Tirai
function controlTirai(action) { // 'TIRAIBUKA', 'TIRAITUTUP', 'TIRAIOFF'
    sendSerialCommand(action);
    addChatMessage('You', 'Kontrol Tirai: ' + action);
}

// Fungsi Device Umum (Lampu, dll)
function sendDeviceCommand(deviceIndex, action) { // action: 'on' atau 'off'
    if (deviceCommands[deviceIndex] && deviceCommands[deviceIndex][action]) {
        const cmd = deviceCommands[deviceIndex][action];
        sendSerialCommand(cmd);
        addChatMessage('You', `Device ${deviceIndex} -> ${action.toUpperCase()}`);
    }
}

// --- 5. FITUR SUARA (SPEECH RECOGNITION & SYNTHESIS) ---

// A. Text-to-Speech (Web Bicara)
function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stop suara sebelumnya
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID'; 
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
    }
}

// B. Speech-to-Text (Mendengar)
function startVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.lang = 'id-ID';
        recognition.interimResults = false;
        
        recognition.start();
        addChatMessage('System', '🎤 Mendengarkan...');

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            document.getElementById('userInput').value = transcript;
            
            // Kirim langsung sebagai pesan chat
            sendMessage(); 
            
            // Kirim juga ke Topik Voice Input untuk diproses Python
            if (isConnected) {
                mqttClient.publish(TOPIC_PREFIX + 'voice_input', transcript.toLowerCase());
            }
        };
        
        recognition.onerror = function(event) {
            addChatMessage('System', '❌ Error Suara: ' + event.error);
        };
    } else {
        alert("Browser ini tidak mendukung fitur suara.");
    }
}

// --- 6. FUNGSI UI & CHAT ---

function sendMessage() {
    const input = document.getElementById('userInput');
    const msg = input.value.trim();
    if (msg === '') return;

    addChatMessage('Anda', msg);
    
    // Kirim ke Python juga untuk diproses NLP-nya
    if (isConnected) {
         mqttClient.publish(TOPIC_PREFIX + 'voice_input', msg.toLowerCase());
    }
    
    // Cek perintah lokal sederhana
    processLocalCommand(msg);
    
    input.value = '';
}

function processLocalCommand(msg) {
    const lower = msg.toLowerCase();
    if (lower === 'status') sendSerialCommand('STATUS');
    // Perintah lain sudah dihandle oleh Python via MQTT voice_input
}

function addChatMessage(sender, text) {
    const chatBox = document.getElementById('chatMessages'); // Pastikan ID ini benar di HTML
    if (!chatBox) return;

    const div = document.createElement('div');
    div.style.marginBottom = "5px";
    div.style.padding = "5px";
    div.style.borderRadius = "5px";
    
    if (sender === 'Anda' || sender === 'You') {
        div.style.backgroundColor = "#e1f5fe";
        div.style.textAlign = "right";
        div.innerHTML = `<strong>Anda:</strong> ${text}`;
    } else if (sender === 'Bot') {
        div.style.backgroundColor = "#e8f5e9";
        div.innerHTML = `<strong>🤖 Bot:</strong> ${text}`;
    } else if (sender === 'Sensor') {
        div.style.backgroundColor = "#fff3e0";
        div.style.fontSize = "0.9em";
        div.innerHTML = `<strong>📡 Sensor:</strong> ${text}`;
    } else {
        div.style.backgroundColor = "#f5f5f5";
        div.innerHTML = `<strong>${sender}:</strong> ${text}`;
    }

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function updateStatusIndicator(text, color) {
    // Cari elemen status di HTML (bisa sesuaikan ID-nya)
    const el = document.getElementById('connection-status') || document.getElementById('status');
    if (el) {
        el.innerText = text;
        el.style.color = color;
    }
}

function updateUIStatus(devName, status) {
    // Update warna tombol/teks berdasarkan nama perangkat
    // Contoh implementasi sederhana:
    console.log(`Update UI: ${devName} -> ${status}`);
    // Silakan tambahkan logika update icon/warna tombol disini sesuai ID HTML Anda
}

// --- 7. INISIALISASI ---

window.onload = function() {
    connectToMQTT();
    
    // Event listener Enter pada input chat
    const input = document.getElementById('userInput');
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendMessage();
        });
    }
    
    // Tampilkan pesan awal
    setTimeout(() => {
        addChatMessage('System', '👋 Selamat Datang! Sistem Siap.');
    }, 1000);
};

// Expose fungsi ke Global agar bisa dipanggil dari HTML onclick=""
window.sendMessage = sendMessage;
window.startVoiceRecognition = startVoiceRecognition;
window.openDoorLock = openDoorLock;
window.controlTirai = controlTirai;
window.sendDeviceCommand = sendDeviceCommand;
