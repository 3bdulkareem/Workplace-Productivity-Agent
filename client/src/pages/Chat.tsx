import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChatInterface } from "@/components/ChatInterface";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Plus, ArrowLeft, LogOut, Menu, X } from "lucide-react";

export default function Chat() {
  const [, setLocation] = useLocation();
  const { user, logout, loading: authLoading } = useAuth({ redirectOnUnauthenticated: true });
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: conversations, isLoading: conversationsLoading } = trpc.chat.getConversations.useQuery(undefined, {
    enabled: !!user,
  });

  const createConversationMutation = trpc.chat.createConversation.useMutation({
    onSuccess: (data) => {
      setSelectedConversationId(data.id);
      setIsCreating(false);
      setSidebarOpen(false);
    },
  });

  const handleCreateConversation = async () => {
    setIsCreating(true);
    try {
      await createConversationMutation.mutateAsync({});
    } catch (error) {
      console.error("Error creating conversation:", error);
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setLocation("/");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const handleSelectConversation = (id: number) => {
    setSelectedConversationId(id);
    setSidebarOpen(false);
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex bg-gray-50 flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">Productivity Agent</h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "block" : "hidden"
        } md:block md:w-64 bg-white border-r border-gray-200 flex flex-col absolute md:relative top-16 md:top-0 left-0 right-0 z-40 md:z-auto`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Conversations</h2>
            <Button
              onClick={() => setLocation("/")}
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-gray-700"
              title="Back to home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
          <Button
            onClick={handleCreateConversation}
            disabled={isCreating}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2">
          {conversationsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : conversations && conversations.length > 0 ? (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    selectedConversationId === conv.id
                      ? "bg-blue-100 text-blue-900"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <div className="truncate text-sm font-medium">
                    {conv.title || `Chat ${conv.id}`}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {new Date(conv.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs">Create one to get started</p>
            </div>
          )}
        </div>

        {/* User Info & Logout */}
        <div className="p-4 border-t border-gray-200">
          <Card className="p-3 mb-3 bg-gray-50">
            <div className="text-xs text-gray-600 mb-1">Logged in as</div>
            <div className="text-sm font-semibold text-gray-900 truncate">
              {user.name || user.email || "User"}
            </div>
          </Card>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            className="w-full flex items-center justify-center gap-2 text-gray-700 border-gray-300"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0 md:min-h-screen">
        {selectedConversationId ? (
          <ChatInterface conversationId={selectedConversationId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 p-4">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <p className="text-lg font-medium mb-2">No conversation selected</p>
              <p className="text-sm">Create a new chat or select one from the sidebar</p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
