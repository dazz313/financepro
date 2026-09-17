import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { buildAppDataContext, buildActionItems } from "@/lib/assistant-data";
import { getUserFromRequest } from "@/lib/auth";

const SYSTEM_PROMPT = `Anda adalah Asisten AI FinancePro — asisten keuangan cerdas untuk aplikasi akuntansi double-entry Indonesia.

Anda MENGUASAI: PSAK, double-entry (Aset=Kewajiban+Ekuitas), PPN 11%, PPh21, BPJS, alur dokumen Penawaran→Pesanan→Faktur.

PANDUAN JAWABAN:
1. Bahasa Indonesia, jelas & profesional
2. Format: gunakan **bold**, bullet list, numbered list untuk rapi
3. Gunakan data real dari [KONTEKS DATA] untuk jawaban spesifik
4. Angka: sebutkan angka real dari data (mis. "Kas Rp 185.500.000")
5. Jika tanya "apa yang perlu ditindak lanjuti", prioritaskan item [ITEM PERLU TINDAK LANJUT]
6. Untuk pertanyaan pakai app, beri langkah dengan menu spesifik
7. Ringkas (maks 200 kata) kecuali diminta detail
8. Jika user tanya tentang modul tertentu, sebutkan nama menu yang tepat di sidebar`;

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return Response.json({ error: "Tidak terautentikasi" }, { status: 401 });
    }

    const body = await req.json();
    const { messages, mode, view } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "Pesan tidak boleh kosong" }, { status: 400 });
    }

    const [appData, actionItems] = await Promise.all([
      buildAppDataContext(),
      buildActionItems(),
    ]);

    let contextInfo = appData;
    if (view && typeof view === "string") {
      contextInfo += `\n\n[HALAMAN USER SAAT INI] ${view.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`;
    }
    if (actionItems.length > 0) {
      contextInfo += "\n\n[ITEM PERLU TINDAK LANJUT]\n" + actionItems.join("\n");
    }

    let effectiveMessages = messages;
    if (mode === "analyze") {
      effectiveMessages = [
        { role: "user", content: "Lakukan analisis menyeluruh terhadap data keuangan saya. Apa yang perlu segera ditindak lanjuti? Berikan prioritas dan saran tindakan konkret." },
        ...messages,
      ];
    }

    const zai = await ZAI.create();

    const fullMessages = [
      { role: "assistant", content: SYSTEM_PROMPT + contextInfo },
      ...effectiveMessages.slice(-12),
    ];

    const completion = await zai.chat.completions.create({
      messages: fullMessages as any,
      stream: true,
      thinking: { type: "disabled" },
    });

    if (completion && typeof completion.getReader === "function") {
      const reader = completion.getReader();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
        async start(controller) {
          let buffer = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6).trim();
                  if (data === "[DONE]") {
                    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                    continue;
                  }
                }
                if (line.trim()) {
                  controller.enqueue(new TextEncoder().encode(line + "\n\n"));
                }
              }
            }
            if (buffer.trim()) {
              controller.enqueue(new TextEncoder().encode(buffer + "\n\n"));
            }
          } catch (e) {
            controller.error(e);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const response = completion.choices?.[0]?.message?.content ?? "";
    if (!response.trim()) {
      return Response.json({ error: "Respons AI kosong" }, { status: 500 });
    }

    const sseData = `data: ${JSON.stringify({ content: response })}\ndata: [DONE]\n\n`;
    return new Response(sseData, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Assistant error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Gagal menghubungi AI" },
      { status: 500 }
    );
  }
}
