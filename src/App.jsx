import React, { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [currentPage, setCurrentPage] = useState("ask");

  const [documents, setDocuments] = useState([]);

  const [question, setQuestion] = useState("");

  const [messages, setMessages] = useState([]);

  const [loading, setLoading] = useState(false);

  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState("");

  const fileInputRef = useRef(null);

  const chatEndRef = useRef(null);


  /* ============================================================
     LOAD DOCUMENTS
  ============================================================ */

  useEffect(() => {
    loadDocuments();
  }, []);


  /* ============================================================
     SCROLL CHAT
  ============================================================ */

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);


  /* ============================================================
     GET DOCUMENTS
  ============================================================ */

async function loadDocuments() {
  try {
    const response = await fetch(
      `${API_URL}/documents`
    );

    if (!response.ok) {
      throw new Error("Could not load documents.");
    }

    const data = await response.json();

    console.log("RAW DOCUMENT RESPONSE:", data);

    const rawDocuments = Array.isArray(data.documents)
      ? data.documents
      : [];

    const normalizedDocuments = rawDocuments.map(
      (doc, index) => ({
        id:
          doc.id ||
          doc.name ||
          doc.filename ||
          `document-${index}`,

        name:
          doc.name ||
          doc.filename ||
          doc.file_name ||
          doc.original_name ||
          "Unnamed document",

        size: doc.size || 0,
      })
    );

    console.log(
      "NORMALIZED DOCUMENTS:",
      normalizedDocuments
    );

    setDocuments(normalizedDocuments);

  } catch (err) {
    console.error(
      "Load documents error:",
      err
    );

    setDocuments([]);
  }
}

  /* ============================================================
     UPLOAD DOCUMENT
  ============================================================ */

  async function handleUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploading(true);

    setError("");

    const formData = new FormData();

    formData.append("file", file);

    try {
      const response = await fetch(
        `${API_URL}/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Document upload failed."
        );
      }

      await loadDocuments();

      setCurrentPage("ask");

    } catch (err) {
      console.error(
        "Upload error:",
        err
      );

      setError(
        err.message ||
          "Could not upload document."
      );

    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }


  /* ============================================================
     DELETE DOCUMENT
  ============================================================ */

async function removeDocument(name) {

  if (!name) {
    console.error(
      "Cannot delete document: name is missing."
    );

    setError(
      "Could not identify the document."
    );

    return;
  }

  console.log(
    "Deleting:",
    name
  );

  try {

    const response = await fetch(
      `${API_URL}/documents/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail ||
        "Could not remove document."
      );
    }

    await loadDocuments();

    setError("");

  } catch (err) {

    console.error(
      "Delete error:",
      err
    );

    setError(
      err.message ||
      "Could not remove the uploaded document."
    );
  }
}

  /* ============================================================
     ASK GEMINI
  ============================================================ */

  async function askGemini(event) {
    if (event) {
      event.preventDefault();
    }

    const cleanQuestion =
      question.trim();

    if (!cleanQuestion) {
      return;
    }

    if (documents.length === 0) {
      setError(
        "Please upload at least one document first."
      );

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
            "Content-Type":
              "application/json",
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


  /* ============================================================
     FILE SIZE
  ============================================================ */

  function formatFileSize(bytes) {
    if (!bytes) {
      return "Size unavailable";
    }

    const kb = bytes / 1024;

    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }

    return `${(
      kb / 1024
    ).toFixed(1)} MB`;
  }


  /* ============================================================
     NEW CHAT
  ============================================================ */

  function startNewChat() {
    setMessages([]);

    setQuestion("");

    setError("");
  }


  /* ============================================================
     UPLOAD PAGE
  ============================================================ */

  function renderUploadPage() {
    return (
      <div className="page-content upload-page">

        {/* HEADER */}

        <div className="upload-header">

          <div>

            <p className="page-eyebrow">
              DOCUMENT MANAGEMENT
            </p>

            <h1>
              Upload Documents
            </h1>

            <p className="page-description">
              Add financial documents to
              analyze them with Gemini.
            </p>

          </div>

        </div>


        {/* UPLOAD CARD */}

        <div className="upload-container">

          <div className="upload-icon">
            ☁
          </div>

          <h2>
            Upload a document
          </h2>

          <p>
            Upload financial PDFs to
            start asking questions.
          </p>

          <button
            className="upload-button"
            type="button"
            onClick={() =>
              fileInputRef.current?.click()
            }
            disabled={uploading}
          >
            {uploading
              ? "Uploading..."
              : "Choose PDF"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleUpload}
            hidden
          />

          <span className="upload-hint">
            PDF files supported
          </span>

        </div>


        {/* ERROR */}

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}


        {/* DOCUMENTS */}

        <div className="documents-container">

          <div className="documents-title">

            <div>

              <h2>
                Uploaded documents
              </h2>

              <p>
                {documents.length} document
                {documents.length !== 1
                  ? "s"
                  : ""}
              </p>

            </div>

          </div>


          {documents.length === 0 ? (

            <div className="empty-documents">

              <div className="empty-document-icon">
                📄
              </div>

              <h3>
                No documents uploaded yet
              </h3>

              <p>
                Upload a financial document
                to get started.
              </p>

            </div>

          ) : (

 <div className="document-list">

  {documents.map((document, index) => (

    <div
      className="document-item"
      key={
        document.id ||
        `document-${index}`
      }
    >

      <div className="document-icon">
        📄
      </div>


      <div className="document-details">

        <strong
          title={document.name}
        >
          {document.name}
        </strong>

        <span>
          {formatFileSize(document.size)}
        </span>

      </div>


      <button
        className="document-delete"
        type="button"
        onClick={() =>
          removeDocument(document.name)
        }
        title="Remove document"
      >
        ×
      </button>

    </div>

  ))}

</div>

          )}

        </div>

      </div>
    );
  }


  /* ============================================================
     ASK GEMINI PAGE
  ============================================================ */

  function renderAskPage() {
    return (
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
                Ask questions about all
                your uploaded financial
                documents.
              </p>


              {documents.length === 0 ? (

                <button
                  className="welcome-upload"
                  onClick={() =>
                    setCurrentPage(
                      "upload"
                    )
                  }
                  type="button"
                >
                  Upload a document
                </button>

              ) : (

                <div className="document-ready">

                  <span>
                    ✓
                  </span>

                  <span>
                    {documents.length} uploaded
                    document
                    {documents.length !== 1
                      ? "s"
                      : ""}{" "}
                    available
                  </span>

                </div>

              )}

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


        {/* COMPOSER */}

        <div className="composer-wrapper">

          {documents.length > 0 && (

            <div className="selected-document-bar">

              <div className="selected-document-left">

                <span>
                  📎
                </span>

                <span>
                  {documents.length} uploaded
                  document
                  {documents.length !== 1
                    ? "s"
                    : ""}{" "}
                  — Gemini will search
                  all documents
                </span>

              </div>


              <button
                type="button"
                onClick={() =>
                  setCurrentPage(
                    "upload"
                  )
                }
              >
                Manage
              </button>

            </div>

          )}


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
              placeholder={
                documents.length > 0
                  ? "Ask anything about your uploaded documents..."
                  : "Upload a document to start..."
              }
              disabled={
                loading ||
                documents.length === 0
              }
              rows="1"
            />


            <div className="composer-bottom">

              <div className="composer-actions">

                <button
                  type="button"
                  className="composer-icon"
                  onClick={() =>
                    setCurrentPage(
                      "upload"
                    )
                  }
                >
                  ＋
                </button>

                <span className="composer-hint">
                  Enter to send
                </span>

              </div>


              <button
                type="submit"
                className="send-button"
                disabled={
                  loading ||
                  !question.trim() ||
                  documents.length === 0
                }
              >
                ↑
              </button>

            </div>

          </form>


          <p className="composer-disclaimer">
            FinSight answers using
            information from all your
            uploaded documents.
          </p>

        </div>

      </div>
    );
  }


  /* ============================================================
     MAIN APP
  ============================================================ */

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
            className={
              currentPage === "ask"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              setCurrentPage("ask")
            }
            type="button"
          >
            ✦ Ask Gemini
          </button>


          <button
            className={
              currentPage === "upload"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              setCurrentPage("upload")
            }
            type="button"
          >
            ＋ Upload Documents
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

        {currentPage === "upload"
          ? renderUploadPage()
          : renderAskPage()}

      </main>

    </div>
  );
}

export default App;