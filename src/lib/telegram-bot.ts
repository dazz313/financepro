const TELEGRAM_API = "https://api.telegram.org/bot";

export type TelegramMessage = {
  message_id: number;
  chat: { id: number; first_name?: string; username?: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  date: number;
};

export type TelegramCallbackQuery = {
  id: string;
  message?: { message_id: number; chat: { id: number }; text?: string };
  from: { id: number; first_name?: string; username?: string };
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

// Conversation state per chat
export type ConversationStep =
  | "idle"
  | "receipt_select_bank"
  | "receipt_input_amount"
  | "receipt_input_date"
  | "receipt_input_description"
  | "receipt_input_reference"
  | "receipt_confirm"
  | "payment_select_bank"
  | "payment_input_amount"
  | "payment_input_date"
  | "payment_input_description"
  | "payment_input_reference"
  | "payment_confirm";

export type ConversationState = {
  step: ConversationStep;
  type?: "receipt" | "payment";
  bankAccountId?: string;
  bankAccountName?: string;
  amount?: number;
  date?: string;
  description?: string;
  reference?: string;
};

// In-memory conversation store (keyed by chat ID)
const conversations = new Map<number, ConversationState>();

export function getConversation(chatId: number): ConversationState {
  return conversations.get(chatId) || { step: "idle" };
}

export function setConversation(chatId: number, state: ConversationState) {
  conversations.set(chatId, state);
}

export function clearConversation(chatId: number) {
  conversations.delete(chatId);
}

// Telegram API helpers
async function tg(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  reply_markup?: Record<string, unknown>
) {
  return tg(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(reply_markup ? { reply_markup } : {}),
  });
}

export async function editMessage(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  reply_markup?: Record<string, unknown>
) {
  return tg(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...(reply_markup ? { reply_markup } : {}),
  });
}

export async function answerCallback(token: string, callbackQueryId: string, text?: string) {
  return tg(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text || "",
  });
}

export function inlineKeyboard(rows: { text: string; callback_data: string }[][]) {
  return { inline_keyboard: rows };
}

// Fetch bank accounts from our API (server-side)
export async function fetchBankAccounts() {
  const { db } = await import("@/lib/db");
  const accounts = await db.bankAccount.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return accounts;
}

// Fetch contacts from our API (server-side)
export async function fetchContacts(type?: string) {
  const { db } = await import("@/lib/db");
  const where = type && type !== "ALL" ? { type } : {};
  const contacts = await db.contact.findMany({
    where,
    orderBy: { code: "asc" },
  });
  return contacts;
}

// Create receipt via internal DB call
export async function createReceipt(data: {
  date: string;
  amount: number;
  bankAccountId: string;
  accountCode: string;
  fromContactId?: string;
  description?: string;
  reference?: string;
}) {
  const { db } = await import("@/lib/db");

  const bank = await db.bankAccount.findUnique({ where: { id: data.bankAccountId } });
  if (!bank) throw new Error("Akun bank tidak ditemukan");

  const accounts = await db.account.findMany();
  const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
  const debitAcc = codeMap.get(bank.accountCode);
  const creditAcc = codeMap.get(data.accountCode);
  if (!debitAcc || !creditAcc) throw new Error("Akun tidak valid");

  const { nextCode } = await import("@/lib/code-gen");
  const number = await nextCode(db, "receipt", { date: data.date });
  const entryNumber = await nextCode(db, "journal", { date: data.date });

  const result = await db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        entryNumber,
        date: new Date(data.date),
        description: data.description || `Penerimaan ${number}`,
        reference: data.reference || number,
        source: "RECEIPT",
        lines: {
          create: [
            { accountId: debitAcc, debit: data.amount, credit: 0, description: `Penerimaan ke ${bank.name}` },
            { accountId: creditAcc, debit: 0, credit: data.amount, description: `Penerimaan ${number}` },
          ],
        },
      },
    });

    const receipt = await tx.receipt.create({
      data: {
        number,
        date: new Date(data.date),
        amount: data.amount,
        fromContactId: data.fromContactId || null,
        bankAccountId: data.bankAccountId,
        accountCode: data.accountCode,
        description: data.description || null,
        reference: data.reference || null,
        journalEntryId: entry.id,
        source: "RECEIPT",
      },
      include: {
        contact: { select: { id: true, code: true, name: true } },
        bankAccount: { select: { id: true, code: true, name: true } },
      },
    });

    return { receipt, entry };
  });

  return result;
}

// Create payment via internal DB call
export async function createPayment(data: {
  date: string;
  amount: number;
  bankAccountId: string;
  accountCode: string;
  toContactId?: string;
  description?: string;
  reference?: string;
}) {
  const { db } = await import("@/lib/db");

  const bank = await db.bankAccount.findUnique({ where: { id: data.bankAccountId } });
  if (!bank) throw new Error("Akun bank tidak ditemukan");

  const accounts = await db.account.findMany();
  const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
  const creditAcc = codeMap.get(bank.accountCode);
  const debitAcc = codeMap.get(data.accountCode);
  if (!debitAcc || !creditAcc) throw new Error("Akun tidak valid");

  const { nextCode } = await import("@/lib/code-gen");
  const number = await nextCode(db, "payment", { date: data.date });
  const entryNumber = await nextCode(db, "journal", { date: data.date });

  const result = await db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        entryNumber,
        date: new Date(data.date),
        description: data.description || `Pembayaran ${number}`,
        reference: data.reference || number,
        source: "PAYMENT",
        lines: {
          create: [
            { accountId: debitAcc, debit: data.amount, credit: 0, description: `Pembayaran ${number}` },
            { accountId: creditAcc, debit: 0, credit: data.amount, description: `Pembayaran dari ${bank.name}` },
          ],
        },
      },
    });

    const payment = await tx.payment.create({
      data: {
        number,
        date: new Date(data.date),
        amount: data.amount,
        toContactId: data.toContactId || null,
        bankAccountId: data.bankAccountId,
        accountCode: data.accountCode,
        description: data.description || null,
        reference: data.reference || null,
        journalEntryId: entry.id,
        source: "PAYMENT",
      },
      include: {
        contact: { select: { id: true, code: true, name: true } },
        bankAccount: { select: { id: true, code: true, name: true } },
      },
    });

    return { payment, entry };
  });

  return result;
}
