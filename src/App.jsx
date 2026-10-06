import React, { useEffect, useRef, useState } from "react";
import "./App.css";

// ============================================================
// BACKEND API
// ============================================================

// LOCAL:
// const API_URL = "http://127.0.0.1:8000";

// RENDER:
// Replace this with your actual FastAPI Render URL.
const API_URL = "https://gdi-2-backend.onrender.com";

function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const chatEndRef = useRef(null);

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
      console.error(
        "Gemini error:",
        err
      );

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
  // MAIN APP
  // ============================================================

  return (
    <div className="app">

      {/* SIDEBAR */}

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
            className="nav-item active"
            type="button"
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


      {/* MAIN */}

      <main className="main">

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

      </main>

    </div>
  );
}

export default App;