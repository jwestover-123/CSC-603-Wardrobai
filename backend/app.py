"""
WardrobeAI Backend — Flask API
Model: Llama 3.1 8B (or 3.2 3B) via Ollama — fully local, no API key required.
RAG concept: a curated fashion knowledge base is retrieved and injected into
the prompt before each generation (Retrieval-Augmented Generation).

Quality improvements over the original notebook:
  1. Few-shot examples in the system prompt (biggest quality boost for small models)
  2. Lower temperature (0.3) — more focused, less hallucination
  3. RAG context injected per request — grounded fashion knowledge
  4. Strict output template — rigid fill-in-the-blank format small models follow reliably
"""

import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ── Ollama config ─────────────────────────────────────────────────────────────
# Default: llama3.1:8b  (best quality, needs ~5GB RAM)
# Fallback: llama3.2    (3B, lighter, needs ~2GB RAM)
# Change OLLAMA_MODEL env var to override: export OLLAMA_MODEL=llama3.2
OLLAMA_URL   = os.environ.get("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# RAG KNOWLEDGE BASE
# In a production system this would be a vector DB (Pinecone, Chroma, etc.)
# and embeddings model. For this capstone demo we use TF-IDF-style keyword
# matching over a curated fashion rule set — the concept is identical to RAG:
#   1. Store domain knowledge as "documents"
#   2. Retrieve the most relevant docs given the query
#   3. Inject retrieved docs into the prompt (Retrieval-Augmented Generation)
# ─────────────────────────────────────────────────────────────────────────────

FASHION_KNOWLEDGE_BASE = [
    {
        "id": "color-neutrals",
        "tags": ["color", "neutral", "basics", "versatile"],
        "rule": "Neutral colors (white, black, navy, grey, beige, olive) are the backbone of a functional wardrobe. Any two neutrals can be combined safely. Navy and tan are a classic pairing; grey and white feel clean and modern."
    },
    {
        "id": "color-contrast",
        "tags": ["color", "contrast", "pairing"],
        "rule": "For visual interest, pair a light piece with a dark one. Avoid wearing the same value (e.g., medium grey shirt + medium grey pants) — it reads as flat and unintentional."
    },
    {
        "id": "business-casual",
        "tags": ["business casual", "office", "work", "friday", "professional"],
        "rule": "Business casual typically means: tailored trousers or chinos (not jeans), a collared shirt or clean knit sweater, and smart shoes (Chelsea boots, loafers, clean leather sneakers). A blazer elevates any business casual look instantly."
    },
    {
        "id": "date-night",
        "tags": ["date", "date night", "romantic", "evening", "dinner"],
        "rule": "Date night outfits should feel intentional but effortless. A well-fitted outfit in one or two refined colors (navy, cream, charcoal) signals effort without trying too hard. Chelsea boots or clean leather shoes over sneakers. Avoid overly casual pieces like athletic wear."
    },
    {
        "id": "casual-weekend",
        "tags": ["casual", "weekend", "relaxed", "everyday"],
        "rule": "Casual outfits benefit from texture play: pair a smooth item (chinos) with a textured one (knit sweater). Clean sneakers or canvas shoes work well. T-shirts look best when they fit well — not too baggy, not too tight."
    },
    {
        "id": "layering",
        "tags": ["layering", "cold", "winter", "autumn", "fall", "sweater", "blazer", "jacket"],
        "rule": "Layering rule: the innermost layer should be the most fitted; outer layers can be looser. A fitted t-shirt under a relaxed knit sweater under a blazer is a classic 3-layer stack. Ensure collar/neckline visibility is intentional."
    },
    {
        "id": "smart-casual",
        "tags": ["smart casual", "cocktail", "bar", "event", "party"],
        "rule": "Smart casual sits between casual and business casual. Dark jeans (no rips) can replace trousers. A blazer over a clean t-shirt or Oxford shirt works well. Chelsea boots are the most versatile footwear for smart casual."
    },
    {
        "id": "proportions",
        "tags": ["fit", "proportion", "slim", "oversized", "silhouette"],
        "rule": "Proportion rule: balance a loose/oversized top with fitted bottoms, or a fitted top with relaxed bottoms. Wearing both loose simultaneously creates a shapeless silhouette. Slim chinos with an oversized knit is a modern, intentional combination."
    },
    {
        "id": "shoes-formality",
        "tags": ["shoes", "sneakers", "boots", "formality", "footwear"],
        "rule": "Shoe formality ladder (casual → formal): canvas sneakers → leather sneakers → Chelsea boots → loafers → dress shoes. Match shoe formality to the formality of the rest of the outfit. Chelsea boots are uniquely versatile — they work from smart casual through business casual."
    },
    {
        "id": "interview",
        "tags": ["interview", "job", "formal", "professional", "presentation"],
        "rule": "For interviews or formal presentations: prioritize tailored pieces. Charcoal or navy trousers with a white or light blue Oxford shirt and a blazer is a reliable formula. Ensure shoes are clean and closed-toe. Avoid overly casual accessories."
    },
    {
        "id": "minimalist",
        "tags": ["minimalist", "minimal", "clean", "simple", "monochrome"],
        "rule": "Minimalist dressing: stick to 2-3 neutral colors per outfit, limit visible logos, prioritize clean silhouettes and good fit over decoration. Tonal dressing (different shades of the same color) is a minimalist hallmark."
    },
    {
        "id": "accessories",
        "tags": ["accessories", "bag", "tote", "watch", "belt"],
        "rule": "Accessories should complement, not compete. A canvas tote bag reads as casual and should be paired with casual to smart casual outfits, not formal ones. Match bag material/tone to the overall outfit formality."
    },
    {
        "id": "texture-mixing",
        "tags": ["texture", "knit", "cotton", "denim", "mix", "fabric"],
        "rule": "Mixing textures adds depth: denim + knit wool, cotton Oxford + chino fabric, leather + casual cotton all create interesting contrasts. Avoid mixing two very similar textures (e.g., two knit pieces) without a clear intentional reason."
    },
    {
        "id": "streetwear",
        "tags": ["streetwear", "urban", "sneakers", "hoodie", "hype"],
        "rule": "Streetwear styling: sneakers are the hero piece — outfit builds outward from them. Oversized proportions are intentional. Monochrome or tonal looks (all black, all grey) are streetwear staples. Clean, high-quality basics elevate the look."
    },
    {
        "id": "color-navy",
        "tags": ["navy", "blue", "blazer"],
        "rule": "Navy is one of the most versatile colors in menswear. Navy blazer pairs with: white, cream, grey, olive, tan, charcoal. Navy top pairs with: olive trousers, khaki chinos, dark jeans, light grey trousers. Avoid pairing navy with black — it reads as a mistake rather than intentional."
    },
]


def simple_rag_retrieve(query: str, wardrobe: list, top_k: int = 4) -> list[dict]:
    """
    Lightweight RAG retrieval using keyword overlap (TF-IDF spirit).
    In production: replace with cosine similarity over sentence embeddings.

    The query is constructed from the occasion + wardrobe item types/styles,
    then matched against each knowledge document's tags and rule text.
    Returns the top_k most relevant fashion rules.
    """
    # Build a rich query signal from occasion + wardrobe metadata
    query_lower = query.lower()
    wardrobe_styles = " ".join([
        f"{it.get('style','')} {it.get('type','')} {it.get('color','')}"
        for it in wardrobe
    ]).lower()
    full_signal = query_lower + " " + wardrobe_styles

    scored = []
    for doc in FASHION_KNOWLEDGE_BASE:
        score = 0
        # Tag match (high weight)
        for tag in doc["tags"]:
            if tag in full_signal:
                score += 3
        # Rule text word overlap (lower weight)
        rule_words = set(doc["rule"].lower().split())
        signal_words = set(full_signal.split())
        overlap = rule_words & signal_words
        score += len(overlap) * 0.5
        scored.append((score, doc))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [doc for _, doc in scored[:top_k] if _ > 0]


# ─────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT — Few-shot version
#
# Quality improvement #1: Few-shot examples
# Small models like Llama 3B/8B follow structural patterns much more reliably
# when shown a concrete example rather than just described rules. The example
# below acts as a template the model fills in, dramatically reducing format
# failures and item hallucination.
# ─────────────────────────────────────────────────────────────────────────────

BASE_SYSTEM_PROMPT = """You are WardrobeAI, a personal outfit assistant. Your job is to suggest outfits using ONLY the clothing items the user provides. Never invent or add items that are not in the wardrobe list.

You will receive:
- WARDROBE: a numbered list of clothing items the user owns
- OCCASION: the event or context to dress for
- STYLE PREFERENCE: optional aesthetic direction
- FASHION RULES: expert styling knowledge to apply (from RAG retrieval)

CRITICAL RULES:
- Use ONLY items from the WARDROBE list. Copy item names exactly as written.
- Suggest exactly 3 outfits using different item combinations.
- Follow the exact format shown in the example below.
- Do not add commentary before or after the 3 outfits.

---
EXAMPLE (do not use these items — this is format only):

WARDROBE:
1. White Cotton t-shirt (Casual style)
2. Black Slim jeans (Casual style)
3. Tan Chelsea boots (Smart casual style)
4. Grey Wool blazer (Business casual style)
5. White Leather sneakers (Casual style)

OCCASION: Smart casual dinner

## Outfit 1: Clean & Sharp
**Items:** White Cotton t-shirt, Black Slim jeans, Tan Chelsea boots, Grey Wool blazer
**Why it works:** The grey blazer elevates the casual t-shirt and jeans into smart casual territory. Tan Chelsea boots add warmth and follow the shoe formality rule — more polished than sneakers without being overdressed.
**Styling tip:** Leave the blazer unbuttoned and roll the jeans one cuff for a relaxed-but-intentional look.

## Outfit 2: Minimal Edge
**Items:** White Cotton t-shirt, Black Slim jeans, White Leather sneakers
**Why it works:** A tonal black-and-white palette reads as intentionally minimalist. The slim jeans keep proportions clean against the relaxed t-shirt fit.
**Styling tip:** Tuck the t-shirt half-in at the front to add structure without losing the casual feel.

## Outfit 3: Elevated Casual
**Items:** White Cotton t-shirt, Black Slim jeans, Grey Wool blazer, White Leather sneakers
**Why it works:** Swapping boots for sneakers under the blazer creates a smart-casual contrast — the blazer does the heavy lifting while sneakers keep it approachable.
**Styling tip:** Match the sneaker white to the t-shirt white for a cohesive tonal thread through the outfit.
---

Now generate outfits for the user's actual wardrobe below. Use ONLY their items."""


def format_wardrobe(wardrobe: list) -> str:
    if not wardrobe:
        return "(No items added yet)"
    lines = []
    for i, item in enumerate(wardrobe, 1):
        line = f"{i}. {item['color'].title()} {item['type'].lower()} ({item['style']} style)"
        if item.get('notes'):
            line += f" — {item['notes']}"
        lines.append(line)
    return "\n".join(lines)


def call_ollama(messages: list, max_tokens: int = 1200) -> str:
    """
    Call the local Ollama server.
    Uses temperature=0.3 (quality improvement #2 — more focused output,
    less likely to hallucinate items or drift from the format template).

    Ollama's /api/chat endpoint accepts OpenAI-compatible message format.
    """
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.3,       # Lower = more deterministic, fewer hallucinations
            "num_predict": max_tokens, # Cap token output so model doesn't ramble
            "top_p": 0.9,
            "repeat_penalty": 1.1,    # Discourage repetitive phrasing
        },
    }
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json=payload,
            timeout=120,  # Llama on CPU can take up to ~60s; 120s gives headroom
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]
    except requests.exceptions.ConnectionError:
        raise RuntimeError(
            f"Cannot connect to Ollama at {OLLAMA_URL}. "
            "Is Ollama running? Start it with: ollama serve"
        )
    except requests.exceptions.Timeout:
        raise RuntimeError("Ollama request timed out. The model may still be loading — try again in a moment.")
    except Exception as e:
        raise RuntimeError(f"Ollama error: {e}")


