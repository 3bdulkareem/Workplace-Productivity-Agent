import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

// Mock database module
vi.mock("./db", () => ({
  getOrCreateConversation: vi.fn(),
  getConversationsByUser: vi.fn(),
  getConversationMessages: vi.fn(),
  addMessage: vi.fn(),
  createInterrupt: vi.fn(),
  getPendingInterrupt: vi.fn(),
  resolveInterrupt: vi.fn(),
  getConversation: vi.fn(),
  getInterrupt: vi.fn(),
}));

// Mock integrated-agent module
vi.mock("./agents/integrated-agent", () => ({
  processMessage: vi.fn(),
  resumeAfterApproval: vi.fn(),
}));

import * as integratedAgent from "./agents/integrated-agent";

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

describe("End-to-End Conversation Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should complete full conversation lifecycle", async () => {
    // Step 1: Create conversation
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
    const conversation = await caller.chat.createConversation({});

    expect(conversation.id).toBe(1);
    expect(conversation.threadId).toBe("thread_abc123");

    // Step 2: Send user message
    vi.mocked(db.addMessage).mockResolvedValue(undefined);
    vi.mocked(integratedAgent.processMessage).mockResolvedValue({
      response: "Our vacation policy allows 20 days per year.",
      agentType: "rag",
      interruptRequired: false,
    });

    const sendResult = await caller.chat.sendMessage({
      conversationId: 1,
      content: "What is our vacation policy?",
    });

    expect(sendResult.success).toBe(true);
    expect(db.addMessage).toHaveBeenCalledWith(1, "user", "What is our vacation policy?");

    // Step 3: Get conversation messages
    const mockMessages = [
      {
        id: 1,
        conversationId: 1,
        role: "user" as const,
        content: "What is our vacation policy?",
        agentType: null,
        interruptRequired: false,
        createdAt: new Date(),
      },
    ];

    vi.mocked(db.getConversationMessages).mockResolvedValue(mockMessages);

    const messages = await caller.chat.getMessages({ conversationId: 1 });

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");

    // Step 4: Add assistant response
    const assistantResult = await caller.chat.addAssistantMessage({
      conversationId: 1,
      content: "Our vacation policy allows 20 days per year.",
      agentType: "rag",
    });

    expect(assistantResult.success).toBe(true);

    // Step 5: Get updated messages
    const updatedMessages = [
      ...mockMessages,
      {
        id: 2,
        conversationId: 1,
        role: "assistant" as const,
        content: "Our vacation policy allows 20 days per year.",
        agentType: "rag",
        interruptRequired: false,
        createdAt: new Date(),
      },
    ];

    vi.mocked(db.getConversationMessages).mockResolvedValue(updatedMessages);

    const finalMessages = await caller.chat.getMessages({ conversationId: 1 });

    expect(finalMessages).toHaveLength(2);
    expect(finalMessages[1].agentType).toBe("rag");
  });

  it("should handle human-in-the-loop approval flow", async () => {
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

    // Step 1: Create conversation
    const conversation = await caller.chat.createConversation({});
    expect(conversation.id).toBe(1);

    // Step 2: Send message that requires web search
    vi.mocked(db.addMessage).mockResolvedValue(undefined);
    vi.mocked(integratedAgent.processMessage).mockResolvedValue({
      response: "I need to search for the latest AI trends. Awaiting approval...",
      agentType: "web_search",
      interruptRequired: true,
    });

    await caller.chat.sendMessage({
      conversationId: 1,
      content: "Search for latest AI trends",
    });

    // Step 3: Create interrupt for approval
    const interruptResult = await caller.chat.createInterrupt({
      conversationId: 1,
      messageId: 1,
      interruptMessage: "Approve web search for 'latest AI trends'?",
    });

    expect(interruptResult.success).toBe(true);
    expect(db.createInterrupt).toHaveBeenCalledWith(
      1,
      1,
      "Approve web search for 'latest AI trends'?"
    );

    // Step 4: Check pending interrupt
    const mockInterrupt = {
      id: 1,
      conversationId: 1,
      messageId: 1,
      interruptMessage: "Approve web search for 'latest AI trends'?",
      status: "pending",
      createdAt: new Date(),
    };

    vi.mocked(db.getPendingInterrupt).mockResolvedValue(mockInterrupt);

    const pendingInterrupt = await caller.chat.getPendingInterrupt({
      conversationId: 1,
    });

    expect(pendingInterrupt).not.toBeNull();
    expect(pendingInterrupt?.status).toBe("pending");

    // Step 5: User approves
    vi.mocked(db.resolveInterrupt).mockResolvedValue(undefined);
    vi.mocked(integratedAgent.resumeAfterApproval).mockResolvedValue({
      response: "Latest AI trends: ...",
      agentType: "web_search",
    });

    const approveResult = await caller.chat.resolveInterrupt({
      conversationId: 1,
      interruptId: 1,
      status: "approved",
    });

    expect(approveResult.success).toBe(true);
    expect(approveResult.response).toBeDefined();
    expect(approveResult.agentType).toBeDefined();

    // Step 6: Add web search results
    await caller.chat.addAssistantMessage({
      conversationId: 1,
      content: "Latest AI trends: ...",
      agentType: "web_search",
    });

    expect(db.addMessage).toHaveBeenCalledWith(
      1,
      "assistant",
      "Latest AI trends: ...",
      "web_search"
    );
  });

  it("should handle conversation rejection", async () => {
    const mockConversation = {
      id: 1,
      userId: "user123",
      threadId: "thread_abc123",
      title: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.getOrCreateConversation).mockResolvedValue(mockConversation);
    vi.mocked(db.addMessage).mockResolvedValue(undefined);

    const caller = appRouter.createCaller({ ...mockAuthContext });

    // Create conversation and send message
    await caller.chat.createConversation({});
    await caller.chat.sendMessage({
      conversationId: 1,
      content: "Search for sensitive data",
    });

    // Create interrupt
    await caller.chat.createInterrupt({
      conversationId: 1,
      messageId: 1,
      interruptMessage: "Approve web search for 'sensitive data'?",
    });

    // User rejects
    const mockInterrupt = {
      id: 1,
      conversationId: 1,
      messageId: 1,
      interruptMessage: "Approve web search for 'sensitive data'?",
      status: "pending",
      createdAt: new Date(),
    };

    vi.mocked(db.getPendingInterrupt).mockResolvedValue(mockInterrupt);
    vi.mocked(db.resolveInterrupt).mockResolvedValue(undefined);
    vi.mocked(integratedAgent.resumeAfterApproval).mockResolvedValue({
      response: "The web search was rejected. I cannot proceed with this request.",
      agentType: "system",
    });

    const rejectResult = await caller.chat.resolveInterrupt({
      conversationId: 1,
      interruptId: 1,
      status: "rejected",
    });

    expect(rejectResult.success).toBe(true);
    expect(rejectResult.response).toBeDefined();
    expect(rejectResult.agentType).toBeDefined();

    // Add rejection message
    await caller.chat.addAssistantMessage({
      conversationId: 1,
      content: "The web search was rejected. I cannot proceed with this request.",
    });

    expect(db.addMessage).toHaveBeenCalledWith(
      1,
      "assistant",
      "The web search was rejected. I cannot proceed with this request.",
      undefined
    );
  });

  it("should maintain conversation history across multiple exchanges", async () => {
    const mockConversation = {
      id: 1,
      userId: "user123",
      threadId: "thread_abc123",
      title: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.getOrCreateConversation).mockResolvedValue(mockConversation);
    vi.mocked(db.addMessage).mockResolvedValue(undefined);

    const caller = appRouter.createCaller({ ...mockAuthContext });

    // Create conversation
    const conversation = await caller.chat.createConversation({});

    // Exchange 1
    await caller.chat.sendMessage({
      conversationId: 1,
      content: "What is the company mission?",
    });

    await caller.chat.addAssistantMessage({
      conversationId: 1,
      content: "Our mission is to innovate and improve productivity.",
      agentType: "rag",
    });

    // Exchange 2
    await caller.chat.sendMessage({
      conversationId: 1,
      content: "Summarize that in one sentence",
    });

    await caller.chat.addAssistantMessage({
      conversationId: 1,
      content: "We innovate to improve productivity.",
      agentType: "summarizer",
    });

    // Verify history is maintained
    const mockMessages = [
      {
        id: 1,
        conversationId: 1,
        role: "user" as const,
        content: "What is the company mission?",
        agentType: null,
        interruptRequired: false,
        createdAt: new Date(),
      },
      {
        id: 2,
        conversationId: 1,
        role: "assistant" as const,
        content: "Our mission is to innovate and improve productivity.",
        agentType: "rag",
        interruptRequired: false,
        createdAt: new Date(),
      },
      {
        id: 3,
        conversationId: 1,
        role: "user" as const,
        content: "Summarize that in one sentence",
        agentType: null,
        interruptRequired: false,
        createdAt: new Date(),
      },
      {
        id: 4,
        conversationId: 1,
        role: "assistant" as const,
        content: "We innovate to improve productivity.",
        agentType: "summarizer",
        interruptRequired: false,
        createdAt: new Date(),
      },
    ];

    vi.mocked(db.getConversationMessages).mockResolvedValue(mockMessages);

    const messages = await caller.chat.getMessages({ conversationId: 1 });

    expect(messages).toHaveLength(4);
    expect(messages[0].content).toBe("What is the company mission?");
    expect(messages[1].agentType).toBe("rag");
    expect(messages[2].content).toBe("Summarize that in one sentence");
    expect(messages[3].agentType).toBe("summarizer");
  });
});
