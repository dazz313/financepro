"use client";

import * as React from "react";
import { Bot, X, Send, Sparkles, Loader2, MessageCircle, AlertCircle, Zap, Copy, Check, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { authFetch } from "@/components/auth-provider";
import Markdown from "react-markdown";
import { VIEW_SUGGESTIONS } from "@/lib/assistant-suggestions";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const STORAGE_KEY = "financepro_ai_messages";
const MAX_STORED = 20;

const ACTION_VIEW_MAP: Record<string, { view: string; label: string }> = {
  "faktur pembelian": { view: "invoices", label: "Buka Faktur" },
  "salin ke": { view: "invoices", label: "Buka Faktur" },
  "menu faktur": { view: "invoices", label: "Buka Faktur" },
  "menu pegawai": { view: "employees", label: "Buka Pegawai" },
  "jalankan payroll": { view: "employees", label: "Buka Pegawai" },
  "menu penerimaan": { view: "receipts", label: "Buka Penerimaan" },
  "catat penerimaan": { view: "receipts", label: "Buka Penerimaan" },
  "menu pembayaran": { view: "payments", label: "Buka Pembayaran" },
  "menu dashboard": { view: "dashboard", label: "Buka Dashboard" },
  "menu laporan": { view: "reports", label: "Buka Laporan" },
  "menu pengaturan": { view: "settings", label: "Buka Pengaturan" },
  "menu persediaan": { view: "inventory", label: "Buka Persediaan" },
  "menu kas": { view: "bank-accounts", label: "Buka Kas & Bank" },
};

function findViewLink(text: string): { view: string; label: string } | null {
  const lower = text.toLowerCase();
  for (const [keyword, info] of Object.entries(ACTION_VIEW_MAP)) {
    if (lower.includes(keyword)) return info;
  }
  return null;
}

function loadMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMessages(msgs: Message[]) {
  if (typeof window === "undefined") return;
  try {
    const toStore = msgs.slice(-MAX_STORED * 2);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {}
}

export function AIAssistant({ currentView }: { currentView?: string }) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>(loadMessages);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [actionCount, setActionCount] = React.useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [suggestions, setSuggestions] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open || actionCount !== null) return;
    authFetch("/api/assistant/status").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setActionCount(d.count ?? 0);
    }).catch(() => {});
  }, [open, actionCount]);

  React.useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  React.useEffect(() => {
    if (!currentView) return;
    setSuggestions(VIEW_SUGGESTIONS[currentView] ?? [
      "Bagaimana cara kerja modul ini?",
      "Apa tips untuk modul ini?",
    ]);
  }, [currentView, open]);

  const sendMessage = React.useCallback(async (text: string, mode?: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const newMsgs = mode ? [userMsg] : [...messages, userMsg];
    setMessages(mode ? [userMsg] : newMsgs);
    setInput("");
    setLoading(true);

    try {
      const res = await authFetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: mode ? [userMsg] : newMsgs,
          mode,
          view: currentView,
        }),
        signal: abortRef.current?.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Gagal");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let aiContent = "";
      let buffer = "";

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.content ?? parsed.choices?.[0]?.delta?.content ?? "";
            if (chunk) {
              aiContent += chunk;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: aiContent };
                return updated;
              });
            }
            if (Array.isArray(parsed.actionItems)) {
              setActionCount(parsed.actionItems.length);
            }
          } catch {}
        }
      }

      if (!aiContent) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "Maaf, tidak ada respons dari AI. Silakan coba lagi." };
          return updated;
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Maaf, terjadi kesalahan. (${err instanceof Error ? err.message : ""})`,
      }]);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [messages, loading, currentView]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleClearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleNavigate = (view: string) => {
    window.location.search = `?view=${view}`;
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-110 hover:shadow-xl"
          aria-label="Buka Asisten AI"
        >
          <Bot className="h-7 w-7" />
          {actionCount !== null && actionCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-[11px] font-bold text-white ring-2 ring-background">
              {actionCount}
            </span>
          ) : (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
              <Sparkles className="h-3 w-3" />
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-0 right-0 z-50 flex h-[100dvh] w-full flex-col border-l bg-card shadow-2xl sm:bottom-6 sm:right-6 sm:h-[620px] sm:w-[440px] sm:rounded-2xl sm:border">
          <div className="flex items-center justify-between border-b bg-primary px-4 py-3 text-primary-foreground sm:rounded-t-2xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-foreground/15">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">Asisten AI FinancePro</p>
                <p className="text-[10px] text-primary-foreground/70">Data-aware · Streaming · Markdown</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-primary-foreground hover:bg-primary-foreground/15" onClick={handleClearChat}>
                  Hapus
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">Halo! Saya Asisten AI Anda</p>
                  <p className="text-[11px] text-muted-foreground max-w-[280px]">
                    Saya menganalisis data real aplikasi Anda dan memberikan saran tindakan.
                  </p>
                </div>
                <button
                  onClick={() => sendMessage("Analisis menyeluruh", "analyze")}
                  disabled={loading}
                  className="flex w-full max-w-[300px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
                >
                  <Zap className="h-4 w-4" />
                  {actionCount !== null && actionCount > 0
                    ? `Analisis Cepat (${actionCount} item)`
                    : "Analisis Cepat"}
                </button>
                {actionCount !== null && actionCount > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600">
                    <AlertCircle className="h-3 w-3" />
                    {actionCount} item butuh perhatian
                  </div>
                )}
                {suggestions.length > 0 && (
                  <div className="w-full max-w-[300px] pt-1">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {currentView ? `Tentang ${currentView}` : "Coba tanya"}
                    </p>
                    <div className="flex flex-col gap-1">
                      {suggestions.map(s => (
                        <button key={s} onClick={() => sendMessage(s)}
                          className="rounded-lg border bg-background px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted hover:border-primary/30">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                const viewLink = m.role === "assistant" ? findViewLink(m.content) : null;
                const showSuggestions = m.role === "assistant" && isLast && !loading && messages.length > 1;

                return (
                  <div key={i} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      m.role === "assistant" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {m.role === "assistant" ? <Bot className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                    </div>
                    <div className={cn(
                      "max-w-[82%] rounded-2xl px-3 py-2 text-sm",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    )}>
                      {m.role === "assistant" ? (
                        <div className="ai-markdown max-w-none">
                          <Markdown>{m.content || (loading && isLast ? "" : "...")}</Markdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      )}

                      {m.role === "assistant" && m.content && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopy(m.content, i)}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted-foreground/10"
                          >
                            {copiedIdx === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copiedIdx === i ? "Tersalin" : "Salin"}
                          </button>
                          {viewLink && (
                            <button
                              onClick={() => handleNavigate(viewLink.view)}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
                            >
                              {viewLink.label} <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {loading && (
              <div className="flex gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <div className="border-t p-3">
            <div className="mb-2 flex items-center gap-1 overflow-x-auto scrollbar-none">
              {messages.length > 0 && !loading && (
                <>
                  {[
                    "Apa item yang perlu ditindak?",
                    "Jelaskan neraca saldo",
                    "Tips improve profit",
                  ].map(s => (
                    <button key={s} onClick={() => sendMessage(s)}
                      className="shrink-0 rounded-full border bg-background px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      {s}
                    </button>
                  ))}
                </>
              )}
            </div>
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              {loading ? (
                <Button type="button" size="icon" onClick={handleStop}
                  className="h-9 w-9 shrink-0 bg-rose-500 hover:bg-rose-600">
                  <div className="h-3 w-3 rounded-sm bg-white" />
                </Button>
              ) : (
                <Input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  placeholder="Ketik pertanyaan..." disabled={loading} className="flex-1 text-sm" autoFocus />
              )}
              {!loading && (
                <Button type="submit" size="icon" disabled={!input.trim()}
                  className="h-9 w-9 shrink-0 bg-emerald-600 hover:bg-emerald-700">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