# In-memory session store (keyed by session_id sent from frontend)
sessions: dict[str, list] = {}


@app.route("/api/health", methods=["GET"])
def health():
    # Ping Ollama to check if it's running and the model is available
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        models = [m["name"] for m in resp.json().get("models", [])]
        model_ready = any(OLLAMA_MODEL.split(":")[0] in m for m in models)
        return jsonify({
            "status": "ok",
            "backend": "ollama",
            "model": OLLAMA_MODEL,
            "model_ready": model_ready,
            "available_models": models,
        })
    except Exception:
        return jsonify({
            "status": "ollama_offline",
            "model": OLLAMA_MODEL,
            "hint": f"Start Ollama with: ollama serve  |  Pull model with: ollama pull {OLLAMA_MODEL}"
        }), 503


@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.json
    wardrobe = data.get("wardrobe", [])
    occasion = data.get("occasion", "")
    style_pref = data.get("style_pref", "")
    session_id = data.get("session_id", "default")

    if not wardrobe:
        return jsonify({"error": "Please add at least one item to your wardrobe first."}), 400
    if not occasion:
        return jsonify({"error": "Please enter an occasion."}), 400

    # ── RAG STEP: retrieve relevant fashion rules ──────────────────────────
    rag_query = f"{occasion} {style_pref}"
    retrieved_docs = simple_rag_retrieve(rag_query, wardrobe, top_k=4)
    rag_context = ""
    if retrieved_docs:
        rag_context = "\n\nFASHION RULES (apply these in your outfit explanations):\n"
        for doc in retrieved_docs:
            rag_context += f"- [{doc['id']}] {doc['rule']}\n"
    # ──────────────────────────────────────────────────────────────────────

    # Build the user message — clear labeled sections help small models parse context
    user_msg = (
        f"WARDROBE:\n{format_wardrobe(wardrobe)}\n\n"
        f"OCCASION: {occasion}"
    )
    if style_pref:
        user_msg += f"\nSTYLE PREFERENCE: {style_pref}"
    user_msg += rag_context
    user_msg += "\n\nGenerate 3 outfits using ONLY the wardrobe items listed above."

    messages = [
        {"role": "system", "content": BASE_SYSTEM_PROMPT},
        {"role": "user",   "content": user_msg},
    ]
    sessions[session_id] = messages

    try:
        reply = call_ollama(messages, max_tokens=1200)
        sessions[session_id].append({"role": "assistant", "content": reply})
        return jsonify({
            "reply": reply,
            "rag_docs": [{"id": d["id"], "rule": d["rule"]} for d in retrieved_docs],
            "rag_count": len(retrieved_docs),
            "model": OLLAMA_MODEL,
        })
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/followup", methods=["POST"])
def followup():
    data = request.json
    message = data.get("message", "")
    session_id = data.get("session_id", "default")

    if not message:
        return jsonify({"error": "Message cannot be empty."}), 400
    if session_id not in sessions or not sessions[session_id]:
        return jsonify({"error": "Generate outfits first before asking a follow-up."}), 400

    sessions[session_id].append({"role": "user", "content": message})

    try:
        reply = call_ollama(sessions[session_id], max_tokens=800)
        sessions[session_id].append({"role": "assistant", "content": reply})
        return jsonify({"reply": reply})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/rag-info", methods=["GET"])
def rag_info():
    """Expose the knowledge base for the UI 'How it works' panel."""
    return jsonify({
        "total_docs": len(FASHION_KNOWLEDGE_BASE),
        "model": OLLAMA_MODEL,
        "docs": [{"id": d["id"], "tags": d["tags"], "rule": d["rule"]}
                 for d in FASHION_KNOWLEDGE_BASE]
    })


if __name__ == "__main__":
    print(f"WardrobeAI backend starting — model: {OLLAMA_MODEL}")
    print(f"Ollama URL: {OLLAMA_URL}")
    print("Tip: override model with OLLAMA_MODEL=llama3.2 python app.py")
    app.run(debug=True, port=5000)
