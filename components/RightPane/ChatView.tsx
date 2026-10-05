"use client";

/**
 * Chat with the document.
 *
 * Sidebar: list of chats (most-recent first), "+ new" button. Main: open
 * thread with a tight ChatGPT-style input and tap-and-go shipping. We never
 * cap the visible history because chats are scoped per-doc and the codex
 * model receives a server-side excerpt.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Send, MessageSquare, RefreshCw } from "lucide-react";
import Markdown from "@/components/Markdown";
import type { ChatThread } from "@/lib/work-context-types";
import { consumePrefill } from "./prefill";

type Props = { docId: string };

export default function ChatView({ docId }: Props) {
  const [chats, setChats] = useState<ChatThread[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  // The last turn that failed to get a reply, scoped to its chat. The user
  // message is kept visible in the thread; this drives an inline "couldn't
  // reach Codex — Retry" row beneath it. Sending never auto-retries.
  const [failed, setFailed] = useState<{
    chatId: string;
    message: string;
    error: string;
  } | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Initial fetch + handle prefill from a "Chat about this concept" jump
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chat/${docId}`)
      .then((r) => r.json())
      .then(async (j: { chats: ChatThread[] }) => {
        if (cancelled) return;
        setChats(j.chats);
        // One-shot prefill from a knowledge-graph jump.
        const prefill = consumePrefill(docId, "chat");
        if (prefill) {
          // Create a fresh chat for this concept and seed the draft.
          const r = await fetch(`/api/chat/${docId}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "create", title: prefill }),
          });
          const { chat } = (await r.json()) as { chat: ChatThread };
          if (cancelled) return;
          setChats((prev) => [chat, ...(prev ?? j.chats)]);
          setActiveId(chat.id);
          setDraft(`Spiegami "${prefill}".`);
          return;
        }
        if (j.chats.length && !activeId) setActiveId(j.chats[0].id);
      })
      .catch(() => {
        if (!cancelled) setChats([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const active = useMemo(
    () => chats?.find((c) => c.id === activeId) ?? null,
    [chats, activeId],
  );

  // Auto-scroll to the bottom when messages change.
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [active?.messages.length, sending]);

  const createChat = useCallback(async () => {
    setCreating(true);
    try {
      const r = await fetch(`/api/chat/${docId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const j = (await r.json()) as { chat: ChatThread };
      setChats((prev) => [j.chat, ...(prev ?? [])]);
      setActiveId(j.chat.id);
    } finally {
      setCreating(false);
    }
  }, [docId]);

  const deleteChat = useCallback(
    async (id: string) => {
      await fetch(`/api/chat/${docId}?chatId=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setChats((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
      if (activeId === id) setActiveId(null);
    },
    [docId, activeId],
  );

  // Ship one turn to the server and fold the result back in. On success the
  // server returns the full chat (user message + reply, committed together),
  // so we replace local state with it — the optimistic user bubble is reconciled
  // with no duplicate. On failure we record `failed` (no auto-retry) so the
  // thread shows a manual Retry control. Used by both a fresh send and Retry.
  const deliver = useCallback(
    async (chatId: string, message: string) => {
      setSending(true);
      setFailed(null);
      try {
        const r = await fetch(`/api/chat/${docId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "send", chatId, message }),
        });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`reply failed (${r.status})${txt ? `: ${txt.slice(0, 120)}` : ""}`);
        }
        const j = (await r.json()) as { chat: ChatThread };
        setChats((prev) =>
          prev ? prev.map((c) => (c.id === chatId ? j.chat : c)) : prev,
        );
        // Tell the viewer a reply landed. It batches a single knowledge-graph
        // evaluation when the student leaves the Chat tab, instead of one per
        // message.
        window.dispatchEvent(
          new CustomEvent("getit:chat-sent", { detail: { docId } }),
        );
      } catch (e) {
        setFailed({ chatId, message, error: (e as Error).message });
      } finally {
        setSending(false);
      }
    },
    [docId],
  );

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || sending) return;
    let chatId = activeId;
    if (!chatId) {
      // Auto-create a chat on first send.
      const r = await fetch(`/api/chat/${docId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const j = (await r.json()) as { chat: ChatThread };
      chatId = j.chat.id;
      setChats((prev) => [j.chat, ...(prev ?? [])]);
      setActiveId(j.chat.id);
    }
    // Optimistic: append the user message immediately.
    const optimisticUser = {
      role: "user" as const,
      content: message,
      ts: Date.now(),
    };
    setChats((prev) =>
      prev
        ? prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: [...c.messages, optimisticUser], updatedAt: optimisticUser.ts }
              : c,
          )
        : prev,
    );
    setDraft("");
    await deliver(chatId, message);
  }, [activeId, docId, draft, sending, deliver]);

  // Re-send the last failed turn. Its user bubble is already in the thread, so
  // we just re-deliver — no second optimistic append, no duplicate.
  const retry = useCallback(() => {
    if (!failed || sending) return;
    void deliver(failed.chatId, failed.message);
  }, [failed, sending, deliver]);

  if (chats === null) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-[var(--ink-500)]">
        <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> loading chats…
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Chat list */}
      <aside className="flex w-44 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-canvas)]">
        <button
          type="button"
          onClick={createChat}
          disabled={creating}
          className="m-2 flex items-center justify-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-1.5 text-[12px] font-medium text-[var(--ink-900)] hover:bg-[var(--surface-sunken)] disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {chats.length === 0 ? (
            <p className="px-2 py-3 text-[11.5px] leading-relaxed text-[var(--ink-400)]">
              No conversations yet. Start one to ask anything about this document.
            </p>
          ) : (
            chats.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] ${
                  activeId === c.id
                    ? "bg-[var(--surface-raised)] text-[var(--ink-900)] shadow-[var(--shadow-nav)]"
                    : "text-[var(--ink-700)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className="min-w-0 flex-1 truncate text-left"
                  title={c.title}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => deleteChat(c.id)}
                  className="invisible h-5 w-5 shrink-0 rounded text-[var(--ink-400)] hover:bg-[var(--surface-sunken)] hover:text-rose-600 group-hover:visible"
                  title="Delete chat"
                >
                  <Trash2 className="m-auto h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Active thread */}
      <section className="flex min-w-0 flex-1 flex-col bg-[var(--surface-raised)]">
        {!active ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center">
            <div className="max-w-sm">
              <MessageSquare className="mx-auto mb-3 h-7 w-7 text-[var(--ink-400)]" />
              <p className="text-[13.5px] leading-relaxed text-[var(--ink-500)]">
                Ask anything about this document. Each conversation is saved and feeds the
                knowledge graph evaluator when you leave the Chat tab.
              </p>
            </div>
          </div>
        ) : (
          <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {active.messages.length === 0 && (
              <p className="text-center text-[12px] text-[var(--ink-400)]">
                Type your first question below.
              </p>
            )}
            {active.messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} />
            ))}
            {sending && (
              <Bubble role="assistant" content="…" pulsing />
            )}
            {failed && failed.chatId === active.id && !sending && (
              <div className="mb-3 flex flex-col items-start gap-1.5">
                <p className="text-[11.5px] leading-relaxed text-rose-700 dark:text-rose-300">
                  Couldn&apos;t get a reply — {failed.error}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[12px] font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-900"
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask a question about this document…"
              rows={2}
              className="min-h-[44px] flex-1 resize-none rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-md bg-[var(--button-primary-bg)] text-white hover:bg-[var(--button-primary-hover)] disabled:opacity-40"
              title="Send (Enter)"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Bubble({
  role,
  content,
  pulsing,
}: {
  role: "user" | "assistant";
  content: string;
  pulsing?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`mb-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
          isUser
            ? "bg-[var(--button-primary-bg)] text-white"
            : "bg-[var(--surface-sunken)] text-[var(--ink-900)]"
        } whitespace-pre-wrap ${pulsing ? "animate-pulse" : ""}`}
      >
        {pulsing ? (
          content
        ) : (
          <Markdown
            disallowedElements={["img"]}
            components={{
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="mb-1 list-disc pl-4 last:mb-0">{children}</ul>,
              ol: ({ children }) => <ol className="mb-1 list-decimal pl-4 last:mb-0">{children}</ol>,
              li: ({ children }) => <li className="mb-0.5 last:mb-0">{children}</li>,
              pre: ({ children }) => (
                <pre className="mb-2 mt-1 overflow-x-auto rounded-md bg-[var(--border-subtle)] p-3 last:mb-0">
                  {children}
                </pre>
              ),
              code: ({ className, children, node, ...props }) => {
                const text = String(children);
                const isInline = !className && !text.includes("\n");
                return isInline ? (
                  <code className="rounded bg-[var(--border-subtle)] px-1 py-0.5 text-[12px]" {...props}>
                    {children}
                  </code>
                ) : (
                  <code className={`${className ?? ""} text-[12px]`} {...props}>
                    {children}
                  </code>
                );
              },
              a: ({ children, href }) => {
                const safe = href && /^https?:\/\//i.test(href) ? href : undefined;
                return (
                  <a href={safe} className="underline underline-offset-2 hover:opacity-80" target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            }}
          >
            {content}
          </Markdown>
        )}
      </div>
    </div>
  );
}
