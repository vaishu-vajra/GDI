import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import Dashboard from "./Dashboard";

// ============================================================
// BACKEND API
// ============================================================

const API_URL = "https://gdi-2-backend.onrender.com";

function App() {
  // ============================================================
  // GLOBAL APP STATE
  // ============================================================

  const [currentPage, setCurrentPage] = useState("Dashboard");

  // Dashboard / company data
  const [documents, setDocuments] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  // Investment data
  // Keep this empty until the investments API/table is connected.
  const [investments] = useState([]);

  // ============================================================
  // ASK GEMINI STATE
  // ============================================================

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const chatEndRef = useRef(null);

  // ============================================================
  // LOAD DASHBOARD DATA
  // ============================================================

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setDashboardLoading(true);
    setDashboardError("");

    try {
      const response = await fetch(`${API_URL}/dashboard`);

      if (!response.ok) {
        throw new Error("Could not load dashboard data.");
      }

      const data = await response.json();

      setDocuments(data.documents || []);
    } catch (err) {
      console.error("Dashboard error:", err);
      setDashboardError(
        err.message || "Could not load dashboard data."
      );
    } finally {
      setDashboardLoading(false);
    }
  }

  // ============================================================
  // SCROLL CHAT
  // ============================================================

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  // ============================================================
  // ASK GEMINI
  // ============================================================

  async function askGemini(event) {
    if (event) {
      event.preventDefault();
    }

    const cleanQuestion = question.trim();

    if (!cleanQuestion) {
      return;
    }

    setError("");

    const userMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text: cleanQuestion,
    };

    setMessages((previous) => [
      ...previous,
      userMessage,
    ]);

    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/ask`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: cleanQuestion,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Gemini request failed."
        );
      }

      const assistantMessage = {
        id: `${Date.now()}-gemini`,
        role: "assistant",
        text:
          data.answer ||
          "Gemini did not return an answer.",
      };

      setMessages((previous) => [
        ...previous,
        assistantMessage,
      ]);
    } catch (err) {
      console.error("Gemini error:", err);

      setMessages((previous) => [
        ...previous,
        {
          id: `${Date.now()}-error`,
          role: "assistant",
          text:
            err.message ||
            "Something went wrong.",
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // NEW CHAT
  // ============================================================

  function startNewChat() {
    setMessages([]);
    setQuestion("");
    setError("");
  }

  // ============================================================
  // PAGE NAVIGATION
  // ============================================================

  function navigate(page) {
    setCurrentPage(page);
  }

  // ============================================================
  // PLACEHOLDER PAGES
  // ============================================================

  function PlaceholderPage({ title, description }) {
    return (
      <div className="placeholder-page">
        <div className="placeholder-card">
          <h1>{title}</h1>
          <p>{description}</p>
          {title === "Companies" && (
            <div className="placeholder-company-count">
              {documents.length} indexed document
              {documents.length !== 1 ? "s" : ""} available
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // MAIN APP
  // ============================================================

  return (
    <div className="app">

      {/* ======================================================
          SIDEBAR
          ====================================================== */}

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-mark">
            F
          </div>

          <span>
            FinSight
          </span>

        </div>

        <nav className="sidebar-nav">

          <button
            className={`nav-item ${
              currentPage === "Dashboard"
                ? "active"
                : ""
            }`}
            type="button"
            onClick={() => navigate("Dashboard")}
          >
            ▦ Dashboard
          </button>


          <button
            className={`nav-item ${
              currentPage === "Ask Gemini"
                ? "active"
                : ""
            }`}
            type="button"
            onClick={() => navigate("Ask Gemini")}
          >
            ✦ Ask Gemini
          </button>

        </nav>

        <div className="sidebar-bottom">

          <div className="sidebar-status">

            <span className="status-dot"></span>

            <span>
              FinSight AI
            </span>

          </div>

        </div>

      </aside>


      {/* ======================================================
          MAIN CONTENT
          ====================================================== */}

      <main className="main">

        {/* ====================================================
            DASHBOARD
            ==================================================== */}

        {currentPage === "Dashboard" && (
          <div className="dashboard-page-wrapper">

            {dashboardError && (
              <div className="dashboard-error">
                {dashboardError}
              </div>
            )}

            <Dashboard
              documents={documents}
              investments={investments}
              onNavigate={navigate}
            />

            {dashboardLoading && (
              <div className="dashboard-loading">
                Loading company research...
              </div>
            )}

          </div>
        )}


        {/* ====================================================
            ASK GEMINI
            ==================================================== */}

        {currentPage === "Ask Gemini" && (

          <div className="chat-page">

            {/* CHAT HEADER */}

            <div className="chat-header">

              <div className="chat-title">

                <div className="gemini-small-icon">
                  ✦
                </div>

                <div>

                  <h1>
                    FinSight
                  </h1>

                  <span>
                    Financial document
                    intelligence
                  </span>

                </div>

              </div>


              <button
                className="new-chat-button"
                onClick={startNewChat}
                type="button"
              >
                ＋ New chat
              </button>

            </div>


            {/* CHAT AREA */}

            <div className="chat-area">

              {messages.length === 0 &&
              !loading ? (

                <div className="welcome-container">

                  <div className="welcome-icon">
                    ✦
                  </div>

                  <h2>
                    How can I help you?
                  </h2>

                  <p>
                    Ask questions about
                    your company's financial
                    information.
                  </p>

                </div>

              ) : (

                <div className="conversation">

                  {messages.map(
                    (message, index) => (

                      <div
                        key={
                          message.id ||
                          `message-${index}`
                        }
                        className={
                          message.role ===
                          "user"
                            ? "message-row user-row"
                            : "message-row"
                        }
                      >

                        {message.role ===
                          "assistant" && (

                          <div className="assistant-avatar">
                            ✦
                          </div>

                        )}

                        <div
                          className={
                            message.role ===
                            "user"
                              ? "user-message"
                              : "assistant-message"
                          }
                        >

                          {message.role ===
                            "assistant" && (

                            <div className="answer-label">
                              Gemini
                            </div>

                          )}

                          <div className="message-text">
                            {message.text}
                          </div>

                        </div>

                      </div>

                    )
                  )}


                  {/* LOADING */}

                  {loading && (

                    <div className="message-row">

                      <div className="assistant-avatar">
                        ✦
                      </div>

                      <div className="assistant-message">

                        <div className="answer-label">
                          Gemini
                        </div>

                        <div className="typing-indicator">

                          <span></span>
                          <span></span>
                          <span></span>

                        </div>

                      </div>

                    </div>

                  )}

                  <div ref={chatEndRef} />

                </div>

              )}

            </div>


            {/* ERROR */}

            {error && (

              <div className="error-box">
                {error}
              </div>

            )}


            {/* COMPOSER */}

            <div className="composer-wrapper">

              <form
                className="composer"
                onSubmit={askGemini}
              >

                <textarea
                  value={question}
                  onChange={(event) =>
                    setQuestion(
                      event.target.value
                    )
                  }
                  onKeyDown={(event) => {

                    if (
                      event.key === "Enter" &&
                      !event.shiftKey
                    ) {

                      event.preventDefault();

                      askGemini();

                    }

                  }}
                  placeholder="Ask anything about your company's financial information..."
                  disabled={loading}
                  rows="1"
                />


                <div className="composer-bottom">

                  <div className="composer-actions">

                    <span className="composer-hint">
                      Enter to send
                    </span>

                  </div>


                  <button
                    type="submit"
                    className="send-button"
                    disabled={
                      loading ||
                      !question.trim()
                    }
                  >
                    ↑
                  </button>

                </div>

              </form>


              <p className="composer-disclaimer">
                FinSight answers using
                information from the
                company's connected
                financial documents.
              </p>

            </div>

          </div>

        )}


        {/* ====================================================
            OTHER PAGES
            ==================================================== */}



        {currentPage !== "Dashboard" &&
          currentPage !== "Ask Gemini" && (
            <Dashboard
              documents={documents}
              investments={investments}
              onNavigate={navigate}
            />
        )}

      </main>

    </div>
  );
}

export default App;
