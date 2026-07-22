/**
 * LangSmith Tracing Integration
 * 
 * Provides tracing capabilities for LangGraph agents using LangSmith.
 * Traces are automatically sent to LangSmith when LANGCHAIN_TRACING_V2 is enabled.
 */

import { traceable } from "langsmith/traceable";

/**
 * Wrap an async function with LangSmith tracing
 * 
 * @param name - The name of the traced operation
 * @param fn - The async function to trace
 * @returns The result of the function
 */
export async function traceLangSmith<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  // Check if LangSmith tracing is enabled
  const tracingEnabled = process.env.LANGCHAIN_TRACING_V2 === "true";

  if (!tracingEnabled) {
    // If tracing is disabled, just execute the function
    return fn();
  }

  // Create a traced function
  const tracedFn = traceable(
    async () => {
      return fn();
    },
    {
      name,
      run_type: "llm",
      tags: ["langgraph", "agent"],
    }
  );

  return tracedFn();
}

/**
 * Log a trace event with metadata
 * 
 * @param name - Event name
 * @param data - Event data
 */
export function logTraceEvent(name: string, data: Record<string, unknown>): void {
  const tracingEnabled = process.env.LANGCHAIN_TRACING_V2 === "true";

  if (tracingEnabled) {
    console.log(`[TRACE] ${name}:`, JSON.stringify(data, null, 2));
  }
}

/**
 * Create a trace context for debugging
 * 
 * @param agentName - Name of the agent
 * @param input - Input to the agent
 * @param output - Output from the agent
 */
export function createTraceContext(
  agentName: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>
): void {
  const tracingEnabled = process.env.LANGCHAIN_TRACING_V2 === "true";

  if (tracingEnabled) {
    const context = {
      agent: agentName,
      timestamp: new Date().toISOString(),
      input,
      output,
    };

    console.log("[TRACE_CONTEXT]", JSON.stringify(context, null, 2));
  }
}
