const pool = require('./config/db');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
    try {
        console.log('[SEEDER] Memulai proses seeding data...');

        const saltRounds = 10;
        const defaultPassword = await bcrypt.hash('password123', saltRounds);

        // --- 1. SEEDING CABANG (BRANCHES) ---
        console.log('[SEEDER] Menambahkan data Cabang...');
        await pool.query(`
            INSERT INTO branches (branch_code, name, address) VALUES 
            ('KLT', 'Kantor Pusat Klaten', 'Jl. Pemuda No. 123, Klaten'),
            ('SLO', 'Cabang Solo Baru', 'Jl. Ir. Soekarno No. 45, Solo Baru')
            ON CONFLICT (branch_code) DO NOTHING;
        `);

        const branchRes = await pool.query(`SELECT id, name FROM branches WHERE branch_code IN ('KLT', 'SLO');`);
        const branchKlaten = branchRes.rows.find(b => b.name.includes('Klaten')).id;
        const branchSolo = branchRes.rows.find(b => b.name.includes('Solo')).id;

        // --- 2. SEEDING 3 MANAGERIAL SEBAGAI PARENT UNIT ---
        console.log('[SEEDER] Menambahkan data Divisi Managerial...');
        const managerUnitsRes = await pool.query(`
            INSERT INTO units (branch_id, name, unit_code, parent_unit_id) VALUES 
            ($1, 'Divisi IT & Infrastruktur', 'DIV-IT', NULL),
            ($1, 'Divisi Operasional & Layanan', 'DIV-OPS', NULL),
            ($1, 'Divisi Keuangan & Administrasi', 'DIV-FIN', NULL)
            RETURNING id, name;
        `, [branchKlaten]);

        const unitItManager = managerUnitsRes.rows.find(u => u.name.includes('IT')).id;
        const unitOpsManager = managerUnitsRes.rows.find(u => u.name.includes('Operasional')).id;
        const unitFinManager = managerUnitsRes.rows.find(u => u.name.includes('Keuangan')).id;

        // --- 3. SEEDING 10 UNIT TURUNAN (SUB-UNIT) ---
        console.log('[SEEDER] Menambahkan 10 Unit Kerja operasional...');
        
        // Dipecah per kelompok parent agar parameter indeksnya akurat dan aman
        const unitsResIT = await pool.query(`
            INSERT INTO units (branch_id, name, unit_code, parent_unit_id) VALUES 
            ($1, 'Network Operations Center (NOC)', 'NOC', $2),
            ($1, 'Server & Database Admin', 'SDB', $2),
            ($1, 'IT Helpdesk Support', 'HLD', $2),
            ($1, 'Hardware & Maintenance', 'HWM', $2)
            RETURNING id, name;
        `, [branchKlaten, unitItManager]);

        const unitsResOps = await pool.query(`
            INSERT INTO units (branch_id, name, unit_code, parent_unit_id) VALUES 
            ($1, 'Customer Service Front Office', 'CSF', $2),
            ($1, 'Logistik & Gudang', 'LOG', $2),
            ($1, 'Quality Control', 'QC', $2)
            RETURNING id, name;
        `, [branchKlaten, unitOpsManager]);

        const unitsResFin = await pool.query(`
            INSERT INTO units (branch_id, name, unit_code, parent_unit_id) VALUES 
            ($1, 'Accounting & Tax', 'ACC', $2),
            ($1, 'Human Resources (HRD)', 'HRD', $2),
            ($1, 'General Affair (GA)', 'GA', $2)
            RETURNING id, name;
        `, [branchKlaten, unitFinManager]);

        const allUnits = [...unitsResIT.rows, ...unitsResOps.rows, ...unitsResFin.rows];

        const unitNoc = allUnits.find(u => u.name.includes('NOC')).id;
        const unitServer = allUnits.find(u => u.name.includes('Server')).id;
        const unitHelpdesk = allUnits.find(u => u.name.includes('Helpdesk')).id;
        const unitHardware = allUnits.find(u => u.name.includes('Hardware')).id;
        const unitCs = allUnits.find(u => u.name.includes('Customer Service')).id;
        const unitLogistik = allUnits.find(u => u.name.includes('Logistik')).id;
        const unitAccounting = allUnits.find(u => u.name.includes('Accounting')).id;
        const unitHrd = allUnits.find(u => u.name.includes('Human Resources')).id;

        // --- 4. SEEDING USERS ---
        console.log('[SEEDER] Menambahkan akun Pengguna (Users)...');
        await pool.query(`
            INSERT INTO users (branch_id, unit_id, name, nip, password, role) VALUES 
            ($1, NULL, 'Super Administrator', 'SA001', $16, 'superadmin'),
            ($1, NULL, 'Admin Cabang Klaten', 'AC001', $16, 'admin_cabang'),
            ($2, NULL, 'Admin Cabang Solo', 'AC002', $16, 'admin_cabang'),
            ($1, $3, 'Manager IT Pusat', 'MGR01', $16, 'manager'),
            ($1, $4, 'Manager Operasional', 'MGR02', $16, 'manager'),
            ($1, $5, 'Manager Keuangan', 'MGR03', $16, 'manager'),
            ($1, $6, 'Supervisor NOC', 'SPV01', $16, 'supervisor'),
            ($1, $7, 'Supervisor Helpdesk', 'SPV02', $16, 'supervisor'),
            ($1, $8, 'Rif''an Wafi Ilyasa (Network Engineer)', 'STF01', $16, 'staff'),
            ($1, $9, 'Ahmad Server Engineer', 'STF02', $16, 'staff'),
            ($1, $10, 'Budi Helpdesk Support', 'STF03', $16, 'staff'),
            ($1, $11, 'Siti Hardware Tech', 'STF04', $16, 'staff'),
            ($1, $12, 'Dewi Customer Service', 'STF05', $16, 'staff'),
            ($1, $13, 'Joko Logistik Staff', 'STF06', $16, 'staff'),
            ($1, $14, 'Rina Accounting Staff', 'STF07', $16, 'staff'),
            ($1, $15, 'Eko HRD Staff', 'STF08', $16, 'staff')
            ON CONFLICT (nip) DO NOTHING;
        `, [
            branchKlaten,       // $1
            branchSolo,         // $2
            unitItManager,      // $3
            unitOpsManager,     // $4
            unitFinManager,     // $5
            unitNoc,            // $6
            unitHelpdesk,       // $7
            unitNoc,            // $8
            unitServer,         // $9
            unitHelpdesk,       // $10
            unitHardware,       // $11
            unitCs,             // $12
            unitLogistik,       // $13
            unitAccounting,     // $14
            unitHrd,            // $15
            defaultPassword     // $16 (hashed password)
        ]);

        console.log('[SEEDER] Berhasil! Semua data seeder berhasil dimasukkan ke database.');
        process.exit(0);
    } catch (error) {
        console.error('[SEEDER] Gagal melakukan seeding database:', error);
        process.exit(1);
    }
}

seedDatabase();