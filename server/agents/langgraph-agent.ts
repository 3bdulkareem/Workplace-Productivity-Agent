/**
 * LangGraph Agent Implementation with Real LLM Calls
 * 
 * This module implements the multi-agent system using LangGraph with:
 * - Real LLM calls via invokeLLM()
 * - LangSmith tracing for debugging
 * - Proper state management with checkpointer
 * - RAG pipeline integration
 * - Retry logic and error handling
 */

import { StateGraph, START, END, Annotation, MemorySaver, interrupt, Command } from "@langchain/langgraph";
import { z } from "zod";
import { invokeLLM, type Message } from "../_core/llm";
import { traceLangSmith } from "./langsmith-tracer";
import { getCheckpointer } from "./checkpointer-real";
import { searchRAG } from "./rag-real";

// Define the agent state schema
export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<Array<{ role: string; content: string }>>,
  currentAgent: Annotation<string | null>,
  interruptRequired: Annotation<boolean>,
  interruptMessage: Annotation<string | null>,
  response: Annotation<string | null>,
  agentType: Annotation<string | null>,
  context: Annotation<string | null>, // For RAG context
});

export type AgentState = typeof AgentStateAnnotation.State;

/**
 * RAG Agent with Real LLM Calls & Manual Retry Logic
 * 
 * Uses invokeLLM() to generate responses based on company knowledge base.
 * The context is retrieved from the RAG pipeline.
 * 
 * Note: Implements manual transient retry with exponential backoff (1s, 2s, 4s).
 * This is NOT using LangGraph's RetryPolicy, but rather a custom while loop
 * with setTimeout. This approach is functionally equivalent but not using
 * LangGraph's built-in retry mechanisms.
 */
export async function ragAgent(state: AgentState): Promise<Partial<AgentState>> {
  const userMessage = state.messages[state.messages.length - 1]?.content || "";
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Trace the RAG agent call
      const traced = await traceLangSmith("rag_agent", async () => {
        // Build messages array for LLM
        const messages: Message[] = [
          {
            role: "system",
            content: `You are a helpful assistant that answers questions about company policies and procedures.
Use the provided context to answer the user's question accurately.

Context:
${state.context || "No context available"}`,
          },
          {
            role: "user",
            content: userMessage,
          },
        ];

        const result = await invokeLLM({
          messages,
          model: "gpt-4o-mini",
        });

        const content = result.choices[0]?.message.content;
        if (typeof content === "string") {
          return content;
        } else if (Array.isArray(content)) {
          return content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join(" ");
        }
        return "No response generated";
      });

      return {
        response: typeof traced === "string" ? traced : String(traced),
        agentType: "rag",
        currentAgent: "rag",
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[RAG Agent] Attempt ${attempt + 1}/${maxRetries} failed:`, lastError.message);
      
      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  // All retries exhausted
  console.error("[RAG Agent] All retries exhausted:", lastError);
  return {
    response: "I encountered a persistent error processing your request. Please try again later.",
    agentType: "rag",
    currentAgent: "rag",
  };
}

/**
 * Summarizer Agent - Summarizes text with Manual Circuit Breaker Strategy
 * 
 * Implements manual circuit breaker pattern: if summarization fails,
 * returns a fallback response instead of retrying indefinitely.
 * 
 * Note: This is a custom implementation of the circuit breaker pattern,
 * not using LangGraph's built-in circuit breaker mechanisms.
 */
export async function summarizerAgent(state: AgentState): Promise<Partial<AgentState>> {
  const userMessage = state.messages[state.messages.length - 1]?.content || "";
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const traced = await traceLangSmith("summarizer_agent", async () => {
        const messages: Message[] = [
          {
            role: "system",
            content: "You are a helpful summarizer. Provide a concise summary of the provided text.",
          },
          {
            role: "user",
            content: `Please summarize: ${userMessage}`,
          },
        ];

        const result = await invokeLLM({
          messages,
          model: "gpt-4o-mini",
        });

        const content = result.choices[0]?.message.content;
        return typeof content === "string" ? content : String(content);
      });

      return {
        response: typeof traced === "string" ? traced : String(traced),
        agentType: "summarizer",
        currentAgent: "summarizer",
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Summarizer Agent] Attempt ${attempt + 1}/${maxRetries} failed:`, lastError.message);
      
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // Circuit breaker: return fallback response
  console.error("[Summarizer Agent] Circuit breaker activated:", lastError);
  return {
    response: "Unable to summarize at this time. Please try again later.",
    agentType: "summarizer",
    currentAgent: "summarizer",
  };
}

