// Konfigurasi MQTT - Menggunakan EMQX broker
const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_TOPIC_PREFIX = 'lutfi_140910/smart_home/';

// Variabel global
let mqttClient = null;
let isConnected = false;

// Mapping perangkat Arduino dengan perintah ON/OFF baru
const deviceCommands = {
    // Format: index: {on: 'perintah_nyala', off: 'perintah_mati'}
    0: { on: 'ON 0', off: 'OFF 0' }, // Lampu Utama
    1: { on: 'ON 1', off: 'OFF 1' }, // Lampu Kamar
    2: { on: 'ON 2', off: 'OFF 2' }, // Lampu Tamu
    3: { on: 'ON 3', off: 'OFF 3' }, // Colokan Terminal
    6: { on: 'KIPASON 50', off: 'KIPASOFF' }, // Kipas
    7: { on: 'ON 7', off: 'OFF 7' }, // Pompa
    8: { on: 'ON 8', off: 'OFF 8' }, // Solenoid Valve
    9: { on: 'SOLENOID_DOOR', off: null }, // Solenoid Door (hanya nyala)
    // Tirai - tetap pakai command khusus
    'tirai_buka': 'TIRAIBUKA',
    'tirai_tutup': 'TIRAITUTUP',
    'tirai_stop': 'TIRAIOFF'
};

// Nama perangkat sesuai Arduino
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
    10: "Otomatis Pompa",
    11: "Otomatis Lampu"
};

// Mapping perangkat ke UI element ID
const deviceUI = {
    0: { element: 'lamp', type: 'lampu' },
    6: { element: 'ac', type: 'kipas' },
    9: { element: 'door', type: 'pintu' },
    1: { element: null, type: 'lampu' },
    2: { element: null, type: 'lampu' },
    3: { element: null, type: 'terminal' },
    7: { element: null, type: 'pompa' },
    8: { element: null, type: 'valve' }
};

// Status perangkat default
let deviceStatus = {
    lamp: "Mati",      // Lampu Utama (index 0)
    ac: "Mati",        // Kipas (index 6)
    door: "Terkunci"   // Solenoid Door (index 9)
};

// Status untuk semua perangkat
let allDeviceStatus = {
    0: false, // Lampu Utama
    1: false, // Lampu Kamar
    2: false, // Lampu Tamu
    3: false, // Colokan Terminal
    6: false, // Kipas
    7: false, // Pompa
    8: false, // Solenoid Valve
    9: false  // Solenoid Door
};

// Fungsi untuk koneksi MQTT
function connectToMQTT() {
    console.log('Menghubungkan ke MQTT Broker EMQX...');
    
    const options = {
        clientId: 'smart_home_web_' + Math.random().toString(16).substr(2, 8),
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 30000,
    };

    mqttClient = mqtt.connect(MQTT_BROKER_URL, options);

    mqttClient.on('connect', function () {
        console.log('✅ Terhubung ke MQTT Broker EMQX');
        isConnected = true;
        
        subscribeToTopics();
        requestInitialStatus();
        updateConnectionStatus(true);
    });

    mqttClient.on('message', function (topic, message) {
        handleIncomingMessage(topic, message.toString());
    });

    mqttClient.on('error', function (error) {
        console.error('MQTT Error:', error);
        updateConnectionStatus(false);
    });

    mqttClient.on('close', function () {
        console.log('MQTT disconnected');
        isConnected = false;
        updateConnectionStatus(false);
    });
}

// Subscribe ke topik
function subscribeToTopics() {
    const topics = [
        MQTT_TOPIC_PREFIX + 'response',
        MQTT_TOPIC_PREFIX + 'status',
        MQTT_TOPIC_PREFIX + 'sensor'
    ];

    topics.forEach(topic => {
        mqttClient.subscribe(topic, { qos: 0 }, function (err) {
            if (!err) {
                console.log('Subscribed to:', topic);
            }
        });
    });
}

// Handle pesan masuk dari MQTT
function handleIncomingMessage(topic, message) {
    console.log('Pesan diterima:', topic, '=>', message);
    
    // Filter pesan yang tidak perlu
    if (message.includes("SISTEM KONTROL RUMAH") || 
        message.includes("PERINTAH SERIAL:") ||
        message.includes("Catatan:") ||
        message === "===============================") {
        return; // Abaikan pesan header/menu
    }
    
    if (topic.includes('response')) {
        parseArduinoResponse(message);
    } else if (topic.includes('status')) {
        updateStatusFromMessage(message);
    } else if (topic.includes('sensor')) {
        processSensorData(message);
    }
}

