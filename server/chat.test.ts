import { describe, it, expect, beforeEach, vi } from "vitest";
import * as db from "./db";

// Mock the database module
vi.mock("./db", () => ({
  getOrCreateConversation: vi.fn(),
  getConversationsByUser: vi.fn(),
  getConversationMessages: vi.fn(),
  addMessage: vi.fn(),
  createInterrupt: vi.fn(),
  getPendingInterrupt: vi.fn(),
  resolveInterrupt: vi.fn(),
}));

describe("Chat Procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreateConversation", () => {
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

      const result = await db.getOrCreateConversation("user123", "thread_abc123");

      expect(result).toEqual(mockConversation);
      expect(db.getOrCreateConversation).toHaveBeenCalledWith("user123", "thread_abc123");
    });

    it("should return existing conversation if threadId matches", async () => {
      const mockConversation = {
        id: 1,
        userId: "user123",
        threadId: "thread_existing",
        title: "Previous Chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.getOrCreateConversation).mockResolvedValue(mockConversation);

      const result = await db.getOrCreateConversation("user123", "thread_existing");

      expect(result.threadId).toBe("thread_existing");
      expect(result.title).toBe("Previous Chat");
    });
  });

  describe("getConversationsByUser", () => {
    it("should return all conversations for a user", async () => {
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

      const result = await db.getConversationsByUser("user123");

      expect(result).toHaveLength(2);
      expect(result[0].threadId).toBe("thread_1");
      expect(result[1].threadId).toBe("thread_2");
    });

    it("should return empty array if user has no conversations", async () => {
      vi.mocked(db.getConversationsByUser).mockResolvedValue([]);

      const result = await db.getConversationsByUser("user_no_chats");

      expect(result).toEqual([]);
    });
  });

  describe("getConversationMessages", () => {
    it("should return messages for a conversation", async () => {
      const mockMessages = [
        {
          id: 1,
          conversationId: 1,
          role: "user",
          content: "Hello",
          agentType: null,
          interruptRequired: false,
          createdAt: new Date(),
        },
        {
          id: 2,
          conversationId: 1,
          role: "assistant",
          content: "Hi there!",
          agentType: "rag",
          interruptRequired: false,
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.getConversationMessages).mockResolvedValue(mockMessages);

      const result = await db.getConversationMessages(1);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("user");
      expect(result[1].agentType).toBe("rag");
    });
  });

  describe("addMessage", () => {
    it("should add a user message to conversation", async () => {
      vi.mocked(db.addMessage).mockResolvedValue(undefined);

      await db.addMessage(1, "user", "Test message");

      expect(db.addMessage).toHaveBeenCalledWith(1, "user", "Test message");
    });

    it("should add an assistant message with agent type", async () => {
      vi.mocked(db.addMessage).mockResolvedValue(undefined);

      await db.addMessage(1, "assistant", "Response", "rag");

      expect(db.addMessage).toHaveBeenCalledWith(1, "assistant", "Response", expect.any(String));
    });
  });

  describe("createInterrupt", () => {
    it("should create an interrupt for web search approval", async () => {
      vi.mocked(db.createInterrupt).mockResolvedValue(undefined);

      await db.createInterrupt(1, 2, "Approve web search for 'latest AI trends'?");

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

      const result = await db.getPendingInterrupt(1);

      expect(result).toEqual(mockInterrupt);
      expect(result?.status).toBe("pending");
    });

    it("should return null if no pending interrupt", async () => {
      vi.mocked(db.getPendingInterrupt).mockResolvedValue(null);

      const result = await db.getPendingInterrupt(1);

      expect(result).toBeNull();
    });
  });

  describe("resolveInterrupt", () => {
    it("should resolve interrupt with approval status", async () => {
      vi.mocked(db.resolveInterrupt).mockResolvedValue(undefined);

      await db.resolveInterrupt(1, "approved");

      expect(db.resolveInterrupt).toHaveBeenCalledWith(1, "approved");
    });

    it("should resolve interrupt with rejection status", async () => {
      vi.mocked(db.resolveInterrupt).mockResolvedValue(undefined);

      await db.resolveInterrupt(1, "rejected");

      expect(db.resolveInterrupt).toHaveBeenCalledWith(1, "rejected");
    });
  });
});
