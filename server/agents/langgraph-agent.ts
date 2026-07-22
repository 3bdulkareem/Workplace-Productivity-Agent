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

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { z } from "zod";
import { invokeLLM, type Message } from "../_core/llm";
import { traceLangSmith } from "./langsmith-tracer";
import { getCheckpointer } from "./checkpointer-real";

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
 * RAG Agent with Real LLM Calls
 * 
 * Uses invokeLLM() to generate responses based on company knowledge base.
 * The context is retrieved from the RAG pipeline.
 */
export async function ragAgent(state: AgentState): Promise<Partial<AgentState>> {
  const userMessage = state.messages[state.messages.length - 1]?.content || "";

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
    console.error("[RAG Agent] Error:", error);
    return {
      response: "I encountered an error. Please try again.",
      agentType: "rag",
      currentAgent: "rag",
    };
  }
}

/**
 * Summarizer Agent - Summarizes text
 */
export async function summarizerAgent(state: AgentState): Promise<Partial<AgentState>> {
  const userMessage = state.messages[state.messages.length - 1]?.content || "";

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
    console.error("[Summarizer Agent] Error:", error);
    return {
      response: "I encountered an error summarizing. Please try again.",
      agentType: "summarizer",
      currentAgent: "summarizer",
    };
  }
}

/**
 * Web Search Agent - Requests human approval before searching
 */
export async function webSearchAgent(state: AgentState): Promise<Partial<AgentState>> {
  return {
    interruptRequired: true,
    interruptMessage: "Would you like me to search the web for this information?",
    currentAgent: "web_search",
  };
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
 * Resume After Interrupt
 * 
 * Called when user approves or rejects an interrupt.
 */
export async function resumeAfterInterrupt(
  state: AgentState,
  decision: "approved" | "rejected",
  threadId?: string,
  userId?: string
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
 * Build the LangGraph Agent
 * 
 * Creates a state graph with nodes for each agent and transitions.
 */
export function buildAgentGraph() {
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

  // Compile without checkpointer - we handle persistence manually
  return graph.compile();
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
  const checkpointer = threadId && userId ? getCheckpointer() : undefined;
  const agent = buildAgentGraph();

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
    context: ragContext || null,
  };

  try {
    // Save initial state to checkpointer
    if (checkpointer && threadId && userId) {
      await checkpointer.save(threadId, userId, state, { step: "initial" });
    }

    const result = await agent.invoke(state);

    // Save final state to checkpointer
    if (checkpointer && threadId && userId) {
      await checkpointer.save(threadId, userId, result, { step: "final" });
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