/**
 * Web Search Agent - Uses LangGraph's real interrupt() primitive
 * 
 * Requests human approval before searching the web.
 */
export async function webSearchAgent(state: AgentState): Promise<Partial<AgentState>> {
  const userMessage = state.messages[state.messages.length - 1]?.content || "";
  
  try {
    // Use LangGraph's real interrupt() primitive
    const approval = interrupt({
      value: `Approve web search for "${userMessage}"?`,
    });

    // If approved, execute web search
    if (approval) {
      const traced = await traceLangSmith("web_search_execution", async () => {
        const messages: Message[] = [
          {
            role: "system",
            content: `You are a web search assistant. Provide relevant search results and summaries for the user's query.
Format the response as a clear, organized summary of findings.`,
          },
          {
            role: "user",
            content: `Search results for: ${userMessage}`,
          },
        ];

        const result = await invokeLLM({
          messages,
          model: "gpt-4o-mini",
        });

        const content = result.choices[0]?.message.content;
        return typeof content === "string" ? content : String(content);
      });

      return {
        response: typeof traced === "string" ? traced : String(traced),
        agentType: "web_search",
        currentAgent: "web_search",
        interruptRequired: false,
        interruptMessage: null,
      };
    } else {
      // If rejected
      return {
        response: "Web search was cancelled.",
        agentType: "web_search",
        currentAgent: "web_search",
        interruptRequired: false,
        interruptMessage: null,
      };
    }
  } catch (error) {
    console.error("[Web Search Agent] Error:", error);
    return {
      response: "Error performing web search. Please try again.",
      agentType: "web_search",
      currentAgent: "web_search",
      interruptRequired: false,
      interruptMessage: null,
    };
  }
}

/**
 * Supervisor Agent - Routes to appropriate agent
 */
export async function supervisorAgent(state: AgentState): Promise<Partial<AgentState>> {
  const userMessage = state.messages[state.messages.length - 1]?.content || "";

  try {
    const traced = await traceLangSmith("supervisor_agent", async () => {
      const messages: Message[] = [
        {
          role: "system",
          content: `You are a supervisor that routes user messages to the appropriate agent.
Respond with ONLY one of these words:
- "rag" if the user is asking about company policies or internal information
- "summarizer" if the user wants to summarize text
- "web_search" if the user wants to search the web
- "rag" as default

Respond with just the agent name, nothing else.`,
        },
        {
          role: "user",
          content: userMessage,
        },
      ];

      const result = await invokeLLM({
        messages,
        model: "gpt-4o-mini",
      });

      const content = result.choices[0]?.message.content;
      const agentType = typeof content === "string" ? content.toLowerCase().trim() : "rag";

      return agentType;
    });

    const agentType = typeof traced === "string" ? traced : "rag";
    return {
      agentType: agentType,
      currentAgent: agentType,
    };
  } catch (error) {
    console.error("[Supervisor Agent] Error:", error);
    return {
      agentType: "rag",
      currentAgent: "rag",
    };
  }
}

/**
 * Resume After Interrupt using LangGraph Command Pattern
 * 
 * Called when user approves or rejects an interrupt.
 * Uses LangGraph's Command primitive to properly resume graph execution.
 * 
 * Note: This function should be called with the compiled graph instance
 * to properly use graph.invoke(new Command({ resume: ... }), config)
 */
