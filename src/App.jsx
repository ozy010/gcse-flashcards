import { useState, useEffect } from "react"
import { supabase } from "./supabaseClient"
import "./App.css"

const SCREEN = { SELECT: "select", CARDS: "cards", SUMMARY: "summary" }

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

export default function App() {
  const [screen, setScreen]               = useState(SCREEN.SELECT)
  const [allPapers, setAllPapers]         = useState([])
  const [topics, setTopics]               = useState([])
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [selectedPaper, setSelectedPaper] = useState(null)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [cards, setCards]                 = useState([])
  const [results, setResults]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)

  // Load only papers that have at least one published flashcard
  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: pubCards, error: e1 } = await supabase
        .from("flashcard")
        .select("paper_id")
        .eq("is_published", true)
        .not("paper_id", "is", null)
      if (e1) { setError(e1.message); setLoading(false); return }

      const paperIds = [...new Set((pubCards || []).map(f => f.paper_id))]
      if (paperIds.length === 0) { setAllPapers([]); setLoading(false); return }

      const { data, error: e2 } = await supabase
        .from("paper")
        .select(`
          id, paper_number, paper_name, year,
          subject!inner(id, name,
            exam_board!inner(id, name, slug)
          )
        `)
        .in("id", paperIds)
        .order("paper_number")
        .order("year", { ascending: false })
      if (e2) { setError(e2.message); setLoading(false); return }
      setAllPapers(data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Load only topics that have published cards for the selected paper
  useEffect(() => {
    if (!selectedPaper) { setTopics([]); return }
    setTopicsLoading(true)
    async function loadTopics() {
      const { data: pubCards } = await supabase
        .from("flashcard")
        .select("topic_id")
        .eq("paper_id", selectedPaper.id)
        .eq("is_published", true)
        .not("topic_id", "is", null)
      const ids = [...new Set((pubCards || []).map(c => c.topic_id))]
      if (ids.length === 0) { setTopics([]); setTopicsLoading(false); return }
      const { data } = await supabase
        .from("topic")
        .select("id, name, display_order")
        .in("id", ids)
        .order("display_order")
      setTopics(data || [])
      setTopicsLoading(false)
    }
    loadTopics()
  }, [selectedPaper])

  async function startSession(topicId) {
    setLoading(true)
    let query = supabase
      .from("flashcard")
      .select("id, question_ref, question, answer, marks, command_word, difficulty, topic_id")
      .eq("paper_id", selectedPaper.id)
      .eq("is_published", true)
    if (topicId !== "all") query = query.eq("topic_id", topicId)
    const { data, error } = await query
    if (error) { setError(error.message); setLoading(false); return }
    setCards(shuffle(data || []))
    setResults([])
    setLoading(false)
    setScreen(SCREEN.CARDS)
  }

  function handleSessionComplete(sessionResults) {
    setResults(sessionResults)
    setScreen(SCREEN.SUMMARY)
  }

  function retryMissed() {
    const missed = results.filter(r => !r.knew).map(r => r.card)
    setCards(shuffle(missed))
    setResults([])
    setScreen(SCREEN.CARDS)
  }

  function reset() {
    setSelectedPaper(null)
    setSelectedTopic(null)
    setCards([])
    setResults([])
    setScreen(SCREEN.SELECT)
  }

  if (error) return (
    <div className="error-state">
      <p>Something went wrong: {error}</p>
      <button onClick={() => setError(null)}>Try again</button>
    </div>
  )

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <h1 className="brand-title">Locked In Learning</h1>
        </div>
      </header>
      <main className="app-main">
        {screen === SCREEN.SELECT && (
          <SelectScreen
            allPapers={allPapers}
            topics={topics}
            topicsLoading={topicsLoading}
            selectedPaper={selectedPaper}
            selectedTopic={selectedTopic}
            onSelectPaper={p => { setSelectedPaper(p); setSelectedTopic(null) }}
            onSelectTopic={setSelectedTopic}
            onStart={startSession}
            loading={loading}
          />
        )}
        {screen === SCREEN.CARDS && (
          <CardScreen
            cards={cards}
            paper={selectedPaper}
            topicName={selectedTopic === "all"
              ? "All topics"
              : topics.find(t => t.id === selectedTopic)?.name}
            onComplete={handleSessionComplete}
            onBack={reset}
          />
        )}
        {screen === SCREEN.SUMMARY && (
          <SummaryScreen
            results={results}
            paper={selectedPaper}
            topicName={selectedTopic === "all"
              ? "All topics"
              : topics.find(t => t.id === selectedTopic)?.name}
            onRetry={retryMissed}
            onNewTopic={reset}
          />
        )}
      </main>
    </div>
  )
}

