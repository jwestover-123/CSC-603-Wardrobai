# WardrobeAI

> AI-powered outfit assistant — CSC 603/803 Capstone · Spring 2026
> Team Members - Team lead: Jordan Westover     Frontend lead : Derek Ye     Backend lead: Diane Bilse       

WardrobeAI helps users build outfits from clothes they already own.
You describe your wardrobe, enter an occasion, and the AI suggests styled outfits with explanations.

**AI concept demonstrated: Retrieval-Augmented Generation (RAG)**

---

## Project Structure

```
wardrobe-ai/
├── backend/
│   ├── app.py              # Flask API + RAG engine
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.js          # React app
│   │   └── App.css
│   └── public/
│       └── index.html
├── start.sh                # One-command startup (macOS/Linux)
└── README.md
```

---

## How the RAG Works

WardrobeAI demonstrates **Retrieval-Augmented Generation** — one of the most important modern AI techniques:

1. **Knowledge Store** — 15 curated fashion rules are stored as "documents" in `backend/app.py` (the `FASHION_KNOWLEDGE_BASE` list). In production, these would live in a vector database like Pinecone or Chroma.

2. **Retrieval** — When a user submits an occasion + wardrobe, `simple_rag_retrieve()` scores each document against the query using keyword overlap (production systems use cosine similarity over sentence embeddings like `text-embedding-3-small`).

3. **Augmented Generation** — The top-4 retrieved rules are injected into the LLM prompt before calling llama. The model sees both the user's wardrobe *and* expert fashion knowledge it might not reliably produce on its own.

4. **Transparency** — The UI shows exactly which documents were retrieved for each generation, making the RAG pipeline visible and explainable.

```
User query + wardrobe
        ↓
  RAG Retrieval (keyword match → top-4 rules)
        ↓
  Augmented Prompt (wardrobe + rules + occasion)
        ↓
  LLM Generation (Llama3.1:8b)
        ↓
  Outfit suggestions grounded in fashion knowledge
```

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- [Ollama](https://ollama.com) — free local model server (no API key needed)

### 1 — Install Ollama and pull the model

```bash
# Install Ollama from https://ollama.com (macOS: brew install ollama)
ollama pull llama3.1:8b       # recommended (~5GB, best quality)
# or lighter option:
ollama pull llama3.2          # 3B model (~2GB, faster on low-RAM machines)
```

### 2 — Clone and start the backend

```bash
git clone <your-repo-url>
cd wardrobe-ai/backend
pip install -r requirements.txt
python app.py
# → Running on http://localhost:5000
```

To use the lighter 3B model: `OLLAMA_MODEL=llama3.2 python app.py`

### 3 — Frontend (new terminal tab)

```bash
cd frontend
npm install
npm start
# → Opens http://localhost:3000
```

### Or use the convenience script (macOS/Linux)

```bash
chmod +x start.sh
./start.sh
# No API key needed!
```

---

## Usage

1. **Closet tab** — Add clothing items (type, color, style, optional notes). Use "Load demo wardrobe" for a pre-loaded 10-item wardrobe.
2. **Generate tab** — Enter an occasion (e.g. "Business casual Friday") and optional style preference, then hit "Get Outfits".
3. **Outfits tab** — See 3 AI-generated outfits. The green RAG panel shows which fashion rules were retrieved and used. Ask follow-up questions to refine the outfits.

Click the **RAG · N rules ▾** badge in the header to browse the full knowledge base.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/health` | Health check |
| POST | `/api/generate` | Generate outfits with RAG |
| POST | `/api/followup` | Follow-up conversation turn |
| GET  | `/api/rag-info` | Expose full knowledge base |

---

## Model & Quality Improvements

WardrobeAI uses **Llama 3.1 8B** (or 3.2 3B) via Ollama — the same model family used in class, now served locally with no API key or cost.

Three engineering choices improve output quality beyond the original notebook:

| Improvement | What it does | Where in code |
|---|---|---|
| **Few-shot prompting** | Shows the model a complete example wardrobe → outfit response before the real request | `BASE_SYSTEM_PROMPT` in `app.py` |
| **Lower temperature (0.3)** | Makes output more deterministic — follows the format template reliably, fewer hallucinated items | `call_ollama()` options |
| **RAG context injection** | Retrieves relevant fashion rules and injects them into the prompt | `simple_rag_retrieve()` + user message |

**Model options (change with `OLLAMA_MODEL` env var):**

| Model | RAM needed | Speed (CPU) | Quality |
|---|---|---|---|
| `llama3.2` (3B) | ~2GB | ~10s | Good |
| `llama3.1:8b` | ~5GB | ~20s | Better |
| `mistral` (7B) | ~4.5GB | ~15s | Good at instruction-following |

| Metric | Question | Scale |
|---|---|---|
| Outfit relevance | How well did the outfits match your occasion? | 1–5 |
| Explanation quality | Did the styling rationale make sense? | 1–5 |
| Wardrobe accuracy | Did the AI only use items you described? | Yes / No |
| Task completion | Did you get at least one outfit you would actually wear? | Yes / No |
| Overall satisfaction | How satisfied were you with WardrobeAI overall? | 1–5 |

**Targets:** avg relevance ≥ 3.5 · explanation helpfulness ≥ 70% · task completion ≥ 80%

---

*WardrobeAI · CSC 603/803 Capstone · Spring 2026*
