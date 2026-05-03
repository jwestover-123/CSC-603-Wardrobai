"""
WardrobeAI Backend — Flask API
Model: Llama 3.1 8B (or 3.2 3B) via Ollama — fully local, no API key required.

Improvements in this version:
  1. RAG synonym expansion — "networking" → business casual, "brunch" → smart casual, etc.
  2. Session persistence via JSON file — survives backend restarts mid-demo
  3. Minimum wardrobe item check — warns user before sending bad prompts to LLM
  4. Season/month injection — tells Llama the current season for contextual suggestions
  5. Input sanitization — trims and caps field lengths before they reach the prompt
"""

import os
import json
import time
import datetime
import requests
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ── Ollama config ─────────────────────────────────────────────────────────────
OLLAMA_URL   = os.environ.get("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")

# ── Session persistence — survives backend restarts ───────────────────────────
SESSION_FILE = Path(__file__).parent / "sessions.json"

def load_sessions() -> dict:
    try:
        if SESSION_FILE.exists():
            return json.loads(SESSION_FILE.read_text())
    except Exception:
        pass
    return {}

def save_sessions(sessions: dict):
    try:
        SESSION_FILE.write_text(json.dumps(sessions))
    except Exception:
        pass

sessions = load_sessions()

# ─────────────────────────────────────────────────────────────────────────────
# SEASON HELPER
# Injecting the current season into the prompt costs nothing and meaningfully
# improves suggestion quality — a knit sweater recommendation in July is unhelpful.
# ─────────────────────────────────────────────────────────────────────────────

def get_season() -> str:
    month = datetime.datetime.now().month
    if month in (12, 1, 2):  return "Winter"
    if month in (3, 4, 5):   return "Spring"
    if month in (6, 7, 8):   return "Summer"
    return "Autumn/Fall"

def get_month_name() -> str:
    return datetime.datetime.now().strftime("%B")

# ─────────────────────────────────────────────────────────────────────────────
# RAG KNOWLEDGE BASE
# ─────────────────────────────────────────────────────────────────────────────

