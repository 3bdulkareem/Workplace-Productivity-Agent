# LangGraph Integration Guide

This document explains how to integrate the LangGraph multi-agent system from the Python implementation into the Node.js web application.

## Architecture Overview

The web application is structured to support LangGraph integration:

```
Frontend (React)
    ↓
tRPC Chat Procedures (server/routers.ts)
    ↓
Database (MySQL/TiDB)
    ↓
LangGraph Backend (Node.js or Python bridge)
```

## Current State

- **Database**: Fully set up with `conversations`, `messages`, and `interrupts` tables
- **tRPC Procedures**: Chat management procedures ready
- **Frontend**: Chat UI with message history and HITL approval buttons
- **Testing**: 27 comprehensive tests covering database and procedures

## Integration Steps

### Option 1: Node.js LangGraph Implementation

If porting LangGraph to Node.js:

1. **Install LangGraph.js** (when available):
   ```bash
   pnpm add @langchain/langgraph
   ```

2. **Create agent file** (`server/agents/index.ts`):
   ```typescript
   import { StateGraph, START, END } from "@langchain/langgraph";
   
   // Define your agents here
   export const supervisorAgent = new StateGraph(...)
     .addNode("rag", ragAgent)
     .addNode("summarizer", summarizerAgent)
     .addNode("web_search", webSearchAgent)
     .compile();
   ```

3. **Create bridge procedure** in `server/routers.ts`:
   ```typescript
   processMessage: protectedProcedure
     .input(z.object({ conversationId: z.number(), message: z.string() }))
     .mutation(async ({ input, ctx }) => {
       // Call LangGraph with conversation history
       const response = await supervisorAgent.invoke({
         messages: await db.getConversationMessages(input.conversationId),
         input: input.message,
       });
       
       // Save response to database
       await db.addMessage(input.conversationId, "assistant", response.output);
       return { success: true };
     }),
   ```

### Option 2: Python Bridge

If keeping Python implementation:

1. **Setup Python service** (separate process or container):
   ```bash
   # In Workplace-Productivity-Agent directory
   python -m uvicorn src.app:app --port 8001
   ```

2. **Create Node.js client** (`server/agents/pythonBridge.ts`):
   ```typescript
   import axios from "axios";
   
   export async function callPythonAgent(
     threadId: string,
     messages: Array<{ role: string; content: string }>
   ) {
     const response = await axios.post("http://localhost:8001/chat", {
       thread_id: threadId,
       messages,
     });
     return response.data;
   }
   ```

3. **Integrate into tRPC**:
   ```typescript
   processMessage: protectedProcedure
     .input(z.object({ conversationId: z.number(), message: z.string() }))
     .mutation(async ({ input, ctx }) => {
       const conversation = await db.getConversation(input.conversationId);
       const response = await callPythonAgent(
         conversation.threadId,
         await db.getConversationMessages(input.conversationId)
       );
       
       // Handle response and interrupts
       if (response.interrupt_required) {
         await db.createInterrupt(
           input.conversationId,
           response.message_id,
           response.interrupt_message
         );
       }
       
       await db.addMessage(
         input.conversationId,
         "assistant",
         response.content,
         response.agent_type
       );
       return { success: true };
     }),
   ```

## Thread ID Mapping

The `threadId` field in the `conversations` table maps to LangGraph's thread ID:

```typescript
// When creating a conversation
const conversation = await db.getOrCreateConversation(userId, threadId);

// When resuming after interrupt
const conversation = await db.getConversation(conversationId);
const response = await supervisorAgent.invoke({
  thread_id: conversation.threadId,
  // ... rest of state
});
```

## Human-in-the-Loop (HITL) Flow

1. **Agent requests approval**:
   ```typescript
   if (response.interrupt_required) {
     await db.createInterrupt(
       conversationId,
       messageId,
       response.interrupt_message
     );
   }
   ```

2. **User approves/rejects** (frontend):
   - Approval buttons appear in ChatInterface
   - User clicks Approve/Reject
   - Frontend calls `resolveInterrupt` mutation

3. **Resume execution**:
   ```typescript
   resolveInterrupt: protectedProcedure
     .input(z.object({ interruptId: z.number(), status: z.enum(["approved", "rejected"]) }))
     .mutation(async ({ input }) => {
       const interrupt = await db.getInterrupt(input.interruptId);
       const conversation = await db.getConversation(interrupt.conversationId);
       
       // Resume graph with user decision
       const response = await supervisorAgent.invoke({
         thread_id: conversation.threadId,
         interrupt_decision: input.status,
         // ... rest of state
       });
       
       await db.resolveInterrupt(input.interruptId, input.status);
       await db.addMessage(
         interrupt.conversationId,
         "assistant",
         response.content,
         response.agent_type
       );
     }),
   ```

## Testing Integration

After implementing LangGraph integration:

1. **Test agent routing**:
   ```typescript
   it("should route to RAG agent for policy questions", async () => {
     const response = await supervisorAgent.invoke({
       messages: [{ role: "user", content: "What is our vacation policy?" }],
     });
     expect(response.agent_type).toBe("rag");
   });
   ```

2. **Test HITL flow**:
   ```typescript
   it("should create interrupt for web search", async () => {
     const response = await supervisorAgent.invoke({
       messages: [{ role: "user", content: "Search for latest AI news" }],
     });
     expect(response.interrupt_required).toBe(true);
   });
   ```

3. **Test persistence**:
   ```typescript
   it("should resume conversation with same thread_id", async () => {
     const conv1 = await db.getOrCreateConversation("user123", "thread_abc");
     const conv2 = await db.getOrCreateConversation("user123", "thread_abc");
     expect(conv1.id).toBe(conv2.id);
   });
   ```

## Environment Variables

Add these to your `.env` for LangGraph integration:

```env
# For Node.js LangGraph
LANGCHAIN_API_KEY=your_key_here
LANGCHAIN_TRACING_V2=true

# For Python bridge
PYTHON_AGENT_URL=http://localhost:8001
PYTHON_AGENT_TIMEOUT=30000
```

## Next Steps

1. Choose integration approach (Node.js or Python bridge)
2. Implement agent logic
3. Add comprehensive tests
4. Deploy and monitor

## Troubleshooting

- **Thread ID mismatch**: Ensure `threadId` is consistent between database and LangGraph
- **Interrupt not showing**: Check that `createInterrupt` is called before response is sent
- **Message not persisting**: Verify database connection and transaction handling
