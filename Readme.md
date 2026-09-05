# Ticketing System MyTickSystem

Sistem Ticketing profesional dengan manajemen hierarki (Superadmin, Admin Cabang, Manager, Supervisor, Staf), multi-branch, profil mandiri, dan global search.

## Cara Instalasi & Menjalankan Project:

1. **Clone repository ini:**
   ```bash
   git clone https://github.com/deepstruct-ilyasa/MyTickSystem.git
   cd MyTickSystem
   ```

2. **Installdependencies:**
    ```bash
    npm install
    ```

3. **Konfigurasi Environment:**
    - Rename atau saling file .env.example menjadi .env
    ```bash
    cp .env.example .env
    ```
    - Sesuaikan kredensial database PostgreSQL di dalam file .env.

4. **Jalankan Migrasi Database:**
    - Buat database baru di PostgreSQL, lalu impor skema tabel yang dibutuhkan.

5. **Jalankan Server (Development Mode):**
    ```bash
    npm run dev
    ```
    - Buka browser di http://localhost:4000 atau http://ipserver:4000
