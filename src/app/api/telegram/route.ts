import { NextRequest, NextResponse } from "next/server";
import {
  type TelegramUpdate,
  type ConversationState,
  getConversation,
  setConversation,
  clearConversation,
  sendMessage,
  editMessage,
  answerCallback,
  inlineKeyboard,
  fetchBankAccounts,
  createReceipt,
  createPayment,
} from "@/lib/telegram-bot";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";

function fmt(amount: number) {
  return amount.toLocaleString("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/telegram - health check / set webhook
export async function GET(req: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN belum diset di .env" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "set-webhook") {
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const webhookUrl = `${protocol}://${host}/api/telegram`;

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: WEBHOOK_SECRET || undefined,
      }),
    });
    const data = await res.json();
    return NextResponse.json({ webhookUrl, result: data });
  }

  if (action === "get-info") {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const data = await res.json();
    return NextResponse.json(data);
  }

  return NextResponse.json({ status: "ok", message: "Telegram webhook endpoint aktif. Gunakan ?action=set-webhook untuk setup." });
}

// POST /api/telegram - handle Telegram updates
export async function POST(req: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "BOT_TOKEN not set" }, { status: 500 });
  }

  // Verify secret token (optional)
  const secretToken = req.headers.get("x-telegram-bot-api-secret-token");
  if (WEBHOOK_SECRET && secretToken !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const update: TelegramUpdate = await req.json();
  const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id;
  if (!chatId) return NextResponse.json({ ok: true });

  // Handle callback queries (inline keyboard buttons)
  if (update.callback_query) {
    await handleCallback(update);
    return NextResponse.json({ ok: true });
  }

  // Handle text messages
  if (update.message?.text) {
    await handleMessage(update.message.chat.id, update.message.text, update.message.chat.first_name);
  }

  return NextResponse.json({ ok: true });
}

