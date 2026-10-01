import os
import json
import re
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pypdf import PdfReader
from openpyxl import load_workbook
from bs4 import BeautifulSoup

from google import genai
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


def clean_response(text: str) -> str:
    """Remove Markdown formatting markers from Gemini's answer."""
    text = re.sub(r"\*{1,3}", "", text)
    text = re.sub(r"(?m)^\s*#+\s*", "", text)
    return text.strip()


# ============================================================
# APP
# ============================================================

app = FastAPI(title="FinSight Backend")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

UPLOAD_DIR = BASE_DIR / "uploads"
CREDENTIALS_FILE = BASE_DIR / "credentials.json"
TOKEN_FILE = BASE_DIR / "token.json"

# Database that remembers which Drive documents
# have already been processed.
DATABASE_FILE = BASE_DIR / "finsight.db"

# JSON knowledge file.
# This makes it easy to inspect what FinSight has learned
# from the company documents.
KNOWLEDGE_FILE = BASE_DIR / "knowledge.json"

UPLOAD_DIR.mkdir(exist_ok=True)


# ============================================================
# GOOGLE DRIVE
# ============================================================

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly"
]

DRIVE_FOLDER_ID = "1T-8canBJey6LBLvJcvF9dRMLkrgef0Nr"


# ============================================================
# GEMINI
# ============================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

client = None

if GEMINI_API_KEY:
    client = genai.Client(
        api_key=GEMINI_API_KEY
    )

MODEL_NAME = "gemini-3.5-flash"


# ============================================================
# DATABASE
# ============================================================

def get_db_connection():
    connection = sqlite3.connect(
        DATABASE_FILE
    )

    connection.row_factory = sqlite3.Row

    return connection


def initialize_database():
    connection = get_db_connection()

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drive_file_id TEXT UNIQUE NOT NULL,
            file_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            modified_time TEXT NOT NULL,
            knowledge TEXT NOT NULL,
            processed_at TEXT NOT NULL
        )
        """
    )

    connection.commit()
    connection.close()


initialize_database()


# ============================================================
# KNOWLEDGE HELPERS
# ============================================================

def load_knowledge_store():
    if not KNOWLEDGE_FILE.exists():
        return []

    try:
        with open(
            KNOWLEDGE_FILE,
            "r",
            encoding="utf-8"
        ) as file:
            data = json.load(file)

        if isinstance(data, list):
            return data

        return []

    except Exception as e:
        print(
            f"Knowledge file could not be loaded: {e}"
        )

        return []


def save_knowledge_store(documents):
    with open(
        KNOWLEDGE_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            documents,
            file,
            indent=2,
            ensure_ascii=False
        )


# ============================================================
# GOOGLE DRIVE SERVICE
# ============================================================

def get_drive_service():

    if not CREDENTIALS_FILE.exists():

        raise HTTPException(
            status_code=500,
            detail="Google Drive credentials.json not found."
        )

    credentials = None

    # --------------------------------------------------------
    # Existing token
    # --------------------------------------------------------

    if TOKEN_FILE.exists():

        from google.oauth2.credentials import Credentials

        credentials = Credentials.from_authorized_user_file(
            str(TOKEN_FILE),
            SCOPES
        )

    # --------------------------------------------------------
    # First-time Google login
    # --------------------------------------------------------

    if not credentials or not credentials.valid:

        flow = InstalledAppFlow.from_client_secrets_file(
            str(CREDENTIALS_FILE),
            SCOPES
        )

        credentials = flow.run_local_server(
            port=0
        )

        TOKEN_FILE.write_text(
            credentials.to_json(),
            encoding="utf-8"
        )

    service = build(
        "drive",
        "v3",
        credentials=credentials
    )

    return service


# ============================================================
# FILE READING
# ============================================================

def read_pdf(file_path: Path):

    pages = []

    try:

        reader = PdfReader(
            str(file_path)
        )

        for page_number, page in enumerate(
            reader.pages
        ):

            page_text = page.extract_text() or ""

            if page_text.strip():

                pages.append(
                    f"""
