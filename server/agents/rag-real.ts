/**
 * Real RAG Pipeline with Local Embeddings and Manus LLM
 * 
 * This module implements a production-grade RAG system with:
 * - Document loading and chunking
 * - Local TF-IDF embeddings (no external API needed)
 * - In-memory vector store
 * - Semantic similarity search
 * - Manus built-in LLM for generation
 */

import { invokeLLM, type Message, type InvokeResult } from "../_core/llm";

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

/**
 * Simple TF-IDF based embeddings (no external API needed)
 */
class LocalEmbeddings {
  private vocabulary: Map<string, number> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private totalDocs = 0;

  addDocument(text: string) {
    const words = this.tokenize(text);
    const uniqueWords = new Set(words);
    
    uniqueWords.forEach(word => {
      this.documentFrequency.set(word, (this.documentFrequency.get(word) || 0) + 1);
    });
    
    words.forEach(word => {
      if (!this.vocabulary.has(word)) {
        this.vocabulary.set(word, this.vocabulary.size);
      }
    });
    
    this.totalDocs++;
  }

  async embedQuery(text: string): Promise<number[]> {
    const words = this.tokenize(text);
    const embedding = new Array(Math.min(this.vocabulary.size, 100)).fill(0);
    
    words.forEach(word => {
      const idx = this.vocabulary.get(word);
      if (idx !== undefined && idx < embedding.length) {
        const tf = words.filter(w => w === word).length / words.length;
        const idf = Math.log((this.totalDocs + 1) / (this.documentFrequency.get(word) || 1));
        embedding[idx] = tf * idf;
      }
    });
    
    return embedding;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }
}

class SimpleVectorStore {
  private documents: StoredDocument[] = [];
  private embeddings: LocalEmbeddings;

  constructor() {
    this.embeddings = new LocalEmbeddings();
  }

  async addDocuments(docs: Array<{ text: string; metadata?: Record<string, any> }>) {
    for (const doc of docs) {
      this.embeddings.addDocument(doc.text);
      const embedding = await this.embeddings.embedQuery(doc.text);
      this.documents.push({
        id: `doc-${Date.now()}-${Math.random()}`,
        text: doc.text,
        embedding,
        metadata: doc.metadata || {},
      });
    }
  }

  async search(query: string, topK = 3): Promise<StoredDocument[]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);
    
    const scored = this.documents.map(doc => ({
      doc,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => item.doc);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const minLen = Math.min(a.length, b.length);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < minLen; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

// Global vector store instance
let vectorStore: SimpleVectorStore | null = null;

/**
 * Initialize RAG pipeline with company policies
 */
export async function initializeRAG() {
  if (vectorStore) return vectorStore;

  vectorStore = new SimpleVectorStore();

  const policies = [
    {
      text: "Company Leave Policy: Employees are entitled to 20 days of annual leave per year. Leave must be requested at least 2 weeks in advance. Emergency leave can be approved with immediate notice.",
      metadata: { category: "HR", policy: "Leave" },
    },
    {
      text: "Remote Work Policy: Employees can work from home up to 3 days per week. Remote work must be approved by manager. Core hours are 10 AM to 4 PM.",
      metadata: { category: "HR", policy: "Remote Work" },
    },
    {
      text: "Code of Conduct: All employees must maintain professional behavior. Harassment and discrimination are strictly prohibited. Violations will result in disciplinary action.",
      metadata: { category: "HR", policy: "Code of Conduct" },
    },
    {
      text: "Expense Policy: All business expenses must be approved before purchase. Receipts must be submitted within 7 days. Personal expenses will not be reimbursed.",
      metadata: { category: "Finance", policy: "Expenses" },
    },
    {
      text: "Data Security Policy: All company data must be encrypted. Passwords must be changed every 90 days. Unauthorized access is prohibited and will be reported to security.",
      metadata: { category: "IT", policy: "Security" },
    },
  ];

  await vectorStore.addDocuments(policies);
  return vectorStore;
}

/**
 * Search for relevant documents using RAG
 */
export async function searchRAG(query: string): Promise<RAGResult> {
  const store = await initializeRAG();
  const documents = await store.search(query, 3);
  
  const context = documents
    .map(doc => `[${doc.metadata.category}] ${doc.text}`)
    .join("\n\n");

  return {
    documents,
    query,
    context,
  };
}

/**
 * RAG Agent that retrieves documents and generates responses
 */
export async function ragAgent(userMessage: string): Promise<string> {
  try {
    // Search for relevant documents
    const ragResult = await searchRAG(userMessage);
    
    // If no relevant documents found
    if (ragResult.documents.length === 0) {
      return "I couldn't find relevant company policies for your question. Please contact HR for more information.";
    }

    // Generate response using Manus LLM with RAG context
    const systemPrompt = `You are a helpful company assistant. Use the provided company policies to answer questions accurately and professionally. If the information is not in the policies, say so.

Company Policies:
${ragResult.context}`;

    const messages: Message[] = [
      { role: "user", content: userMessage }
    ];

    // Add system message to messages
    const messagesWithSystem: Message[] = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const response = await invokeLLM({
      model: "gpt-4o-mini",
      messages: messagesWithSystem,
    });

    const content = response.choices[0]?.message.content;
    if (typeof content === "string") {
      return content;
    } else if (Array.isArray(content)) {
      return content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join(" ");
    }
    return "No response generated.";
  } catch (error) {
    console.error("[RAG Agent] Error:", error);
    return "I encountered an error while processing your request. Please try again.";
  }
}
