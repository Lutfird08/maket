// ==========================================
// 🔐 KONFIGURASI PASSWORD
// ==========================================
// Ganti "lutfi123" dengan password yang Anda inginkan
const VALID_PASSWORD = "lutfi123"; 

// ==========================================
// 🚀 FUNGSI LOGIN (Dipanggil Tombol MASUK)
// ==========================================
function login() {
    let passwordInput = document.getElementById("password");
    let password = passwordInput.value.trim();

    // Cek kecocokan password
    if (password === VALID_PASSWORD) {
        // JIKA BENAR:
        console.log("Login Berhasil!");
        window.location.href = "home.html"; // Pindah ke Dashboard
    } else {
        // JIKA SALAH:
        alert('⚠️ Password salah! Silakan coba lagi.');
        passwordInput.value = ""; // Kosongkan input
        passwordInput.focus();    // Fokuskan kursor kembali
    }
}

// ==========================================
// 👁️ FUNGSI INTIP PASSWORD (Mata)
// ==========================================
function togglePassword() {
    let passwordInput = document.getElementById("password");
    let toggleImage = document.getElementById("eye-icon"); // Pastikan ID ini ada di HTML

    if (passwordInput.type === "password") {
        // Ubah jadi teks (terlihat)
        passwordInput.type = "text";
        toggleImage.src = "Asset/view.png"; // Gambar mata terbuka
    } else {
        // Ubah jadi password (titik-titik)
        passwordInput.type = "password";
        toggleImage.src = "Asset/hide.png"; // Gambar mata tertutup/dicoret
    }
}

// ==========================================
// ⌨️ EVENT LISTENER TOMBOL ENTER
// ==========================================
// Agar user bisa langsung tekan Enter tanpa klik tombol Masuk
document.getElementById("password").addEventListener("keyup", function(event) {
    if (event.key === "Enter") {
        login();
    }
});
