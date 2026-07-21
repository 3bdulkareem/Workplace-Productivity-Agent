# Workplace Productivity Agent - Setup & Usage Guide

## Project Overview

This is a full-stack web application for the Workplace Productivity Agent, featuring:

- **Professional Chat Interface**: Real-time conversation with AI agents
- **Multi-Agent System**: RAG, Summarizer, and Web Search agents
- **Human-in-the-Loop (HITL)**: Approval buttons for sensitive operations
- **Persistent History**: All conversations stored in MySQL/TiDB
- **Authentication**: Manus OAuth integration
- **Responsive Design**: Works on desktop, tablet, and mobile

## Technology Stack

- **Frontend**: React 19, Tailwind CSS 4, TypeScript
- **Backend**: Express, tRPC, Node.js
- **Database**: MySQL/TiDB with Drizzle ORM
- **Testing**: Vitest (31 tests passing)
- **Authentication**: Manus OAuth

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm package manager
- MySQL/TiDB database

### Installation

```bash
# Install dependencies
pnpm install

# Generate database migrations
pnpm drizzle-kit generate

# Apply migrations (via webdev_execute_sql in Management UI)
# See database schema in drizzle/schema.ts

# Start development server
pnpm dev
```

The application will be available at `http://localhost:3000`

## Project Structure

```
workplace-productivity-web/
├── client/                    # React frontend
│   ├── src/
│   │   ├── pages/            # Page components (Home, Chat)
│   │   ├── components/       # Reusable UI components
│   │   ├── lib/              # tRPC client setup
│   │   └── App.tsx           # Main router
│   └── index.html
├── server/                    # Express backend
│   ├── routers.ts            # tRPC procedures
│   ├── db.ts                 # Database helpers
│   ├── *.test.ts             # Vitest tests
│   └── _core/                # Framework setup
├── drizzle/                   # Database schema
│   ├── schema.ts             # Table definitions
│   └── migrations/           # SQL migrations
├── LANGGRAPH_INTEGRATION.md  # Integration guide
└── todo.md                    # Project tasks
```

## Key Features

### 1. Chat Interface

Located at `/chat` after authentication:

- **Message History**: All messages persisted to database
- **Agent Indicators**: Shows which agent is responding (RAG, Summarizer, Web Search)
- **Loading States**: Visual feedback during processing
- **Error Handling**: Graceful error messages for failed operations

### 2. Human-in-the-Loop (HITL)

When an agent needs approval (e.g., web search):

1. Approval request appears in chat as yellow card
2. User clicks "Approve" or "Reject"
3. Agent resumes with user's decision
4. Result is added to conversation

### 3. Conversation Management

- **Create New Chat**: "New Chat" button in sidebar
- **View History**: All conversations listed in sidebar
- **Persistent Memory**: Each conversation has unique `threadId` for LangGraph

### 4. Authentication

- Uses Manus OAuth
- Automatic login redirect
- Session management via cookies
- User info displayed in sidebar

## Database Schema

### conversations table
```sql
- id: Primary key
- userId: User identifier
- threadId: LangGraph thread ID (unique per conversation)
- title: Optional conversation title
- createdAt, updatedAt: Timestamps
```

### messages table
```sql
- id: Primary key
- conversationId: Foreign key to conversations
- role: 'user' | 'assistant' | 'system'
- content: Message text
- agentType: 'rag' | 'summarizer' | 'web_search' | null
- interruptRequired: Boolean flag
- createdAt: Timestamp
```

### interrupts table
```sql
- id: Primary key
- conversationId: Foreign key to conversations
- messageId: Associated message ID
- interruptMessage: Approval request text
- status: 'pending' | 'approved' | 'rejected'
- createdAt: Timestamp
```

## API Procedures

### Chat Router

All procedures require authentication.

**createConversation**
```typescript
Input: { threadId?: string }
Output: { id, userId, threadId, title, createdAt, updatedAt }
```

**getConversations**
```typescript
Output: Conversation[]
```

**getMessages**
```typescript
Input: { conversationId: number }
Output: Message[]
```

**sendMessage**
```typescript
Input: { conversationId: number, content: string }
Output: { success: boolean }
```

**addAssistantMessage**
```typescript
Input: { conversationId: number, content: string, agentType?: string }
Output: { success: boolean }
```

**createInterrupt**
```typescript
Input: { conversationId: number, messageId: number, interruptMessage: string }
Output: { success: boolean }
```

**getPendingInterrupt**
```typescript
Input: { conversationId: number }
Output: Interrupt | null
```

**resolveInterrupt**
```typescript
Input: { interruptId: number, status: 'approved' | 'rejected' }
Output: { success: boolean }
```

## Testing

Run all tests:
```bash
pnpm test
```

Test files:
- `server/chat.test.ts` - Database helper tests (12 tests)
- `server/routers.test.ts` - tRPC procedure tests (14 tests)
- `server/conversation-flow.test.ts` - End-to-end flow tests (4 tests)
- `server/auth.logout.test.ts` - Authentication tests (1 test)

Total: **31 tests passing**

## LangGraph Integration

See `LANGGRAPH_INTEGRATION.md` for detailed integration instructions.

Two approaches available:

1. **Node.js Implementation**: Direct LangGraph.js integration
2. **Python Bridge**: Connect to existing Python service

Both approaches map `threadId` to LangGraph's thread ID for persistent memory.

## Environment Variables

Set in Management UI Secrets panel:

- `DATABASE_URL`: MySQL/TiDB connection string
- `JWT_SECRET`: Session signing secret
- `VITE_APP_ID`: Manus OAuth app ID
- `OAUTH_SERVER_URL`: Manus OAuth backend URL
- `VITE_OAUTH_PORTAL_URL`: Manus login portal URL

## Development Workflow

1. **Update Database Schema**:
   ```bash
   # Edit drizzle/schema.ts
   pnpm drizzle-kit generate
   # Apply migration via webdev_execute_sql
   ```

2. **Add tRPC Procedure**:
   ```typescript
   // In server/routers.ts
   myFeature: protectedProcedure
     .input(z.object({ ... }))
     .mutation(async ({ input, ctx }) => { ... })
   ```

3. **Use in Frontend**:
   ```typescript
   // In React component
   const mutation = trpc.myFeature.useMutation();
   await mutation.mutateAsync({ ... });
   ```

4. **Write Tests**:
   ```bash
   pnpm test
   ```

## Deployment

1. Create checkpoint via Management UI
2. Click "Publish" button
3. Application deployed to production

See Management UI for:
- Custom domain setup
- Visibility settings
- Analytics dashboard
- Database management

## Troubleshooting

### Chat not loading
- Check browser console for errors
- Verify authentication status in sidebar
- Check dev server logs: `tail .manus-logs/devserver.log`

### Messages not saving
- Verify database connection
- Check SQL migrations applied
- Review server logs for database errors

### HITL approval not working
- Ensure `createInterrupt` is called before response
- Check that `resolveInterrupt` invalidates pending interrupt query
- Verify interrupt ID is correct

### Performance issues
- Check message count (pagination recommended for large histories)
- Monitor database query performance
- Use browser DevTools to profile React components

## Next Steps

1. **Integrate LangGraph**: Follow `LANGGRAPH_INTEGRATION.md`
2. **Implement Agents**: Create RAG, Summarizer, Web Search agents
3. **Add Features**: Conversation titles, search, export
4. **Monitor**: Setup error tracking and analytics

## Support

For issues or questions:
1. Check logs in `.manus-logs/`
2. Review test files for usage examples
3. Consult `LANGGRAPH_INTEGRATION.md` for agent setup
4. Contact Manus support via Management UI