async function handleCallback(update: TelegramUpdate) {
  const cq = update.callback_query!;
  const chatId = cq.message?.chat.id;
  const data = cq.data;
  const firstName = cq.from.first_name || "User";
  if (!chatId || !data) return;

  await answerCallback(BOT_TOKEN, cq.id);
  const state = getConversation(chatId);

  // Main menu buttons
  if (data === "menu") {
    clearConversation(chatId);
    await sendMainMenu(chatId, firstName);
    return;
  }

  // Start receipt flow
  if (data === "start_receipt") {
    const banks = await fetchBankAccounts();
    if (banks.length === 0) {
      await sendMessage(BOT_TOKEN, chatId, "Tidak ada akun bank yang tersedia. Silakan tambah akun bank di aplikasi.");
      return;
    }
    const buttons = banks.map((b) => [{ text: `${b.name}`, callback_data: `rcv_bank:${b.id}:${b.name}` }]);
    buttons.push([{ text: "Batal", callback_data: "menu" }]);
    setConversation(chatId, { step: "receipt_select_bank", type: "receipt" });
    await sendMessage(BOT_TOKEN, chatId, "Pilih akun bank penerima:", inlineKeyboard(buttons));
    return;
  }

  // Start payment flow
  if (data === "start_payment") {
    const banks = await fetchBankAccounts();
    if (banks.length === 0) {
      await sendMessage(BOT_TOKEN, chatId, "Tidak ada akun bank yang tersedia. Silakan tambah akun bank di aplikasi.");
      return;
    }
    const buttons = banks.map((b) => [{ text: `${b.name}`, callback_data: `pmt_bank:${b.id}:${b.name}` }]);
    buttons.push([{ text: "Batal", callback_data: "menu" }]);
    setConversation(chatId, { step: "payment_select_bank", type: "payment" });
    await sendMessage(BOT_TOKEN, chatId, "Pilih akun bank pengirim:", inlineKeyboard(buttons));
    return;
  }

  // Receipt: bank selected
  if (data.startsWith("rcv_bank:")) {
    const [, bankId, ...nameParts] = data.split(":");
    const bankName = nameParts.join(":");
    state.bankAccountId = bankId;
    state.bankAccountName = bankName;
    state.step = "receipt_input_amount";
    setConversation(chatId, state);
    await sendMessage(BOT_TOKEN, chatId,
      `Bank: <b>${bankName}</b>\n\nMasukkan jumlah penerimaan (contoh: 5000000):`,
    );
    return;
  }

  // Payment: bank selected
  if (data.startsWith("pmt_bank:")) {
    const [, bankId, ...nameParts] = data.split(":");
    const bankName = nameParts.join(":");
    state.bankAccountId = bankId;
    state.bankAccountName = bankName;
    state.step = "payment_input_amount";
    setConversation(chatId, state);
    await sendMessage(BOT_TOKEN, chatId,
      `Bank: <b>${bankName}</b>\n\nMasukkan jumlah pembayaran (contoh: 5000000):`,
    );
    return;
  }

  // Receipt: confirm
  if (data === "rcv_confirm_yes" && state.step === "receipt_confirm") {
    try {
      const result = await createReceipt({
        date: state.date || today(),
        amount: state.amount!,
        bankAccountId: state.bankAccountId!,
        accountCode: "1-1300", // Piutang default
        description: state.description,
        reference: state.reference,
      });
      clearConversation(chatId);
      await sendMessage(BOT_TOKEN, chatId,
        `Penerimaan berhasil dicatat!\n\n` +
        `No: <b>${result.receipt.number}</b>\n` +
        `Tanggal: ${state.date || today()}\n` +
        `Jumlah: <b>${fmt(state.amount!)}</b>\n` +
        `Bank: ${result.receipt.bankAccount.name}\n` +
        `Jurnal: ${result.entry.entryNumber}`,
        inlineKeyboard([[{ text: "Menu Utama", callback_data: "menu" }]])
      );
    } catch (err) {
      clearConversation(chatId);
      await sendMessage(BOT_TOKEN, chatId,
        `Gagal mencatat penerimaan: ${err instanceof Error ? err.message : "Error"}`,
        inlineKeyboard([[{ text: "Menu Utama", callback_data: "menu" }]])
      );
    }
    return;
  }

  // Payment: confirm
  if (data === "pmt_confirm_yes" && state.step === "payment_confirm") {
    try {
      const result = await createPayment({
        date: state.date || today(),
        amount: state.amount!,
        bankAccountId: state.bankAccountId!,
        accountCode: "5-1200", // Beban operasional default
        description: state.description,
        reference: state.reference,
      });
      clearConversation(chatId);
      await sendMessage(BOT_TOKEN, chatId,
        `Pembayaran berhasil dicatat!\n\n` +
        `No: <b>${result.payment.number}</b>\n` +
        `Tanggal: ${state.date || today()}\n` +
        `Jumlah: <b>${fmt(state.amount!)}</b>\n` +
        `Bank: ${result.payment.bankAccount.name}\n` +
        `Jurnal: ${result.entry.entryNumber}`,
        inlineKeyboard([[{ text: "Menu Utama", callback_data: "menu" }]])
      );
    } catch (err) {
      clearConversation(chatId);
      await sendMessage(BOT_TOKEN, chatId,
        `Gagal mencatat pembayaran: ${err instanceof Error ? err.message : "Error"}`,
        inlineKeyboard([[{ text: "Menu Utama", callback_data: "menu" }]])
      );
    }
    return;
  }

  // Cancel
  if (data === "rcv_confirm_no" || data === "pmt_confirm_no") {
    clearConversation(chatId);
    await sendMainMenu(chatId, firstName);
    return;
  }
}

