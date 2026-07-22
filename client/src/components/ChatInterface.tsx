import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, CheckCircle, XCircle, Brain, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id?: number;
  role: "user" | "assistant" | "system";
  content: string;
  agentType?: string | null;
  createdAt?: Date;
}

interface PendingInterrupt {
  id: number;
  interruptMessage: string;
}

export function ChatInterface({ conversationId }: { conversationId: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [pendingInterrupt, setPendingInterrupt] = useState<PendingInterrupt | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const { data: dbMessages, isLoading: messagesLoading, error: messagesError } = trpc.chat.getMessages.useQuery({ conversationId });
  const { data: interrupt, isLoading: interruptLoading } = trpc.chat.getPendingInterrupt.useQuery({ conversationId });

  const sendMessageMutation = trpc.chat.sendMessage.useMutation();
  const addAssistantMutation = trpc.chat.addAssistantMessage.useMutation();
  const resolveInterruptMutation = trpc.chat.resolveInterrupt.useMutation({
    onSuccess: async () => {
      setPendingInterrupt(null);
      // Invalidate the pending interrupt query to refetch
      await utils.chat.getPendingInterrupt.invalidate({ conversationId });
    },
  });

  useEffect(() => {
    if (dbMessages) {
      setMessages(dbMessages);
    }
  }, [dbMessages]);

  useEffect(() => {
    if (interrupt) {
      setPendingInterrupt(interrupt);
    } else {
      setPendingInterrupt(null);
    }
  }, [interrupt]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput("");
    setLoading(true);
    setActiveAgent("processing");

    try {
      // Add user message
      await sendMessageMutation.mutateAsync({
        conversationId,
        content: userMessage,
      });

      setMessages(prev => [...prev, {
        role: "user",
        content: userMessage,
      }]);

      // Call the real LangGraph agent through tRPC
      setActiveAgent("processing");
      const result = await sendMessageMutation.mutateAsync({
        conversationId,
        content: userMessage,
      });

      // Set the active agent based on the result
      if (result.agentType) {
        setActiveAgent(result.agentType);
      }

      // Add the real assistant response
      await addAssistantMutation.mutateAsync({
        conversationId,
        content: result.response,
        agentType: result.agentType || "rag",
      });

      setMessages(prev => [...prev, {
        role: "assistant",
        content: result.response,
        agentType: result.agentType || "rag",
      }]);

      // Check if there's an interrupt
      if (result.interruptRequired && result.interruptMessage) {
        setPendingInterrupt({
          id: 0,
          interruptMessage: result.interruptMessage,
        });
      }

      setActiveAgent(null);
    } catch (error) {
      console.error("Error sending message:", error);
      setActiveAgent(null);
      setMessages(prev => [...prev, {
        role: "system",
        content: "Error sending message. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleInterruptResponse = async (approved: boolean) => {
    if (!pendingInterrupt) return;

    setResolveLoading(true);
    try {
      await resolveInterruptMutation.mutateAsync({
        conversationId,
        interruptId: pendingInterrupt.id,
        status: approved ? "approved" : "rejected",
      });
    } catch (error) {
      console.error("Error resolving interrupt:", error);
    } finally {
      setResolveLoading(false);
    }
  };

  const getAgentColor = (agent?: string | null) => {
    switch (agent) {
      case "rag":
        return "bg-blue-50 border-blue-200";
      case "summarizer":
        return "bg-purple-50 border-purple-200";
      case "web_search":
        return "bg-green-50 border-green-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const getAgentLabel = (agent?: string | null) => {
    switch (agent) {
      case "rag":
        return "📚 RAG Agent";
      case "summarizer":
        return "✂️ Summarizer";
      case "web_search":
        return "🔍 Web Search";
      default:
        return "Assistant";
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
              <p className="text-gray-500">Loading messages...</p>
            </div>
          </div>
        ) : messagesError ? (
          <div className="flex items-center justify-center h-full">
            <Card className="bg-red-50 border-red-200 p-4 max-w-md">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-900">Error loading messages</p>
                  <p className="text-sm text-red-700 mt-1">Please try refreshing the page</p>
                </div>
              </div>
            </Card>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Start a conversation with the AI Assistant</p>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-xs lg:max-w-md px-4 py-3 rounded-lg",
                  msg.role === "user"
                    ? "bg-blue-500 text-white rounded-br-none"
                    : msg.role === "system"
                    ? "bg-red-50 border border-red-200 text-red-900 rounded-bl-none"
                    : `border ${getAgentColor(msg.agentType)} rounded-bl-none`
                )}
              >
                {msg.role === "assistant" && msg.agentType && (
                  <div className="text-xs font-semibold text-gray-600 mb-1">
                    {getAgentLabel(msg.agentType)}
                  </div>
                )}
                <p className="text-sm">{msg.content}</p>
              </div>
            </div>
          ))
        )}

        {/* Pending Interrupt */}
        {pendingInterrupt && (
          <div className="flex justify-start">
            <Card className="bg-yellow-50 border-yellow-200 p-4 max-w-md">
              <p className="text-sm font-semibold text-yellow-900 mb-3">
                ⚠️ Approval Required
              </p>
              <p className="text-sm text-yellow-800 mb-4">
                {pendingInterrupt.interruptMessage}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleInterruptResponse(true)}
                  disabled={resolveLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {resolveLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-1" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleInterruptResponse(false)}
                  disabled={resolveLoading}
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  {resolveLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-1" />
                  )}
                  Reject
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Loading State */}
        {loading && activeAgent && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-4 py-3 rounded-lg rounded-bl-none flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-gray-600">
                {activeAgent === "processing" ? "Processing..." : getAgentLabel(activeAgent)}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4 bg-gray-50 rounded-b-lg">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !loading && handleSendMessage()}
            placeholder="Ask me anything..."
            disabled={loading || !!pendingInterrupt || interruptLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={loading || !input.trim() || !!pendingInterrupt || interruptLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