// Parsing response dari Arduino
function parseArduinoResponse(message) {
    console.log('Parsing response:', message);
    
    // Format: "Lampu Utama: ON" atau "Lampu Utama: OFF"
    if (message.includes(':')) {
        const parts = message.split(':');
        if (parts.length >= 2) {
            const deviceName = parts[0].trim();
            const status = parts[1].trim();
            
            // Tampilkan di chat
            addChatMessage('Arduino', `${deviceName}: ${status}`);
            
            // Update UI status
            updateUIFromResponse(deviceName, status);
        }
    } 
    // Untuk pesan khusus
    else if (message.includes('Solenoid Door:') || message.includes('Tirai:')) {
        addChatMessage('Arduino', message);
        
        if (message.includes('Solenoid Door:')) {
            updateDeviceStatus('door', message.includes('AKTIF') ? 'Terbuka' : 'Terkunci');
        }
    }
    else if (message.startsWith('>>')) {
        // Echo dari perintah yang dikirim
        const cmd = message.substring(3).trim();
        addChatMessage('Arduino', `Menerima: ${cmd}`);
    }
    else if (message.startsWith('ERROR:')) {
        addChatMessage('Arduino', message);
    }
    else if (message.includes('=== STATUS SISTEM ===')) {
        // Status lengkap - bisa ditampilkan di chat
        addChatMessage('Arduino', '📋 Status sistem diterima');
    }
    else if (message.includes('ESP32:')) {
        // Status dari ESP32
        addChatMessage('System', message);
    }
}

// Update UI dari response
function updateUIFromResponse(deviceName, status) {
    const lowerDeviceName = deviceName.toLowerCase();
    const lowerStatus = status.toLowerCase();
    const isOn = lowerStatus.includes('on') || lowerStatus.includes('aktif');
    
    // Cari device berdasarkan nama
    for (const [index, name] of Object.entries(deviceNames)) {
        if (lowerDeviceName.includes(name.toLowerCase())) {
            const idx = parseInt(index);
            allDeviceStatus[idx] = isOn;
            
            // Update UI utama jika ada
            if (deviceUI[idx]) {
                const uiElement = deviceUI[idx].element;
                if (uiElement) {
                    updateDeviceStatus(uiElement, isOn ? 'Nyala' : 'Mati');
                }
            }
            
            console.log(`Updated ${name}: ${isOn ? 'ON' : 'OFF'}`);
            break;
        }
    }
}

// Update status dari message status topic
function updateStatusFromMessage(message) {
    // Format dari Arduino: "Lampu Utama: ON" per baris
    if (message.includes(':')) {
        const parts = message.split(':');
        if (parts.length === 2) {
            const deviceName = parts[0].trim();
            const status = parts[1].trim();
            updateUIFromResponse(deviceName, status);
        }
    }
}

// Process sensor data
function processSensorData(message) {
    if (message.startsWith("LDR:") || message.startsWith("Soil:") || message.startsWith("DHT11:")) {
        addChatMessage('Sensor', message);
    }
}

// Update device status di UI
function updateDeviceStatus(device, status) {
    deviceStatus[device] = status;
    
    const element = document.getElementById(device);
    if (element) {
        element.textContent = status;
        updateStatusColor(element, status);
    }
}

// Update warna status
function updateStatusColor(element, status) {
    if (!element) return;
    
    if (status.includes('Nyala') || status.includes('Terbuka')) {
        element.style.color = '#4CAF50';
        element.style.fontWeight = 'bold';
    } else {
        element.style.color = '#f44336';
        element.style.fontWeight = 'normal';
    }
}

// Request status awal
function requestInitialStatus() {
    if (!isConnected) return;
    
    setTimeout(() => {
        sendSerialCommand('STATUS');
    }, 1000);
}

