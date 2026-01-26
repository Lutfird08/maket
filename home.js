// ==========================================
//  HOME.JS - SMART HOME LOGIC (FINAL FIX)
// ==========================================

// Konfigurasi MQTT
const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_TOPIC_PREFIX = 'lutfi_140910/smart_home/';

// Variabel Global
let mqttClient = null;
let isConnected = false;

// 1. MAPPING PERANGKAT (ARDUINO INDEX -> NAMA)
// Harus SAMA PERSIS dengan urutan di Arduino Mega
const deviceNames = {
    0: "Lampu Utama", 
    1: "Lampu Kamar", 
    2: "Lampu Tamu",
    3: "Colokan Terminal", 
    4: "Tirai Tutup", 
    5: "Tirai Buka",
    6: "Kipas", 
    7: "Pompa Penyiram", 
    8: "Solenoid Valve",
    9: "Solenoid Door",
    12: "AC" // Index AC
};

// 2. MAPPING UI (INDEX -> HTML ID)
// Menghubungkan Index Arduino ke ID elemen di home.html
const deviceUI = {
    0: 'lamp',       // Lampu Utama -> Update teks di id="lamp"
    9: 'door',       // Pintu -> Update teks di id="door"
    12: 'status-ac'  // AC -> Update teks di id="status-ac"
};

// --- KONEKSI MQTT ---

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
        
        // Subscribe ke SEMUA topik terkait
        mqttClient.subscribe(MQTT_TOPIC_PREFIX + '#'); 
        
        // Minta status awal ke Arduino (biar gak loading terus)
        setTimeout(() => sendToPython("STATUS"), 2000);
    });

    mqttClient.on('message', function (topic, message) {
        handleIncomingMessage(topic, message.toString());
    });

    mqttClient.on('close', () => updateConnectionStatus(false));
    mqttClient.on('error', (err) => console.error('MQTT Error:', err));
}

// --- HANDLER PESAN MASUK (INTI PERBAIKAN) ---

function handleIncomingMessage(topic, message) {
    // A. DATA SENSOR (TAMPIL DI CHAT SESUAI REQUEST)
    // Format Arduino: "SENSOR: LDR:100, Soil:200, Temp:28.00"
    if (message.startsWith("SENSOR:")) {
        const cleanMsg = message.replace("SENSOR:", "").trim();
        addChatMessage('Sensor', cleanMsg);
        return; 
    }

    // B. SUARA BOT (DARI PYTHON)
    if (topic.includes('voice_reply')) {
        addChatMessage('Bot', message);
        speak(message);
        return;
    }

    // C. STATUS REALTIME PERANGKAT
    // Format Arduino: "Nama Alat: Status" (Contoh: "Lampu Utama: ON")
    if (message.includes(':')) {
        const parts = message.split(':');
        // Pastikan formatnya benar (minimal ada nama dan status)
        if (parts.length >= 2) {
            const devName = parts[0].trim();
            const devStatus = parts[1].trim();
            
            // Update Tampilan UI (Warna/Teks)
            updateUIFromResponse(devName, devStatus);
            
            // Opsional: Jika ingin status alat masuk chat juga, uncomment baris bawah:
            // addChatMessage('System', `${devName} -> ${devStatus}`);
        }
    }
}

// --- FUNGSI UPDATE TAMPILAN (UI) ---

function updateUIFromResponse(deviceName, status) {
    const lowerName = deviceName.toLowerCase();
    
    // Status Boolean (Nyala/Mati)
    const isOn = status.toUpperCase() === 'ON' || 
                 status.toUpperCase() === 'TERBUKA' || 
                 status.toUpperCase().includes('NYALA');

    // Cari Perangkat di Mapping deviceNames
    for (const [index, name] of Object.entries(deviceNames)) {
        if (lowerName.includes(name.toLowerCase())) {
            
            // Jika perangkat ini punya tampilan di HTML (ada di deviceUI)
            if (deviceUI[index]) {
                const elementId = deviceUI[index];
                const el = document.getElementById(elementId);
                
                if (el) {
                    // Update Teks Status
                    // Khusus Pintu: Terbuka/Terkunci, Lainnya: Nyala/Mati
                    if (index == 9) {
                        el.innerText = isOn ? "Terbuka" : "Terkunci";
                    } else {
                        el.innerText = isOn ? "Nyala" : "Mati";
                    }

                    // Update Warna (Hijau=Nyala, Merah=Mati)
                    el.style.color = isOn ? "#4CAF50" : "#f44336";
                    el.style.fontWeight = "bold";
                    
                    console.log(`✅ UI Updated: ${name} -> ${status}`);
                }
            }
            break; // Ketemu, stop loop
        }
    }
}

// --- FUNGSI KIRIM PERINTAH ---

function sendToPython(text) {
    if (isConnected) {
        const topicInput = MQTT_TOPIC_PREFIX + 'voice_input';
        mqttClient.publish(topicInput, text.toLowerCase());
        console.log("Dikirim:", text);
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

// --- FITUR TAMBAHAN (CHAT, SUARA, JAM) ---

function addChatMessage(sender, message) {
    const chatBox = document.getElementById('chatMessages');
    if (!chatBox) return;
    
    const div = document.createElement('div');
    
    // Styling Pesan
    div.style.marginBottom = '8px';
    div.style.padding = '8px 12px';
    div.style.borderRadius = '10px';
    div.style.maxWidth = '85%';
    div.style.fontSize = '14px';
    div.style.lineHeight = '1.4';
    
    if (sender === 'Anda') {
        div.style.marginLeft = 'auto'; // Rata Kanan
        div.style.backgroundColor = '#e3f2fd';
        div.style.textAlign = 'right';
        div.innerHTML = `<strong>${sender}</strong><br>${message}`;
    } else if (sender === 'Sensor') {
        div.style.marginRight = 'auto'; // Rata Kiri
        div.style.backgroundColor = '#fff3e0'; // Warna Oranye Muda utk Sensor
        div.style.border = '1px solid #ffe0b2';
        div.innerHTML = `<strong>📡 Sensor Data</strong><br><span style="font-family:monospace">${message}</span>`;
    } else { // Bot / System
        div.style.marginRight = 'auto';
        div.style.backgroundColor = '#f5f5f5';
        div.innerHTML = `<strong>${sender}</strong><br>${message}`;
    }
    
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto scroll ke bawah
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
        if (el.innerText === 'Loading...' || el.innerText === 'Offline') {
            el.innerText = connected ? "Mati" : "Offline";
            el.style.color = connected ? "#f44336" : "#9e9e9e";
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

window.onload = function() {
    updateDateTime();
    setInterval(updateDateTime, 60000);
    connectToMQTT();
    
    const input = document.getElementById('userInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
};

// Export Global Functions
window.sendMessage = sendMessage;
window.startVoiceRecognition = startVoiceRecognition;
window.sendToPython = sendToPython;
window.toggleMenu = () => document.getElementById('hamburgerMenu').classList.toggle('active');