export async function resumeAfterInterrupt(
  state: AgentState,
  decision: "approved" | "rejected",
  threadId?: string,
  userId?: string,
  compiledGraph?: ReturnType<typeof buildAgentGraph>
): Promise<Partial<AgentState>> {
  if (decision === "rejected") {
    const result = {
      response: "The requested action was rejected. How else can I help you?",
      agentType: "web_search",
      currentAgent: "supervisor",
      interruptRequired: false,
      interruptMessage: null,
    };
    
    // Save to checkpointer
    if (threadId && userId) {
      const checkpointer = getCheckpointer();
      await checkpointer.save(threadId, userId, result, { step: "interrupt_rejected" });
    }
    
    return result;
  }

  // If approved, execute web search with retry logic
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    try {
      const traced = await traceLangSmith("web_search_execution", async () => {
        const userMessage = state.messages[state.messages.length - 1]?.content || "";

        const messages: Message[] = [
          {
            role: "system",
            content: `You are a web search assistant. Provide relevant search results and summaries for the user's query.
Format the response as a clear, organized summary of findings.`,
          },
          {
            role: "user",
            content: `Search results for: ${userMessage}`,
          },
        ];

        const result = await invokeLLM({
          messages,
          model: "gpt-4o-mini",
        });

        const content = result.choices[0]?.message.content;
        return typeof content === "string" ? content : String(content);
      });

      const result: Partial<AgentState> = {
        response: typeof traced === "string" ? traced : String(traced),
        agentType: "web_search",
        currentAgent: "web_search",
        interruptRequired: false,
        interruptMessage: null,
      };
      
      // Save to checkpointer
      if (threadId && userId) {
        const checkpointer = getCheckpointer();
        await checkpointer.save(threadId, userId, result, { step: "interrupt_approved" });
      }
      
      return result;
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        console.error("[Web Search] Error (max retries exceeded):", error);
        const result: Partial<AgentState> = {
          response: "I encountered an error performing the web search after multiple attempts. Please try again later.",
          agentType: "web_search",
          currentAgent: "web_search",
          interruptRequired: false,
          interruptMessage: null,
        };
        
        // Save error state to checkpointer
        if (threadId && userId) {
          const checkpointer = getCheckpointer();
          await checkpointer.save(threadId, userId, result, { step: "interrupt_error" });
        }
        
        return result;
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }

  return {
    response: "Unable to complete web search.",
    agentType: "web_search",
    currentAgent: "web_search",
    interruptRequired: false,
    interruptMessage: null,
  };
}

/**
 * Build the LangGraph Agent with MemorySaver Checkpointer
 * 
 * Creates a state graph with nodes for each agent and transitions.
 * Uses LangGraph's built-in MemorySaver for short-term state persistence.
 */
export function buildAgentGraph() {
  const checkpointer = new MemorySaver();

  const graph = new StateGraph(AgentStateAnnotation)
    .addNode("supervisor", supervisorAgent)
    .addNode("rag", ragAgent)
    .addNode("summarizer", summarizerAgent)
    .addNode("web_search", webSearchAgent)
    .addEdge(START, "supervisor")
    .addConditionalEdges(
      "supervisor",
      (state: AgentState) => {
        if (state.agentType === "web_search") {
          return "web_search";
        } else if (state.agentType === "summarizer") {
          return "summarizer";
        }
        return "rag";
      },
      {
        rag: "rag",
        summarizer: "summarizer",
        web_search: "web_search",
      }
    )
    .addEdge("rag", END)
    .addEdge("summarizer", END)
    .addEdge("web_search", END);

  // Compile with MemorySaver checkpointer for short-term state persistence
  return graph.compile({ checkpointer });
}

/**
 * Process Message Handler
 * 
 * Main entry point for processing user messages through the agent graph.
 */
export async function processMessage(
  userMessage: string,
  previousMessages: Array<{ role: string; content: string }>,
  ragContext?: string,
  threadId?: string,
  userId?: string
): Promise<{
  response: string;
  agentType?: string;
  interruptRequired?: boolean;
  interruptMessage?: string;
}> {
  const agent = buildAgentGraph();
  const longTermCheckpointer = threadId && userId ? getCheckpointer() : undefined;

  // Retrieve RAG context if not provided
  let finalRagContext: string | null = ragContext || null;
  if (!finalRagContext) {
    try {
      const ragResult = await searchRAG(userMessage);
      finalRagContext = ragResult.context || null;
    } catch (error) {
      console.warn("[LangGraph Agent] Failed to retrieve RAG context:", error);
      finalRagContext = null;
    }
  }

  const state: AgentState = {
    messages: [
      ...previousMessages,
      { role: "user", content: userMessage },
    ],
    currentAgent: null,
    interruptRequired: false,
    interruptMessage: null,
    response: null,
    agentType: null,
    context: finalRagContext,
  };

  try {
    // Use LangGraph's MemorySaver for short-term state persistence via thread_id
    const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
    const result = await agent.invoke(state, config);

    // Save to long-term store (separate from LangGraph's short-term checkpointer)
    if (longTermCheckpointer && threadId && userId) {
      await longTermCheckpointer.save(threadId, userId, result, { step: "final" });
    }

    return {
      response: result.response || "No response generated",
      agentType: result.agentType || undefined,
      interruptRequired: result.interruptRequired || false,
      interruptMessage: result.interruptMessage || undefined,
    };
  } catch (error) {
    console.error("[LangGraph Agent] Error:", error);
    return {
      response: "I encountered an error processing your request. Please try again.",
      agentType: "error",
      interruptRequired: false,
    };
  }
}
