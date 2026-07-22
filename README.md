# Workplace Productivity Agent

**Student Name:** عبدالكريم المالكي

## Project Overview

This is a full-stack web application for the Workplace Productivity Agent, designed to assist users with various tasks using AI agents. It features a professional chat interface, a multi-agent system (RAG, Summarizer, Web Search), Human-in-the-Loop (HITL) for approvals, persistent conversation history, and Manus OAuth authentication.

## Features

- **Interactive Chat Interface**: Real-time conversations with AI agents.
- **Multi-Agent System**: Integrates RAG, Summarizer, and Web Search capabilities.
- **Human-in-the-Loop (HITL)**: User approval for sensitive operations like web searches.
- **Persistent Conversations**: All chat history is stored in a MySQL/TiDB database.
- **User Authentication**: Secure login via Manus OAuth.
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices.

## Technology Stack

- **Frontend**: React 19, Tailwind CSS 4, TypeScript
- **Backend**: Express, tRPC, Node.js
- **Database**: MySQL/TiDB with Drizzle ORM
- **Testing**: Vitest
- **Authentication**: Manus OAuth
- **AI Integration**: LangChain/LangGraph (planned integration)

## Setup and Installation

### Prerequisites

- Node.js 22+
- pnpm package manager
- MySQL/TiDB database

### Installation Steps

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/3bdulkareem/Workplace-Productivity-Agent.git
    cd Workplace-Productivity-Agent
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Database Setup:**
    - Ensure your MySQL/TiDB database is running.
    - Generate database migrations:
      ```bash
      pnpm drizzle-kit generate
      ```
    - Apply the generated SQL migrations to your database. (Refer to `drizzle/migrations` for SQL files).

4.  **Environment Variables:**
    Configure the following environment variables in your `.env` file or through the Manus Management UI:
    - `DATABASE_URL`: Your MySQL/TiDB connection string.
    - `JWT_SECRET`: A secret key for session signing.
    - `VITE_APP_ID`: Your Manus OAuth application ID.
    - `OAUTH_SERVER_URL`: Manus OAuth backend base URL.
    - `VITE_OAUTH_PORTAL_URL`: Manus login portal URL.
    - `LANGCHAIN_API_KEY`: Your LangChain API key (for LangSmith tracing).
    - `LANGCHAIN_TRACING_V2`: Set to `true` for LangSmith tracing.

5.  **Start the development server:**
    ```bash
    pnpm dev
    ```
    The application will be accessible at `http://localhost:3000`.

## LangGraph Integration

This project is designed for integration with LangGraph to power its multi-agent system. The `LANGGRAPH_INTEGRATION.md` file provides detailed instructions on how to connect the LangGraph backend (either Node.js or Python bridge) with this web application.

## Testing

To run all tests:

```bash
pnpm test
```

This project includes comprehensive Vitest tests for database helpers, tRPC procedures, and end-to-end conversation flows.

## Deployment

To deploy the application, create a checkpoint via the Manus Management UI and click the "Publish" button. The application will be deployed to production with auto-scaling capabilities.

## Contact

For any questions or support, please refer to the documentation or contact the project maintainers.
