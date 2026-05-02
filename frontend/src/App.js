import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const API = "";
const SESSION_ID = "session_" + Math.random().toString(36).slice(2, 9);

const STYLE_OPTIONS = [
  "Casual", "Smart casual", "Business casual",
  "Formal", "Streetwear", "Bohemian", "Minimalist", "Classic", "Athleisure"
];

const DEMO_WARDROBE = [
  { type: "White Oxford shirt", color: "White",     style: "Classic",          notes: "slightly oversized" },
  { type: "Chinos",             color: "Olive",     style: "Smart casual",     notes: "slim fit" },
  { type: "T-shirt",            color: "Grey",      style: "Casual",           notes: "crew neck" },
  { type: "Jeans",              color: "Dark wash", style: "Casual",           notes: "straight leg" },
  { type: "Blazer",             color: "Navy",      style: "Business casual",  notes: "single breasted" },
  { type: "Sneakers",           color: "White",     style: "Casual",           notes: "low-top leather" },
  { type: "Chelsea boots",      color: "Tan",       style: "Smart casual",     notes: "" },
  { type: "Knit sweater",       color: "Cream",     style: "Casual",           notes: "slightly oversized, ribbed" },
  { type: "Trousers",           color: "Charcoal",  style: "Formal",           notes: "tapered" },
  { type: "Tote bag",           color: "Canvas",    style: "Casual",           notes: "natural color" },
];

function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? initial; }
    catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(val)); }, [key, val]);
  return [val, setVal];
}