// Kirim perintah serial ke Arduino (via MQTT)
function sendSerialCommand(command) {
    if (!isConnected || !mqttClient) {
        addChatMessage('System', '❌ Tidak terhubung ke server MQTT');
        return;
    }
    
    const topic = MQTT_TOPIC_PREFIX + 'control';
    
    console.log('Mengirim perintah:', command);
    
    mqttClient.publish(topic, command, { qos: 0 }, function (err) {
        if (err) {
            console.error('Gagal mengirim perintah:', err);
            addChatMessage('System', '❌ Gagal mengirim perintah');
        } else {
            // Tampilkan di chat bahwa perintah telah dikirim
            addChatMessage('Anda', command);
        }
    });
}

// Fungsi untuk mengirim perintah berdasarkan device index
function sendDeviceCommand(deviceIndex, action) {
    if (deviceCommands[deviceIndex]) {
        const command = deviceCommands[deviceIndex][action];
        if (command) {
            sendSerialCommand(command);
            return true;
        } else {
            addChatMessage('System', `Perintah ${action} tidak tersedia untuk perangkat ini`);
            return false;
        }
    } else {
        addChatMessage('System', `Perangkat index ${deviceIndex} tidak dikenali`);
        return false;
    }
}

// Fungsi khusus untuk tirai
function sendTiraiCommand(action) {
    if (deviceCommands[action]) {
        sendSerialCommand(deviceCommands[action]);
        return true;
    }
    return false;
}

// Fungsi chat
function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    
    if (message === '') return;
    
    addChatMessage('Anda', message);
    processCommand(message);
    input.value = '';
}

// Proses perintah dari chat
function processCommand(message) {
    const lowerMessage = message.toLowerCase();
    
    // Perintah sederhana
    if (lowerMessage === 'status') {
        sendSerialCommand('STATUS');
        addChatMessage('System', '📋 Meminta status sistem...');
        return;
    }
    else if (lowerMessage === 'buka pintu' || lowerMessage === 'pintu buka') {
        sendSerialCommand('SOLENOID_DOOR');
        addChatMessage('System', '🚪 Membuka pintu (5 detik)...');
        return;
    }
    else if (lowerMessage === 'tirai buka') {
        sendSerialCommand('TIRAIBUKA');
        addChatMessage('System', '🪟 Membuka tirai (500ms)...');
        return;
    }
    else if (lowerMessage === 'tirai tutup') {
        sendSerialCommand('TIRAITUTUP');
        addChatMessage('System', '🪟 Menutup tirai (500ms)...');
        return;
    }
    else if (lowerMessage === 'tirai stop' || lowerMessage === 'stop tirai') {
        sendSerialCommand('TIRAIOFF');
        addChatMessage('System', '🛑 Menghentikan tirai...');
        return;
    }
    else if (lowerMessage === 'nyala semua' || lowerMessage === 'nyalakan semua') {
        // Nyalakan semua perangkat utama
        const devicesToTurnOn = [0, 1, 2, 3, 6, 7, 8];
        devicesToTurnOn.forEach((deviceId, index) => {
            setTimeout(() => {
                sendDeviceCommand(deviceId, 'on');
            }, index * 300);
        });
        addChatMessage('System', '💡 Menyalakan semua perangkat...');
        return;
    }
    else if (lowerMessage === 'mati semua' || lowerMessage === 'matikan semua') {
        // Matikan semua perangkat
        const devicesToTurnOff = [0, 1, 2, 3, 6, 7, 8];
        devicesToTurnOff.forEach((deviceId, index) => {
            setTimeout(() => {
                sendDeviceCommand(deviceId, 'off');
            }, index * 300);
        });
        addChatMessage('System', '🔌 Mematikan semua perangkat...');
        return;
    }
    
    // Perintah dengan parameter - lampu
    if (lowerMessage.includes('lampu utama')) {
        handleDeviceCommand(0, lowerMessage, 'Lampu Utama');
    }
    else if (lowerMessage.includes('lampu kamar')) {
        handleDeviceCommand(1, lowerMessage, 'Lampu Kamar');
    }
    else if (lowerMessage.includes('lampu tamu')) {
        handleDeviceCommand(2, lowerMessage, 'Lampu Tamu');
    }
    else if (lowerMessage.includes('colokan') || lowerMessage.includes('terminal')) {
        handleDeviceCommand(3, lowerMessage, 'Colokan Terminal');
    }
    else if (lowerMessage.includes('kipas')) {
        handleDeviceCommand(6, lowerMessage, 'Kipas');
    }
    else if (lowerMessage.includes('pompa') || lowerMessage.includes('siram')) {
        handleDeviceCommand(7, lowerMessage, 'Pompa');
    }
    else if (lowerMessage.includes('valve') || lowerMessage.includes('solenoid')) {
        handleDeviceCommand(8, lowerMessage, 'Solenoid Valve');
    }
    else {
        // Kirim langsung sebagai command (untuk command khusus)
        sendSerialCommand(message.toUpperCase());
    }
}

