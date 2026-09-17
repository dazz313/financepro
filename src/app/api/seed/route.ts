import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_CHART_OF_ACCOUNTS } from "@/lib/seed-data";
import { hashPassword, getUserFromRequest } from "@/lib/auth";
import crypto from "crypto";

function randomPassword(length = 12): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// POST /api/seed - Inisialisasi chart of accounts default + contoh data
export async function POST(req: NextRequest) {
  try {
    const existing = await db.account.count();
    if (existing > 0) {
      return NextResponse.json(
        { error: "Data sudah ada. Hapus database untuk re-seed." },
        { status: 400 }
      );
    }

    // Password admin dari pengguna (opsional) — bila kosong, dibangkitkan acak
    // agar tidak ada kredensial default yang bisa ditebak.
    let body: { adminPassword?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    let password = String(body.adminPassword ?? "").trim();
    if (password && password.length < 8) {
      return NextResponse.json({ error: "Password admin minimal 8 karakter" }, { status: 400 });
    }
    const generated = !password;
    if (!password) password = randomPassword(12);

    // 0. Buat default admin user + company settings + preferences
    const passwordHash = await hashPassword(password);
    const adminUser = await db.user.create({
      data: {
        email: "admin@finance.pro",
        name: "Administrator",
        passwordHash,
        role: "SUPERADMIN",
        isActive: true,
        preferences: { create: {} },
      },
    });

    await db.companySettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        name: "FinancePro Demo",
        legalName: "PT FinancePro Demo Indonesia",
        taxId: "01.234.567.8-091.000",
        email: "admin@finance.pro",
        phone: "021-5551234",
        address: "Jl. Sudirman Kav. 21-22",
        city: "Jakarta Selatan",
        postalCode: "12190",
        country: "Indonesia",
        currencyCode: "IDR",
        currencySymbol: "Rp",
        currencyPosition: "before",
        decimalPlaces: 0,
        thousandSeparator: ".",
        decimalSeparator: ",",
        locale: "id-ID",
        fiscalYearStartMonth: 1,
        fiscalYearStartDay: 1,
        defaultTaxRate: 11,
        taxIncluded: false,
        companyCode: "FPD",
        numberingFormat: "{prefix}-{companyCode}-{year}-{month}-{seq}",
        invoicePrefix: "INV",
        invoiceStartNumber: 1,
        nextInvoiceNumber: 6,
        defaultPaymentTermsDays: 30,
        invoiceSignature: "Budi Santoso",
        invoiceSignatureTitle: "Direktur Utama",
        invoiceFooterNote: "Pembayaran dilakukan via transfer bank dalam waktu 30 hari. Mohon sebutkan nomor faktur saat pembayaran.",
        invoiceBankName: "Bank BCA",
        invoiceBankAccount: "1234567890",
        invoiceBankHolder: "PT FinancePro Demo Indonesia",
        journalPrefix: "JE",
      },
    });

    // 1. Insert default chart of accounts
    await db.account.createMany({
      data: DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
        code: a.code,
        name: a.name,
        type: a.type,
        subtype: a.subtype ?? null,
        parentCode: a.parentCode ?? null,
        isGroup: a.isGroup,
        isActive: true,
      })),
    });

    // 2. Insert contoh kontak
    await db.contact.createMany({
      data: [
        { code: "C-001", name: "PT Maju Jaya Abadi", type: "CUSTOMER", email: "contact@majujaya.co.id", phone: "021-5551234", address: "Jl. Sudirman No. 45, Jakarta" },
        { code: "C-002", name: "CV Sumber Rezeki", type: "CUSTOMER", email: "info@sumberrejeki.com", phone: "022-7778888", address: "Jl. Asia Afrika No. 12, Bandung" },
        { code: "S-001", name: "PT Distributor Sejahtera", type: "SUPPLIER", email: "sales@distrsejahtera.co.id", phone: "021-3334444", address: "Jl. Gajah Mada No. 88, Jakarta" },
        { code: "S-002", name: "Toko Elektronik Sentosa", type: "SUPPLIER", email: "sentosa@elektronik.id", phone: "031-9990000", address: "Jl. Pemuda No. 21, Surabaya" },
      ],
    });

    // 3. Insert contoh jurnal transaksi
    const now = new Date();
    const sampleEntries = [
      { date: new Date(now.getFullYear(), now.getMonth() - 5, 5), description: "Setoran modal awal pemilik", reference: "BUKTI-001", lines: [
        { code: "1-1100", debit: 100000000 }, { code: "3-1000", credit: 100000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 5, 6), description: "Setor kas ke rekening BCA", reference: "BUKTI-002", lines: [
        { code: "1-1200", debit: 80000000 }, { code: "1-1100", credit: 80000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 5, 10), description: "Pembelian peralatan kantor", reference: "BUKTI-003", lines: [
        { code: "1-2100", debit: 25000000 }, { code: "1-1200", credit: 25000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 4, 15), description: "Penjualan jasa kepada PT Maju Jaya", reference: "INV-001", lines: [
        { code: "1-1300", debit: 35000000 }, { code: "4-1100", credit: 35000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 4, 28), description: "Penerimaan piutang dari PT Maju Jaya", reference: "BUKTI-004", lines: [
        { code: "1-1200", debit: 35000000 }, { code: "1-1300", credit: 35000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 4, 5), description: "Pembayaran sewa kantor bulanan", reference: "BUKTI-005", lines: [
        { code: "5-1200", debit: 12000000 }, { code: "1-1200", credit: 12000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 4, 25), description: "Pembayaran gaji karyawan", reference: "BUKTI-006", lines: [
        { code: "5-1100", debit: 18000000 }, { code: "1-1100", credit: 18000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 3, 8), description: "Pembelian persediaan dari PT Distributor", reference: "PO-005", lines: [
        { code: "1-1400", debit: 22000000 }, { code: "2-1100", credit: 22000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 3, 12), description: "Pembayaran listrik & internet", reference: "BUKTI-007", lines: [
        { code: "5-1300", debit: 3500000 }, { code: "1-1200", credit: 3500000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 3, 18), description: "Penjualan produk kepada CV Sumber Rezeki", reference: "INV-002", lines: [
        { code: "1-1200", debit: 28000000 }, { code: "4-1000", credit: 28000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 3, 18), description: "Harga pokok penjualan INV-002", reference: "INV-002", lines: [
        { code: "5-2000", debit: 15500000 }, { code: "1-1400", credit: 15500000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 2, 3), description: "Iklan digital marketing", reference: "BUKTI-008", lines: [
        { code: "5-1500", debit: 4500000 }, { code: "1-1200", credit: 4500000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 2, 20), description: "Penjualan jasa konsultasi", reference: "INV-003", lines: [
        { code: "1-1200", debit: 42000000 }, { code: "4-1100", credit: 42000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 1, 10), description: "Pembayaran hutang ke PT Distributor", reference: "BUKTI-009", lines: [
        { code: "2-1100", debit: 22000000 }, { code: "1-1200", credit: 22000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 1, 15), description: "Beban transportasi & bensin", reference: "BUKTI-010", lines: [
        { code: "5-1600", debit: 2800000 }, { code: "1-1100", credit: 2800000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 1, 22), description: "Penjualan produk", reference: "INV-004", lines: [
        { code: "1-1200", debit: 31000000 }, { code: "4-1000", credit: 31000000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 1, 22), description: "Harga pokok penjualan INV-004", reference: "INV-004", lines: [
        { code: "5-2000", debit: 17500000 }, { code: "1-1400", credit: 17500000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth() - 1, 30), description: "Penyusutan aset tetap bulan ini", reference: "ADJ-001", lines: [
        { code: "5-3000", debit: 1500000 }, { code: "1-2900", credit: 1500000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth(), 5), description: "Beban administrasi & ATK", reference: "BUKTI-011", lines: [
        { code: "5-1700", debit: 1200000 }, { code: "1-1100", credit: 1200000 }
      ]},
      { date: new Date(now.getFullYear(), now.getMonth(), 14), description: "Penjualan jasa kepada pelanggan", reference: "INV-005", lines: [
        { code: "1-1200", debit: 38500000 }, { code: "4-1100", credit: 38500000 }
      ]},
    ];

    const accountByCode = await db.account.findMany();
    const codeMap = new Map(accountByCode.map((a) => [a.code, a.id]));

    let entryCounter = 1;
    for (const e of sampleEntries) {
      const entryNumber = `JE-${String(entryCounter).padStart(4, "0")}`;
      entryCounter++;
      await db.journalEntry.create({
        data: {
          entryNumber,
          date: e.date,
          description: e.description,
          reference: e.reference,
          source: "MANUAL",
          lines: {
            create: e.lines.map((l) => ({
              accountId: codeMap.get(l.code)!,
              debit: l.debit ?? 0,
              credit: l.credit ?? 0,
            })),
          },
        },
      });
    }

    // 4. Contoh invoice
    const c1 = (await db.contact.findUnique({ where: { code: "C-001" } }))!;
    const c2 = (await db.contact.findUnique({ where: { code: "C-002" } }))!;
    await db.invoice.createMany({
      data: [
        { number: "INV-001", type: "SALES", contactId: c1.id, date: new Date(now.getFullYear(), now.getMonth() - 4, 15), dueDate: new Date(now.getFullYear(), now.getMonth() - 3, 15), status: "PAID", subtotal: 35000000, taxRate: 0, taxAmount: 0, total: 35000000, paidAmount: 35000000 },
        { number: "INV-002", type: "SALES", contactId: c2.id, date: new Date(now.getFullYear(), now.getMonth() - 3, 18), dueDate: new Date(now.getFullYear(), now.getMonth() - 2, 18), status: "PAID", subtotal: 28000000, taxRate: 0, taxAmount: 0, total: 28000000, paidAmount: 28000000 },
        { number: "INV-003", type: "SALES", contactId: c1.id, date: new Date(now.getFullYear(), now.getMonth() - 2, 20), dueDate: new Date(now.getFullYear(), now.getMonth() - 1, 20), status: "PAID", subtotal: 42000000, taxRate: 0, taxAmount: 0, total: 42000000, paidAmount: 42000000 },
        { number: "INV-004", type: "SALES", contactId: c2.id, date: new Date(now.getFullYear(), now.getMonth() - 1, 22), dueDate: new Date(now.getFullYear(), now.getMonth(), 22), status: "SENT", subtotal: 31000000, taxRate: 0, taxAmount: 0, total: 31000000, paidAmount: 0 },
        { number: "INV-005", type: "SALES", contactId: c1.id, date: new Date(now.getFullYear(), now.getMonth(), 14), dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 14), status: "SENT", subtotal: 38500000, taxRate: 0, taxAmount: 0, total: 38500000, paidAmount: 0 },
      ],
    });

    // 5. Bank Accounts (Kas & Bank) - link ke akun CoA
    await db.bankAccount.createMany({
      data: [
        { code: "KAS-01", name: "Kas Utama Kantor", type: "CASH", currency: "IDR", accountCode: "1-1100", openingBalance: 0, description: "Kas tunai kantor" },
        { code: "BCA-01", name: "Rekening Operasional BCA", bankName: "Bank BCA", accountNumber: "1234567890", accountHolder: "PT FinancePro Demo", branch: "Jakarta Sudirman", type: "BANK", currency: "IDR", accountCode: "1-1200", openingBalance: 0 },
        { code: "MDR-01", name: "Rekening Payroll Mandiri", bankName: "Bank Mandiri", accountNumber: "0987654321", accountHolder: "PT FinancePro Demo", branch: "Jakarta Pusat", type: "BANK", currency: "IDR", accountCode: "1-1210", openingBalance: 0 },
      ],
    });

    // 6. Employees (Pegawai)
    await db.employee.createMany({
      data: [
        { code: "EMP-001", name: "Budi Santoso", position: "Manager Keuangan", department: "Keuangan", email: "budi@finance.pro", phone: "081234567890", taxId: "12.345.678.9-012.000", joinDate: new Date(2020, 0, 5), status: "ACTIVE", basicSalary: 15000000, allowance: 3000000, bpjsRate: 2, taxRate: 5, notes: "Karyawan tetap sejak 2020" },
        { code: "EMP-002", name: "Siti Rahayu", position: "Staff Akuntansi", department: "Keuangan", email: "siti@finance.pro", phone: "081234567891", taxId: "12.345.678.9-013.000", joinDate: new Date(2021, 5, 1), status: "ACTIVE", basicSalary: 8000000, allowance: 1500000, bpjsRate: 2, taxRate: 3, notes: "Spesialis akuntansi" },
        { code: "EMP-003", name: "Ahmad Fauzi", position: "Sales Executive", department: "Penjualan", email: "ahmad@finance.pro", phone: "081234567892", taxId: "12.345.678.9-014.000", joinDate: new Date(2022, 2, 10), status: "ACTIVE", basicSalary: 7000000, allowance: 2000000, bpjsRate: 2, taxRate: 3 },
        { code: "EMP-004", name: "Dewi Lestari", position: "Admin Gudang", department: "Operasional", email: "dewi@finance.pro", phone: "081234567893", taxId: "12.345.678.9-015.000", joinDate: new Date(2021, 10, 15), status: "ACTIVE", basicSalary: 5500000, allowance: 1000000, bpjsRate: 2, taxRate: 2 },
        { code: "EMP-005", name: "Rudi Hartono", position: "Driver", department: "Operasional", email: "rudi@finance.pro", phone: "081234567894", joinDate: new Date(2023, 0, 20), status: "ON_LEAVE", basicSalary: 4500000, allowance: 1000000, bpjsRate: 1, taxRate: 0 },
      ],
    });

    // 7. Inventory Items (Persediaan Barang) — didaftarkan tanpa harga (hanya nama).
    // Harga & stok akan terisi otomatis saat membuat Faktur Pembelian.
    await db.inventoryItem.createMany({
      data: [
        { code: "SKU-001", name: "Kertas A4 80gsm (rim)", category: "ATK", unit: "rim", purchasePrice: 0, salePrice: 0, quantityOnHand: 0, reorderLevel: 20, inventoryAccountCode: "1-1400", salesAccountCode: "4-1000", cogsAccountCode: "5-2000" },
        { code: "SKU-002", name: "Tinta Printer HP Hitam", category: "ATK", unit: "pcs", purchasePrice: 0, salePrice: 0, quantityOnHand: 0, reorderLevel: 10, inventoryAccountCode: "1-1400", salesAccountCode: "4-1000", cogsAccountCode: "5-2000" },
        { code: "SKU-003", name: "Pulpen Standard (box)", category: "ATK", unit: "box", purchasePrice: 0, salePrice: 0, quantityOnHand: 0, reorderLevel: 15, inventoryAccountCode: "1-1400", salesAccountCode: "4-1000", cogsAccountCode: "5-2000" },
        { code: "SKU-004", name: "Laptop Asus X441 (unit)", category: "Elektronik", unit: "pcs", purchasePrice: 0, salePrice: 0, quantityOnHand: 0, reorderLevel: 5, inventoryAccountCode: "1-1400", salesAccountCode: "4-1000", cogsAccountCode: "5-2000" },
        { code: "SKU-005", name: "Mouse Wireless Logitech", category: "Elektronik", unit: "pcs", purchasePrice: 0, salePrice: 0, quantityOnHand: 0, reorderLevel: 15, inventoryAccountCode: "1-1400", salesAccountCode: "4-1000", cogsAccountCode: "5-2000" },
        { code: "SKU-006", name: "Folder Map Plastik", category: "ATK", unit: "pcs", purchasePrice: 0, salePrice: 0, quantityOnHand: 0, reorderLevel: 30, inventoryAccountCode: "1-1400", salesAccountCode: "4-1000", cogsAccountCode: "5-2000" },
        { code: "SKU-007", name: "Stapler Joyko HD-50", category: "ATK", unit: "pcs", purchasePrice: 0, salePrice: 0, quantityOnHand: 0, reorderLevel: 10, inventoryAccountCode: "1-1400", salesAccountCode: "4-1000", cogsAccountCode: "5-2000" },
        { code: "SKU-008", name: "Kopi Sachet Kapal Api (dus)", category: "Konsumsi", unit: "dus", purchasePrice: 0, salePrice: 0, quantityOnHand: 0, reorderLevel: 8, inventoryAccountCode: "1-1400", salesAccountCode: "4-1000", cogsAccountCode: "5-2000" },
      ],
    });

    // 7b. Fixed Asset Tetap (register + jurnal pembelian)
    const bankForFixed = (await db.bankAccount.findUnique({ where: { code: "BCA-01" } }))!;
    const fixedAssets = [
      { code: "FA-001", name: "Kendaraan Toyota Avanza", category: "Kendaraan", purchaseDate: new Date(now.getFullYear(), now.getMonth() - 10, 15), purchasePrice: 180000000, residualValue: 20000000, usefulLifeMonths: 60, assetAccountCode: "1-2200" },
      { code: "FA-002", name: "Komputer & Laptop Kantor", category: "Komputer", purchaseDate: new Date(now.getFullYear(), now.getMonth() - 8, 3), purchasePrice: 45000000, residualValue: 5000000, usefulLifeMonths: 48, assetAccountCode: "1-2100" },
      { code: "FA-003", name: "Mesin Fotokopi", category: "Mesin", purchaseDate: new Date(now.getFullYear(), now.getMonth() - 6, 20), purchasePrice: 25000000, residualValue: 2500000, usefulLifeMonths: 60, assetAccountCode: "1-2100" },
    ];
    for (const fa of fixedAssets) {
      const jeCount = await db.journalEntry.count();
      const entryNumber = `JE-${String(jeCount + 1).padStart(4, "0")}`;
      const accAsset = codeMap.get(fa.assetAccountCode);
      const accBank = codeMap.get(bankForFixed.accountCode);
      if (accAsset && accBank) {
        await db.journalEntry.create({
          data: {
            entryNumber,
            date: fa.purchaseDate,
            description: `Pembelian aset ${fa.code} - ${fa.name}`,
            reference: fa.code,
            source: "FIXED_ASSET",
            lines: {
              create: [
                { accountId: accAsset, debit: fa.purchasePrice, credit: 0, description: `Perolehan aset ${fa.code}` },
                { accountId: accBank, debit: 0, credit: fa.purchasePrice, description: `Bayar aset ${fa.code} dari ${bankForFixed.name}` },
              ],
            },
          },
        });
      }
      await db.fixedAsset.create({
        data: {
          code: fa.code,
          name: fa.name,
          category: fa.category,
          assetAccountCode: fa.assetAccountCode,
          accumulatedAccountCode: "1-2900",
          expenseAccountCode: "5-3000",
          purchaseDate: fa.purchaseDate,
          purchasePrice: fa.purchasePrice,
          residualValue: fa.residualValue,
          usefulLifeMonths: fa.usefulLifeMonths,
          depreciationMethod: "STRAIGHT_LINE",
          bankAccountId: bankForFixed.id,
        },
      });
    }

    // 8. Sample Receipts & Payments (Penerimaan & Pembayaran)
    const rc1 = (await db.contact.findUnique({ where: { code: "C-001" } }))!;
    const rc2 = (await db.contact.findUnique({ where: { code: "C-002" } }))!;
    const s1 = (await db.contact.findUnique({ where: { code: "S-001" } }))!;
    const bca = (await db.bankAccount.findUnique({ where: { code: "BCA-01" } }))!;
    const kas = (await db.bankAccount.findUnique({ where: { code: "KAS-01" } }))!;
    const mdr = (await db.bankAccount.findUnique({ where: { code: "MDR-01" } }))!;

    // Receipts (penerimaan dari pelanggan)
    await db.receipt.createMany({
      data: [
        { number: "RCV-001", date: new Date(now.getFullYear(), now.getMonth() - 4, 28), amount: 35000000, fromContactId: rc1.id, bankAccountId: bca.id, accountCode: "1-1300", description: "Pembayaran dari PT Maju Jaya untuk INV-001", reference: "INV-001", allocateToInvoiceId: (await db.invoice.findUnique({ where: { number: "INV-001" } }))!.id, source: "RECEIPT" },
        { number: "RCV-002", date: new Date(now.getFullYear(), now.getMonth() - 3, 20), amount: 28000000, fromContactId: rc2.id, bankAccountId: bca.id, accountCode: "1-1300", description: "Pembayaran dari CV Sumber Rezeki untuk INV-002", reference: "INV-002", allocateToInvoiceId: (await db.invoice.findUnique({ where: { number: "INV-002" } }))!.id, source: "RECEIPT" },
        { number: "RCV-003", date: new Date(now.getFullYear(), now.getMonth() - 2, 25), amount: 42000000, fromContactId: rc1.id, bankAccountId: bca.id, accountCode: "1-1300", description: "Pembayaran dari PT Maju Jaya untuk INV-003", reference: "INV-003", allocateToInvoiceId: (await db.invoice.findUnique({ where: { number: "INV-003" } }))!.id, source: "RECEIPT" },
        { number: "RCV-004", date: new Date(now.getFullYear(), now.getMonth() - 1, 10), amount: 5000000, bankAccountId: kas.id, accountCode: "4-2000", description: "Pendapatan jasa lepas diterima tunai", reference: "SRV-001", source: "RECEIPT" },
      ],
    });

    // Payments (pembayaran ke pemasok & beban operasional)
    await db.payment.createMany({
      data: [
        { number: "PMT-001", date: new Date(now.getFullYear(), now.getMonth() - 3, 10), amount: 22000000, toContactId: s1.id, bankAccountId: bca.id, accountCode: "2-1100", description: "Pembayaran hutang ke PT Distributor Sejahtera", reference: "PO-005", source: "PAYMENT" },
        { number: "PMT-002", date: new Date(now.getFullYear(), now.getMonth() - 4, 5), amount: 12000000, bankAccountId: bca.id, accountCode: "5-1200", description: "Pembayaran sewa kantor bulanan", reference: "SEWA-01", source: "PAYMENT" },
        { number: "PMT-003", date: new Date(now.getFullYear(), now.getMonth() - 4, 25), amount: 18000000, bankAccountId: kas.id, accountCode: "5-1100", description: "Pembayaran gaji karyawan (manual)", reference: "PAYROLL-MANUAL", source: "PAYMENT" },
        { number: "PMT-004", date: new Date(now.getFullYear(), now.getMonth() - 3, 12), amount: 3500000, bankAccountId: bca.id, accountCode: "5-1300", description: "Pembayaran listrik & internet", reference: "PLN-001", source: "PAYMENT" },
        { number: "PMT-005", date: new Date(now.getFullYear(), now.getMonth() - 2, 3), amount: 4500000, bankAccountId: bca.id, accountCode: "5-1500", description: "Iklan digital marketing", reference: "ADS-001", source: "PAYMENT" },
        { number: "PMT-006", date: new Date(now.getFullYear(), now.getMonth() - 1, 15), amount: 2800000, bankAccountId: kas.id, accountCode: "5-1600", description: "Bensin & transportasi", reference: "BBM-001", source: "PAYMENT" },
      ],
    });

    // 9. Employee Leaves (Cuti/Izin/Sakit), Reimbursements, Loans
    const emp1 = (await db.employee.findUnique({ where: { code: "EMP-001" } }))!;
    const emp2 = (await db.employee.findUnique({ where: { code: "EMP-002" } }))!;
    const emp3 = (await db.employee.findUnique({ where: { code: "EMP-003" } }))!;

    await db.employeeLeave.createMany({
      data: [
        { employeeId: emp1.id, type: "CUTI", category: "TAHUNAN", startDate: new Date(now.getFullYear(), now.getMonth() - 2, 5), endDate: new Date(now.getFullYear(), now.getMonth() - 2, 9), days: 5, reason: "Libur keluarga ke Bali", status: "APPROVED" },
        { employeeId: emp2.id, type: "SAKIT", category: "RAWAT JALAN", startDate: new Date(now.getFullYear(), now.getMonth() - 1, 14), endDate: new Date(now.getFullYear(), now.getMonth() - 1, 15), days: 2, reason: "Demam & flu", status: "APPROVED" },
        { employeeId: emp3.id, type: "IZIN", category: "KEPERLUAN", startDate: new Date(now.getFullYear(), now.getMonth(), 8), endDate: new Date(now.getFullYear(), now.getMonth(), 8), days: 1, reason: "Ada keperluan keluarga mendadak", status: "PENDING" },
        { employeeId: emp2.id, type: "CUTI", category: "TAHUNAN", startDate: new Date(now.getFullYear(), now.getMonth() + 1, 2), endDate: new Date(now.getFullYear(), now.getMonth() + 1, 4), days: 3, reason: "Cuti tahunan tersisa", status: "PENDING" },
      ],
    });

    await db.employeeReimbursement.createMany({
      data: [
        { number: "RMB-001", employeeId: emp2.id, date: new Date(now.getFullYear(), now.getMonth() - 1, 18), category: "TRANSPORT", description: "Taksi dinas ke klien", amount: 350000, accountCode: "5-1700", bankAccountId: kas.id, status: "PAID" },
        { number: "RMB-002", employeeId: emp3.id, date: new Date(now.getFullYear(), now.getMonth(), 3), category: "ATK", description: "Pembelian pulpen & map untuk rapat", amount: 125000, accountCode: "5-1700", bankAccountId: kas.id, status: "APPROVED" },
        { number: "RMB-003", employeeId: emp1.id, date: new Date(now.getFullYear(), now.getMonth(), 6), category: "KESEHATAN", description: "Obat & biaya pemeriksaan", amount: 500000, accountCode: "5-1700", status: "PENDING" },
      ],
    });

    // Reimburse RMB-001 yang PAID → auto-post jurnal
    const rb1 = await db.employeeReimbursement.findUnique({ where: { number: "RMB-001" } });
    if (rb1 && !rb1.journalEntryId) {
      const accExp = codeMap.get("5-1700");
      const accCash = codeMap.get("1-1100");
      if (accExp && accCash) {
        const jeCount = await db.journalEntry.count();
        const entryNumber = `JE-${String(jeCount + 1).padStart(4, "0")}`;
        const entry = await db.journalEntry.create({
          data: {
            entryNumber,
            date: rb1.date,
            description: `Reimburse RMB-001 - Taksi dinas ke klien`,
            reference: "RMB-001",
            source: "REIMBURSEMENT",
            lines: {
              create: [
                { accountId: accExp, debit: rb1.amount, credit: 0, description: "Reimburse RMB-001" },
                { accountId: accCash, debit: 0, credit: rb1.amount, description: "Bayar reimburse RMB-001" },
              ],
            },
          },
        });
        await db.employeeReimbursement.update({ where: { id: rb1.id }, data: { journalEntryId: entry.id } });
      }
    }

    // Loans (hutang/kasbon karyawan) + satu cicilan
    await db.employeeLoan.createMany({
      data: [
        { number: "LN-001", employeeId: emp2.id, date: new Date(now.getFullYear(), now.getMonth() - 1, 2), amount: 5000000, paidAmount: 1000000, installmentAmount: 1000000, accountCode: "1-1300", bankAccountId: kas.id, description: "Kasbon perbaikan rumah", status: "ACTIVE" },
        { number: "LN-002", employeeId: emp3.id, date: new Date(now.getFullYear(), now.getMonth(), 1), amount: 3000000, paidAmount: 0, installmentAmount: 500000, accountCode: "1-1300", bankAccountId: bca.id, description: "Pinjaman pendidikan anak", status: "ACTIVE" },
      ],
    });

    const accountCount = await db.account.count();
    const entryCount = await db.journalEntry.count();
    const contactCount = await db.contact.count();
    const invoiceCount = await db.invoice.count();
    const bankCount = await db.bankAccount.count();
    const employeeCount = await db.employee.count();
    const itemCount = await db.inventoryItem.count();
    const receiptCount = await db.receipt.count();
    const paymentCount = await db.payment.count();
    const fixedAssetCount = await db.fixedAsset.count();
    const leaveCount = await db.employeeLeave.count();
    const reimburseCount = await db.employeeReimbursement.count();
    const loanCount = await db.employeeLoan.count();

    return NextResponse.json({
      message: "Seed berhasil",
      adminEmail: adminUser.email,
      adminPassword: generated ? password : undefined,
      generated,
      counts: { accounts: accountCount, entries: entryCount, contacts: contactCount, invoices: invoiceCount, bankAccounts: bankCount, employees: employeeCount, inventoryItems: itemCount, receipts: receiptCount, payments: paymentCount, fixedAssets: fixedAssetCount, leaves: leaveCount, reimbursements: reimburseCount, loans: loanCount },
    });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal melakukan seed" },
      { status: 500 }
    );
  }
}

// DELETE /api/seed - hapus semua data transaksi (reset)
// Pertahankan: user, companySettings, userPreferences, chart of accounts
// HANYA admin yang boleh menghapus data.
export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    await db.fixedAssetDepreciation.deleteMany();
    await db.fixedAsset.deleteMany();
    await db.transfer.deleteMany();
    await db.receipt.deleteMany();
    await db.payment.deleteMany();
    await db.inventoryMovement.deleteMany();
    await db.inventoryItem.deleteMany();
    await db.payrollEntry.deleteMany();
    await db.employeeLoan.deleteMany();
    await db.employeeReimbursement.deleteMany();
    await db.employeeLeave.deleteMany();
    await db.employee.deleteMany();
    await db.bankAccount.deleteMany();
    await db.invoiceLine.deleteMany();
    await db.invoice.deleteMany();
    await db.journalLine.deleteMany();
    await db.journalEntry.deleteMany();
    await db.contact.deleteMany();
    return NextResponse.json({ message: "Semua data transaksi dihapus" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menghapus data" },
      { status: 500 }
    );
  }
}

// GET /api/seed - status apakah sudah ada data
export async function GET() {
  const account = await db.account.findFirst({ select: { id: true } });
  return NextResponse.json({ seeded: !!account });
}
