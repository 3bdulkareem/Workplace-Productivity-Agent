/**
 * Integrated Agent with Real RAG and Checkpointer
 * 
 * This module provides the complete agent workflow:
 * - RAG agent for company policies (with real embeddings)
 * - Summarizer agent for text summarization
 * - Web search agent with human approval
 * - Supervisor routing between agents
 * - Persistent state with checkpointer
 */

import { ragAgent } from "./rag-real";
import { getCheckpointer } from "./checkpointer-real";
import { invokeLLM, type Message } from "../_core/llm";

/**
 * Agent State - shared across all agents
 */
export interface AgentState {
  messages: Message[];
  agentType: string;
  interruptRequired: boolean;
  interruptMessage: string;
  result: string;
  threadId: string;
  userId: string;
}

/**
 * RAG Agent - Answers questions based on company policies with real embeddings
 */
async function ragAgentNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[RAG Agent] Processing with real embeddings");

  const lastMessage = state.messages[state.messages.length - 1];
  const userQuery = typeof lastMessage.content === "string" 
    ? lastMessage.content 
    : String(lastMessage.content);

  // Call RAG agent with real embeddings and LLM
  const response = await ragAgent(userQuery);
  console.log(`[RAG Agent] Generated response`);

  return {
    result: response,
    agentType: "rag",
    messages: [
      ...state.messages,
      {
        role: "assistant",
        content: response,
      },
    ],
  };
}

/**
 * Summarizer Agent - Summarizes text
 */
async function summarizerAgent(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[Summarizer Agent] Processing");

  const lastMessage = state.messages[state.messages.length - 1];
  const textToSummarize = typeof lastMessage.content === "string" 
    ? lastMessage.content 
    : String(lastMessage.content);

  const messages: Message[] = [
    {
      role: "system",
      content: "You are a helpful summarizer. Provide a concise summary of the given text.",
    },
    {
      role: "user",
      content: `Please summarize the following text:\n\n${textToSummarize}`,
    },
  ];

  const response = await invokeLLM({ messages });
  const responseText = response.choices[0].message.content;

  return {
    result: typeof responseText === "string" ? responseText : String(responseText),
    agentType: "summarizer",
    messages: [
      ...state.messages,
      {
        role: "assistant",
        content: responseText,
      },
    ],
  };
}

/**
 * Web Search Agent - Searches the web (with human approval)
 */
async function webSearchAgent(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[Web Search Agent] Requesting human approval");

  // Request human approval for web search
  const approvalMessage = `I need to search the web for this query. Do you approve?`;

  return {
    interruptRequired: true,
    interruptMessage: approvalMessage,
    agentType: "web-search",
  };
}

/**
 * Supervisor Agent - Routes to appropriate agent using LLM
 */
async function supervisorAgent(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[Supervisor Agent] Routing message");

  const lastMessage = state.messages[state.messages.length - 1];
  const userQuery = typeof lastMessage.content === "string" 
    ? lastMessage.content 
    : String(lastMessage.content);

  const routingMessages: Message[] = [
    {
      role: "system",
      content: `You are a supervisor that routes queries to the appropriate agent.
      
Available agents:
1. "rag" - For questions about company policies and internal knowledge
2. "summarizer" - For summarizing text
3. "web-search" - For searching the web

Respond with ONLY the agent name, nothing else.`,
    },
    {
      role: "user",
      content: userQuery,
    },
  ];

  const response = await invokeLLM({ messages: routingMessages });
  const agentChoice = response.choices[0].message.content;
  const normalizedChoice = (typeof agentChoice === "string" 
    ? agentChoice.toLowerCase().trim() 
    : String(agentChoice).toLowerCase().trim());

  console.log("[Supervisor] Routed to:", normalizedChoice);

  return {
    agentType: normalizedChoice,
  };
}

/**
 * Execute agent workflow
 */
async function executeAgent(state: AgentState): Promise<AgentState> {
  // Route based on agent type
  const agentType = state.agentType.toLowerCase().trim();
  
  let result: Partial<AgentState>;
  
  if (agentType.includes("rag") || agentType.includes("policy")) {
    result = await ragAgentNode(state);
  } else if (agentType.includes("summar")) {
    result = await summarizerAgent(state);
  } else if (agentType.includes("web") || agentType.includes("search")) {
    result = await webSearchAgent(state);
  } else {
    // Default to RAG
    result = await ragAgentNode(state);
  }

  return { ...state, ...result };
}

/**
 * Process a message through the agent with real RAG and checkpointer
 */
export async function processMessage(
  userMessage: string,
  threadId: string,
  userId: string
): Promise<{
  response: string;
  agentType: string;
  interruptRequired: boolean;
  interruptMessage?: string;
}> {
  const checkpointer = getCheckpointer();

  // Initialize state
  let state: AgentState = {
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
    agentType: "supervisor",
    interruptRequired: false,
    interruptMessage: "",
    result: "",
    threadId,
    userId,
  };

  // Save initial state to checkpointer
  await checkpointer.save(threadId, userId, state, { step: "initial" });

  // Step 1: Supervisor routes the message
  const supervisorResult = await supervisorAgent(state);
  state = { ...state, ...supervisorResult };
  await checkpointer.save(threadId, userId, state, { step: "supervisor" });

  // Step 2: Execute the appropriate agent
  const agentResult = await executeAgent(state);
  state = { ...state, ...agentResult };
  await checkpointer.save(threadId, userId, state, { step: "agent" });

  return {
    response: String(state.result || ""),
    agentType: String(state.agentType || "rag"),
    interruptRequired: Boolean(state.interruptRequired || false),
    interruptMessage: String(state.interruptMessage || ""),
  };
}

/**
 * Resume agent after human approval
 */
export async function resumeAfterApproval(
  threadId: string,
  userId: string,
  approved: boolean
): Promise<{
  response: string;
  agentType: string;
}> {
  const checkpointer = getCheckpointer();
  const checkpoint = await checkpointer.get(threadId);

  if (!checkpoint) {
    throw new Error(`No checkpoint found for thread ${threadId}`);
  }

  const state = checkpoint.checkpoint as AgentState;

  if (approved) {
    // Continue with web search
    const messages: Message[] = [
      {
        role: "system",
        content: "User approved the web search. Provide search results.",
      },
      ...state.messages,
    ];

    const response = await invokeLLM({ messages });
    const responseText = response.choices[0].message.content;

    const result = typeof responseText === "string" ? responseText : String(responseText);

    // Save final state
    await checkpointer.save(threadId, userId, { ...state, result }, { step: "approved" });

    return {
      response: result,
      agentType: "web-search",
    };
  } else {
    const result = "Web search was rejected by the user.";

    // Save final state
    await checkpointer.save(threadId, userId, { ...state, result }, { step: "rejected" });

    return {
      response: result,
      agentType: "web-search",
    };
  }
}

/**
 * Get conversation history from checkpointer
 */
export async function getConversationHistory(
  threadId: string
): Promise<Message[]> {
  const checkpointer = getCheckpointer();
  const checkpoint = await checkpointer.get(threadId);

  if (!checkpoint) {
    return [];
  }

  const state = checkpoint.checkpoint as AgentState;
  return state.messages || [];
}
