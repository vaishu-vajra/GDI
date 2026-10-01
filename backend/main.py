import os
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pypdf import PdfReader
from openpyxl import load_workbook
from bs4 import BeautifulSoup

from google import genai


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

UPLOAD_DIR.mkdir(exist_ok=True)


# ============================================================
# GEMINI
# ============================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

client = None

if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)


MODEL_NAME = "gemini-3.8-flash"


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
# UPLOAD
# ============================================================

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):

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
        ".htm",
    }

    extension = Path(file.filename).suffix.lower()

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type."
        )

    file_path = UPLOAD_DIR / file.filename

    contents = await file.read()

    with open(file_path, "wb") as f:
        f.write(contents)

    return {
        "message": "File uploaded successfully",
        "filename": file.filename,
        "size": len(contents)
    }


# ============================================================
# GET ALL DOCUMENTS
# ============================================================

@app.get("/documents")
def get_documents():

    documents = []

    for file_path in UPLOAD_DIR.iterdir():

        if file_path.is_file():

            documents.append({
                "filename": file_path.name,
                "size": file_path.stat().st_size
            })

    return {
        "documents": documents
    }


# ============================================================
# DELETE DOCUMENT
# ============================================================

@app.delete("/documents/{filename}")
def delete_document(filename: str):

    # Prevent accidental path traversal
    safe_filename = Path(filename).name

    file_path = UPLOAD_DIR / safe_filename

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Document not found: {safe_filename}"
        )

    if not file_path.is_file():
        raise HTTPException(
            status_code=400,
            detail="Invalid document."
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
# READ PDF
# ============================================================

def read_pdf(file_path: Path):

    pages = []

    try:

        reader = PdfReader(str(file_path))

        for page_number, page in enumerate(reader.pages):

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


# ============================================================
# READ EXCEL
# ============================================================

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


# ============================================================
# READ HTML
# ============================================================

def read_html(file_path: Path):

    try:

        with open(
            file_path,
            "r",
            encoding="utf-8",
            errors="ignore"
        ) as f:

            html = f.read()

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


# ============================================================
# READ FILE
# ============================================================

def read_file(file_path: Path):

    extension = file_path.suffix.lower()

    if extension == ".pdf":
        return read_pdf(file_path)

    if extension in [".xlsx", ".xls"]:
        return read_excel(file_path)

    if extension in [".html", ".htm"]:
        return read_html(file_path)

    return ""


# ============================================================
# READ ALL DOCUMENTS
# ============================================================

def read_all_documents():

    all_documents = []

    files = [
        file
        for file in UPLOAD_DIR.iterdir()
        if file.is_file()
    ]

    for file_path in files:

        print(
            f"Reading: {file_path.name}"
        )

        content = read_file(file_path)

        if content.strip():

            all_documents.append(
                f"""
============================================================
DOCUMENT: {file_path.name}
============================================================

{content}
"""
            )

    return "\n".join(all_documents)


# ============================================================
# ASK GEMINI
# ============================================================

@app.post("/ask")
async def ask_gemini(request: AskRequest):

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

    document_context = read_all_documents()

    if not document_context:

        raise HTTPException(
            status_code=404,
            detail="No readable documents found."
        )

    prompt = f"""
You are FinSight, a financial document analysis assistant.

The user has uploaded multiple documents.

IMPORTANT:

- Read ALL uploaded documents.
- Search across ALL documents before answering.
- Do not restrict your answer to one document.
- Use only information contained in the uploaded documents.
- Do not invent information.
- Mention the source document when useful.
- Preserve financial figures accurately.

UPLOADED DOCUMENTS:

{document_context}

USER QUESTION:

{question}

ANSWER:

Give a clear and direct answer based on the uploaded documents.
"""

    try:

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt
        )

        return {
            "answer": response.text
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