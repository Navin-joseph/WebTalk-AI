const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  ExternalHyperlink, UnderlineType
} = require("docx");
const fs = require("fs");

const BRAND = "7C3AED"; // violet-600
const BRAND_LIGHT = "EDE9FE"; // violet-100
const SLATE_800 = "1E293B";
const SLATE_600 = "475569";
const SLATE_400 = "94A3B8";
const WHITE = "FFFFFF";
const BORDER_COLOR = "E2E8F0";
const GREEN = "059669";
const BLUE = "2563EB";
const ORANGE = "D97706";

const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 36, color: SLATE_800 })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND, space: 4 } },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 28, color: BRAND })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 24, color: SLATE_800 })]
  });
}

function p(text, options = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: SLATE_600, ...options })]
  });
}

function bullet(text, bold_prefix = "") {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [
      ...(bold_prefix ? [new TextRun({ text: bold_prefix + ": ", bold: true, font: "Arial", size: 22, color: SLATE_800 })] : []),
      new TextRun({ text, font: "Arial", size: 22, color: SLATE_600 })
    ]
  });
}

function sub_bullet(text) {
  return new Paragraph({
    numbering: { reference: "sub-bullets", level: 0 },
    spacing: { before: 20, after: 20 },
    children: [new TextRun({ text, font: "Arial", size: 20, color: SLATE_600 })]
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function spacer() {
  return new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun("")] });
}

function infoBox(title, text, color = BRAND_LIGHT, borderColor = BRAND) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [new TableCell({
          borders: {
            top: { style: BorderStyle.SINGLE, size: 6, color: borderColor },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
            left: { style: BorderStyle.SINGLE, size: 16, color: borderColor },
            right: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
          },
          shading: { fill: color, type: ShadingType.CLEAR },
          margins: { top: 160, bottom: 160, left: 200, right: 200 },
          width: { size: 9360, type: WidthType.DXA },
          children: [
            ...(title ? [new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: title, bold: true, font: "Arial", size: 22, color: SLATE_800 })] })] : []),
            new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text, font: "Arial", size: 21, color: SLATE_600 })] }),
          ]
        })]
      })
    ]
  });
}

function twoCol(leftContent, rightContent, leftWidth = 4680, rightWidth = 4680) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    rows: [new TableRow({
      children: [
        new TableCell({
          borders: noBorders,
          width: { size: leftWidth, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 0, right: 160 },
          children: leftContent
        }),
        new TableCell({
          borders: noBorders,
          width: { size: rightWidth, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 160, right: 0 },
          children: rightContent
        })
      ]
    })]
  });
}

function stackTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders,
      shading: { fill: BRAND, type: ShadingType.CLEAR },
      width: { size: colWidths[i], type: WidthType.DXA },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 20, color: WHITE })] })]
    }))
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      borders,
      shading: { fill: ri % 2 === 0 ? "F8FAFC" : WHITE, type: ShadingType.CLEAR },
      width: { size: colWidths[ci], type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      children: [new Paragraph({ children: [new TextRun({ text: cell, font: "Arial", size: 20, color: SLATE_600 })] })]
    }))
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows]
  });
}

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22, color: SLATE_600 } }
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: SLATE_800 },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: BRAND },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 1 }
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: SLATE_800 },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 }
      },
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "sub-bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } }
        }]
      },
      {
        reference: "numbered",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND, space: 4 } },
          spacing: { before: 0, after: 160 },
          children: [
            new TextRun({ text: "WebTalk AI", bold: true, font: "Arial", size: 20, color: BRAND }),
            new TextRun({ text: "  |  Product Requirements Document  |  Confidential", font: "Arial", size: 20, color: SLATE_400 }),
          ]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 4 } },
          spacing: { before: 160, after: 0 },
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 18, color: SLATE_400 }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: SLATE_400 }),
            new TextRun({ text: " of ", font: "Arial", size: 18, color: SLATE_400 }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 18, color: SLATE_400 }),
          ]
        })]
      })
    },
    children: [

      // ─────────────────────────────────────────────────────
      // COVER PAGE
      // ─────────────────────────────────────────────────────
      new Paragraph({ spacing: { before: 1440, after: 0 }, children: [new TextRun("")] }),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: "WebTalk AI", bold: true, font: "Arial", size: 72, color: BRAND })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 160 },
        children: [new TextRun({ text: "Product Requirements Document", font: "Arial", size: 36, color: SLATE_600 })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 800 },
        children: [new TextRun({ text: "AI Voice & Text Agent Platform for Business", font: "Arial", size: 26, color: SLATE_400 })]
      }),

      new Table({
        width: { size: 6000, type: WidthType.DXA },
        columnWidths: [3000, 3000],
        rows: [
          new TableRow({ children: [
            new TableCell({
              borders: noBorders, shading: { fill: "F5F3FF", type: ShadingType.CLEAR },
              margins: { top: 160, bottom: 160, left: 200, right: 200 },
              width: { size: 3000, type: WidthType.DXA },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Version", bold: true, font: "Arial", size: 20, color: SLATE_400 })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "1.0", bold: true, font: "Arial", size: 28, color: BRAND })] }),
              ]
            }),
            new TableCell({
              borders: noBorders, shading: { fill: "F5F3FF", type: ShadingType.CLEAR },
              margins: { top: 160, bottom: 160, left: 200, right: 200 },
              width: { size: 3000, type: WidthType.DXA },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Status", bold: true, font: "Arial", size: 20, color: SLATE_400 })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Active Development", bold: true, font: "Arial", size: 22, color: GREEN })] }),
              ]
            }),
          ]})
        ]
      }),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 1. EXECUTIVE SUMMARY
      // ─────────────────────────────────────────────────────
      h1("1. Executive Summary"),

      infoBox(
        "What is WebTalk AI?",
        "WebTalk AI is a multi-tenant SaaS platform that lets businesses deploy AI-powered voice and text agents trained on their own website content. Clients embed a lightweight JavaScript widget on their site; end-users can then interact with it via text or voice in real time. The AI is grounded in the client's actual knowledge base using Retrieval-Augmented Generation (RAG).",
        "F5F3FF", BRAND
      ),

      spacer(),

      p("WebTalk AI solves a core problem for small-to-medium businesses: they need intelligent, always-available customer support agents but lack the resources to build or maintain them. WebTalk AI provides a full turnkey solution — crawl the website, train the AI, embed the widget, and go live within minutes."),

      spacer(),

      h3("Key Differentiators"),
      bullet("Real-time voice interaction with <100ms lip-sync using Simli.ai WebRTC avatars"),
      bullet("No-code setup: paste one script tag to deploy a fully-trained AI agent"),
      bullet("RAG pipeline grounds every response in the client's actual website content"),
      bullet("Multi-tenant isolation: each client's data and knowledge base is fully separated"),
      bullet("Sub-50ms LLM responses via Groq's optimized inference infrastructure"),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 2. TECH STACK
      // ─────────────────────────────────────────────────────
      h1("2. Technology Stack"),

      p("WebTalk AI uses a modern, cloud-native stack optimized for low latency and real-time AI interactions."),
      spacer(),

      stackTable(
        ["Layer", "Technology", "Purpose", "Notes"],
        [
          ["Frontend / Dashboard", "Next.js 14", "Client dashboard, analytics, settings", "Deployed on Vercel"],
          ["Backend API", "FastAPI (Python)", "REST + WebSocket API, RAG pipeline, voice processing", "Deployed on Render"],
          ["Auth & Database", "Supabase (PostgreSQL)", "User auth, client data, conversations, analytics", "Row-Level Security enabled"],
          ["Cache", "Redis", "Session caching, rate limiting, job queues", "Via Upstash or local"],
          ["Vector Database", "Qdrant", "Embedding storage and semantic search for RAG", "Cloud-hosted"],
          ["LLM", "Groq API (Llama-3.1-8B-Instant)", "Fast AI text generation", "Sub-50ms latency"],
          ["Web Crawler", "Playwright + BeautifulSoup", "Scrape and parse client website content", "Async, JS-rendered pages"],
          ["Speech-to-Text", "Deepgram Nova-3", "Real-time audio transcription", "Lowest latency STT"],
          ["Text-to-Speech", "Cartesia Sonic-3.5", "80-150ms streaming audio synthesis", "SSE streaming"],
          ["Avatar / Lip-sync", "Simli.ai WebRTC", "Realistic talking head with real-time lip-sync", "PCM-16 audio input"],
          ["Real-time Comm.", "WebSockets", "Bidirectional voice pipeline streaming", "Full-duplex audio"],
          ["Embeddings", "Groq nomic-embed-text-v1.5", "Text-to-vector conversion for RAG", "768-dim vectors"],
          ["Deployment", "Docker + Vercel + Render", "Containerized backend, serverless frontend", "CI/CD via GitHub"],
        ],
        [2400, 2200, 2760, 2000]
      ),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 3. SYSTEM ARCHITECTURE
      // ─────────────────────────────────────────────────────
      h1("3. System Architecture"),

      h2("3.1 High-Level Architecture"),

      infoBox("Architecture Flow", [
        "Client Website",
        "  └── Embeddable Widget (JS SDK / widget.js)",
        "       └── WebSocket + HTTP",
        "            └── FastAPI Backend (Render)",
        "                 ├── Groq API  →  LLM Inference (Llama-3.1-8B-Instant)",
        "                 ├── RAG Engine  →  Qdrant (Vector Search)",
        "                 ├── Deepgram  →  Speech-to-Text (Nova-3)",
        "                 ├── Cartesia  →  Text-to-Speech (Sonic-3.5)",
        "                 └── Supabase  →  Auth + PostgreSQL + Analytics",
      ].join("\n"), "F8FAFC", SLATE_400),

      spacer(),

      h2("3.2 Multi-Tenancy Model"),
      p("Every resource in WebTalk AI is scoped to a client_id. This applies at every layer:"),
      bullet("Database: Every table row has a client_id column. Supabase Row Level Security (RLS) enforces tenant isolation."),
      bullet("Vector DB: Each client has a dedicated Qdrant collection named after their client_id."),
      bullet("API Keys: Clients authenticate via hashed API keys (wtk_ prefix) that map to their client_id."),
      bullet("WebSocket Sessions: Each session carries the client_id; all RAG queries are scoped to that collection."),

      spacer(),

      h2("3.3 Voice Pipeline (WebSocket Flow)"),
      p("The complete voice interaction flow for a single user turn:"),

      stackTable(
        ["Step", "Component", "Action", "Latency Target"],
        [
          ["1", "Browser (Mic)", "Capture audio chunks via MediaRecorder API", "Real-time"],
          ["2", "WebSocket", "Stream raw audio bytes to FastAPI backend", "<10ms"],
          ["3", "Deepgram Nova-3", "Transcribe audio to text (STT)", "<50ms"],
          ["4", "RAG Engine", "Embed query, search Qdrant for relevant context", "<100ms"],
          ["5", "Groq Llama-3.1-8B", "Generate response with RAG context", "<50ms"],
          ["6", "Cartesia Sonic-3.5", "Stream text-to-speech as MP3 chunks (SSE)", "First byte <100ms"],
          ["7", "Browser / Simli", "Play audio locally + send PCM-16 to Simli for lip-sync", "Real-time"],
          ["8", "Simli.ai WebRTC", "Animate avatar face in sync with audio", "<50ms"],
        ],
        [500, 1800, 3200, 1860]
      ),

      spacer(),

      h2("3.4 RAG Pipeline"),
      p("The Retrieval-Augmented Generation pipeline ensures all AI responses are grounded in the client's website:"),

      bullet("Crawl", "Client provides website URL"),
      sub_bullet("Playwright crawls all pages (handles JavaScript-rendered content)"),
      sub_bullet("BeautifulSoup extracts clean text from HTML"),
      sub_bullet("Content is chunked, deduplicated, and stored"),

      bullet("Embed", "Text chunks converted to 768-dim vectors via nomic-embed-text-v1.5"),
      sub_bullet("Each vector stored in Qdrant under client's collection"),
      sub_bullet("Training job status tracked in training_jobs table"),

      bullet("Retrieve", "At query time, user message is embedded"),
      sub_bullet("Top-K most relevant chunks retrieved from Qdrant"),
      sub_bullet("Context injected into Groq LLM system prompt"),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 4. DATABASE SCHEMA
      // ─────────────────────────────────────────────────────
      h1("4. Database Schema (Supabase PostgreSQL)"),

      p("All tables are in Supabase (PostgreSQL) with Row Level Security enabled. Every table except users includes a client_id foreign key for multi-tenant isolation."),
      spacer(),

      h3("clients"),
      stackTable(
        ["Column", "Type", "Description"],
        [
          ["id", "UUID (PK)", "Unique client identifier"],
          ["user_id", "UUID (FK)", "Reference to Supabase auth user"],
          ["company_name", "TEXT", "Business name"],
          ["website_url", "TEXT", "Primary website to train on"],
          ["agent_name", "TEXT", "Display name of the AI agent"],
          ["system_prompt", "TEXT", "Custom instructions for the AI agent"],
          ["created_at", "TIMESTAMPTZ", "Account creation timestamp"],
          ["updated_at", "TIMESTAMPTZ", "Last modification timestamp"],
        ],
        [2200, 1800, 5360]
      ),
      spacer(),

      h3("conversations"),
      stackTable(
        ["Column", "Type", "Description"],
        [
          ["id", "UUID (PK)", "Unique conversation identifier"],
          ["client_id", "UUID (FK)", "Tenant scope"],
          ["session_id", "TEXT", "Groups messages in one session"],
          ["role", "TEXT", "user or assistant"],
          ["content", "TEXT", "Message text"],
          ["metadata", "JSONB", "Sources, latency, token counts"],
          ["created_at", "TIMESTAMPTZ", "Message timestamp"],
        ],
        [2200, 1800, 5360]
      ),
      spacer(),

      h3("training_jobs"),
      stackTable(
        ["Column", "Type", "Description"],
        [
          ["id", "UUID (PK)", "Job identifier"],
          ["client_id", "UUID (FK)", "Tenant scope"],
          ["status", "TEXT", "pending / running / completed / failed"],
          ["url", "TEXT", "Website URL being crawled"],
          ["pages_crawled", "INTEGER", "Number of pages processed"],
          ["chunks_indexed", "INTEGER", "Number of vectors stored in Qdrant"],
          ["error", "TEXT", "Error message if failed"],
          ["started_at", "TIMESTAMPTZ", "Job start time"],
          ["completed_at", "TIMESTAMPTZ", "Job completion time"],
        ],
        [2200, 1800, 5360]
      ),
      spacer(),

      h3("api_keys"),
      stackTable(
        ["Column", "Type", "Description"],
        [
          ["id", "UUID (PK)", "Key identifier"],
          ["client_id", "UUID (FK)", "Tenant scope"],
          ["name", "TEXT", "Human-readable label e.g. Production widget"],
          ["key_hash", "TEXT", "Bcrypt hash of the actual key"],
          ["key_prefix", "TEXT", "First 8 chars shown in dashboard (wtk_...)"],
          ["last_used_at", "TIMESTAMPTZ", "Last successful authentication"],
          ["created_at", "TIMESTAMPTZ", "Key creation timestamp"],
        ],
        [2200, 1800, 5360]
      ),
      spacer(),

      h3("analytics"),
      stackTable(
        ["Column", "Type", "Description"],
        [
          ["id", "UUID (PK)", "Event identifier"],
          ["client_id", "UUID (FK)", "Tenant scope"],
          ["event_type", "TEXT", "conversation_start / tts_request / stt_request etc."],
          ["session_id", "TEXT", "Session grouping"],
          ["metadata", "JSONB", "Latencies, model used, token counts"],
          ["created_at", "TIMESTAMPTZ", "Event timestamp"],
        ],
        [2200, 1800, 5360]
      ),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 5. API REFERENCE
      // ─────────────────────────────────────────────────────
      h1("5. API Reference"),

      h2("5.1 Widget API (Public — API Key Auth)"),
      p("Used by the embedded widget.js. Authenticated via X-API-Key header."),
      spacer(),

      stackTable(
        ["Method", "Endpoint", "Description"],
        [
          ["POST", "/api/v1/widget/bootstrap", "Validate API key, return tenant config (name, colors, system prompt)"],
          ["POST", "/api/v1/widget/chat/stream", "SSE stream — send user message, receive token-by-token AI response"],
          ["POST", "/api/v1/widget/tts", "One-shot TTS — returns full MP3 blob"],
          ["POST", "/api/v1/widget/tts/stream", "Streaming TTS — returns MP3 bytes as they generate (<100ms first byte)"],
          ["WebSocket", "/api/v1/widget/voice", "Full duplex voice — stream audio in, receive TTS audio + transcript out"],
        ],
        [900, 3100, 5360]
      ),

      spacer(),
      h2("5.2 Dashboard API (Private — Bearer Token Auth)"),
      p("Used by the Next.js dashboard. Authenticated via Supabase JWT Bearer token."),
      spacer(),

      stackTable(
        ["Method", "Endpoint", "Description"],
        [
          ["GET", "/api/v1/clients/me", "Get current client profile"],
          ["PATCH", "/api/v1/clients/me", "Update client profile (name, prompt, colors)"],
          ["GET", "/api/v1/clients/me/api-keys", "List all API keys"],
          ["POST", "/api/v1/clients/me/api-keys", "Create new API key (returns plain key once)"],
          ["DELETE", "/api/v1/clients/me/api-keys/{id}", "Revoke API key"],
          ["POST", "/api/v1/training/crawl", "Start crawl + embed training job"],
          ["GET", "/api/v1/training/jobs", "List training jobs with status"],
          ["GET", "/api/v1/conversations", "List conversations with pagination"],
          ["GET", "/api/v1/analytics/summary", "Get aggregate stats (messages, sessions, latency)"],
          ["POST", "/api/v1/conversations/assistant/stream", "Dashboard AI assistant (SSE stream)"],
          ["POST", "/api/v1/conversations/tts", "TTS for dashboard AI (blob)"],
          ["POST", "/api/v1/conversations/tts/stream", "TTS for dashboard AI (streaming)"],
        ],
        [900, 3300, 5160]
      ),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 6. EMBEDDABLE WIDGET
      // ─────────────────────────────────────────────────────
      h1("6. Embeddable Widget (widget.js)"),

      h2("6.1 Overview"),
      p("The widget is a single self-contained JavaScript file hosted at https://web-talk-ai.vercel.app/widget.js. It injects a floating chat panel into any website with zero dependencies."),

      spacer(),
      h2("6.2 Embed Code"),
      infoBox("Minimal Embed (Text only)", [
        '<script defer src="https://web-talk-ai.vercel.app/widget.js"></script>',
        '<script>',
        'document.addEventListener("DOMContentLoaded", function () {',
        '  WebTalkAI.init({',
        '    apiKey: "YOUR_API_KEY",',
        '    theme: "light",',
        '    position: "bottom-right",',
        '    voiceEnabled: true,',
        '    ttsAutoPlay: true',
        '  });',
        '});',
        '</script>',
      ].join("\n"), "F0FDF4", "059669"),

      spacer(),
      infoBox("Full Embed (With Simli.ai Talking Avatar)", [
        '<script defer src="https://web-talk-ai.vercel.app/widget.js"></script>',
        '<script>',
        'document.addEventListener("DOMContentLoaded", function () {',
        '  WebTalkAI.init({',
        '    apiKey: "YOUR_API_KEY",',
        '    simliApiKey: "YOUR_SIMLI_API_KEY",',
        '    simliFaceId: "YOUR_SIMLI_FACE_ID",',
        '    theme: "light",',
        '    position: "bottom-right",',
        '    voiceEnabled: true,',
        '    ttsAutoPlay: true',
        '  });',
        '});',
        '</script>',
      ].join("\n"), "EFF6FF", BLUE),

      spacer(),
      h2("6.3 Configuration Options"),
      stackTable(
        ["Option", "Type", "Default", "Description"],
        [
          ["apiKey", "string", "required", "Widget API key from Dashboard > Install & API Keys"],
          ["theme", "string", "light", "Color scheme: light or dark"],
          ["position", "string", "bottom-right", "Widget position: bottom-right or bottom-left"],
          ["voiceEnabled", "boolean", "true", "Show microphone button for voice input (Deepgram STT)"],
          ["ttsAutoPlay", "boolean", "true", "Auto-play AI responses as speech (Cartesia TTS)"],
          ["simliApiKey", "string", "null", "Optional: Simli.ai API key for realistic talking avatar"],
          ["simliFaceId", "string", "null", "Optional: Simli.ai Face ID for avatar appearance"],
        ],
        [1800, 900, 1200, 5460]
      ),

      spacer(),
      h2("6.4 Simli.ai Avatar Integration"),
      p("When simliApiKey and simliFaceId are provided, the widget activates the Simli.ai WebRTC avatar:"),
      bullet("Simli.ai streams a real-time WebRTC video of a realistic talking human face"),
      bullet("PCM-16 audio (16kHz, mono, little-endian) is sent to Simli.sendAudioData() for lip sync"),
      bullet("The widget uses the blob TTS endpoint (not streaming) when Simli is active, to obtain the full audio blob for PCM-16 conversion"),
      bullet("A dark gradient loading screen animates while the WebRTC connection establishes (~2-3 seconds)"),
      bullet("Simli sessions have a 600-second idle timeout with automatic reconnect on drop"),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 7. DASHBOARD
      // ─────────────────────────────────────────────────────
      h1("7. Dashboard (Next.js)"),

      h2("7.1 Pages"),
      stackTable(
        ["Route", "Page", "Features"],
        [
          ["/dashboard", "Overview", "Stats cards: total conversations, sessions, avg latency, active training jobs"],
          ["/dashboard/training", "Training", "Enter URL, start crawl, view job progress, pages/chunks stats"],
          ["/dashboard/conversations", "Conversations", "Browse conversation history, session replay, search by keyword"],
          ["/dashboard/analytics", "Analytics", "Charts: message volume, voice vs text, latency trends, top questions"],
          ["/dashboard/clients", "Install & API Keys", "Create/revoke API keys, copy embed snippet with Simli credentials"],
        ],
        [2000, 1800, 5560]
      ),

      spacer(),
      h2("7.2 DashboardAI Assistant"),
      p("Every dashboard page includes a floating AI assistant panel (bottom-right corner) that:"),
      bullet("Connects to the same backend AI pipeline as the widget"),
      bullet("Displays a Simli.ai WebRTC avatar (configured via NEXT_PUBLIC_SIMLI_API_KEY and NEXT_PUBLIC_SIMLI_FACE_ID env vars)"),
      bullet("Supports text and voice input for questions about the platform"),
      bullet("Uses the same TTS pipeline with lip-sync to Simli avatar"),

      spacer(),
      h2("7.3 Environment Variables (Vercel)"),
      stackTable(
        ["Variable", "Description"],
        [
          ["NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL"],
          ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon/public API key"],
          ["NEXT_PUBLIC_API_URL", "FastAPI backend URL (e.g. https://webtalk-ai.onrender.com)"],
          ["NEXT_PUBLIC_SIMLI_API_KEY", "Simli.ai API key for dashboard avatar"],
          ["NEXT_PUBLIC_SIMLI_FACE_ID", "Simli.ai Face ID for dashboard avatar"],
        ],
        [3200, 6160]
      ),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 8. BACKEND
      // ─────────────────────────────────────────────────────
      h1("8. Backend (FastAPI)"),

      h2("8.1 Environment Variables (Render)"),
      stackTable(
        ["Variable", "Description"],
        [
          ["SECRET_KEY", "JWT signing key"],
          ["SUPABASE_URL", "Supabase project URL"],
          ["SUPABASE_ANON_KEY", "Supabase anon key"],
          ["SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key (admin operations)"],
          ["REDIS_URL", "Redis connection URL"],
          ["QDRANT_URL", "Qdrant cloud cluster URL"],
          ["QDRANT_API_KEY", "Qdrant API key"],
          ["GROQ_API_KEY", "Groq API key for LLM and embeddings"],
          ["GROQ_MODEL", "LLM model (default: llama-3.1-8b-instant)"],
          ["GROQ_EMBEDDING_MODEL", "Embedding model (default: nomic-embed-text-v1_5)"],
          ["DEEPGRAM_API_KEY", "Deepgram API key for STT"],
          ["DEEPGRAM_STT_MODEL", "STT model (default: nova-3)"],
          ["TTS_PROVIDER", "TTS provider: cartesia or elevenlabs"],
          ["CARTESIA_API_KEY", "Cartesia API key"],
          ["CARTESIA_VOICE_ID", "Cartesia voice UUID"],
          ["CARTESIA_MODEL_ID", "Cartesia model (default: sonic-3.5)"],
          ["ELEVENLABS_API_KEY", "ElevenLabs API key (fallback TTS)"],
          ["ELEVENLABS_VOICE_ID", "ElevenLabs voice ID"],
          ["ALLOWED_ORIGINS", "JSON array of allowed CORS origins"],
        ],
        [3200, 6160]
      ),

      spacer(),
      h2("8.2 Key Backend Modules"),
      stackTable(
        ["File", "Purpose"],
        [
          ["backend/app/config.py", "Pydantic settings loaded from .env — single source of truth for all config"],
          ["backend/app/voice/stt.py", "Deepgram STT wrapper — transcribes PCM audio to text"],
          ["backend/app/voice/tts.py", "Cartesia + ElevenLabs TTS — synthesize() and synthesize_stream() methods"],
          ["backend/app/rag/", "RAG pipeline — embed, store, retrieve from Qdrant"],
          ["backend/app/crawler/", "Playwright web crawler — crawl URLs, extract text, chunk content"],
          ["backend/app/api/widget.py", "Widget API routes — bootstrap, chat, TTS, voice WebSocket"],
          ["backend/app/api/training.py", "Training API routes — start crawl, track job status"],
          ["backend/app/api/conversations.py", "Dashboard API routes — conversation history, AI assistant"],
        ],
        [3200, 6160]
      ),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 9. DEVELOPMENT PHASES
      // ─────────────────────────────────────────────────────
      h1("9. Development Phases"),

      stackTable(
        ["Phase", "Name", "Status", "Key Deliverables"],
        [
          ["1", "Repository Setup", "COMPLETE", "Git + GitHub, project structure, CLAUDE.md"],
          ["2", "FastAPI Scaffolding", "COMPLETE", "Backend routes, middleware, health checks"],
          ["3", "Supabase Schema + Auth", "COMPLETE", "All tables, RLS policies, auth flows"],
          ["4", "Groq LLM Integration", "COMPLETE", "Chat stream, RAG context injection"],
          ["5", "Website Crawler", "COMPLETE", "Playwright crawl, BeautifulSoup parse, Qdrant index"],
          ["6", "RAG Pipeline", "COMPLETE", "Query embed, vector search, LLM with context"],
          ["7", "Voice AI", "COMPLETE", "Deepgram STT + Cartesia TTS over WebSocket"],
          ["8", "Embeddable Widget SDK", "COMPLETE", "widget.js with Simli avatar, light/dark theme"],
          ["9", "Analytics Dashboard", "IN PROGRESS", "Next.js dashboard, charts, conversation history"],
          ["10", "Docker Deployment", "PLANNED", "Dockerfile, docker-compose, production CI/CD"],
        ],
        [600, 2200, 1400, 5160]
      ),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 10. KEY CONVENTIONS
      // ─────────────────────────────────────────────────────
      h1("10. Key Conventions & Rules"),

      h2("10.1 Multi-Tenancy Rules (CRITICAL)"),
      infoBox(
        "SECURITY REQUIREMENT",
        "All backend routes MUST scope queries by client_id. Never return cross-tenant data. Use Supabase RLS as a second line of defense. The client_id is derived from the authenticated API key or JWT — never trust it from request body.",
        "FFF7ED", ORANGE
      ),

      spacer(),
      h2("10.2 Voice Pipeline Rules"),
      bullet("WebSocket sessions handle the full voice pipeline: receive audio chunks → STT → RAG retrieval → LLM → TTS → stream back audio"),
      bullet("TTS streaming uses Cartesia SSE endpoint for first-byte latency <100ms"),
      bullet("When Simli is active, use blob TTS endpoint (not streaming) to get full audio for PCM-16 conversion"),
      bullet("PCM-16 format for Simli: 16-bit, 16kHz, mono, little-endian raw bytes"),

      spacer(),
      h2("10.3 Training Job Rules"),
      bullet("Crawl + embed jobs run asynchronously as background tasks"),
      bullet("Job status is tracked in the training_jobs table (pending / running / completed / failed)"),
      bullet("Each client gets a dedicated Qdrant collection: collection name = client_id"),
      bullet("Chunks are deduplicated before indexing to avoid duplicate embeddings"),

      spacer(),
      h2("10.4 Widget Performance Rules"),
      bullet("Text is flushed to TTS aggressively: sentence boundaries, commas after 12+ chars, or every 18 chars"),
      bullet("Next TTS chunk is pre-fetched while current chunk plays to eliminate gaps"),
      bullet("Simli audio is sent before local playback starts to fill Simli's buffer ahead of time"),
      bullet("Simli audio element is muted — local TTS audio is the only audio source to prevent echo"),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 11. LATENCY TARGETS
      // ─────────────────────────────────────────────────────
      h1("11. Performance & Latency Targets"),

      stackTable(
        ["Component", "Target", "Current Model/Config"],
        [
          ["Widget Bootstrap", "<600ms", "Supabase API key validation"],
          ["LLM First Token", "<50ms", "Groq llama-3.1-8b-instant"],
          ["STT Transcription", "<50ms", "Deepgram Nova-3"],
          ["TTS First Byte", "<100ms", "Cartesia Sonic-3.5 SSE streaming"],
          ["RAG Vector Search", "<100ms", "Qdrant cloud with pre-warmed collection"],
          ["Simli Avatar Lip Sync", "<100ms", "PCM-16 pre-sent before playback starts"],
          ["Total Voice Turn Latency", "<500ms", "End-to-end: speech in → speech out"],
          ["Simli WebRTC Connection", "2-3 seconds", "One-time setup per panel open"],
        ],
        [3000, 1500, 4860]
      ),

      spacer(),
      spacer(),

      // ─────────────────────────────────────────────────────
      // 12. FREE TIER LIMITS
      // ─────────────────────────────────────────────────────
      h1("12. Free Tier & Service Limits"),

      stackTable(
        ["Service", "Free Tier", "Notes"],
        [
          ["Groq API", "Unlimited (rate limited)", "llama-3.1-8b-instant included in free tier"],
          ["Deepgram", "12,000 min/month free", "Nova-3 model included"],
          ["Cartesia", "Account credits (monthly)", "Sonic-3.5 model, replenishes monthly"],
          ["ElevenLabs", "10,000 chars/month free", "Fallback TTS provider"],
          ["Simli.ai", "100 minutes/month free", "WebRTC avatar streaming"],
          ["Qdrant Cloud", "1GB free cluster", "Sufficient for ~1M embeddings"],
          ["Supabase", "500MB DB, 50K MAU free", "Includes auth + real-time"],
          ["Vercel", "Unlimited hobby deployments", "Frontend + widget.js CDN"],
          ["Render", "750 hours/month free", "Backend FastAPI (spins down after 15min)"],
        ],
        [2000, 2200, 5160]
      ),

      pageBreak(),

      // ─────────────────────────────────────────────────────
      // 13. FILE STRUCTURE
      // ─────────────────────────────────────────────────────
      h1("13. Repository File Structure"),

      infoBox("Key Files", [
        "WebTalk-AI/",
        "├── backend/",
        "│   ├── app/",
        "│   │   ├── config.py          # All settings via Pydantic + .env",
        "│   │   ├── api/               # Route handlers",
        "│   │   │   ├── widget.py      # Widget API (bootstrap, chat, TTS, voice)",
        "│   │   │   ├── training.py    # Crawl + embed training jobs",
        "│   │   │   └── conversations.py # Dashboard AI + conversation history",
        "│   │   ├── voice/",
        "│   │   │   ├── stt.py         # Deepgram STT (Nova-3)",
        "│   │   │   └── tts.py         # Cartesia + ElevenLabs TTS",
        "│   │   └── rag/               # RAG pipeline (embed, store, retrieve)",
        "│   └── .env                   # Backend environment variables",
        "├── frontend/",
        "│   ├── app/",
        "│   │   └── dashboard/",
        "│   │       ├── layout.tsx     # Sidebar + DashboardAI component",
        "│   │       ├── clients/page.tsx # Install & API Keys page",
        "│   │       └── _components/",
        "│   │           ├── DashboardAI.tsx  # Floating AI assistant panel",
        "│   │           └── SimliAvatar.tsx  # Simli WebRTC React component",
        "│   └── public/",
        "│       └── widget.js          # Self-contained embeddable widget",
        "├── CLAUDE.md                  # AI coding guidelines",
        "└── SIMLI_SETUP.md             # Simli.ai setup guide",
      ].join("\n"), "F8FAFC", SLATE_400),

      spacer(),

      // ─────────────────────────────────────────────────────
      // 14. GLOSSARY
      // ─────────────────────────────────────────────────────
      h1("14. Glossary"),

      stackTable(
        ["Term", "Definition"],
        [
          ["RAG", "Retrieval-Augmented Generation — injecting relevant context from a knowledge base into LLM prompts"],
          ["STT", "Speech-to-Text — converting audio to text (Deepgram Nova-3)"],
          ["TTS", "Text-to-Speech — converting text to audio (Cartesia Sonic-3.5)"],
          ["PCM-16", "16-bit pulse-code modulation audio — raw audio format required by Simli.ai for lip sync"],
          ["client_id", "Unique identifier for each business tenant in WebTalk AI"],
          ["Qdrant", "Open-source vector database used to store and search document embeddings"],
          ["Embedding", "A numeric vector representation of text that captures semantic meaning"],
          ["SSE", "Server-Sent Events — HTTP streaming used by Cartesia for real-time TTS delivery"],
          ["WebRTC", "Web Real-Time Communication — browser protocol used by Simli.ai for video streaming"],
          ["Simli.ai", "Third-party service providing real-time AI talking-head avatars via WebRTC"],
          ["MSE", "MediaSource Extensions — browser API for low-latency streaming audio playback"],
          ["Widget", "The embeddable JavaScript snippet (widget.js) that clients paste on their website"],
          ["RLS", "Row Level Security — PostgreSQL policy feature enforcing data isolation per tenant"],
        ],
        [2000, 7360]
      ),

      spacer(),
      spacer(),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 0 },
        children: [new TextRun({ text: "End of Document", font: "Arial", size: 18, color: SLATE_400, italics: true })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("WebTalkAI_PRD.docx", buffer);
  console.log("PRD generated: WebTalkAI_PRD.docx");
});