async function handleMessage(chatId: number, text: string, firstName?: string) {
  const state = getConversation(chatId);
  const trimmed = text.trim();

  // Commands
  if (trimmed === "/start" || trimmed === "/menu" || trimmed === "/bantuan") {
    clearConversation(chatId);
    await sendMainMenu(chatId, firstName || "User");
    return;
  }

  if (trimmed === "/receipt" || trimmed === "/penerimaan") {
    // Trigger receipt start
    const banks = await fetchBankAccounts();
    if (banks.length === 0) {
      await sendMessage(BOT_TOKEN, chatId, "Tidak ada akun bank yang tersedia.");
      return;
    }
    const buttons = banks.map((b) => [{ text: `${b.name}`, callback_data: `rcv_bank:${b.id}:${b.name}` }]);
    buttons.push([{ text: "Batal", callback_data: "menu" }]);
    setConversation(chatId, { step: "receipt_select_bank", type: "receipt" });
    await sendMessage(BOT_TOKEN, chatId, "Pilih akun bank penerima:", inlineKeyboard(buttons));
    return;
  }

  if (trimmed === "/payment" || trimmed === "/pembayaran") {
    const banks = await fetchBankAccounts();
    if (banks.length === 0) {
      await sendMessage(BOT_TOKEN, chatId, "Tidak ada akun bank yang tersedia.");
      return;
    }
    const buttons = banks.map((b) => [{ text: `${b.name}`, callback_data: `pmt_bank:${b.id}:${b.name}` }]);
    buttons.push([{ text: "Batal", callback_data: "menu" }]);
    setConversation(chatId, { step: "payment_select_bank", type: "payment" });
    await sendMessage(BOT_TOKEN, chatId, "Pilih akun bank pengirim:", inlineKeyboard(buttons));
    return;
  }

  if (trimmed === "/cancel") {
    clearConversation(chatId);
    await sendMessage(BOT_TOKEN, chatId, "Dibatalkan.");
    await sendMainMenu(chatId, firstName || "User");
    return;
  }

  // Handle conversation steps
  if (state.step === "receipt_input_amount") {
    const amount = parseAmount(trimmed);
    if (!amount || amount <= 0) {
      await sendMessage(BOT_TOKEN, chatId, "Jumlah tidak valid. Masukkan angka (contoh: 5000000):");
      return;
    }
    state.amount = amount;
    state.date = today();
    state.step = "receipt_input_date";
    setConversation(chatId, state);
    await sendMessage(BOT_TOKEN, chatId,
      `Jumlah: <b>${fmt(amount)}</b>\n\nMasukkan tanggal (YYYY-MM-DD) atau ketik <b>hari ini</b>:`,
    );
    return;
  }

  if (state.step === "receipt_input_date") {
    let dateStr = trimmed;
    if (trimmed.toLowerCase() === "hari ini" || trimmed.toLowerCase() === "today") {
      dateStr = today();
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      await sendMessage(BOT_TOKEN, chatId, "Format tanggal salah. Gunakan YYYY-MM-DD (contoh: 2026-09-11) atau ketik 'hari ini':");
      return;
    }
    state.date = dateStr;
    state.step = "receipt_input_description";
    setConversation(chatId, state);
    await sendMessage(BOT_TOKEN, chatId,
      `Tanggal: <b>${dateStr}</b>\n\nMasukkan keterangan (atau ketik <b>-</b> untuk skip):`,
    );
    return;
  }

  if (state.step === "receipt_input_description") {
    state.description = trimmed === "-" ? undefined : trimmed;
    state.step = "receipt_input_reference";
    setConversation(chatId, state);
    await sendMessage(BOT_TOKEN, chatId,
      `Keterangan: ${state.description || "(tidak ada)"}\n\nMasukkan referensi/no.bukti (atau ketik <b>-</b> untuk skip):`,
    );
    return;
  }

  if (state.step === "receipt_input_reference") {
    state.reference = trimmed === "-" ? undefined : trimmed;
    state.step = "receipt_confirm";
    setConversation(chatId, state);
    await sendMessage(BOT_TOKEN, chatId,
      `Konfirmasi penerimaan:\n\n` +
      `Bank: <b>${state.bankAccountName}</b>\n` +
      `Tanggal: ${state.date}\n` +
      `Jumlah: <b>${fmt(state.amount!)}</b>\n` +
      `Keterangan: ${state.description || "-"}\n` +
      `Referensi: ${state.reference || "-"}\n\n` +
      `Simpan?`,
      inlineKeyboard([
        [{ text: "Ya, Simpan", callback_data: "rcv_confirm_yes" }, { text: "Batal", callback_data: "rcv_confirm_no" }],
      ])
    );
    return;
  }

  if (state.step === "payment_input_amount") {
    const amount = parseAmount(trimmed);
    if (!amount || amount <= 0) {
      await sendMessage(BOT_TOKEN, chatId, "Jumlah tidak valid. Masukkan angka (contoh: 5000000):");
      return;
    }
    state.amount = amount;
    state.date = today();
    state.step = "payment_input_date";
    setConversation(chatId, state);
    await sendMessage(BOT_TOKEN, chatId,
      `Jumlah: <b>${fmt(amount)}</b>\n\nMasukkan tanggal (YYYY-MM-DD) atau ketik <b>hari ini</b>:`,
    );
    return;
  }

  if (state.step === "payment_input_date") {
    let dateStr = trimmed;
    if (trimmed.toLowerCase() === "hari ini" || trimmed.toLowerCase() === "today") {
      dateStr = today();
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      await sendMessage(BOT_TOKEN, chatId, "Format tanggal salah. Gunakan YYYY-MM-DD (contoh: 2026-09-11) atau ketik 'hari ini':");
      return;
    }
    state.date = dateStr;
    state.step = "payment_input_description";
    setConversation(chatId, state);
    await sendMessage(BOT_TOKEN, chatId,
      `Tanggal: <b>${dateStr}</b>\n\nMasukkan keterangan (atau ketik <b>-</b> untuk skip):`,
    );
    return;
  }

  if (state.step === "payment_input_description") {
    state.description = trimmed === "-" ? undefined : trimmed;
    state.step = "payment_input_reference";
    setConversation(chatId, state);
    await sendMessage(BOT_TOKEN, chatId,
      `Keterangan: ${state.description || "(tidak ada)"}\n\nMasukkan referensi/no.bukti (atau ketik <b>-</b> untuk skip):`,
    );
    return;
  }

  if (state.step === "payment_input_reference") {
    state.reference = trimmed === "-" ? undefined : trimmed;
    state.step = "payment_confirm";
    setConversation(chatId, state);
    await sendMessage(BOT_TOKEN, chatId,
      `Konfirmasi pembayaran:\n\n` +
      `Bank: <b>${state.bankAccountName}</b>\n` +
      `Tanggal: ${state.date}\n` +
      `Jumlah: <b>${fmt(state.amount!)}</b>\n` +
      `Keterangan: ${state.description || "-"}\n` +
      `Referensi: ${state.reference || "-"}\n\n` +
      `Simpan?`,
      inlineKeyboard([
        [{ text: "Ya, Simpan", callback_data: "pmt_confirm_yes" }, { text: "Batal", callback_data: "pmt_confirm_no" }],
      ])
    );
    return;
  }

  // If in idle state and unrecognized command
  if (state.step === "idle") {
    await sendMessage(BOT_TOKEN, chatId,
      `Perintah tidak dikenal. Ketik /menu untuk melihat pilihan.`,
    );
  }
}

async function sendMainMenu(chatId: number, firstName: string) {
  await sendMessage(BOT_TOKEN, chatId,
    `Halo, <b>${firstName}</b>! 👋\n\n` +
    `Selamat datang di <b>FinancePro Bot</b>\n` +
    `Kelola penerimaan & pembayaran langsung dari Telegram.\n\n` +
    `Pilih menu di bawah:`,
    inlineKeyboard([
      [{ text: "Penerimaan (Receipt)", callback_data: "start_receipt" }],
      [{ text: "Pembayaran (Payment)", callback_data: "start_payment" }],
    ])
  );
}

function parseAmount(text: string): number | null {
  // Remove currency symbols, dots, commas, spaces
  const cleaned = text.replace(/[Rp\s.,]/gi, "").trim();
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}
