# Workplace Productivity Agent Web - TODO

## Phase 1: Database & Backend Setup
- [x] Create database schema for conversations, messages, and thread management
- [x] Add tRPC procedures for chat operations (send message, get history, create thread)
- [ ] Integrate LangGraph backend with Express server
- [x] Setup conversation persistence with thread_id

## Phase 2: Chat UI & Landing Page
- [x] Design and implement landing page with feature showcase (RAG, Summarizer, Web Search)
- [x] Build chat interface component with message history display
- [x] Add message input with send button
- [x] Implement message loading states and animations
- [x] Add agent status indicator (showing active agent: RAG/Summarizer/Web Search)
- [x] Create Chat page with conversation management sidebar

## Phase 3: LangGraph Integration
- [ ] Setup LangGraph supervisor agent on backend
- [ ] Create RAG agent with company policy knowledge base
- [ ] Create summarizer agent
- [ ] Create web search agent
- [ ] Implement routing logic between agents
- [x] Create integration guide (LANGGRAPH_INTEGRATION.md)

## Phase 4: Human-in-the-Loop
- [x] Add interrupt handling for web search approval
- [x] Implement approval/rejection buttons in chat UI
- [ ] Handle user responses and resume graph execution
- [ ] Display approval request as system message in chat

## Phase 5: Conversation Management
- [x] Save all messages to database with user association
- [x] Implement thread_id persistence per user
- [x] Create conversation history UI
- [ ] Add ability to view/restore previous conversations
- [ ] Implement conversation clearing/deletion
- [x] Create PROJECT_SETUP.md documentation

## Phase 6: Testing & Deployment
- [x] Write vitest tests for chat procedures
- [x] Write vitest tests for tRPC routers
- [x] Test full conversation flow end-to-end
- [x] Test Human-in-the-loop approval/rejection
- [x] Test message persistence
- [ ] Deploy to production

## Design System
- [x] Define color palette and typography
- [x] Create reusable UI components
- [x] Implement smooth animations and transitions
- [x] Ensure responsive design (mobile, tablet, desktop)
- [ ] Add dark/light theme support (optional)
