import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const API = "";
const SESSION_ID = "session_" + Math.random().toString(36).slice(2, 9);

const STYLE_OPTIONS = [
  "Casual", "Smart casual", "Business casual",
  "Formal", "Streetwear", "Bohemian", "Minimalist", "Classic", "Athleisure"
];

// ── Clothing categories for grouped closet view ───────────────────────────
const CATEGORIES = [
  { key: "tops",        label: "Tops",        keywords: ["shirt", "oxford", "blouse", "t-shirt", "tee", "tank", "sweater", "knit", "hoodie", "jumper", "polo"] },
  { key: "outerwear",   label: "Outerwear",   keywords: ["jacket", "blazer", "coat", "cardigan", "vest"] },
  { key: "bottoms",     label: "Bottoms",     keywords: ["jeans", "trouser", "chino", "pant", "skirt", "shorts", "legging"] },
  { key: "shoes",       label: "Shoes",       keywords: ["shoe", "sneaker", "boot", "loafer", "heel", "sandal"] },
  { key: "accessories", label: "Accessories", keywords: ["bag", "tote", "backpack", "purse", "hat", "cap", "beanie", "scarf", "sock", "belt", "watch", "tie"] },
];

function getCategory(type) {
  const t = type.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(k => t.includes(k))) return cat.key;
  }
  return "other";
}

const DEMO_WARDROBE = [
  // Tops
  { type: "Oxford shirt",       color: "White",     style: "Classic",          notes: "slightly oversized" },
  { type: "Oxford shirt",       color: "Light blue", style: "Classic",         notes: "slim fit" },
  { type: "Dress shirt",        color: "White",     style: "Formal",           notes: "crisp, French tuck friendly" },
  { type: "T-shirt",            color: "Grey",      style: "Casual",           notes: "crew neck, fitted" },
  { type: "T-shirt",            color: "White",     style: "Casual",           notes: "crew neck, slightly oversized" },
  { type: "T-shirt",            color: "Black",     style: "Casual",           notes: "crew neck" },
  { type: "Knit sweater",       color: "Cream",     style: "Casual",           notes: "slightly oversized, ribbed" },
  { type: "Knit sweater",       color: "Burgundy",  style: "Smart casual",     notes: "crewneck, slim fit" },
  { type: "Polo shirt",         color: "Navy",      style: "Smart casual",     notes: "pique cotton" },
  // Outerwear
  { type: "Blazer",             color: "Navy",      style: "Business casual",  notes: "single breasted, slim fit" },
  { type: "Blazer",             color: "Tan",       style: "Smart casual",     notes: "unstructured, relaxed" },
  { type: "Denim jacket",       color: "Light wash", style: "Casual",          notes: "slightly oversized" },
  { type: "Wool overcoat",      color: "Charcoal",  style: "Formal",           notes: "longline, double breasted" },
  // Bottoms
  { type: "Chinos",             color: "Olive",     style: "Smart casual",     notes: "slim fit" },
  { type: "Chinos",             color: "Khaki",     style: "Smart casual",     notes: "straight leg" },
  { type: "Jeans",              color: "Dark wash", style: "Casual",           notes: "straight leg" },
  { type: "Jeans",              color: "Black",     style: "Smart casual",     notes: "slim fit, no distressing" },
  { type: "Trousers",           color: "Charcoal",  style: "Formal",           notes: "tapered, pleated" },
  { type: "Trousers",           color: "Beige",     style: "Smart casual",     notes: "wide leg, linen blend" },
  // Shoes
  { type: "Sneakers",           color: "White",     style: "Casual",           notes: "low-top leather" },
  { type: "Chelsea boots",      color: "Tan",       style: "Smart casual",     notes: "suede" },
  { type: "Chelsea boots",      color: "Black",     style: "Business casual",  notes: "leather, polished" },
  { type: "Loafers",            color: "Brown",     style: "Smart casual",     notes: "penny loafer, leather" },
  // Accessories
  { type: "Tote bag",           color: "Canvas",    style: "Casual",           notes: "natural color" },
  { type: "Leather belt",       color: "Brown",     style: "Classic",          notes: "dress belt, silver buckle" },
];

