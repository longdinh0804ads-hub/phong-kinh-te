"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Send, Sparkles, MessageSquare, X } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { MarkdownContent } from "./markdown-content";
import { ConversationSidebar, type ConversationSummary } from "./conversation-sidebar";
import { ConfirmationCard, type PendingAction } from "./confirmation-card";
import { getConversations, getConversationMessages } from "@/actions/conversation";

interface Source {
  documentId: string;
  documentTitle: string;
  article?: string | null;
  section?: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  pendingActions?: PendingAction[];
  isStreaming?: boolean;
}

export function ChatInterface({ userId, userName }: { userId: string; userName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  // Conversations state
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // AI status
  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((data) => setAiAvailable(!!data.available))
      .catch(() => setAiAvailable(false));
  }, []);

  // Load conversations on mount (and trigger 7-day cleanup server-side)
  useEffect(() => {
    getConversations().then((convs) => setConversations(convs as ConversationSummary[]));
  }, []);

  // Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Switch conversation: load messages from DB
  async function selectConversation(id: string | null) {
    setSidebarOpenMobile(false);
    if (id === activeConvId) return;
    setActiveConvId(id);

    if (!id) {
      // New chat
      setMessages([]);
      return;
    }

    setLoadingConv(true);
    setMessages([]);
    try {
      const conv = await getConversationMessages(id);
      if (conv?.messages) {
        const loaded: Message[] = [];
        for (const m of conv.messages) {
          loaded.push({
            id: m.id + "-q",
            role: "user",
            content: m.question,
          });
          const sourcesRaw = m.sources as any;
          const sourcesData = sourcesRaw?.refs || sourcesRaw || [];
          const pendingActions: PendingAction[] = Array.isArray(sourcesRaw?.pendingActions)
            ? sourcesRaw.pendingActions
            : [];
          loaded.push({
            id: m.id + "-a",
            role: "assistant",
            content: m.answer,
            sources: Array.isArray(sourcesData) ? sourcesData : [],
            pendingActions,
          });
        }
        setMessages(loaded);
      }
    } finally {
      setLoadingConv(false);
    }
  }

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    const aiMsgId = crypto.randomUUID();
    setMessages((m) => [...m, { id: aiMsgId, role: "assistant", content: "", isStreaming: true }]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMsg.content, conversationId: activeConvId }),
      });

      if (!res.ok || !res.body) throw new Error("AI không khả dụng");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let sources: Source[] = [];
      let pendingActions: PendingAction[] = [];
      let receivedConvId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data);
            if (obj.text) fullText += obj.text;
            if (obj.sources) sources = obj.sources;
            if (obj.conversationId) receivedConvId = obj.conversationId;
            if (obj.pendingAction) {
              pendingActions = [...pendingActions, obj.pendingAction];
            }
            setMessages((m) =>
              m.map((msg) =>
                msg.id === aiMsgId
                  ? { ...msg, content: fullText, sources, pendingActions }
                  : msg
              )
            );
          } catch {}
        }
      }

      setMessages((m) => m.map((msg) => (msg.id === aiMsgId ? { ...msg, isStreaming: false } : msg)));

      // Update conversation list (new conv hoặc updated time)
      if (receivedConvId && receivedConvId !== activeConvId) {
        setActiveConvId(receivedConvId);
      }
      const convs = await getConversations();
      setConversations(convs as ConversationSummary[]);
    } catch {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === aiMsgId
            ? {
                ...msg,
                content: "Xin lỗi, trợ lý hiện không khả dụng. Vui lòng thử lại sau.",
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  }

  const inputDisabled = loading || aiAvailable === false || loadingConv;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-12rem)]">
      {/* Sidebar - desktop */}
      <div className="hidden lg:block">
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={selectConversation}
          onListChange={setConversations}
        />
      </div>

      {/* Sidebar - mobile drawer */}
      {sidebarOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setSidebarOpenMobile(false)}>
          <div
            className="absolute left-0 top-0 bottom-0 w-[85%] max-w-sm bg-background p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="font-semibold">Lịch sử hội thoại</h3>
              <button onClick={() => setSidebarOpenMobile(false)} className="p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[calc(100vh-5rem)]">
              <ConversationSidebar
                conversations={conversations}
                activeId={activeConvId}
                onSelect={selectConversation}
                onListChange={setConversations}
              />
            </div>
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex flex-col min-h-0">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-2 mb-2">
          <Button variant="outline" size="sm" onClick={() => setSidebarOpenMobile(true)}>
            <MessageSquare className="h-4 w-4" />
            Lịch sử
          </Button>
        </div>

        {aiAvailable === false && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
            ⚠️ Trợ lý AI hiện chưa được kích hoạt. Vui lòng liên hệ Trưởng phòng.
          </div>
        )}

        <Card className="flex-1 mb-4 overflow-hidden">
          <CardContent className="h-full overflow-y-auto p-4 space-y-4">
            {loadingConv ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Đang tải hội thoại...
              </div>
            ) : messages.length === 0 ? (
              null
            ) : (
              messages.map((m) => (
                <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className={m.role === "user" ? "" : "bg-primary text-primary-foreground"}>
                      {m.role === "user" ? getInitials(userName) : <Sparkles className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "rounded-lg px-4 py-2 max-w-[80%]",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    {m.role === "assistant" ? (
                      <div className="text-sm">
                        {m.content && <MarkdownContent content={m.content} />}
                        {m.isStreaming && (
                          <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse align-middle" />
                        )}
                        {m.pendingActions && m.pendingActions.length > 0 && (
                          <div className="space-y-2 mt-2">
                            {m.pendingActions.map((action) => (
                              <ConfirmationCard
                                key={action.id}
                                action={action}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={scrollRef} />
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              aiAvailable === false ? "Trợ lý AI tạm thời không khả dụng" : "Nhập câu hỏi..."
            }
            rows={2}
            disabled={inputDisabled}
            className="flex-1"
          />
          <Button onClick={send} disabled={inputDisabled || !input.trim()} size="lg">
            {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

