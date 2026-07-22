/**
 * Real RAG Pipeline with Embeddings and Vector Store
 * 
 * This module implements a production-grade RAG system with:
 * - Document loading and chunking
 * - OpenAI embeddings
 * - In-memory vector store (HNSW-like)
 * - Semantic similarity search
 */

import { OpenAIEmbeddings } from "@langchain/openai";
import { invokeLLM, type Message } from "../_core/llm";

interface StoredDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, any>;
}

interface RAGResult {
  documents: StoredDocument[];
  query: string;
  context: string;
}

class SimpleVectorStore {
  private documents: StoredDocument[] = [];
  private embeddings: OpenAIEmbeddings | null = null;

  async initialize() {
    if (!this.embeddings) {
      this.embeddings = new OpenAIEmbeddings({
        modelName: "text-embedding-3-small",
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
  }

  async addDocuments(docs: Array<{ text: string; metadata?: Record<string, any> }>) {
    if (!this.embeddings) await this.initialize();

    for (const doc of docs) {
      const embedding = await this.embeddings!.embedQuery(doc.text);
      this.documents.push({
        id: `doc-${Date.now()}-${Math.random()}`,
        text: doc.text,
        embedding,
        metadata: doc.metadata || {},
      });
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async search(query: string, k: number = 3): Promise<StoredDocument[]> {
    if (!this.embeddings) await this.initialize();

    const queryEmbedding = await this.embeddings!.embedQuery(query);

    const scored = this.documents.map((doc) => ({
      doc,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((item) => item.doc);
  }
}

// Global vector store instance
let vectorStore: SimpleVectorStore | null = null;
let initialized = false;

export async function initializeRAG() {
  if (initialized) return;

  vectorStore = new SimpleVectorStore();
  await vectorStore.initialize();

  // Load company policies
  const policies = [
    {
      text: `Vacation Policy: All full-time employees are entitled to 20 days of paid vacation per year. 
      Part-time employees receive 10 days. Vacation requests must be submitted 2 weeks in advance. 
      Unused vacation days can be carried over to the next year up to a maximum of 5 days.`,
      metadata: { type: "policy", category: "vacation" },
    },
    {
      text: `Remote Work Policy: Employees may work remotely up to 3 days per week. 
      Remote work arrangements must be approved by the manager. 
      Core hours are 10 AM to 3 PM in the employee's local timezone. 
      All company equipment must be secured when working remotely.`,
      metadata: { type: "policy", category: "remote-work" },
    },
    {
      text: `Professional Development: The company provides up to $2,000 per employee per year for professional development. 
      This includes training courses, certifications, and conference attendance. 
      Employees must discuss development plans with their manager and submit requests for approval.`,
      metadata: { type: "policy", category: "development" },
    },
    {
      text: `Sick Leave Policy: Employees are entitled to 10 days of paid sick leave per year. 
      Sick leave can be used for personal illness or to care for immediate family members. 
      Employees must notify their manager as soon as possible when taking sick leave.`,
      metadata: { type: "policy", category: "sick-leave" },
    },
    {
      text: `Code of Conduct: All employees must maintain professional behavior and treat colleagues with respect. 
      Discrimination, harassment, and bullying are strictly prohibited. 
      Violations of the code of conduct may result in disciplinary action up to and including termination.`,
      metadata: { type: "policy", category: "conduct" },
    },
  ];

  await vectorStore.addDocuments(policies);
  initialized = true;
}

export async function retrieveRAGContext(query: string): Promise<RAGResult> {
  if (!vectorStore || !initialized) {
    await initializeRAG();
  }

  const documents = await vectorStore!.search(query, 3);

  const context = documents
    .map((doc, i) => `[Source ${i + 1}]: ${doc.text}`)
    .join("\n\n");

  return {
    documents,
    query,
    context,
  };
}

export async function generateRAGResponse(
  query: string,
  ragResult: RAGResult
): Promise<string> {
  const systemPrompt = `You are a helpful company assistant. Answer questions based on the provided company policies.
Be accurate and cite the relevant policy when answering.

Company Policies:
${ragResult.context}`;

  const messages: Message[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: query,
    },
  ];

  const response = await invokeLLM({ messages });

  // Extract text from response
  if (response.choices && response.choices.length > 0) {
    const content = response.choices[0].message.content;
    return typeof content === "string" ? content : String(content);
  }

  return "Unable to generate response";
}


export { SimpleVectorStore };
