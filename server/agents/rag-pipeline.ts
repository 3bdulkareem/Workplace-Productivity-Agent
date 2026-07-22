/**
 * RAG (Retrieval-Augmented Generation) Pipeline
 * 
 * Implements document loading, chunking, and retrieval
 * for the knowledge base.
 */

// Custom text splitter implementation

/**
 * Document interface for RAG
 */
export interface Document {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: Date;
}

/**
 * Document chunk interface
 */
interface DocumentChunk {
  docId: string;
  title: string;
  category: string;
  content: string;
  source: string;
}

/**
 * RAG Pipeline class
 * 
 * Handles document loading, chunking, and retrieval
 */
export class RAGPipeline {
  private chunks: DocumentChunk[] = [];
  private documents: Document[] = [];

  constructor() {
    // RAG pipeline initialized
  }

  /**
   * Load documents into the RAG pipeline
   * 
   * @param documents - Array of documents to load
   */
  async loadDocuments(documents: Document[]): Promise<void> {
    this.documents = documents;
    this.chunks = [];

    // Split documents into chunks using simple character-based splitting
    const chunkSize = 1000;
    const chunkOverlap = 200;

    for (const doc of documents) {
      const docChunks = this.splitText(doc.content, chunkSize, chunkOverlap);

      for (const chunk of docChunks) {
        this.chunks.push({
          docId: doc.id,
          title: doc.title,
          category: doc.category,
          content: chunk,
          source: `${doc.title} (${doc.category})`,
        });
      }
    }

    console.log(`RAG pipeline loaded ${this.chunks.length} document chunks`);
  }

  /**
   * Simple text splitter implementation
   */
  private splitText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);

      // Try to split at a sentence boundary
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf(".", end);
        const lastNewline = text.lastIndexOf("\n", end);
        const splitPoint = Math.max(lastPeriod, lastNewline);

        if (splitPoint > start) {
          end = splitPoint + 1;
        }
      }

      chunks.push(text.substring(start, end).trim());
      start = end - overlap;
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Retrieve relevant documents for a query
   * 
   * @param query - The search query
   * @param topK - Number of top results to return
   * @returns Formatted context string
   */
  async retrieve(query: string, topK: number = 3): Promise<string> {
    if (this.documents.length === 0) {
      return "No documents loaded in the RAG pipeline.";
    }

    try {
      // Simple keyword-based retrieval
      // In production, this would use vector similarity search
      const lowerQuery = query.toLowerCase();
      const queryTerms = lowerQuery.split(/\s+/);

      // Score chunks based on keyword matches
      const scoredChunks = this.chunks.map(chunk => {
        const lowerContent = chunk.content.toLowerCase();
        const lowerTitle = chunk.title.toLowerCase();

        // Count keyword matches
        let score = 0;
        for (const term of queryTerms) {
          if (lowerTitle.includes(term)) score += 3;
          if (lowerContent.includes(term)) score += 1;
        }

        return { chunk, score };
      });

      // Sort by score and get top K
      const topChunks = scoredChunks
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => item.chunk);

      if (topChunks.length === 0) {
        return "No relevant documents found for your query.";
      }

      // Format results as context
      const context = topChunks
        .map(chunk => {
          return `[Source: ${chunk.source}]\n${chunk.content}`;
        })
        .join("\n\n---\n\n");

      return context;
    } catch (error) {
      console.error("RAG retrieval error:", error);
      return "Error retrieving documents from the knowledge base.";
    }
  }

  /**
   * Add a new document to the RAG pipeline
   * 
   * @param document - Document to add
   */
  async addDocument(document: Document): Promise<void> {
    this.documents.push(document);
    await this.loadDocuments(this.documents);
  }

  /**
   * Get all loaded documents
   */
  getDocuments(): Document[] {
    return this.documents;
  }

  /**
   * Clear all documents from the pipeline
   */
  async clear(): Promise<void> {
    this.documents = [];
    this.chunks = [];
  }
}

/**
 * Sample company policy documents for initialization
 */
export const SAMPLE_DOCUMENTS: Document[] = [
  {
    id: "policy-001",
    title: "Vacation Policy",
    category: "HR Policies",
    content: `
    Vacation Policy

    All full-time employees are entitled to the following vacation days per year:
    - New employees (0-1 year): 10 days
    - Employees (1-5 years): 15 days
    - Senior employees (5+ years): 20 days

    Vacation requests must be submitted at least 2 weeks in advance.
    Managers will approve or deny requests based on business needs.
    Unused vacation days can be carried over to the next year (maximum 5 days).
    `,
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "policy-002",
    title: "Remote Work Policy",
    category: "Work Policies",
    content: `
    Remote Work Policy

    Employees are allowed to work remotely up to 3 days per week.
    Remote work days must be coordinated with your manager.
    
    Requirements for remote work:
    - Stable internet connection
    - Quiet workspace
    - Company-provided equipment
    - Regular communication with team

    Remote work is not permitted for certain roles that require on-site presence.
    `,
    createdAt: new Date("2024-01-15"),
  },
  {
    id: "policy-003",
    title: "Professional Development",
    category: "Employee Benefits",
    content: `
    Professional Development Program

    The company supports employee growth through:
    - Annual training budget of $2,000 per employee
    - Online course access (Coursera, LinkedIn Learning)
    - Conference attendance (with manager approval)
    - Internal mentorship programs
    - Tuition reimbursement for job-related degrees

    Employees must discuss development goals with their manager quarterly.
    `,
    createdAt: new Date("2024-02-01"),
  },
];

/**
 * Initialize RAG pipeline with sample documents
 */
export async function initializeRAGPipeline(): Promise<RAGPipeline> {
  const pipeline = new RAGPipeline();

  try {
    await pipeline.loadDocuments(SAMPLE_DOCUMENTS);
    console.log("RAG pipeline initialized with sample documents");
  } catch (error) {
    console.error("Error initializing RAG pipeline:", error);
  }

  return pipeline;
}

/**
 * Global RAG pipeline instance
 */
let globalRAGPipeline: RAGPipeline | null = null;

/**
 * Get or initialize the global RAG pipeline
 */
export async function getRAGPipeline(): Promise<RAGPipeline> {
  if (!globalRAGPipeline) {
    globalRAGPipeline = await initializeRAGPipeline();
  }
  return globalRAGPipeline;
}
