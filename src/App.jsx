import { useState, useEffect } from "react"
import { supabase } from "./supabaseClient"
import "./App.css"

const SCREEN = { SELECT: "select", CARDS: "cards", SUMMARY: "summary" }

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

export default function App() {
  const [screen, setScreen]           = useState(SCREEN.SELECT)
  const [papers, setPapers]           = useState([])
  const [topics, setTopics]           = useState([])
  const [selectedPaper, setSelectedPaper] = useState(null)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [cards, setCards]             = useState([])
  const [results, setResults]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  useEffect(() => {
    async function loadPapers() {
      setLoading(true)
      const { data, error } = await supabase
        .from("paper")
        .select(`
          id, paper_number, paper_name, year, season,
          subject!inner ( id, name, qualification,
            exam_board!inner ( name, slug ) )
        `)
        .eq("subject.exam_board.slug", "edexcel")
        .order("paper_number")
        .order("year", { ascending: false })
      if (error) { setError(error.message); setLoading(false); return }
      setPapers(data || [])
      setLoading(false)
    }
    loadPapers()
  }, [])

  useEffect(() => {
    if (!selectedPaper) return
    async function loadTopics() {
      const { data, error } = await supabase
        .from("topic")
        .select("id, name, slug, display_order")
        .eq("subject_id", selectedPaper.subject.id)
        .order("display_order")
      if (!error) setTopics(data || [])
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
          <span className="logo">GCSE Revision</span>
          <div className="header-pills">
            <span className="pill pill-purple">Edexcel</span>
            <span className="pill pill-gray">Geography B</span>
          </div>
        </div>
      </header>
      <main className="app-main">
        {screen === SCREEN.SELECT && (
          <SelectScreen
            papers={papers}
            topics={topics}
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

function SelectScreen({ papers, topics, selectedPaper, selectedTopic, onSelectPaper, onSelectTopic, onStart, loading }) {
  const grouped = papers.reduce((acc, p) => {
    const key = p.paper_number
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})
  const paperNumbers = Object.keys(grouped).sort()
  const [activePaperNum, setActivePaperNum] = useState(null)
  const [activeYear, setActiveYear]         = useState(null)

  function handlePaperNum(num) {
    setActivePaperNum(num)
    setActiveYear(null)
    onSelectPaper(null)
    onSelectTopic(null)
  }

  function handleYear(paper) {
    setActiveYear(paper.year)
    onSelectPaper(paper)
    onSelectTopic(null)
  }

  return (
    <div className="screen-select">
      <h1 className="screen-title">What are you revising?</h1>
      {loading && <p className="loading-text">Loading papers…</p>}
      {!loading && (
        <>
          <section className="select-section">
            <p className="select-label">Select a paper</p>
            <div className="btn-row">
              {paperNumbers.map(num => (
                <button
                  key={num}
                  className={`btn-paper ${activePaperNum === num ? "active" : ""}`}
                  onClick={() => handlePaperNum(num)}
                >
                  <span className="paper-number">Paper {num}</span>
                  <span className="paper-name">{grouped[num][0].paper_name}</span>
                </button>
              ))}
            </div>
          </section>
          {activePaperNum && (
            <section className="select-section">
              <p className="select-label">Select a year</p>
              <div className="btn-row">
                {grouped[activePaperNum].map(paper => (
                  <button
                    key={paper.id}
                    className={`btn-year ${activeYear === paper.year ? "active" : ""}`}
                    onClick={() => handleYear(paper)}
                  >
                    {paper.year}
                  </button>
                ))}
              </div>
            </section>
          )}
          {selectedPaper && topics.length > 0 && (
            <section className="select-section">
              <p className="select-label">Select a topic</p>
              <div className="topic-list">
                <button
                  className={`btn-topic ${selectedTopic === "all" ? "active" : ""}`}
                  onClick={() => onSelectTopic("all")}
                >
                  <span>All topics</span>
                </button>
                {topics.map(t => (
                  <button
                    key={t.id}
                    className={`btn-topic ${selectedTopic === t.id ? "active" : ""}`}
                    onClick={() => onSelectTopic(t.id)}
                  >
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {selectedTopic && (
            <button className="btn-start" onClick={() => onStart(selectedTopic)}>
              Start revision
            </button>
          )}
        </>
      )}
    </div>
  )
}

function CardScreen({ cards, paper, topicName, onComplete, onBack }) {
  const [index, setIndex]     = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [results, setResults] = useState([])
  const card     = cards[index]
  const total    = cards.length
  const progress = Math.round((index / total) * 100)

  function flip() {
    if (!flipped) setFlipped(true)
  }

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
        <span className="pill pill-teal">Paper {paper.paper_number}</span>
        <span className="pill pill-gray">{paper.year}</span>
        {card.question_ref && <span className="pill pill-purple">{card.question_ref}</span>}
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

function SummaryScreen({ results, paper, topicName, onRetry, onNewTopic }) {
  const knew   = results.filter(r => r.knew).length
  const missed = results.filter(r => !r.knew).length
  const total  = results.length

  return (
    <div className="screen-summary">
      <h1 className="screen-title">Session complete</h1>
      <p className="summary-subtitle">
        Paper {paper.paper_number} · {paper.year} · {topicName}
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
          <button className="btn-primary" onClick={onRetry}>Retry missed cards</button>
        )}
        <button className="btn-primary" onClick={onNewTopic}>Choose new topic</button>
      </div>
    </div>
  )
}