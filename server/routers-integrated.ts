/**
 * Updated tRPC Routers with Integrated LangGraph Agent
 * 
 * This replaces the basic chat procedures with real LangGraph-powered agent calls
 */

import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { nanoid } from "nanoid";
import { 
  processMessage, 
  resumeAfterApproval,
  getConversationHistory 
} from "./agents/integrated-agent";

const COOKIE_NAME = "session";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  chat: router({
    createConversation: protectedProcedure
      .input(z.object({ threadId: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const threadId = input.threadId || nanoid();
        const conversation = await db.getOrCreateConversation(ctx.user.id, threadId);
        return conversation;
      }),

    getConversations: protectedProcedure
      .query(async ({ ctx }) => {
        return db.getConversationsByUser(ctx.user.id);
      }),

    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input }) => {
        return db.getConversationMessages(input.conversationId);
      }),

    /**
     * Send message and process through integrated LangGraph agent
     * This replaces the basic sendMessage procedure
     */
    sendMessage: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string(),
        threadId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Save user message
        await db.addMessage(input.conversationId, "user", input.content);

        const threadId = input.threadId || String(input.conversationId);

        try {
          // Process through integrated agent with real RAG and checkpointer
          const agentResult = await processMessage(
            input.content,
            threadId,
            String(ctx.user.id)
          );

          // Save assistant response
          await db.addMessage(
            input.conversationId,
            "assistant",
            agentResult.response,
            agentResult.agentType
          );

          // If interrupt required, create interrupt record
          if (agentResult.interruptRequired) {
            const msgList = await db.getConversationMessages(input.conversationId);
            const lastMessage = msgList[msgList.length - 1];
            await db.createInterrupt(
              input.conversationId,
              lastMessage.id,
              agentResult.interruptMessage || ""
            );
          }

          return {
            success: true,
            response: agentResult.response,
            agentType: agentResult.agentType,
            interruptRequired: agentResult.interruptRequired,
          };
        } catch (error) {
          console.error("Error processing message:", error);
          const errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
          await db.addMessage(input.conversationId, "assistant", errorMessage, "error");
          return {
            success: false,
            response: errorMessage,
            agentType: "error",
            interruptRequired: false,
          };
        }
      }),

    /**
     * Add assistant message directly (legacy support)
     */
    addAssistantMessage: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string(),
        agentType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.addMessage(input.conversationId, "assistant", input.content, input.agentType);
        return { success: true };
      }),

    /**
     * Create interrupt for human approval
     */
    createInterrupt: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        messageId: z.number(),
        interruptMessage: z.string(),
      }))
      .mutation(async ({ input }) => {
        await db.createInterrupt(input.conversationId, input.messageId, input.interruptMessage);
        return { success: true };
      }),

    /**
     * Get pending interrupt
     */
    getPendingInterrupt: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input }) => {
        return db.getPendingInterrupt(input.conversationId);
      }),

    /**
     * Resolve interrupt and resume agent with real LangGraph interrupt handling
     */
    resolveInterrupt: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        interruptId: z.number(),
        status: z.enum(["approved", "rejected"]),
        threadId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const threadId = input.threadId || String(input.conversationId);

        try {
          // Resolve interrupt in database
          await db.resolveInterrupt(input.interruptId, input.status);

          // Resume agent with real interrupt handling
          const approved = input.status === "approved";
          const agentResult = await resumeAfterApproval(
            threadId,
            String(ctx.user.id),
            approved
          );

          // Save resumed response
          await db.addMessage(
            input.conversationId,
            "assistant",
            agentResult.response,
            agentResult.agentType
          );

          return {
            success: true,
            response: agentResult.response,
            agentType: agentResult.agentType,
          };
        } catch (error) {
          console.error("Error resolving interrupt:", error);
          return {
            success: false,
            response: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            agentType: "error",
          };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
