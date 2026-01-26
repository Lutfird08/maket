// ==========================================
//  HOME.JS - SMART HOME FINAL (FIXED STATUS & WELCOME)
// ==========================================

const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_TOPIC_PREFIX = 'lutfi_140910/smart_home/';

let mqttClient = null;
let isConnected = false;

// --- 1. MAPPING PERANGKAT (Arduino Name -> HTML ID) ---
// Pastikan "Key" (kiri) sama persis dengan yang dikirim Arduino
// Pastikan "Value" (kanan) sama dengan id="" di home.html
const deviceMap = {
    "lampu utama": "lamp",
    "lampu kamar": "lamp", // Jika ingin lampu kamar update icon yang sama
    "solenoid door": "door",
    "ac": "status-ac" // (Jika nanti id ini ada)
};

// --- 2. KONEKSI MQTT ---
function connectToMQTT() {
    console.log('Menghubungkan ke MQTT...');
    const options = {
        clientId: 'WebClient_' + Math.random().toString(16).substr(2, 8),
        clean: true,
        reconnectPeriod: 5000,
    };

    mqttClient = mqtt.connect(MQTT_BROKER_URL, options);

    mqttClient.on('connect', function () {
        console.log('✅ Terhubung ke MQTT!');
        isConnected = true;
        updateConnectionStatus(true);
        
        // Subscribe semua topik
        mqttClient.subscribe(MQTT_TOPIC_PREFIX + '#');
        
        // PENTING: Minta status awal agar "Unknown" hilang
        setTimeout(() => {
            console.log("Meminta status awal...");
            sendToPython("STATUS");
        }, 1500); 
    });

    mqttClient.on('message', function (topic, message) {
        handleIncomingMessage(topic, message.toString());
    });

    mqttClient.on('close', () => updateConnectionStatus(false));
    mqttClient.on('error', (err) => console.error('MQTT Error:', err));
}

// --- 3. HANDLER PESAN MASUK ---
function handleIncomingMessage(topic, message) {
    // A. DATA SENSOR
    if (message.startsWith("SENSOR:")) {
        const cleanMsg = message.replace("SENSOR:", "").trim();
        addChatMessage('Sensor', cleanMsg);
        return;
    }

    // B. SUARA BOT
    if (topic.includes('voice_reply')) {
        addChatMessage('Bot', message);
        speak(message);
        return;
    }

    // C. STATUS REALTIME (Update Icon/Teks)
    // Format Arduino: "Nama Alat: Status"
    if (message.includes(':')) {
        const parts = message.split(':');
        if (parts.length >= 2) {
            const devName = parts[0].trim().toLowerCase(); // Ubah ke huruf kecil biar aman
            const devStatus = parts[1].trim();
            
            updateUIFromResponse(devName, devStatus);
        }
    }
}

// --- 4. UPDATE UI ---
function updateUIFromResponse(name, status) {
    // Cek apakah nama alat ada di mapping kita
    // Kita cari apakah string dari Arduino mengandung kata kunci di deviceMap
    for (const [key, elementId] of Object.entries(deviceMap)) {
        if (name.includes(key)) {
            const el = document.getElementById(elementId);
            if (el) {
                // Tentukan Teks & Warna
                const isNyala = status.toUpperCase() === 'ON' || status.toUpperCase() === 'TERBUKA';
                
                // Khusus Pintu teksnya beda
                if (elementId === 'door') {
                    el.innerText = isNyala ? "Terbuka" : "Terkunci";
                } else {
                    el.innerText = isNyala ? "Nyala" : "Mati";
                }

                // Ubah Warna (Hijau=Nyala, Merah=Mati)
                el.style.color = isNyala ? "#4CAF50" : "#f44336";
                el.style.fontWeight = "bold";
            }
        }
    }
}

// --- 5. KIRIM PERINTAH ---
function sendToPython(text) {
    if (isConnected) {
        mqttClient.publish(MQTT_TOPIC_PREFIX + 'voice_input', text.toLowerCase());
    } else {
        alert("Koneksi MQTT Putus!");
    }
}

function sendMessage() {
    const input = document.getElementById('userInput');
    const msg = input.value.trim();
    if (msg === '') return;

    addChatMessage('Anda', msg);
    sendToPython(msg);
    input.value = '';
}

// --- 6. FITUR CHAT & SUARA ---
function addChatMessage(sender, message) {
    const chatBox = document.getElementById('chatMessages');
    if (!chatBox) return;
    
    const div = document.createElement('div');
    div.style.marginBottom = '10px';
    div.style.padding = '10px';
    div.style.borderRadius = '10px';
    div.style.maxWidth = '85%';
    div.style.fontSize = '14px';
    
    if (sender === 'Anda') {
        div.style.marginLeft = 'auto';
        div.style.backgroundColor = '#e3f2fd';
        div.style.textAlign = 'right';
        div.innerHTML = `<strong>${sender}</strong><br>${message}`;
    } else if (sender === 'Sensor') {
        div.style.marginRight = 'auto';
        div.style.backgroundColor = '#fff3e0'; // Kuning Sensor
        div.style.border = '1px solid #ffe0b2';
        div.innerHTML = `<strong>📡 Data Sensor</strong><br>${message}`;
    } else if (sender === 'System') {
        div.style.margin = '10px auto';
        div.style.backgroundColor = '#e8f5e9'; // Hijau Welcome
        div.style.textAlign = 'center';
        div.style.width = '90%';
        div.innerHTML = `${message}`;
    } else { // Bot
        div.style.marginRight = 'auto';
        div.style.backgroundColor = '#f5f5f5';
        div.innerHTML = `<strong>${sender}</strong><br>${message}`;
    }
    
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

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

    addChatMessage('System', '🎤 Mendengarkan...');

    recognition.onresult = (e) => {
        const txt = e.results[0][0].transcript;
        addChatMessage('Anda', txt);
        sendToPython(txt);
    };
}

function updateConnectionStatus(connected) {
    const els = document.querySelectorAll('.status-text');
    els.forEach(el => {
        if (el.innerText === 'Unknown' || el.innerText === 'Loading...') {
            el.innerText = connected ? "Mati" : "Offline"; // Default awal sebelum dpt status
        }
    });
}

function updateDateTime() {
    const now = new Date();
    const elTime = document.querySelector('.time');
    const elDate = document.querySelector('.date');
    if(elTime) elTime.innerText = now.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
    if(elDate) elDate.innerText = now.toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}

// --- 7. INITIALIZATION (WELCOME MESSAGE) ---
window.onload = function() {
    updateDateTime();
    setInterval(updateDateTime, 60000);
    connectToMQTT();
    
    // Pesan Selamat Datang (Delay dikit biar smooth)
    setTimeout(() => {
        const welcomeText = `
            <strong>👋 Selamat Datang di Smart Home!</strong><br><br>
            Silakan coba perintah berikut:<br>
            💡 "Nyalakan lampu utama"<br>
            🚪 "Buka pintu"<br>
            ❄️ "Nyalakan AC"<br>
            🌡️ "Berapa suhu sekarang?"
        `;
        addChatMessage('System', welcomeText);
    }, 1000);

    const input = document.getElementById('userInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
};

window.sendMessage = sendMessage;
window.startVoiceRecognition = startVoiceRecognition;
window.toggleMenu = () => document.getElementById('hamburgerMenu').classList.toggle('active');