// Helper function untuk handle device command
function handleDeviceCommand(deviceIndex, lowerMessage, deviceName) {
    const action = lowerMessage.includes('nyala') || 
                   lowerMessage.includes('hidup') || 
                   lowerMessage.includes('buka') ? 'on' : 'off';
    
    if (sendDeviceCommand(deviceIndex, action)) {
        const actionText = action === 'on' ? 'menyalakan' : 'mematikan';
        addChatMessage('System', `${actionText} ${deviceName}...`);
    }
}

// Voice recognition
function startVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.lang = 'id-ID';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        
        recognition.start();
        
        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            document.getElementById('userInput').value = transcript;
            sendMessage();
        };
        
        recognition.onerror = function(event) {
            console.error('Speech recognition error', event.error);
            addChatMessage('System', '🎤 Error dalam pengenalan suara');
        };
        
        recognition.onend = function() {
            addChatMessage('System', '🎤 Siap mendengar perintah...');
        };
    } else {
        addChatMessage('System', '🎤 Browser tidak mendukung pengenalan suara');
    }
}

// Tambahkan pesan ke chat
function addChatMessage(sender, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = sender === 'Anda' ? 'message user' : 'message system';
    
    // Warna berbeda untuk Arduino
    if (sender === 'Arduino') {
        messageDiv.style.color = '#0066cc';
        messageDiv.style.fontStyle = 'italic';
    }
    // Warna untuk Sensor
    else if (sender === 'Sensor') {
        messageDiv.style.color = '#FF9800';
        messageDiv.style.fontSize = '0.9em';
    }
    // Warna untuk System
    else if (sender === 'System') {
        messageDiv.style.color = '#666';
        messageDiv.style.fontSize = '0.9em';
    }
    
    messageDiv.innerHTML = `<strong>${sender}:</strong> ${message}`;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Update UI koneksi status
function updateConnectionStatus(connected) {
    const statusItems = document.querySelectorAll('.status-text');
    
    if (connected) {
        statusItems.forEach(item => {
            if (item.textContent === 'Offline' || item.textContent === 'Loading...') {
                item.textContent = 'Mati';
                item.style.color = '#f44336';
            }
        });
    } else {
        statusItems.forEach(item => {
            item.textContent = 'Offline';
            item.style.color = '#ff9800';
        });
    }
}

// Toggle menu hamburger
function toggleMenu() {
    const menu = document.getElementById('hamburgerMenu');
    menu.classList.toggle('active');
}

// Update waktu dan tanggal
function updateDateTime() {
    const now = new Date();
    const timeElement = document.querySelector('.time');
    const dateElement = document.querySelector('.date');
    
    const optionsDate = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'numeric', 
        day: 'numeric' 
    };
    
    const timeString = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString('id-ID', optionsDate);
    
    if (timeElement) timeElement.textContent = timeString;
    if (dateElement) dateElement.textContent = dateString;
}

// Inisialisasi saat halaman dimuat
window.onload = function() {
    // Update waktu
    updateDateTime();
    setInterval(updateDateTime, 60000);
    
    // Koneksi MQTT
    connectToMQTT();
    
    // Event listener untuk Enter key
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        userInput.focus();
        
        // Placeholder saran
        userInput.placeholder = 'Contoh: "nyalakan lampu utama", "matikan kipas", "status"';
    }
    
    // Pesan selamat datang
    setTimeout(() => {
        addChatMessage('System', '🏠 Selamat datang di Smart Home System!');
        addChatMessage('System', '💬 Gunakan perintah seperti: "nyalakan lampu utama", "matikan kipas", "buka pintu"');
        addChatMessage('System', '🎤 Klik ikon mikrofon untuk perintah suara');
        addChatMessage('System', '📋 Ketik "status" untuk melihat status semua perangkat');
    }, 1500);
};

// Export functions untuk digunakan di HTML
window.toggleMenu = toggleMenu;
window.sendMessage = sendMessage;
window.startVoiceRecognition = startVoiceRecognition;
