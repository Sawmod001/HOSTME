"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Loader2, Bot, AlertCircle, RefreshCw } from "lucide-react";

const WELCOME = "Hi! I'm HostMe AI. Ask me anything about finding venues, booking spaces, or using the platform.";
const HIDDEN_PATHS = ["/sign-in", "/sign-up", "/complete-profile", "/admin", "/admin/listings"];

export default function ChatBot() {
  const pathname = usePathname();
  const hidden = HIDDEN_PATHS.some((p) => pathname?.startsWith(p));
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const msgRef = useRef(messages);
  const inputValRef = useRef(input);
  const loadingRef = useRef(loading);
  useEffect(() => { msgRef.current = messages; }, [messages]);
  useEffect(() => { inputValRef.current = input; }, [input]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
      setTimeout(() => inputRef.current?.focus(), 350);
    } else {
      setVisible(false);
    }
  }, [open]);

  const handleSend = useCallback(async (overrideMsg) => {
    const msg = (overrideMsg || inputValRef.current).trim();
    if (!msg || loadingRef.current) return;
    setInput("");
    setLoading(true);
    const currentMessages = msgRef.current;
    setMessages((prev) => [...prev, { role: "user", content: msg }]);

    try {
      const history = currentMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No response");
      const reply = data.note ? `${data.reply}\n\n_${data.note}_` : data.reply;
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: e.message,
        meta: { error: true },
      }]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRetry = useCallback(() => {
    const msgs = msgRef.current;
    const lastMsg = [...msgs].reverse().find((m) => m.role === "user");
    if (lastMsg) handleSend(lastMsg.content);
  }, [handleSend]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (hidden) return null;

  return (
    <>
      <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
        <div className={`origin-bottom-right transition-all duration-300 ${
          open && visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}>
          <div className="mb-16 flex h-[480px] w-[360px] flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-2xl sm:h-[540px] sm:w-[400px] max-sm:w-[85vw]">
            <div className="flex items-center justify-between border-b bg-[var(--color-primary)] px-4 py-3 text-white">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                  <Bot size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">HostMe AI</p>
                  <p className="text-[11px] leading-tight opacity-80">Ask anything about the platform</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/20">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
              {messages.map((m, i) => {
                const isError = m.meta?.error;
                return (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
                    {m.role === "assistant" && (
                      <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
                        <Bot size={12} className="text-[var(--color-primary)]" />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-[var(--color-primary)] text-white"
                        : isError
                          ? "border border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]"
                          : "bg-[var(--color-surface-alt)] text-[var(--color-ink)]"
                    }`}>
                      {m.content}
                      {isError && i === messages.length - 1 && (
                        <button onClick={handleRetry} className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[#991B1B] hover:underline">
                          <RefreshCw size={12} /> Retry
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {loading && (
                <div className="flex justify-start animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
                    <Bot size={12} className="text-[var(--color-primary)]" />
                  </div>
                  <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--color-surface-alt)] px-4 py-3">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-ink-muted)]" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-ink-muted)]" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-ink-muted)]" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t bg-white p-3">
              <div className="flex items-end gap-2">
                <div className="relative flex-1">
                  <input ref={inputRef} value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={2000}
                    placeholder="Ask about HostMe..."
                    disabled={loading}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3.5 py-2.5 pr-10 text-sm outline-none transition-colors focus:border-[var(--color-primary)] disabled:opacity-50" />
                  {input.length > 0 && (
                    <span className="absolute bottom-2.5 right-3 text-[10px] text-[var(--color-ink-muted)]">{input.length}/2000</span>
                  )}
                </div>
                <button onClick={() => handleSend()} disabled={loading || !input.trim()}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white transition-opacity hover:opacity-90 disabled:opacity-40">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => setOpen(!open)}
        className={`fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 ${
          open ? "bg-[#B91C1C] rotate-90" : "bg-[var(--color-primary)]"
        } text-white`}>
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  );
}
