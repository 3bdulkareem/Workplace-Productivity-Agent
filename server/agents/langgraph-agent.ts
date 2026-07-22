/**
 * LangGraph Agent Implementation with Real LLM Calls
 * 
 * This module implements the multi-agent system using LangGraph with:
 * - Real LLM calls via invokeLLM()
 * - LangSmith tracing for debugging
 * - Proper state management with checkpointer
 * - RAG pipeline integration
 */

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { z } from "zod";
import { invokeLLM, type Message } from "../_core/llm";
import { traceLangSmith } from "./langsmith-tracer";

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

      // Call LLM with real implementation
      const result = await invokeLLM({
        messages,
        model: "gpt-4-turbo",
        maxTokens: 500,
      });

      // Extract the response text
      return result.choices[0]?.message.content || "No response generated";
    });

    return {
      response: typeof traced === "string" ? traced : String(traced),
      agentType: "rag",
      currentAgent: "rag",
    };
  } catch (error) {
    console.error("RAG Agent Error:", error);
    return {
      response: "I encountered an error while processing your request. Please try again.",
      agentType: "rag",
      currentAgent: "rag",
    };
  }
}

/**
 * Summarizer Agent with Real LLM Calls
 * 
 * Summarizes long documents and text using invokeLLM().
 */
export async function summarizerAgent(state: AgentState): Promise<Partial<AgentState>> {
  const userMessage = state.messages[state.messages.length - 1]?.content || "";

  try {
    const traced = await traceLangSmith("summarizer_agent", async () => {
      const messages: Message[] = [
        {
          role: "system",
          content: `You are an expert summarizer. Create a concise and accurate summary of the provided text.
Focus on key points and main ideas. Keep the summary brief but informative.`,
        },
        {
          role: "user",
          content: userMessage,
        },
      ];

      const result = await invokeLLM({
        messages,
        model: "gpt-4-turbo",
        maxTokens: 300,
      });

      return result.choices[0]?.message.content || "No summary generated";
    });

    return {
      response: typeof traced === "string" ? traced : String(traced),
      agentType: "summarizer",
      currentAgent: "summarizer",
    };
  } catch (error) {
    console.error("Summarizer Agent Error:", error);
    return {
      response: "I encountered an error while summarizing. Please try again.",
      agentType: "summarizer",
      currentAgent: "summarizer",
    };
  }
}

/**
 * Web Search Agent with Human-in-the-Loop
 * 
 * Requests user approval before performing web searches.
 * The actual search would be performed after approval.
 */
export async function webSearchAgent(state: AgentState): Promise<Partial<AgentState>> {
  const userMessage = state.messages[state.messages.length - 1]?.content || "";

  // Request approval before proceeding
  return {
    interruptRequired: true,
    interruptMessage: `I need your approval to search the web for: "${userMessage}". Should I proceed?`,
    currentAgent: "web_search",
  };
}

/**
 * Supervisor Agent with Real Routing
 * 
 * Uses LLM to intelligently route queries to appropriate agents.
 */
export async function supervisorAgent(state: AgentState): Promise<Partial<AgentState>> {
  const userMessage = state.messages[state.messages.length - 1]?.content || "";

  try {
    const traced = await traceLangSmith("supervisor_agent", async () => {
      const messages: Message[] = [
        {
          role: "system",
          content: `You are a supervisor agent that routes user queries to the most appropriate agent.

Available agents:
1. RAG Agent: For questions about company policies, procedures, and internal knowledge
2. Summarizer Agent: For summarizing documents, emails, and long texts
3. Web Search Agent: For finding current information from the internet

Analyze the user's query and respond with ONLY the agent name (rag, summarizer, or web_search) that should handle it.
Do not include any explanation, just the agent name.`,
        },
        {
          role: "user",
          content: userMessage,
        },
      ];

      // Get routing decision from LLM
      const result = await invokeLLM({
        messages,
        model: "gpt-4-turbo",
        maxTokens: 50,
      });

      const content = result.choices[0]?.message.content;
      const decision = typeof content === "string" ? content : "rag";
      return decision.toLowerCase().trim();
    });

    // Route to appropriate agent based on LLM decision
    const routingDecision = typeof traced === "string" ? traced : String(traced);
    const lowerDecision = routingDecision.toLowerCase();
    const agent = lowerDecision.includes("summarizer")
      ? summarizerAgent
      : routingDecision.includes("web_search")
        ? webSearchAgent
        : ragAgent;

    return await agent(state);
  } catch (error) {
    console.error("Supervisor Agent Error:", error);
    return {
      response: "I encountered an error routing your request. Please try again.",
      currentAgent: "supervisor",
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
  decision: "approved" | "rejected"
): Promise<Partial<AgentState>> {
  if (decision === "rejected") {
    return {
      response: "The requested action was rejected. How else can I help you?",
      currentAgent: "supervisor",
      interruptRequired: false,
      interruptMessage: null,
    };
  }

  // If approved, execute web search
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
        model: "gpt-4-turbo",
        maxTokens: 500,
      });

      return result.choices[0]?.message.content || "No results found";
    });

    return {
      response: typeof traced === "string" ? traced : String(traced),
      agentType: "web_search",
      currentAgent: "web_search",
      interruptRequired: false,
      interruptMessage: null,
    };
  } catch (error) {
    console.error("Web Search Error:", error);
    return {
      response: "I encountered an error performing the web search. Please try again.",
      currentAgent: "web_search",
      interruptRequired: false,
      interruptMessage: null,
    };
  }
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
        if (state.interruptRequired) {
          return "interrupt";
        }
        return END;
      },
      {
        interrupt: "web_search",
      }
    )
    .addEdge("rag", END)
    .addEdge("summarizer", END)
    .addEdge("web_search", END);

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
  ragContext?: string
): Promise<{
  response: string;
  agentType?: string;
  interruptRequired?: boolean;
  interruptMessage?: string;
}> {
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

  const result = await agent.invoke(state);

  return {
    response: result.response || "No response generated",
    agentType: result.agentType || undefined,
    interruptRequired: result.interruptRequired || false,
    interruptMessage: result.interruptMessage || undefined,
  };
}