function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? initial; }
    catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(val)); }, [key, val]);
  return [val, setVal];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [wardrobe, setWardrobe] = useLocalStorage("wai_wardrobe", []);
  const [tab, setTab] = useState("closet");

  const [form, setForm] = useState({ type: "", color: "", style: "Casual", notes: "" });
  const [addMsg, setAddMsg] = useState(null);

  const [occasion, setOccasion] = useState("");
  const [stylePref, setStylePref] = useState("");
  const [loading, setLoading] = useState(false);
  const [outfitResult, setOutfitResult] = useState(null);
  const [ragDocs, setRagDocs] = useState([]);
  const [error, setError] = useState(null);
  const [successBanner, setSuccessBanner] = useState(false);

  const [followup, setFollowup] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const [ragKb, setRagKb] = useState([]);
  const [showRagPanel, setShowRagPanel] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    fetch(`${API}/api/rag-info`)
      .then(r => r.json())
      .then(d => setRagKb(d.docs || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const addItem = () => {
    if (!form.type.trim() || !form.color.trim()) {
      setAddMsg({ type: "error", text: "Item name and color are required." });
      return;
    }
    setWardrobe(prev => [...prev, { ...form }]);
    setForm(f => ({ ...f, type: "", color: "", notes: "" }));
    setAddMsg({ type: "ok", text: `${form.color} ${form.type} added to your closet.` });
    setTimeout(() => setAddMsg(null), 2500);
  };

  const removeItem = (idx) => setWardrobe(prev => prev.filter((_, i) => i !== idx));

  const loadDemo = () => {
    setWardrobe(DEMO_WARDROBE);
    setAddMsg({ type: "ok", text: "Demo wardrobe loaded — 25 items." });
    setTimeout(() => setAddMsg(null), 2500);
  };

  const clearAll = () => {
    setWardrobe([]);
    setOutfitResult(null);
    setChatHistory([]);
    setRagDocs([]);
    setError(null);
    setSuccessBanner(false);
  };

  const generateOutfits = async () => {
    if (!occasion.trim()) { setError("Please enter an occasion."); return; }
    if (!wardrobe.length) { setError("Please add items to your closet first."); return; }
    setError(null);
    setLoading(true);
    setOutfitResult(null);
    setChatHistory([]);
    setRagDocs([]);
    setSuccessBanner(false);
    try {
      const res = await fetch(`${API}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wardrobe, occasion, style_pref: stylePref, session_id: SESSION_ID }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else {
        setOutfitResult(data.reply);
        setRagDocs(data.rag_docs || []);
        setSuccessBanner(true);
        setTab("outfits");
        setTimeout(() => setSuccessBanner(false), 4000);
      }
    } catch (e) { setError("Could not connect to backend. Is it running?"); }
    setLoading(false);
  };

  const sendFollowup = async () => {
    if (!followup.trim()) return;
    const msg = followup;
    setFollowup("");
    setChatHistory(h => [...h, { role: "user", content: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API}/api/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, session_id: SESSION_ID }),
      });
      const data = await res.json();
      if (data.error) setChatHistory(h => [...h, { role: "error", content: data.error }]);
      else setChatHistory(h => [...h, { role: "assistant", content: data.reply }]);
    } catch (e) { setChatHistory(h => [...h, { role: "error", content: "Connection error." }]); }
    setChatLoading(false);
  };

  const handleFollowupKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFollowup(); }
  };

  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat.key] = wardrobe.filter(i => getCategory(i.type) === cat.key).length;
    return acc;
  }, { all: wardrobe.length });

  const filteredWardrobe = (activeCategory === "all"
    ? wardrobe.map((item, idx) => ({ ...item, _idx: idx }))
    : wardrobe.map((item, idx) => ({ ...item, _idx: idx })).filter(i => getCategory(i.type) === activeCategory)
  );

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo-group">
            <span className="logo-mark">W</span>
            <div>
              <h1 className="logo-text">WardrobeAI</h1>
              <p className="logo-sub">AI Outfit Assistant · CSC 603/803 Capstone</p>
            </div>
          </div>
          <div className="header-badges">
            <span className="badge badge-model">Llama · Ollama</span>
            <span className="badge badge-rag" onClick={() => setShowRagPanel(p => !p)}>
              RAG · {ragKb.length} rules ▾
            </span>
          </div>
        </div>
      </header>

      {/* ── SUCCESS BANNER ── */}
      {successBanner && (
        <div className="success-banner">
          ✨ 3 outfits ready for <strong>{occasion}</strong>
        </div>
      )}

      {/* ── RAG PANEL ── */}
      {showRagPanel && (
        <div className="rag-panel">
          <div className="rag-panel-inner">
            <div className="rag-panel-header">
              <h3>Fashion Knowledge Base <span className="rag-label">RAG Store</span></h3>
              <button className="rag-close" onClick={() => setShowRagPanel(false)}>✕</button>
            </div>
            <p className="rag-explain">
              This is WardrobeAI's RAG knowledge base — {ragKb.length} curated fashion rules stored
              as "documents". When you generate outfits, the system <strong>retrieves</strong> the most
              relevant rules using keyword + synonym matching (e.g. "networking" maps to business casual),
              then <strong>injects</strong> them into the Llama prompt. That's Retrieval-Augmented Generation.
            </p>
            <div className="rag-docs-grid">
              {ragKb.map(doc => (
                <div key={doc.id} className="rag-doc">
                  <div className="rag-doc-id">{doc.id}</div>
                  <div className="rag-doc-tags">{doc.tags.map(t => <span key={t} className="rag-tag">{t}</span>)}</div>
                  <div className="rag-doc-rule">{doc.rule}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="main">
        {/* ── NAV TABS ── */}
        <nav className="tabs">
          {[
            { id: "closet",   label: `Closet (${wardrobe.length})` },
            { id: "generate", label: "Generate" },
            { id: "outfits",  label: "Outfits", disabled: !outfitResult },
          ].map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "tab-active" : ""} ${t.disabled ? "tab-disabled" : ""}`}
              onClick={() => !t.disabled && setTab(t.id)}
            >{t.label}</button>
          ))}
        </nav>

        {/* ══ TAB: CLOSET ══ */}
        {tab === "closet" && (
          <div className="panel">
            <div className="panel-row panel-row-split">
              <div className="section-header">
                <h2>Your Closet</h2>
                <p className="section-sub">Add the clothes you own. Be as detailed as you like.</p>
              </div>
              <div className="closet-actions">
                <button className="btn btn-ghost" onClick={loadDemo}>Load demo wardrobe</button>
                {wardrobe.length > 0 && (
                  <button className="btn btn-danger-ghost" onClick={clearAll}>Clear all</button>
                )}
              </div>
            </div>

            <div className="add-form">
              <div className="form-row">
                <div className="field">
                  <label>Item *</label>
                  <input placeholder="e.g. T-shirt, Chinos, Blazer" value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addItem()} />
                </div>
                <div className="field">
                  <label>Color *</label>
                  <input placeholder="e.g. Navy, Cream, Olive" value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addItem()} />
                </div>
                <div className="field">
                  <label>Style</label>
                  <select value={form.style} onChange={e => setForm(f => ({ ...f, style: e.target.value }))}>
                    {STYLE_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field field-grow">
                  <label>Notes</label>
                  <input placeholder="slim fit, cropped, vintage..." value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addItem()} />
                </div>
                <button className="btn btn-primary" onClick={addItem}>Add</button>
              </div>
              {addMsg && <div className={`inline-msg ${addMsg.type}`}>{addMsg.text}</div>}
            </div>

            {/* ── Category filter bar ── */}
            {wardrobe.length > 0 && (
              <div className="category-filter">
                <button className={`cat-btn ${activeCategory === "all" ? "cat-btn-active" : ""}`}
                  onClick={() => setActiveCategory("all")}>
                  All ({wardrobe.length})
                </button>
                {CATEGORIES.filter(c => categoryCounts[c.key] > 0).map(cat => (
                  <button key={cat.key}
                    className={`cat-btn ${activeCategory === cat.key ? "cat-btn-active" : ""}`}
                    onClick={() => setActiveCategory(cat.key)}>
                    {cat.label} ({categoryCounts[cat.key]})
                  </button>
                ))}
              </div>
            )}

            {wardrobe.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">👔</div>
                <p>Your closet is empty.</p>
                <p className="empty-sub">
                  Add items above or{" "}
                  <button className="link-btn" onClick={loadDemo}>load the demo wardrobe</button>
                  {" "}to get started.
                </p>
              </div>
            ) : filteredWardrobe.length === 0 ? (
              <div className="empty-state"><p>No items in this category yet.</p></div>
            ) : (
              <div className="wardrobe-grid">
                {filteredWardrobe.map(item => (
                  <div key={item._idx} className="wardrobe-card">
                    <div className="wardrobe-card-color" style={{ background: colorDot(item.color) }}>
                      <span className="wardrobe-card-emoji">{clothingIcon(item.type)}</span>
                      <button className="wardrobe-card-remove" onClick={() => removeItem(item._idx)}>✕</button>
                    </div>
                    <div className="wardrobe-card-body">
                      <span className="wardrobe-card-name">{item.color} {item.type}</span>
                      <span className="wardrobe-card-meta">{item.style}</span>
                      {item.notes && <span className="wardrobe-card-notes">{item.notes}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {wardrobe.length > 0 && (
              <div className="closet-footer">
                <span>{wardrobe.length} item{wardrobe.length !== 1 ? "s" : ""} in your closet</span>
                <button className="btn btn-primary" onClick={() => setTab("generate")}>
                  Generate outfits →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: GENERATE ══ */}
        {tab === "generate" && (
          <div className="panel">
            <div className="section-header">
              <h2>Generate Outfits</h2>
              <p className="section-sub">
                Tell WardrobeAI your occasion. The RAG system retrieves relevant fashion rules to ground the suggestions.
              </p>
            </div>

            <div className="generate-form">
              <div className="field field-full">
                <label>Occasion *</label>
                <input className="input-lg"
                  placeholder="e.g. Business casual Friday, Date night, Job interview, Casual weekend..."
                  value={occasion} onChange={e => setOccasion(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && generateOutfits()} />
              </div>
              <div className="field field-full">
                <label>Style preference <span className="optional">(optional)</span></label>
                <input className="input-lg"
                  placeholder="e.g. Minimalist, Smart casual, Streetwear, Classic..."
                  value={stylePref} onChange={e => setStylePref(e.target.value)} />
              </div>

              {error && <div className="inline-msg error">{error}</div>}

              <div className="generate-actions">
                <div className="wardrobe-count-chip">
                  {wardrobe.length} item{wardrobe.length !== 1 ? "s" : ""} in closet
                  {wardrobe.length === 0 && <button className="link-btn" onClick={() => setTab("closet")}> — add some first</button>}
                  {wardrobe.length > 0 && wardrobe.length < 3 && <span className="chip-warn"> — add a few more for better variety</span>}
                </div>
                <button className="btn btn-primary btn-xl" onClick={generateOutfits} disabled={loading}>
                  {loading ? <><span className="spinner" />Generating…</> : "Get Outfits"}
                </button>
              </div>
            </div>

            {loading && <LoadingScreen occasion={occasion} />}

            {!loading && (
              <div className="rag-explainer-card">
                <div className="rag-explainer-icon">🧠</div>
                <div>
                  <strong>How RAG improves your results</strong>
                  <p>
                    When you hit "Get Outfits", WardrobeAI first <em>retrieves</em> the most relevant
                    fashion rules from its {ragKb.length}-document knowledge base — using keyword + synonym
                    matching to handle natural language like "networking event" or "brunch". Those rules are{" "}
                    <em>injected</em> into the Llama prompt before generation. That's Retrieval-Augmented Generation.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: OUTFITS — empty state ══ */}
        {tab === "outfits" && !outfitResult && (
          <div className="panel">
            <div className="empty-state">
              <div className="empty-icon">✨</div>
              <p>No outfits generated yet.</p>
              <p className="empty-sub">
                <button className="link-btn" onClick={() => setTab("generate")}>Go to Generate</button>
                {" "}to build outfits from your closet.
              </p>
            </div>
          </div>
        )}

        {/* ══ TAB: OUTFITS — results ══ */}
        {tab === "outfits" && outfitResult && (
          <div className="panel">
            <div className="section-header">
              <h2>Your Outfits</h2>
              <p className="section-sub">For: <em>{occasion}</em>{stylePref ? ` · ${stylePref}` : ""}</p>
            </div>

            {ragDocs.length > 0 && (
              <div className="rag-retrieved">
                <div className="rag-retrieved-header">
                  <span className="rag-label">RAG</span>
                  <span>{ragDocs.length} fashion rule{ragDocs.length !== 1 ? "s" : ""} retrieved and injected into this response</span>
                </div>
                <div className="rag-retrieved-docs">
                  {ragDocs.map(d => (
                    <div key={d.id} className="rag-retrieved-doc">
                      <span className="rag-doc-id-small">{d.id}</span>
                      <span className="rag-doc-rule-small">{d.rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              const parsed = parseOutfits(outfitResult);
              if (parsed.length > 0) {
                return (
                  <div className="outfit-cards">
                    {parsed.map((outfit, i) => (
                      <OutfitCard key={i} outfit={outfit} index={i} wardrobe={wardrobe} />
                    ))}
                  </div>
                );
              }
              return <div className="outfit-response"><ReactMarkdown>{outfitResult}</ReactMarkdown></div>;
            })()}

            <div className="followup-section">
              <h3 className="followup-title">Refine or ask follow-up questions</h3>
              <p className="followup-sub">Try: "Make Outfit 2 more formal" · "Swap the sneakers for boots" · "What if it's cold outside?"</p>

              {chatHistory.length > 0 && (
                <div className="chat-history">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                      <div className="chat-bubble">
                        {msg.role === "user" ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="chat-msg chat-msg-assistant">
                      <div className="chat-bubble chat-typing">
                        <span className="dot" /><span className="dot" /><span className="dot" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              <div className="chat-input-row">
                <input className="chat-input" placeholder="Ask a follow-up question..."
                  value={followup} onChange={e => setFollowup(e.target.value)}
                  onKeyDown={handleFollowupKey} disabled={chatLoading} />
                <button className={`btn btn-primary ${chatLoading ? "btn-loading" : ""}`}
                  onClick={sendFollowup} disabled={chatLoading || !followup.trim()}>
                  {chatLoading ? <span className="spinner" /> : "Send"}
                </button>
              </div>
            </div>

            <div className="outfit-footer">
              <button className="btn btn-ghost" onClick={() => setTab("generate")}>← Adjust & regenerate</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function colorDot(color) {
  const map = {
    white: "#f0ede6", black: "#222", navy: "#1a2a5e", grey: "#9e9e9e",
    gray: "#9e9e9e", olive: "#6b7c3a", cream: "#f5f0e0", charcoal: "#4a4a44",
    tan: "#c4a56a", beige: "#d9c9a8", "dark wash": "#2c3e6b", canvas: "#c8b97a",
    red: "#c62828", blue: "#1565c0", green: "#2e7d32", brown: "#5d4037",
    pink: "#e91e8c", yellow: "#f9a825", orange: "#e65100", purple: "#6a1b9a",
    burgundy: "#6d1a2a", camel: "#c19a6b", rust: "#b7410e", teal: "#00695c",
    khaki: "#c3b091", denim: "#4e6b8c", mustard: "#c8963e", coral: "#e8735a",
  };
  return map[color.toLowerCase()] || "#bdbdbd";
}

function clothingIcon(type) {
  const t = type.toLowerCase();
  if (t.includes("t-shirt") || t.includes("tee") || t.includes("tank")) return "👕";
  if (t.includes("shirt") || t.includes("oxford") || t.includes("blouse") || t.includes("polo")) return "👔";
  if (t.includes("jacket") || t.includes("blazer") || t.includes("coat")) return "🧥";
  if (t.includes("sweater") || t.includes("knit") || t.includes("hoodie") || t.includes("jumper")) return "🧶";
  if (t.includes("jeans") || t.includes("trouser") || t.includes("chino") || t.includes("pant")) return "👖";
  if (t.includes("skirt") || t.includes("dress")) return "👗";
  if (t.includes("sneaker") || t.includes("shoe") || t.includes("boot") || t.includes("loafer") || t.includes("heel")) return "👟";
  if (t.includes("bag") || t.includes("tote") || t.includes("backpack") || t.includes("purse")) return "👜";
  if (t.includes("hat") || t.includes("cap") || t.includes("beanie")) return "🧢";
  if (t.includes("scarf")) return "🧣";
  if (t.includes("sock")) return "🧦";
  if (t.includes("suit")) return "🤵";
  if (t.includes("belt") || t.includes("watch") || t.includes("tie")) return "⌚";
  return "👚";
}

function parseOutfits(markdown) {
  if (!markdown) return [];
  const blocks = markdown.split(/(?=##\s*Outfit\s*\d)/i).filter(b => b.trim());
  return blocks.map((block, idx) => {
    const nameMatch  = block.match(/##\s*Outfit\s*\d+[:\.\-]?\s*(.+)/i);
    const itemsMatch = block.match(/\*\*Items?[:\*]*\*?\*?\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i);
    const whyMatch   = block.match(/\*\*Why it works[:\*]*\*?\*?\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i);
    const tipMatch   = block.match(/\*\*Styling tip[:\*]*\*?\*?\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i);
    return {
      number: idx + 1,
      name:  nameMatch  ? nameMatch[1].replace(/\*+/g, "").trim()  : `Outfit ${idx + 1}`,
      items: itemsMatch ? itemsMatch[1].replace(/\*+/g, "").trim() : "",
      why:   whyMatch   ? whyMatch[1].replace(/\*+/g, "").trim()   : "",
      tip:   tipMatch   ? tipMatch[1].replace(/\*+/g, "").trim()   : "",
    };
  }).filter(o => o.name || o.items);
}

// Match each outfit item string back to a wardrobe item to pull its color hex
function resolveItemColors(itemList, wardrobe) {
  return itemList.map(itemText => {
    const lower = itemText.toLowerCase();
    const match = wardrobe.find(w =>
      lower.includes(w.type.toLowerCase()) || lower.includes(w.color.toLowerCase())
    );
    return match ? { hex: colorDot(match.color), label: `${match.color} ${match.type}` } : null;
  }).filter(Boolean);
}

const CARD_ACCENTS = ["#2a3f6f", "#1e5c3e", "#5c3a1e", "#4a1e5c", "#1e4a5c"];

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function LoadingScreen({ occasion }) {
  const steps = [
    { icon: "🔍", label: "Scanning your closet" },
    { icon: "📚", label: "Retrieving fashion rules (RAG)" },
    { icon: "🧠", label: "Llama is thinking…" },
    { icon: "✨", label: "Assembling your outfits" },
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 2400);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="loading-screen">
      <div className="loading-inner">
        <div className="loading-logo">W</div>
        <h2 className="loading-title">Building your outfits</h2>
        {occasion && <p className="loading-occasion">for <em>{occasion}</em></p>}
        <div className="loading-steps">
          {steps.map((s, i) => (
            <div key={i} className={`loading-step ${i <= step ? "loading-step-active" : ""} ${i < step ? "loading-step-done" : ""}`}>
              <span className="loading-step-icon">{s.icon}</span>
              <span className="loading-step-label">{s.label}</span>
              {i < step && <span className="loading-step-check">✓</span>}
              {i === step && <span className="loading-step-dots"><span className="dot" /><span className="dot" /><span className="dot" /></span>}
            </div>
          ))}
        </div>
        <p className="loading-hint">This takes about 10–20 seconds on CPU</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTFIT CARD — with color palette swatches
// ─────────────────────────────────────────────────────────────────────────────
function OutfitCard({ outfit, index, wardrobe }) {
  const accent   = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const itemList = outfit.items ? outfit.items.split(/,\s*/).filter(Boolean) : [];
  const palette  = resolveItemColors(itemList, wardrobe);

  return (
    <div className="outfit-card" style={{ "--card-accent": accent }}>
      <div className="outfit-card-header">
        <div className="outfit-card-number" style={{ background: accent }}>{outfit.number}</div>
        <div className="outfit-card-title-group">
          <h3 className="outfit-card-name">{outfit.name}</h3>
          {palette.length > 0 && (
            <div className="color-palette">
              {palette.map((p, i) => (
                <div key={i} className="color-swatch" style={{ background: p.hex }} title={p.label} />
              ))}
              <span className="palette-label">palette</span>
            </div>
          )}
        </div>
      </div>

      {itemList.length > 0 && (
        <div className="outfit-card-items">
          {itemList.map((item, i) => (
            <span key={i} className="outfit-item-chip">
              <span className="outfit-item-icon">{clothingIcon(item)}</span>
              {item.trim()}
            </span>
          ))}
        </div>
      )}

      {outfit.why && (
        <div className="outfit-card-section">
          <div className="outfit-card-section-label">Why it works</div>
          <p className="outfit-card-section-text">{outfit.why}</p>
        </div>
      )}

      {outfit.tip && (
        <div className="outfit-card-tip">
          <span className="outfit-tip-icon">💡</span>
          <span>{outfit.tip}</span>
        </div>
      )}
    </div>
  );
}
