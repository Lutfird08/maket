// ==========================================
//  HOME.JS - FINAL (FULL MAPPING FOR STATUS PAGE)
// ==========================================

const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_TOPIC_PREFIX = 'lutfi_140910/smart_home/';

let mqttClient = null;
let isConnected = false;
let indoVoice = null;

// --- MAPPING LENGKAP (Agar Halaman Status Berfungsi) ---
// Kiri: Nama dr Arduino (Huruf Kecil) | Kanan: ID HTML
const deviceMap = {
    // Lampu
    "lampu utama": "lamp1",  // Di home.html pakai id="lamp", di status.html id="lamp1"
    "lampu kamar": "lamp2",
    "lampu tamu":  "lamp3",

    // Pintu & Keamanan
    "solenoid door": "door",
    
    // Pendingin
    "ac": "status-ac",
    "kipas": "fan",

    // Lainnya
    "colokan terminal": "socket",
    "pompa penyiram": "pump",
    "solenoid valve": "valve",
    "kran": "valve", // Alias
    
    // Tirai
    "tirai buka": "curtain",
    "tirai tutup": "curtain"
};

// --- KONEKSI MQTT ---
function connectToMQTT() {
    console.log('Menghubungkan ke MQTT...');
    const options = {
        clientId: 'WebClient_' + Math.random().toString(16).substr(2, 8),
        clean: true, reconnectPeriod: 5000,
    };

    mqttClient = mqtt.connect(MQTT_BROKER_URL, options);

    mqttClient.on('connect', function () {
        console.log('✅ Terhubung ke MQTT!');
        isConnected = true;
        updateConnectionStatus(true);
        mqttClient.subscribe(MQTT_TOPIC_PREFIX + '#');
        
        // Minta status awal
        setTimeout(() => { console.log("Req Status..."); sendToPython("STATUS"); }, 1500); 
    });

    mqttClient.on('message', function (topic, message) {
        handleIncomingMessage(topic, message.toString());
    });

    mqttClient.on('close', () => updateConnectionStatus(false));
}

// --- HANDLER PESAN ---
function handleIncomingMessage(topic, message) {
    if (message.startsWith("SENSOR:")) {
        // Tampilkan sensor hanya jika ada elemen chat (di home.html)
        if(document.getElementById('chatMessages')) {
            addChatMessage('Sensor', message.replace("SENSOR:", "").trim());
        }
        return;
    }
    
    if (topic.includes('voice_reply')) {
        if(document.getElementById('chatMessages')) addChatMessage('Bot', message);
        speak(message);
        return;
    }

    if (message.includes(':')) {
        const parts = message.split(':');
        if (parts.length >= 2) {
            updateUIFromResponse(parts[0].trim().toLowerCase(), parts[1].trim());
        }
    }
}

// --- UPDATE UI (MULTIPLE ID SUPPORT) ---
function updateUIFromResponse(name, status) {
    // 1. Cek Mapping Utama
    for (const [key, elementId] of Object.entries(deviceMap)) {
        if (name.includes(key)) {
            // Coba update elemen spesifik (misal: lamp1, lamp2 di status.html)
            updateElementState(elementId, status);

            // KHUSUS LAMPU UTAMA: 
            // Di home.html ID-nya "lamp", di status.html ID-nya "lamp1"
            // Jadi kita update juga ID "lamp" jika yang berubah adalah "lampu utama"
            if (key === "lampu utama") updateElementState("lamp", status);
        }
    }
}

function updateElementState(id, status) {
    const el = document.getElementById(id);
    if (el) {
        const isNyala = status.toUpperCase().includes('ON') || 
                        status.toUpperCase().includes('TERBUKA') || 
                        status.toUpperCase().includes('NYALA') ||
                        status.toUpperCase().includes('MEMBUKA');

        if (id === 'door') {
            el.innerText = isNyala ? "Terbuka" : "Terkunci";
        } else if (id === 'curtain') {
            el.innerText = status; 
        } else {
            el.innerText = isNyala ? "Nyala" : "Mati";
        }
        
        el.style.color = isNyala ? "#4CAF50" : "#f44336";
        el.style.fontWeight = "bold";
    }
}

// --- FUNGSI LAINNYA (Standard) ---
function sendToPython(text) {
    if (isConnected) mqttClient.publish(MQTT_TOPIC_PREFIX + 'voice_input', text.toLowerCase());
}

function sendMessage() {
    const input = document.getElementById('userInput');
    if (input && input.value.trim() !== '') {
        addChatMessage('Anda', input.value.trim());
        sendToPython(input.value.trim());
        input.value = '';
    }
}

function addChatMessage(sender, message) {
    const chatBox = document.getElementById('chatMessages');
    if (!chatBox) return; // Kalau di halaman status (gak ada chat), skip aja
    
    const div = document.createElement('div');
    div.style.marginBottom = '10px'; div.style.padding = '10px';
    div.style.borderRadius = '10px'; div.style.maxWidth = '85%';
    div.style.fontSize = '14px';
    
    if (sender === 'Anda') {
        div.style.marginLeft = 'auto'; div.style.backgroundColor = '#e3f2fd'; div.style.textAlign = 'right';
        div.innerHTML = `<strong>${sender}</strong><br>${message}`;
    } else {
        div.style.marginRight = 'auto'; div.style.backgroundColor = '#f5f5f5';
        div.innerHTML = `<strong>${sender}</strong><br>${message}`;
    }
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Voice Logic
function loadVoices() {
    const voices = window.speechSynthesis.getVoices();
    indoVoice = voices.find(v => v.name === 'Google Bahasa Indonesia') || voices.find(v => v.lang === 'id-ID');
}
if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadVoices;

function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'id-ID'; u.rate = 0.95;
        if (!indoVoice) loadVoices();
        if (indoVoice) u.voice = indoVoice;
        window.speechSynthesis.speak(u);
    }
}

function startVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window)) { alert("Gunakan Chrome"); return; }
    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.start();
    recognition.onresult = (e) => {
        const txt = e.results[0][0].transcript;
        if(document.getElementById('chatMessages')) addChatMessage('Anda', txt);
        sendToPython(txt);
    };
}

function updateConnectionStatus(connected) {
    const els = document.querySelectorAll('.status-value, .status-text'); // Support kedua class
    els.forEach(el => {
        if (el.innerText === 'Unknown' || el.innerText === 'Offline' || el.innerText === 'Loading...') {
            el.innerText = connected ? "Mati" : "Offline";
            el.style.color = connected ? "#f44336" : "#9e9e9e";
        }
    });
}

window.onload = function() {
    connectToMQTT();
    if('speechSynthesis' in window) loadVoices();
    
    // Welcome message hanya di halaman Home
    if(document.getElementById('chatMessages')) {
        setTimeout(() => addChatMessage('System', '👋 Sistem Siap. Ketik "Status" untuk update.'), 1500);
    }
};

window.toggleMenu = () => document.getElementById('hamburgerMenu').classList.toggle('active');
window.sendMessage = sendMessage;
window.startVoiceRecognition = startVoiceRecognition;
window.sendToPython = sendToPython;