// ── Select screen ─────────────────────────────────────────────────────────────
function SelectScreen({ allPapers, topics, topicsLoading, selectedPaper, selectedTopic, onSelectPaper, onSelectTopic, onStart, loading }) {
  const [subjectName, setSubjectName] = useState(null)
  const [boardSlug, setBoardSlug]     = useState(null)
  const [paperNum, setPaperNum]       = useState(null)

  // Each level derived only from papers that have published cards
  const subjectNames = [...new Set(allPapers.map(p => p.subject.name))].sort()

  const papersForSubject = allPapers.filter(p => p.subject.name === subjectName)
  const boardsForSubject = Object.values(
    papersForSubject.reduce((acc, p) => {
      const b = p.subject.exam_board
      if (!acc[b.slug]) acc[b.slug] = b
      return acc
    }, {})
  )

  const papersForBoard = papersForSubject.filter(p => p.subject.exam_board.slug === boardSlug)
  const grouped = papersForBoard.reduce((acc, p) => {
    const key = p.paper_number
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})
  const paperNumbers = Object.keys(grouped).sort()
  const yearsForPaper = paperNum ? grouped[paperNum] : []

  function handleSubject(name) {
    setSubjectName(name); setBoardSlug(null); setPaperNum(null)
    onSelectPaper(null); onSelectTopic(null)
  }
  function handleBoard(slug) {
    setBoardSlug(slug); setPaperNum(null)
    onSelectPaper(null); onSelectTopic(null)
  }
  function handlePaperNum(num) {
    setPaperNum(num)
    onSelectPaper(null); onSelectTopic(null)
  }
  function handleYear(paper) {
    onSelectPaper(paper); onSelectTopic(null)
  }

  if (loading) return <p className="loading-text">Loading…</p>

  if (allPapers.length === 0) return (
    <div className="empty-state">No revision materials available yet.</div>
  )

  const chevron = (
    <svg className="paper-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5.5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )

  return (
    <div className="screen-select">

      {/* Step 1 — Subject */}
      <section className="select-section">
        <p className="select-prompt">What are you revising?</p>
        <div className="btn-row">
          {subjectNames.map((name, i) => (
            <button
              key={name}
              className={`btn-paper ${subjectName === name ? "active" : ""}`}
              onClick={() => handleSubject(name)}
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <div className="paper-btn-text">
                <span className="paper-name">{name}</span>
              </div>
              {chevron}
            </button>
          ))}
        </div>
      </section>

      {/* Step 2 — Exam board */}
      {subjectName && (
        <section className="select-section">
          <p className="select-label">Which exam board?</p>
          <div className="btn-row">
            {boardsForSubject.map(b => (
              <button
                key={b.slug}
                className={`btn-year ${boardSlug === b.slug ? "active" : ""}`}
                onClick={() => handleBoard(b.slug)}
              >
                {b.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 3 — Paper number */}
      {boardSlug && (
        <section className="select-section">
          <p className="select-label">Choose a paper</p>
          <div className="btn-row">
            {paperNumbers.map((num, i) => (
              <button
                key={num}
                className={`btn-paper ${paperNum === num ? "active" : ""}`}
                onClick={() => handlePaperNum(num)}
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <div className="paper-btn-text">
                  <span className="paper-number">{num}</span>
                  <span className="paper-name">{grouped[num][0].paper_name}</span>
                </div>
                {chevron}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 4 — Year */}
      {paperNum && (
        <section className="select-section">
          <p className="select-label">Which year?</p>
          <div className="btn-row">
            {yearsForPaper.map(paper => (
              <button
                key={paper.id}
                className={`btn-year ${selectedPaper?.id === paper.id ? "active" : ""}`}
                onClick={() => handleYear(paper)}
              >
                {paper.year}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 5 — Topic (optional) */}
      {selectedPaper && topicsLoading && (
        <p className="loading-text" style={{ marginTop: 4 }}>Loading topics…</p>
      )}
      {selectedPaper && !topicsLoading && topics.length > 0 && (
        <section className="select-section">
          <p className="select-label">
            Filter by topic
            <span className="select-label-hint"> — optional</span>
          </p>
          <div className="topic-list">
            <button
              className={`btn-topic ${selectedTopic === "all" ? "active" : ""}`}
              onClick={() => onSelectTopic("all")}
              style={{ animationDelay: "0ms" }}
            >
              <span>All topics</span>
            </button>
            {topics.map((t, i) => (
              <button
                key={t.id}
                className={`btn-topic ${selectedTopic === t.id ? "active" : ""}`}
                onClick={() => onSelectTopic(t.id)}
                style={{ animationDelay: `${(i + 1) * 80}ms` }}
              >
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Start */}
      {selectedPaper && !topicsLoading && (
        <button className="btn-start" onClick={() => onStart(selectedTopic || "all")}>
          {selectedTopic && selectedTopic !== "all"
            ? `Start revision — ${topics.find(t => t.id === selectedTopic)?.name}`
            : "Start revision"}
        </button>
      )}
    </div>
  )
}

// ── Card screen ───────────────────────────────────────────────────────────────
function CardScreen({ cards, paper, topicName, onComplete, onBack }) {
  const [index, setIndex]     = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [results, setResults] = useState([])
  const card     = cards[index]
  const total    = cards.length
  const progress = Math.round((index / total) * 100)

  function flip() { if (!flipped) setFlipped(true) }

  function mark(knew) {
    const newResults = [...results, { card, knew }]
    if (index + 1 >= total) {
      onComplete(newResults)
    } else {
      setResults(newResults)
      setIndex(index + 1)
      setFlipped(false)
    }
  }

  if (!card) return null

  return (
    <div className="screen-cards">
      <div className="cards-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <span className="card-counter">{index + 1} / {total}</span>
      </div>
      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="card-meta">
        <span className="pill pill-teal">{paper.paper_number}</span>
        <span className="pill pill-gray">{paper.year}</span>
        {topicName && <span className="pill pill-purple">{topicName}</span>}
        {card.question_ref && <span className="pill pill-gray">{card.question_ref}</span>}
      </div>
      <div
        className={`card-flip ${flipped ? "flipped" : ""}`}
        onClick={flip}
        role="button"
        tabIndex={0}
        aria-label={flipped ? "Answer shown" : "Tap to reveal answer"}
        onKeyDown={e => (e.key === "Enter" || e.key === " ") && flip()}
      >
        <div className="card-inner">
          <div className="card-face card-front">
            <p className="card-face-label">Question</p>
            <p className="card-question">{card.question}</p>
            {!flipped && <p className="card-hint">Tap to reveal answer</p>}
          </div>
          <div className="card-face card-back">
            <p className="card-face-label">Answer</p>
            <p className="card-answer">{card.answer}</p>
            {card.marks && (
              <p className="card-marks">{card.marks} mark{card.marks > 1 ? "s" : ""}</p>
            )}
          </div>
        </div>
      </div>
      {flipped && (
        <div className="action-btns">
          <p className="action-label">How did you do?</p>
          <div className="btn-row">
            <button className="btn-missed" onClick={() => mark(false)}>✕ Missed it</button>
            <button className="btn-knew"   onClick={() => mark(true)}>✓ Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Summary screen ────────────────────────────────────────────────────────────
function SummaryScreen({ results, paper, topicName, onRetry, onNewTopic }) {
  const knew   = results.filter(r => r.knew).length
  const missed = results.filter(r => !r.knew).length
  const total  = results.length

  return (
    <div className="screen-summary">
      <h2 className="screen-title">Session complete</h2>
      <p className="summary-subtitle">
        {paper.paper_number} · {paper.year}{topicName ? ` · ${topicName}` : ""}
      </p>
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Reviewed</p>
          <p className="stat-value">{total}</p>
        </div>
        <div className="stat-card stat-knew">
          <p className="stat-label">Got it</p>
          <p className="stat-value">{knew}</p>
        </div>
        <div className="stat-card stat-missed">
          <p className="stat-label">Missed</p>
          <p className="stat-value">{missed}</p>
        </div>
      </div>
      <div className="summary-list">
        <p className="summary-list-title">Card breakdown</p>
        {results.map((r, i) => (
          <div key={i} className="summary-row">
            <span className="summary-q">
              {r.card.question.length > 60
                ? r.card.question.slice(0, 60) + "…"
                : r.card.question}
            </span>
            <span className={`pill ${r.knew ? "pill-teal" : "pill-coral"}`}>
              {r.knew ? "Got it" : "Missed"}
            </span>
          </div>
        ))}
      </div>
      <div className="btn-row">
        {missed > 0 && (
          <button className="btn-primary" onClick={onRetry}>Retry missed</button>
        )}
        <button className="btn-primary" onClick={onNewTopic}>Start over</button>
      </div>
    </div>
  )
}