export default function App() {
  const [wardrobe, setWardrobe] = useLocalStorage("wai_wardrobe", []);
  const [tab, setTab] = useState("closet");

  // Add item form
  const [form, setForm] = useState({ type: "", color: "", style: "Casual", notes: "" });
  const [addMsg, setAddMsg] = useState(null);

  // Outfit generation
  const [occasion, setOccasion] = useState("");
  const [stylePref, setStylePref] = useState("");
  const [loading, setLoading] = useState(false);
  const [outfitResult, setOutfitResult] = useState(null);
  const [ragDocs, setRagDocs] = useState([]);
  const [error, setError] = useState(null);

  // Chat follow-up
  const [followup, setFollowup] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // RAG panel
  const [ragKb, setRagKb] = useState([]);
  const [showRagPanel, setShowRagPanel] = useState(false);

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
    setAddMsg({ type: "ok", text: "Item added to your closet." });
    setTimeout(() => setAddMsg(null), 2500);
  };

  const removeItem = (idx) => setWardrobe(prev => prev.filter((_, i) => i !== idx));

  const loadDemo = () => {
    setWardrobe(DEMO_WARDROBE);
    setAddMsg({ type: "ok", text: "Demo wardrobe loaded — 10 items." });
    setTimeout(() => setAddMsg(null), 2500);
  };

  const clearAll = () => {
    setWardrobe([]);
    setOutfitResult(null);
    setChatHistory([]);
    setRagDocs([]);
    setError(null);
  };

  const generateOutfits = async () => {
    if (!occasion.trim()) { setError("Please enter an occasion."); return; }
    if (!wardrobe.length) { setError("Please add items to your closet first."); return; }
    setError(null);
    setLoading(true);
    setOutfitResult(null);
    setChatHistory([]);
    setRagDocs([]);
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
        setTab("outfits");
      }
    } catch (e) { setError("Could not connect to backend. Is it running?"); }
    setLoading(false);
  };

  const sendFollowup = async () => {
    if (!followup.trim()) return;
    if (!outfitResult) { setError("Generate outfits first."); return; }
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

  const handleFollowupKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFollowup(); } };

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

      {/* ── RAG PANEL ── */}
      {showRagPanel && (
        <div className="rag-panel">
          <div className="rag-panel-inner">
            <div className="rag-panel-header">
              <h3>Fashion Knowledge Base <span className="rag-label">RAG Store</span></h3>
              <button className="rag-close" onClick={() => setShowRagPanel(false)}>✕</button>
            </div>
            <p className="rag-explain">
              This is WardrobeAI's RAG knowledge base — {ragKb.length} curated fashion rules
              stored as "documents". When you generate outfits, the system <strong>retrieves</strong> the
              most relevant rules using keyword matching (production systems use vector embeddings),
              then <strong>injects</strong> them into the prompt before calling the LLM. This is
              Retrieval-Augmented Generation.
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
            { id: "closet", label: `Closet (${wardrobe.length})` },
            { id: "generate", label: "Generate" },
            { id: "outfits", label: "Outfits", disabled: !outfitResult },
          ].map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "tab-active" : ""} ${t.disabled ? "tab-disabled" : ""}`}
              onClick={() => !t.disabled && setTab(t.id)}
            >{t.label}</button>
          ))}
        </nav>

        {/* ══════════════════════════════════════════════════
            TAB: CLOSET
        ══════════════════════════════════════════════════ */}
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

            {/* Add form */}
            <div className="add-form">
              <div className="form-row">
                <div className="field">
                  <label>Item *</label>
                  <input
                    placeholder="e.g. T-shirt, Chinos, Blazer"
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addItem()}
                  />
                </div>
                <div className="field">
                  <label>Color *</label>
                  <input
                    placeholder="e.g. Navy, Cream, Olive"
                    value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addItem()}
                  />
                </div>
                <div className="field">
                  <label>Style</label>
                  <select value={form.style} onChange={e => setForm(f => ({ ...f, style: e.target.value }))}>
                    {STYLE_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field field-grow">
                  <label>Notes</label>
                  <input
                    placeholder="slim fit, cropped, vintage..."
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addItem()}
                  />
                </div>
                <button className="btn btn-primary" onClick={addItem}>Add</button>
              </div>
              {addMsg && (
                <div className={`inline-msg ${addMsg.type}`}>{addMsg.text}</div>
              )}
            </div>

            {/* Wardrobe list */}
            {wardrobe.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">👔</div>
                <p>Your closet is empty. Add items above or load the demo wardrobe.</p>
              </div>
            ) : (
              <div className="wardrobe-list">
                {wardrobe.map((item, i) => (
                  <div key={i} className="wardrobe-item">
                    <div className="item-color-dot" style={{ background: colorDot(item.color) }} />
                    <div className="item-body">
                      <span className="item-name">{item.color} {item.type}</span>
                      <span className="item-meta">{item.style}{item.notes ? ` · ${item.notes}` : ""}</span>
                    </div>
                    <button className="item-remove" onClick={() => removeItem(i)}>✕</button>
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

        {/* ══════════════════════════════════════════════════
            TAB: GENERATE
        ══════════════════════════════════════════════════ */}
        {tab === "generate" && (
          <div className="panel">
            <div className="section-header">
              <h2>Generate Outfits</h2>
              <p className="section-sub">
                Tell WardrobeAI your occasion. The RAG system will retrieve relevant
                fashion rules to ground the suggestions.
              </p>
            </div>

            <div className="generate-form">
              <div className="field field-full">
                <label>Occasion *</label>
                <input
                  className="input-lg"
                  placeholder="e.g. Business casual Friday, Date night, Job interview, Casual weekend..."
                  value={occasion}
                  onChange={e => setOccasion(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && generateOutfits()}
                />
              </div>
              <div className="field field-full">
                <label>Style preference <span className="optional">(optional)</span></label>
                <input
                  className="input-lg"
                  placeholder="e.g. Minimalist, Smart casual, Streetwear, Classic..."
                  value={stylePref}
                  onChange={e => setStylePref(e.target.value)}
                />
              </div>

              {error && <div className="inline-msg error">{error}</div>}

              <div className="generate-actions">
                <div className="wardrobe-count-chip">
                  {wardrobe.length} item{wardrobe.length !== 1 ? "s" : ""} in closet
                  {wardrobe.length === 0 && (
                    <button className="link-btn" onClick={() => setTab("closet")}> — add some first</button>
                  )}
                </div>
                <button
                  className={`btn btn-primary btn-xl ${loading ? "btn-loading" : ""}`}
                  onClick={generateOutfits}
                  disabled={loading}
                >
                  {loading ? (
                    <><span className="spinner" />Generating…</>
                  ) : "Get Outfits"}
                </button>
              </div>
            </div>

            {/* RAG explanation card */}
            <div className="rag-explainer-card">
              <div className="rag-explainer-icon">🧠</div>
              <div>
                <strong>How RAG improves your results</strong>
                <p>
                  When you hit "Get Outfits", WardrobeAI first <em>retrieves</em> the most relevant
                  fashion rules from its {ragKb.length}-document knowledge base (matching on occasion
                  keywords + your wardrobe styles). These rules are then <em>injected</em> into the
                  prompt before the LLM generates suggestions — that's Retrieval-Augmented Generation.
                  The retrieved rules appear in the Outfits tab so you can see exactly what knowledge
                  grounded the response.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB: OUTFITS
        ══════════════════════════════════════════════════ */}
        {tab === "outfits" && outfitResult && (
          <div className="panel">
            <div className="section-header">
              <h2>Your Outfits</h2>
              <p className="section-sub">For: <em>{occasion}</em>{stylePref ? ` · ${stylePref}` : ""}</p>
            </div>

            {/* RAG retrieved docs */}
            {ragDocs.length > 0 && (
              <div className="rag-retrieved">
                <div className="rag-retrieved-header">
                  <span className="rag-label">RAG</span>
                  <span>{ragDocs.length} fashion rule{ragDocs.length !== 1 ? "s" : ""} retrieved and used to ground this response</span>
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

            {/* Outfit response */}
            <div className="outfit-response">
              <ReactMarkdown>{outfitResult}</ReactMarkdown>
            </div>

            {/* Follow-up chat */}
            <div className="followup-section">
              <h3 className="followup-title">Refine or ask follow-up questions</h3>
              <p className="followup-sub">Try: "Make Outfit 2 more formal" · "Swap the sneakers for boots" · "What if it's cold outside?"</p>

              {chatHistory.length > 0 && (
                <div className="chat-history">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                      <div className="chat-bubble">
                        {msg.role === "user"
                          ? msg.content
                          : <ReactMarkdown>{msg.content}</ReactMarkdown>
                        }
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
                <input
                  className="chat-input"
                  placeholder="Ask a follow-up question..."
                  value={followup}
                  onChange={e => setFollowup(e.target.value)}
                  onKeyDown={handleFollowupKey}
                  disabled={chatLoading}
                />
                <button
                  className={`btn btn-primary ${chatLoading ? "btn-loading" : ""}`}
                  onClick={sendFollowup}
                  disabled={chatLoading || !followup.trim()}
                >
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

// Map color names to approximate hex for visual dots
function colorDot(color) {
  const map = {
    white: "#f5f5f5", black: "#222", navy: "#1a2a5e", grey: "#9e9e9e",
    gray: "#9e9e9e", olive: "#6b7c3a", cream: "#f5f0e0", charcoal: "#444",
    tan: "#c4a56a", beige: "#d9c9a8", "dark wash": "#2c3e6b", canvas: "#c8b97a",
    red: "#c62828", blue: "#1565c0", green: "#2e7d32", brown: "#5d4037",
    pink: "#e91e8c", yellow: "#f9a825", orange: "#e65100", purple: "#6a1b9a",
  };
  return map[color.toLowerCase()] || "#bdbdbd";
}