FASHION_KNOWLEDGE_BASE = [
    {
        "id": "color-neutrals",
        "tags": ["color", "neutral", "basics", "versatile", "pairing", "match"],
        "rule": "Neutral colors (white, black, navy, grey, beige, olive) are the backbone of a functional wardrobe. Any two neutrals can be combined safely. Navy and tan are a classic pairing; grey and white feel clean and modern."
    },
    {
        "id": "color-contrast",
        "tags": ["color", "contrast", "pairing", "light", "dark", "tonal"],
        "rule": "For visual interest, pair a light piece with a dark one. Avoid wearing the same value (e.g., medium grey shirt + medium grey pants) — it reads as flat and unintentional."
    },
    {
        "id": "business-casual",
        "tags": ["business casual", "office", "work", "friday", "professional", "networking",
                 "conference", "meeting", "corporate", "colleague", "workplace", "hybrid"],
        "rule": "Business casual typically means: tailored trousers or chinos (not jeans), a collared shirt or clean knit sweater, and smart shoes (Chelsea boots, loafers, clean leather sneakers). A blazer elevates any business casual look instantly."
    },
    {
        "id": "date-night",
        "tags": ["date", "date night", "romantic", "evening", "dinner", "restaurant",
                 "anniversary", "first date", "night out", "drinks", "cocktails"],
        "rule": "Date night outfits should feel intentional but effortless. A well-fitted outfit in one or two refined colors (navy, cream, charcoal) signals effort without trying too hard. Chelsea boots or clean leather shoes over sneakers. Avoid overly casual pieces like athletic wear."
    },
    {
        "id": "casual-weekend",
        "tags": ["casual", "weekend", "relaxed", "everyday", "errands", "brunch",
                 "coffee", "park", "friends", "day off", "hanging out", "chill"],
        "rule": "Casual outfits benefit from texture play: pair a smooth item (chinos) with a textured one (knit sweater). Clean sneakers or canvas shoes work well. T-shirts look best when they fit well — not too baggy, not too tight."
    },
    {
        "id": "layering",
        "tags": ["layering", "cold", "winter", "autumn", "fall", "sweater", "blazer",
                 "jacket", "chilly", "coat", "warm", "layer"],
        "rule": "Layering rule: the innermost layer should be the most fitted; outer layers can be looser. A fitted t-shirt under a relaxed knit sweater under a blazer is a classic 3-layer stack. Ensure collar/neckline visibility is intentional."
    },
    {
        "id": "smart-casual",
        "tags": ["smart casual", "cocktail", "bar", "event", "party", "gallery",
                 "opening", "social", "gathering", "semi-formal", "networking event"],
        "rule": "Smart casual sits between casual and business casual. Dark jeans (no rips) can replace trousers. A blazer over a clean t-shirt or Oxford shirt works well. Chelsea boots are the most versatile footwear for smart casual."
    },
    {
        "id": "proportions",
        "tags": ["fit", "proportion", "slim", "oversized", "silhouette", "baggy",
                 "relaxed", "fitted", "tailored", "loose"],
        "rule": "Proportion rule: balance a loose/oversized top with fitted bottoms, or a fitted top with relaxed bottoms. Wearing both loose simultaneously creates a shapeless silhouette. Slim chinos with an oversized knit is a modern, intentional combination."
    },
    {
        "id": "shoes-formality",
        "tags": ["shoes", "sneakers", "boots", "formality", "footwear", "chelsea",
                 "loafer", "dress shoes", "trainers", "leather"],
        "rule": "Shoe formality ladder (casual → formal): canvas sneakers → leather sneakers → Chelsea boots → loafers → dress shoes. Match shoe formality to the formality of the rest of the outfit. Chelsea boots are uniquely versatile — they work from smart casual through business casual."
    },
    {
        "id": "interview",
        "tags": ["interview", "job", "formal", "professional", "presentation", "client",
                 "pitch", "meeting", "important", "graduate", "career"],
        "rule": "For interviews or formal presentations: prioritize tailored pieces. Charcoal or navy trousers with a white or light blue Oxford shirt and a blazer is a reliable formula. Ensure shoes are clean and closed-toe. Avoid overly casual accessories."
    },
    {
        "id": "minimalist",
        "tags": ["minimalist", "minimal", "clean", "simple", "monochrome", "tonal",
                 "understated", "quiet luxury", "classic"],
        "rule": "Minimalist dressing: stick to 2-3 neutral colors per outfit, limit visible logos, prioritize clean silhouettes and good fit over decoration. Tonal dressing (different shades of the same color) is a minimalist hallmark."
    },
    {
        "id": "accessories",
        "tags": ["accessories", "bag", "tote", "watch", "belt", "scarf", "hat",
                 "sunglasses", "jewelry"],
        "rule": "Accessories should complement, not compete. A canvas tote bag reads as casual and should be paired with casual to smart casual outfits, not formal ones. Match bag material/tone to the overall outfit formality."
    },
    {
        "id": "texture-mixing",
        "tags": ["texture", "knit", "cotton", "denim", "mix", "fabric", "material",
                 "wool", "linen", "leather", "canvas"],
        "rule": "Mixing textures adds depth: denim + knit wool, cotton Oxford + chino fabric, leather + casual cotton all create interesting contrasts. Avoid mixing two very similar textures (e.g., two knit pieces) without a clear intentional reason."
    },
    {
        "id": "streetwear",
        "tags": ["streetwear", "urban", "sneakers", "hoodie", "hype", "hypebeast",
                 "skate", "casual cool", "edgy", "youth"],
        "rule": "Streetwear styling: sneakers are the hero piece — outfit builds outward from them. Oversized proportions are intentional. Monochrome or tonal looks (all black, all grey) are streetwear staples. Clean, high-quality basics elevate the look."
    },
    {
        "id": "color-navy",
        "tags": ["navy", "blue", "blazer", "navy blue"],
        "rule": "Navy is one of the most versatile colors in menswear. Navy blazer pairs with: white, cream, grey, olive, tan, charcoal. Navy top pairs with: olive trousers, khaki chinos, dark jeans, light grey trousers. Avoid pairing navy with black — it reads as a mistake rather than intentional."
    },
    {
        "id": "summer-dressing",
        "tags": ["summer", "hot", "warm weather", "beach", "outdoor", "festival",
                 "vacation", "holiday", "picnic", "barbecue", "bbq"],
        "rule": "Summer dressing: prioritize lightweight fabrics (linen, cotton). Light colors reflect heat. Fewer layers — a well-chosen single layer is more effective than forcing a layered look in heat. Breathable shoes like canvas sneakers or loafers over heavy boots."
    },
    {
        "id": "winter-dressing",
        "tags": ["winter", "cold", "freezing", "snow", "coat", "heavy", "warm",
                 "december", "january", "february"],
        "rule": "Winter dressing: a strong outerwear piece (wool coat, heavy jacket) is the anchor. Layer underneath — the inner layers can be lighter because the coat provides warmth. Dark tones (navy, charcoal, black) are winter staples and easy to coordinate."
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# SYNONYM MAP — expands natural language occasion terms to RAG-searchable tags
# This directly fixes the "networking event" retrieval failure.
# ─────────────────────────────────────────────────────────────────────────────

SYNONYM_MAP = {
    # Business / work
    "networking": "business casual professional",
    "conference": "business casual professional",
    "meeting":    "business casual professional",
    "corporate":  "business casual professional office",
    "client":     "business casual professional interview",
    "pitch":      "interview professional presentation",
    "intern":     "business casual professional",
    "graduate":   "interview formal professional",
    # Social
    "brunch":     "casual smart casual weekend",
    "coffee":     "casual weekend relaxed",
    "bar":        "smart casual evening drinks",
    "club":       "smart casual evening night out",
    "gala":       "formal evening",
    "wedding":    "formal smart casual event",
    "gallery":    "smart casual opening event",
    "festival":   "casual streetwear outdoor summer",
    "picnic":     "casual weekend outdoor summer",
    "barbecue":   "casual weekend outdoor summer",
    "bbq":        "casual weekend outdoor summer",
    "hike":       "casual outdoor athletic",
    "gym":        "athleisure casual",
    # Seasons
    "summer":     "summer warm weather outdoor",
    "winter":     "winter cold layering coat",
    "spring":     "casual smart casual",
    "fall":       "autumn layering",
    "autumn":     "autumn layering",
}

def expand_query(query: str) -> str:
    """Expand the raw query with synonym terms for better RAG retrieval."""
    words  = query.lower().split()
    extras = []
    for word in words:
        if word in SYNONYM_MAP:
            extras.append(SYNONYM_MAP[word])
    return query + " " + " ".join(extras)


def simple_rag_retrieve(query: str, wardrobe: list, top_k: int = 4) -> list[dict]:
    """
    Keyword + synonym RAG retrieval.
    Expands the query first, then scores each knowledge doc by tag and word overlap.
    In production: replace scoring with cosine similarity over sentence embeddings.
    """
    expanded = expand_query(query)
    wardrobe_signal = " ".join([
        f"{it.get('style','')} {it.get('type','')} {it.get('color','')}"
        for it in wardrobe
    ]).lower()
    full_signal = expanded.lower() + " " + wardrobe_signal

    scored = []
    for doc in FASHION_KNOWLEDGE_BASE:
        score = 0
        for tag in doc["tags"]:
            if tag in full_signal:
                score += 3
        rule_words   = set(doc["rule"].lower().split())
        signal_words = set(full_signal.split())
        score += len(rule_words & signal_words) * 0.5
        scored.append((score, doc))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [doc for score, doc in scored[:top_k] if score > 0]


# ─────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT — Few-shot with strict format
# ─────────────────────────────────────────────────────────────────────────────

BASE_SYSTEM_PROMPT = """You are WardrobeAI, a personal outfit assistant. Your job is to suggest outfits using ONLY the clothing items the user provides. Never invent or add items that are not in the wardrobe list.

You will receive:
- WARDROBE: a numbered list of clothing items the user owns
- OCCASION: the event or context to dress for
- SEASON: the current season — consider this for layering and fabric weight
- STYLE PREFERENCE: optional aesthetic direction
- FASHION RULES: expert styling knowledge to apply (from RAG retrieval)

CRITICAL RULES:
- Use ONLY items from the WARDROBE list. Copy item names exactly as written.
- Suggest exactly 3 outfits using different item combinations.
- Consider the SEASON when choosing layers and weights.
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
SEASON: Autumn/Fall

## Outfit 1: Clean & Sharp
**Items:** White Cotton t-shirt, Black Slim jeans, Tan Chelsea boots, Grey Wool blazer
**Why it works:** The grey blazer elevates the casual t-shirt and jeans into smart casual territory. Tan Chelsea boots add warmth and follow the shoe formality rule — more polished than sneakers without being overdressed. The autumn season makes the blazer layer practical and stylish.
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


def sanitize_str(s: str, max_len: int = 200) -> str:
    """Trim and cap string length before injecting into the prompt."""
    return str(s).strip()[:max_len] if s else ""


def call_ollama(messages: list, max_tokens: int = 1200) -> str:
    """
    Call the local Ollama server with tuned generation parameters.
    temperature=0.3 — focused, less hallucination
    repeat_penalty=1.1 — discourages repetitive phrasing
    """
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature":    0.3,
            "num_predict":    max_tokens,
            "top_p":          0.9,
            "repeat_penalty": 1.1,
        },
    }
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]
    except requests.exceptions.ConnectionError:
        raise RuntimeError(
            f"Cannot connect to Ollama at {OLLAMA_URL}. "
            "Is Ollama running? Start it with: ollama serve"
        )
    except requests.exceptions.Timeout:
        raise RuntimeError("Ollama request timed out. The model may still be loading — try again.")
    except Exception as e:
        raise RuntimeError(f"Ollama error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    try:
        resp   = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        models = [m["name"] for m in resp.json().get("models", [])]
        model_ready = any(OLLAMA_MODEL.split(":")[0] in m for m in models)
        return jsonify({
            "status": "ok",
            "backend": "ollama",
            "model": OLLAMA_MODEL,
            "model_ready": model_ready,
            "season": get_season(),
            "month": get_month_name(),
        })
    except Exception:
        return jsonify({
            "status": "ollama_offline",
            "model": OLLAMA_MODEL,
            "hint": f"Start Ollama: ollama serve  |  Pull model: ollama pull {OLLAMA_MODEL}"
        }), 503


@app.route("/api/generate", methods=["POST"])
def generate():
    data       = request.json
    wardrobe   = data.get("wardrobe", [])
    occasion   = sanitize_str(data.get("occasion", ""), 300)
    style_pref = sanitize_str(data.get("style_pref", ""), 200)
    session_id = sanitize_str(data.get("session_id", "default"), 50)

    # ── Input validation ──────────────────────────────────────────────────────
    if not wardrobe:
        return jsonify({"error": "Please add at least one item to your wardrobe first."}), 400
    if not occasion:
        return jsonify({"error": "Please enter an occasion."}), 400

    # Minimum item check — warn user before the LLM gets a bad prompt
    if len(wardrobe) < 3:
        return jsonify({
            "error": f"You have {len(wardrobe)} item(s) in your closet. Add at least 3 for meaningful outfit variety."
        }), 400

    # Sanitize each wardrobe item
    clean_wardrobe = [
        {
            "type":  sanitize_str(it.get("type", "Item"), 80),
            "color": sanitize_str(it.get("color", ""), 50),
            "style": sanitize_str(it.get("style", "Casual"), 50),
            "notes": sanitize_str(it.get("notes", ""), 100),
        }
        for it in wardrobe
    ]

    # ── RAG retrieval with synonym expansion ─────────────────────────────────
    rag_query     = f"{occasion} {style_pref}"
    retrieved_docs = simple_rag_retrieve(rag_query, clean_wardrobe, top_k=4)
    rag_context = ""
    if retrieved_docs:
        rag_context = "\nFASHION RULES (apply these in your outfit explanations):\n"
        for doc in retrieved_docs:
            rag_context += f"- [{doc['id']}] {doc['rule']}\n"

    # ── Season injection ─────────────────────────────────────────────────────
    season = get_season()
    month  = get_month_name()

    # ── Build prompt ──────────────────────────────────────────────────────────
    user_msg = (
        f"WARDROBE:\n{format_wardrobe(clean_wardrobe)}\n\n"
        f"OCCASION: {occasion}\n"
        f"SEASON: {season} ({month})"
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
    save_sessions(sessions)

    try:
        reply = call_ollama(messages, max_tokens=1200)
        sessions[session_id].append({"role": "assistant", "content": reply})
        save_sessions(sessions)
        return jsonify({
            "reply":     reply,
            "rag_docs":  [{"id": d["id"], "rule": d["rule"]} for d in retrieved_docs],
            "rag_count": len(retrieved_docs),
            "model":     OLLAMA_MODEL,
            "season":    season,
        })
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/followup", methods=["POST"])
def followup():
    data       = request.json
    message    = sanitize_str(data.get("message", ""), 500)
    session_id = sanitize_str(data.get("session_id", "default"), 50)

    if not message:
        return jsonify({"error": "Message cannot be empty."}), 400
    if session_id not in sessions or not sessions[session_id]:
        return jsonify({"error": "Generate outfits first before asking a follow-up."}), 400

    sessions[session_id].append({"role": "user", "content": message})
    save_sessions(sessions)

    try:
        reply = call_ollama(sessions[session_id], max_tokens=800)
        sessions[session_id].append({"role": "assistant", "content": reply})
        save_sessions(sessions)
        return jsonify({"reply": reply})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/rag-info", methods=["GET"])
def rag_info():
    return jsonify({
        "total_docs": len(FASHION_KNOWLEDGE_BASE),
        "model":      OLLAMA_MODEL,
        "season":     get_season(),
        "docs": [{"id": d["id"], "tags": d["tags"], "rule": d["rule"]}
                 for d in FASHION_KNOWLEDGE_BASE]
    })


if __name__ == "__main__":
    print(f"WardrobeAI backend starting")
    print(f"  Model:  {OLLAMA_MODEL}")
    print(f"  Ollama: {OLLAMA_URL}")
    print(f"  Season: {get_season()} ({get_month_name()})")
    print(f"  Sessions loaded: {len(sessions)}")
    print("  Override model: OLLAMA_MODEL=llama3.2 python app.py")
    app.run(debug=True, port=5000)
