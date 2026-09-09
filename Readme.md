# 🎫 Enterprise Ticketing System
Sistem Informasi Manajemen Tiket berbasis web yang dirancang untuk mengelola alur penanganan kendala/layanan operasional secara terstruktur, multi-cabang, dan berbasis hierarki unit (Role-Based Access Control & Strict History Unit).

# 🚀 Fitur Utama & Cara Kerja Sistem
1. Manajemen Hirarki Unit & Cabang (Unit & Branch Management)
    - Struktur Organisasi Bertingkat: Sistem mendukung pengelolaan unit operasional yang terikat pada Cabang tertentu, lengkap dengan relasi atasan-bawahan (Parent-Child Unit / Unit Manajemen).
    - Hak Akses Berdasarkan Role (RBAC):
        - Superadmin: Memiliki akses global lintas cabang dan lintas unit untuk memantau seluruh sistem.
        - Admin Cabang: Mengelola operasional dan data unit secara penuh hanya di dalam lingkup cabang mereka sendiri.
        - Manager: Mengawasi rekapitulasi dan penanganan tiket di unit kepemimpinannya beserta sub-unit di bawahnya.
        - Supervisor: Mengontrol dan memantau operasional tiket yang spesifik pada unit yang dipimpin.
        - Staf: Membuat dan merespons tiket yang masuk ke unit mereka.

2. Dashboard Interaktif & Live Synchronization (Chart.js)
    - Statistik Real-Time: Kartu ringkasan jumlah tiket (Total, Open, In Progress, Resolved, Closed) yang diperbarui secara instan.
    - Tingkat Penyelesaian (Resolution Rate): Indikator persentase keberhasilan penyelesaian tiket yang dihitung secara dinamis berdasarkan filter aktif.
    - Distribusi Status Tiket (Doughnut Chart): Visualisasi proporsi penanganan tiket menggunakan Chart.js yang tersinkronisasi otomatis dengan perubahan data atau filter.

3. Pemisahan Ketat Inbox vs Outbox
    - Tiket Masuk (Inbox): Daftar tiket yang ditujukan kepada unit pengguna atau sub-unit di bawahnya untuk segera ditangani.
    - Tiket Keluar (Outbox): Daftar tiket yang dikirim atau dibuat oleh pengguna/unit bersangkutan untuk meminta bantuan ke unit lain.

4. Arsitektur Kebal Mutasi (Strict History Unit)
    - Penguncian Histori Permanen: Sistem mencatat ID unit pembuat (creator_unit_id) dan unit tujuan (target_unit_id) secara mutlak pada saat tiket dibuat.
    - Aman dari Rotasi Jabatan: Jika seorang staf, supervisor, atau manager mengalami mutasi atau perpindahan unit/cabang, riwayat tiket lama tidak akan berubah makna, hilang, atau ikut berpindah. Seluruh rekapitulasi dan grafik statistik masa lalu tetap akurat berdasarkan unit asal terjadinya insiden.

5. Filter Lanjutan & Cascading Dropdown (AJAX)
    - Panel filter interaktif berbasis modal pop-up yang memungkinkan penyaringan data berdasarkan Cabang, Divisi/Manager, Unit Spesifik, hingga Staf.
    - Tabel dan grafik diperbarui secara asinkron (AJAX) tanpa perlu memuat ulang halaman (reload).

# 🛠️ Teknologi yang Digunakan
1. Backend: Node.js, Express.js
2. Database: PostgreSQL (dengan connection pooling)
3. Templating Engine: EJS (Embedded JavaScript)
4. Frontend UI: Tailwind CSS, Alpine.js (untuk interaktivitas modal dan reaktivitas DOM)
5. Visualisasi Grafik: Chart.js

📂 Struktur Direktori Utama
```bash
    MyTickSystem/
    ├── config/             # Konfigurasi database
    ├── controllers/        # Logika (DashboardController, UnitController, TicketController, dll.)
    ├── middlewares/        # Autentikasi dan pengamanan hak akses
    ├── routes/             # Jalur routing aplikasi (unitRoutes, ticketRoutes, dashboardRoutes)
    ├── views/              # Tampilan antarmuka EJS
    ├── app.js              # Titik masuk utama aplikasi Express
    └── .env                # Konfigurasi Environment
```

# ⚙️ Cara Menjalankan Aplikasi
1. Pastikan Node.js dan PostgreSQL sudah terinstal di server atau komputer lokal Anda.

2. Persiapan Database PostgreSQL
    - Buka terminal dan masuk ke CLI PostgreSQL (psql):
        ```bash
        sudo -u postgres psql
        ```
    - Buat database baru beserta user khusus untuk aplikasi (sesuaikan nama dan password):
        ```SQL
        -- Membuat Database
        CREATE DATABASE mytick_db;

        -- Membuat User Database (Opsional, atau bisa menggunakan user 'postgres' bawaan)
        CREATE USER postgres WITH PASSWORD 'password_aman_anda';

        -- Memberikan Hak Akses Penuh ke Database
        GRANT ALL PRIVILEGES ON DATABASE mytick_db TO postgres;
        ```
        Keluar dari psql dengan mengetikkan \q.

3. **Clone repository ini:**
   ```bash
   git clone https://github.com/deepstruct-ilyasa/MyTickSystem.git
   cd MyTickSystem
   ```

4. **Installdependencies:**
    ```bash
    npm install
    ```

5. **Konfigurasi Environment:**
    - Rename atau salin file .env.example menjadi .env
    ```bash
    cp .env.example .env
    ```
    - Sesuaikan kredensial database PostgreSQL di dalam file .env.

6. **Jalankan Migrasi Database:**
    - Buat database baru di PostgreSQL, lalu impor skema tabel yang dibutuhkan.

7. **Jalankan Server (Development Mode):**
    ```bash
    npm run dev
    ```
    - Buka browser di http://localhost:4000 atau http://ipserver:4000