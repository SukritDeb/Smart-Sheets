import os
import uuid
import shutil
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from profiler import profile_dataset
from agent import run_cleaning_agent
from schemas import CleaningPlan

app = FastAPI(
    title="SmartSheets Agent API",
    description="Autonomous Agentic Data Cleaning & Formatting Engine",
    version="1.0.0"
)

# Enable CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join("data", "uploads")
OUTPUT_DIR = os.path.join("data", "outputs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


class CleanRequest(BaseModel):
    task_id: str
    user_prompt: Optional[str] = "Clean, standardize, and format this dataset according to best practices."


class CleanResponse(BaseModel):
    task_id: str
    success: bool
    summary: str
    steps: List[Dict[str, Any]]
    python_code: str
    metrics: Optional[Dict[str, Any]]
    logs: List[str]
    download_url: str
    preview_cleaned_rows: List[Dict[str, Any]]


@app.get("/")
def health_check():
    return {"status": "online", "engine": "SmartSheets Agent", "version": "1.0.0"}


@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Ingests a CSV, stores it with a unique task_id,
    and runs the profiler to extract structured metadata.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are currently supported.")

    task_id = str(uuid.uuid4())[:8]
    saved_filename = f"{task_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        profile = profile_dataset(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to profile dataset: {str(e)}")

    return {
        "task_id": task_id,
        "filename": file.filename,
        "profile": profile
    }


@app.post("/api/clean", response_model=CleanResponse)
async def clean_dataset(request: CleanRequest):
    """
    Executes the autonomous agent loop:
    1. Looks up uploaded file via task_id.
    2. Runs Groq Planner + Sandbox + Self-correction.
    3. Saves cleaned CSV and returns preview + diffs.
    """
    # Locate the uploaded file
    matched_files = [f for f in os.listdir(UPLOAD_DIR) if f.startswith(f"{request.task_id}_")]
    if not matched_files:
        raise HTTPException(status_code=404, detail="Task ID not found or file expired.")

    input_path = os.path.join(UPLOAD_DIR, matched_files[0])
    output_filename = f"cleaned_{matched_files[0]}"
    output_path = os.path.join(OUTPUT_DIR, output_filename)

    # Re-profile to provide freshest context
    profile = profile_dataset(input_path)

    # Run the agentic loop
    success, plan, metrics, logs = run_cleaning_agent(
        input_csv_path=input_path,
        output_csv_path=output_path,
        profile_data=profile,
        user_prompt=request.user_prompt
    )

    if not success:
        raise HTTPException(
            status_code=500, 
            detail={"message": "Agent failed to generate passing code after retries", "logs": logs}
        )

    # Read preview rows of the cleaned data
    df_clean = pd.read_csv(output_path)
    preview_rows = df_clean.head(5).fillna("NULL").to_dict(orient="records")

    return CleanResponse(
        task_id=request.task_id,
        success=True,
        summary=plan.summary,
        steps=[s.model_dump() for s in plan.steps],
        python_code=plan.python_code,
        metrics=metrics,
        logs=logs,
        download_url=f"/api/download/{request.task_id}",
        preview_cleaned_rows=preview_rows
    )


@app.get("/api/download/{task_id}")
async def download_cleaned_file(task_id: str):
    """
    Serves the cleaned CSV file for download.
    """
    matched_files = [f for f in os.listdir(OUTPUT_DIR) if f.startswith(f"cleaned_{task_id}_")]
    if not matched_files:
        raise HTTPException(status_code=404, detail="Cleaned file not found for this task.")

    file_path = os.path.join(OUTPUT_DIR, matched_files[0])
    return FileResponse(
        path=file_path,
        filename=matched_files[0],
        media_type="text/csv"
    )