--- Page {page_number + 1} ---
{page_text}
"""
                )

        return "\n".join(pages)

    except Exception as e:

        print(
            f"PDF reading failed for "
            f"{file_path.name}: {e}"
        )

        return ""


def read_excel(file_path: Path):

    text = []

    try:

        workbook = load_workbook(
            filename=str(file_path),
            data_only=True
        )

        for sheet_name in workbook.sheetnames:

            sheet = workbook[sheet_name]

            text.append(
                f"\n--- Sheet: {sheet_name} ---"
            )

            for row in sheet.iter_rows(
                values_only=True
            ):

                values = [
                    str(value)
                    for value in row
                    if value is not None
                ]

                if values:

                    text.append(
                        " | ".join(values)
                    )

        return "\n".join(text)

    except Exception as e:

        print(
            f"Excel reading failed for "
            f"{file_path.name}: {e}"
        )

        return ""


def read_html(file_path: Path):

    try:

        with open(
            file_path,
            "r",
            encoding="utf-8",
            errors="ignore"
        ) as file:

            html = file.read()

        soup = BeautifulSoup(
            html,
            "html.parser"
        )

        for element in soup(
            ["script", "style", "noscript"]
        ):

            element.decompose()

        return soup.get_text(
            separator="\n",
            strip=True
        )

    except Exception as e:

        print(
            f"HTML reading failed for "
            f"{file_path.name}: {e}"
        )

        return ""


def read_file(file_path: Path):

    extension = file_path.suffix.lower()

    if extension == ".pdf":
        return read_pdf(file_path)

    if extension in [
        ".xlsx",
        ".xls"
    ]:
        return read_excel(file_path)

    if extension in [
        ".html",
        ".htm"
    ]:
        return read_html(file_path)

    return ""


# ============================================================
# GEMINI DOCUMENT KNOWLEDGE CREATION
# ============================================================

def create_document_knowledge(
    file_name,
    document_text
):

    if not client:

        raise RuntimeError(
            "Gemini API key is not configured."
        )

    prompt = f"""
You are FinSight's document knowledge processor.

You are processing ONE company financial document.

Your job is to create a compact but comprehensive
knowledge representation of this document.

The knowledge will be stored permanently by the application
and used later to answer financial questions.

DOCUMENT NAME:
{file_name}

DOCUMENT CONTENT:
{document_text}

Create structured knowledge covering:

1. Company
2. Document type
3. Reporting period
4. Revenue
5. Net income
6. EPS
7. Gross margin
8. Operating income
9. Operating expenses
10. Cash flow
11. Balance sheet information
12. Debt
13. Assets
14. Liabilities
15. Equity
16. Segment performance
17. Important financial metrics
18. Guidance
19. Management statements
20. Major events
21. Risks or warnings explicitly mentioned
22. Important comparisons
23. Any other financially important information

IMPORTANT:

- Preserve exact numbers.
- Preserve units such as million, billion, percentage, etc.
- Preserve dates and reporting periods.
- Do not invent information.
- Do not use outside knowledge.
- If a category is not available, do not invent it.
- Include important details that could be needed for future questions.
- Keep the output compact enough to reduce future Gemini input tokens.
- Organize the result clearly.

