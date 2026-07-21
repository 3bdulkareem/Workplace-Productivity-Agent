import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { inferProcedureInput } from "@trpc/server";

// Mock database module
vi.mock("./db", () => ({
  getOrCreateConversation: vi.fn(),
  getConversationsByUser: vi.fn(),
  getConversationMessages: vi.fn(),
  addMessage: vi.fn(),
  createInterrupt: vi.fn(),
  getPendingInterrupt: vi.fn(),
  resolveInterrupt: vi.fn(),
}));

// Mock context with authenticated user
const mockAuthContext = {
  user: {
    id: "user123",
    openId: "openid123",
    name: "Test User",
    email: "test@example.com",
    loginMethod: "oauth",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: {} as any,
  res: {} as any,
};

describe("Chat Router Procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createConversation", () => {
    it("should create a new conversation with generated threadId", async () => {
      const mockConversation = {
        id: 1,
        userId: "user123",
        threadId: "thread_abc123",
        title: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.getOrCreateConversation).mockResolvedValue(mockConversation);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.createConversation({});

      expect(result).toEqual(mockConversation);
      expect(db.getOrCreateConversation).toHaveBeenCalled();
    });

    it("should create conversation with provided threadId", async () => {
      const mockConversation = {
        id: 1,
        userId: "user123",
        threadId: "custom_thread_123",
        title: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.getOrCreateConversation).mockResolvedValue(mockConversation);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.createConversation({ threadId: "custom_thread_123" });

      expect(result.threadId).toBe("custom_thread_123");
    });
  });

  describe("getConversations", () => {
    it("should return all conversations for authenticated user", async () => {
      const mockConversations = [
        {
          id: 1,
          userId: "user123",
          threadId: "thread_1",
          title: "Chat 1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          userId: "user123",
          threadId: "thread_2",
          title: "Chat 2",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(db.getConversationsByUser).mockResolvedValue(mockConversations);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.getConversations();

      expect(result).toHaveLength(2);
      expect(db.getConversationsByUser).toHaveBeenCalledWith("user123");
    });

    it("should return empty array if no conversations exist", async () => {
      vi.mocked(db.getConversationsByUser).mockResolvedValue([]);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.getConversations();

      expect(result).toEqual([]);
    });
  });

  describe("getMessages", () => {
    it("should return messages for a conversation", async () => {
      const mockMessages = [
        {
          id: 1,
          conversationId: 1,
          role: "user" as const,
          content: "Hello",
          agentType: null,
          interruptRequired: false,
          createdAt: new Date(),
        },
        {
          id: 2,
          conversationId: 1,
          role: "assistant" as const,
          content: "Hi there!",
          agentType: "rag",
          interruptRequired: false,
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.getConversationMessages).mockResolvedValue(mockMessages);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.getMessages({ conversationId: 1 });

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("user");
      expect(result[1].agentType).toBe("rag");
      expect(db.getConversationMessages).toHaveBeenCalledWith(1);
    });
  });

  describe("sendMessage", () => {
    it("should add a user message to conversation", async () => {
      vi.mocked(db.addMessage).mockResolvedValue(undefined);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.sendMessage({
        conversationId: 1,
        content: "Test message",
      });

      expect(result).toEqual({ success: true });
      expect(db.addMessage).toHaveBeenCalledWith(1, "user", "Test message");
    });

    it("should reject empty messages", async () => {
      const caller = appRouter.createCaller({ ...mockAuthContext });

      try {
        await caller.chat.sendMessage({
          conversationId: 1,
          content: "",
        });
        expect.fail("Should have thrown validation error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("addAssistantMessage", () => {
    it("should add an assistant message with agent type", async () => {
      vi.mocked(db.addMessage).mockResolvedValue(undefined);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.addAssistantMessage({
        conversationId: 1,
        content: "Response from RAG",
        agentType: "rag",
      });

      expect(result).toEqual({ success: true });
      expect(db.addMessage).toHaveBeenCalledWith(1, "assistant", "Response from RAG", "rag");
    });

    it("should add assistant message without agent type", async () => {
      vi.mocked(db.addMessage).mockResolvedValue(undefined);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.addAssistantMessage({
        conversationId: 1,
        content: "Generic response",
      });

      expect(result).toEqual({ success: true });
      expect(db.addMessage).toHaveBeenCalledWith(1, "assistant", "Generic response", undefined);
    });
  });

  describe("createInterrupt", () => {
    it("should create an interrupt for web search approval", async () => {
      vi.mocked(db.createInterrupt).mockResolvedValue(undefined);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.createInterrupt({
        conversationId: 1,
        messageId: 2,
        interruptMessage: "Approve web search for 'latest AI trends'?",
      });

      expect(result).toEqual({ success: true });
      expect(db.createInterrupt).toHaveBeenCalledWith(
        1,
        2,
        "Approve web search for 'latest AI trends'?"
      );
    });
  });

  describe("getPendingInterrupt", () => {
    it("should return pending interrupt if exists", async () => {
      const mockInterrupt = {
        id: 1,
        conversationId: 1,
        messageId: 2,
        interruptMessage: "Approve web search?",
        status: "pending",
        createdAt: new Date(),
      };

      vi.mocked(db.getPendingInterrupt).mockResolvedValue(mockInterrupt);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.getPendingInterrupt({ conversationId: 1 });

      expect(result).toEqual(mockInterrupt);
      expect(db.getPendingInterrupt).toHaveBeenCalledWith(1);
    });

    it("should return null if no pending interrupt", async () => {
      vi.mocked(db.getPendingInterrupt).mockResolvedValue(null);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.getPendingInterrupt({ conversationId: 1 });

      expect(result).toBeNull();
    });
  });

  describe("resolveInterrupt", () => {
    it("should resolve interrupt with approval", async () => {
      vi.mocked(db.resolveInterrupt).mockResolvedValue(undefined);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.resolveInterrupt({
        interruptId: 1,
        status: "approved",
      });

      expect(result).toEqual({ success: true });
      expect(db.resolveInterrupt).toHaveBeenCalledWith(1, "approved");
    });

    it("should resolve interrupt with rejection", async () => {
      vi.mocked(db.resolveInterrupt).mockResolvedValue(undefined);

      const caller = appRouter.createCaller({ ...mockAuthContext });
      const result = await caller.chat.resolveInterrupt({
        interruptId: 1,
        status: "rejected",
      });

      expect(result).toEqual({ success: true });
      expect(db.resolveInterrupt).toHaveBeenCalledWith(1, "rejected");
    });
  });
});