Return ONLY the structured knowledge.
"""

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt
    )

    return response.text.strip()


# ============================================================
# CHECK DOCUMENT STATUS
# ============================================================

def get_existing_document(
    drive_file_id
):

    connection = get_db_connection()

    row = connection.execute(
        """
        SELECT *
        FROM documents
        WHERE drive_file_id = ?
        """,
        (drive_file_id,)
    ).fetchone()

    connection.close()

    return row


# ============================================================
# SAVE DOCUMENT KNOWLEDGE
# ============================================================

def save_document_knowledge(
    drive_file_id,
    file_name,
    mime_type,
    modified_time,
    knowledge
):

    connection = get_db_connection()

    processed_at = datetime.now(
        timezone.utc
    ).isoformat()

    connection.execute(
        """
        INSERT INTO documents (
            drive_file_id,
            file_name,
            mime_type,
            modified_time,
            knowledge,
            processed_at
        )
        VALUES (?, ?, ?, ?, ?, ?)

        ON CONFLICT(drive_file_id)
        DO UPDATE SET
            file_name = excluded.file_name,
            mime_type = excluded.mime_type,
            modified_time = excluded.modified_time,
            knowledge = excluded.knowledge,
            processed_at = excluded.processed_at
        """,
        (
            drive_file_id,
            file_name,
            mime_type,
            modified_time,
            knowledge,
            processed_at
        )
    )

    connection.commit()
    connection.close()


# ============================================================
# REFRESH JSON KNOWLEDGE STORE
# ============================================================

def rebuild_knowledge_json():

    connection = get_db_connection()

    rows = connection.execute(
        """
        SELECT
            drive_file_id,
            file_name,
            mime_type,
            modified_time,
            knowledge,
            processed_at
        FROM documents
        ORDER BY file_name
        """
    ).fetchall()

    connection.close()

    documents = []

    for row in rows:

        documents.append(
            {
                "drive_file_id": row["drive_file_id"],
                "file_name": row["file_name"],
                "mime_type": row["mime_type"],
                "modified_time": row["modified_time"],
                "knowledge": row["knowledge"],
                "processed_at": row["processed_at"]
            }
        )

    save_knowledge_store(
        documents
    )


# ============================================================
# DOWNLOAD ONE DRIVE FILE
# ============================================================

def download_drive_file(
    service,
    file_id,
    file_name
):

    safe_name = Path(file_name).name

    destination = UPLOAD_DIR / safe_name

    print(
        f"Downloading NEW/CHANGED document: "
        f"{safe_name}"
    )

    request = service.files().get_media(
        fileId=file_id
    )

    with open(
        destination,
        "wb"
    ) as output_file:

        downloader = MediaIoBaseDownload(
            output_file,
            request
        )

        done = False

        while not done:

            _, done = downloader.next_chunk()

    return destination


# ============================================================
# INCREMENTAL GOOGLE DRIVE SYNC
# ============================================================

def sync_and_index_documents():

    service = get_drive_service()

    query = (
        f"'{DRIVE_FOLDER_ID}' in parents "
        "and trashed = false"
    )

    results = service.files().list(
        q=query,
        pageSize=100,
        fields="files(id,name,mimeType,modifiedTime)"
    ).execute()

    files = results.get(
        "files",
        []
    )

    allowed_mime_types = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/html"
    }

    results_summary = []

    for file in files:

        file_id = file["id"]
        file_name = file["name"]
        mime_type = file["mimeType"]
        modified_time = file["modifiedTime"]

        if mime_type not in allowed_mime_types:

            results_summary.append(
                {
                    "name": file_name,
                    "status": "unsupported"
                }
            )

            continue

        existing = get_existing_document(
            file_id
        )

        # ----------------------------------------------------
        # Already processed and unchanged
        # ----------------------------------------------------

        if (
            existing
            and existing["modified_time"] == modified_time
        ):

            print(
                f"Skipping unchanged document: "
                f"{file_name}"
            )

            results_summary.append(
                {
                    "name": file_name,
                    "status": "skipped"
                }
            )

            continue

        # ----------------------------------------------------
        # New or changed document
        # ----------------------------------------------------

        if existing:

            print(
                f"Document changed: "
                f"{file_name}"
            )

            status = "updated"

        else:

            print(
                f"New document: "
                f"{file_name}"
            )

            status = "new"

        try:

            local_file = download_drive_file(
                service,
                file_id,
                file_name
            )

            print(
                f"Reading document: "
                f"{file_name}"
            )

            document_text = read_file(
                local_file
            )

            if not document_text.strip():

                print(
                    f"No readable content: "
                    f"{file_name}"
                )

                results_summary.append(
                    {
                        "name": file_name,
                        "status": "empty"
                    }
                )

                continue

            print(
                f"Creating Gemini knowledge for: "
                f"{file_name}"
            )

            knowledge = create_document_knowledge(
                file_name,
                document_text
            )

            save_document_knowledge(
                drive_file_id=file_id,
                file_name=file_name,
                mime_type=mime_type,
                modified_time=modified_time,
                knowledge=knowledge
            )

            results_summary.append(
                {
                    "name": file_name,
                    "status": status
                }
            )

        except Exception as e:

            print(
                f"Failed to process "
                f"{file_name}: {e}"
            )

            results_summary.append(
                {
                    "name": file_name,
                    "status": "failed",
                    "error": str(e)
                }
            )

    # Rebuild JSON representation
    rebuild_knowledge_json()

    return results_summary


# ============================================================
# GET ALL STORED KNOWLEDGE
# ============================================================

def get_stored_knowledge():

    connection = get_db_connection()

    rows = connection.execute(
        """
        SELECT
            file_name,
            knowledge
        FROM documents
        ORDER BY file_name
        """
    ).fetchall()

    connection.close()

    return rows


# ============================================================
# REQUEST MODEL
# ============================================================

class AskRequest(BaseModel):

    question: str


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "message": "FinSight backend is running"
    }


# ============================================================
# CONNECT GOOGLE DRIVE
# ============================================================

@app.get("/drive/connect")
def connect_google_drive():

    try:

        service = get_drive_service()

        about = service.about().get(
            fields="user"
        ).execute()

        return {
            "message": "Google Drive connected successfully.",
            "account": about["user"].get(
                "emailAddress"
            )
        }

    except Exception as e:

        print(
            f"Google Drive connection failed: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail="Could not connect to Google Drive."
        )


# ============================================================
# SYNC + INDEX GOOGLE DRIVE
# ============================================================

@app.post("/drive/sync")
def sync_google_drive():

    try:

        results = sync_and_index_documents()

        return {
            "message": "Google Drive indexing completed.",
            "documents": results
        }

    except Exception as e:

        print(
            f"Google Drive sync failed: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ============================================================
# KNOWLEDGE STATUS
# ============================================================

@app.get("/knowledge/status")
def knowledge_status():

    connection = get_db_connection()

    row = connection.execute(
        "SELECT COUNT(*) AS count FROM documents"
    ).fetchone()

    connection.close()

    return {
        "indexed_documents": row["count"],
        "knowledge_file": str(
            KNOWLEDGE_FILE
        )
    }


# ============================================================
# OLD LOCAL UPLOAD
# ============================================================

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...)
):

    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="No filename provided."
        )

    allowed_extensions = {
        ".pdf",
        ".xlsx",
        ".xls",
        ".html",
        ".htm"
    }

    extension = Path(
        file.filename
    ).suffix.lower()

    if extension not in allowed_extensions:

        raise HTTPException(
            status_code=400,
            detail="Unsupported file type."
        )

    file_path = UPLOAD_DIR / Path(
        file.filename
    ).name

    contents = await file.read()

    with open(
        file_path,
        "wb"
    ) as f:

        f.write(contents)

    return {
        "message": "File uploaded successfully",
        "filename": file_path.name,
        "size": len(contents)
    }


# ============================================================
# GET DOCUMENTS
# ============================================================

@app.get("/documents")
def get_documents():

    documents = []

    for file_path in UPLOAD_DIR.iterdir():

        if file_path.is_file():

            documents.append(
                {
                    "name": file_path.name,
                    "size": file_path.stat().st_size
                }
            )

    return {
        "documents": documents
    }


# ============================================================
# DELETE DOCUMENT
# ============================================================

@app.delete("/documents/{filename}")
def delete_document(filename: str):

    safe_filename = Path(
        filename
    ).name

    file_path = UPLOAD_DIR / safe_filename

    if not file_path.exists():

        raise HTTPException(
            status_code=404,
            detail=f"Document not found: {safe_filename}"
        )

    try:

        file_path.unlink()

        return {
            "message": "Document deleted successfully",
            "filename": safe_filename
        }

    except Exception as e:

        print(
            f"Delete error for {safe_filename}: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail="Could not remove document."
        )


# ============================================================
# ASK GEMINI USING STORED KNOWLEDGE
# ============================================================

@app.post("/ask")
async def ask_gemini(
    request: AskRequest
):

    question = request.question.strip()

    if not question:

        raise HTTPException(
            status_code=400,
            detail="Please enter a question."
        )

    if not client:

        raise HTTPException(
            status_code=500,
            detail="Gemini API key is not configured."
        )

    # --------------------------------------------------------
    # IMPORTANT:
    #
    # We DO NOT sync Google Drive here.
    #
    # We DO NOT download PDFs here.
    #
    # We DO NOT read PDFs here.
    #
    # We only use the knowledge already created during sync.
    # --------------------------------------------------------

    stored_documents = get_stored_knowledge()

    if not stored_documents:

        raise HTTPException(
            status_code=404,
            detail=(
                "No indexed company documents found. "
                "Please sync Google Drive first."
            )
        )

    knowledge_sections = []

    for document in stored_documents:

        knowledge_sections.append(
            f"""
============================================================
DOCUMENT: {document["file_name"]}
============================================================

{document["knowledge"]}
"""
        )

    stored_knowledge = "\n".join(
        knowledge_sections
    )

    # --------------------------------------------------------
    # Gemini receives the structured knowledge,
    # NOT the original PDFs.
    # --------------------------------------------------------

    prompt = f"""
You are FinSight, a financial document analysis assistant.

The company documents were previously processed and converted
into structured knowledge.

Use ONLY the stored knowledge below to answer the user's
question.

IMPORTANT:

- Do not use outside knowledge.
- Do not invent information.
- Preserve financial figures accurately.
- Preserve units and reporting periods.
- If information is missing, say that it is not available.
- If comparing companies, use only the companies represented
  in the stored knowledge.
- Mention the source document when useful.
- Give a clear and direct answer.

STORED COMPANY KNOWLEDGE:

{stored_knowledge}

USER QUESTION:

{question}

ANSWER:
"""

    try:

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt
        )

        answer = clean_response(response.text or "")

        return {
            "answer": answer
        }

    except Exception as e:

        print(
            f"Gemini request failed: {e}"
        )

        error_text = str(e)

        if "503" in error_text:

            raise HTTPException(
                status_code=503,
                detail=(
                    "Gemini is temporarily busy. "
                    "Please try again in a moment."
                )
            )

        if "429" in error_text:

            raise HTTPException(
                status_code=429,
                detail=(
                    "Gemini API quota has been exceeded."
                )
            )

        raise HTTPException(
            status_code=500,
            detail="Gemini request failed."
        )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000
    )