from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Any, Dict


class CleaningStep(BaseModel):
    column: str = Field(default="all", description="Target column name")
    action: str = Field(default="format", description="Short title of the operation")
    rationale: str = Field(default="", description="Why this step is needed")


class CleaningPlan(BaseModel):
    summary: str = Field(default="Dataset cleaned successfully.")
    steps: List[CleaningStep] = Field(default_factory=list)
    python_code: str = Field(description="Executable Python code defining clean_data(df)")

    @model_validator(mode="before")
    @classmethod
    def normalize_keys(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        # Map alternate code keys
        if "python_code" not in data:
            for alt in ["code", "script", "python", "cleaned_code"]:
                if alt in data:
                    data["python_code"] = data[alt]
                    break

        # Map alternate steps keys
        if "steps" not in data:
            for alt in ["cleaning_steps", "operations", "plan_steps"]:
                if alt in data:
                    data["steps"] = data[alt]
                    break

        # Ensure summary exists
        if "summary" not in data:
            data["summary"] = data.get("description", "Cleaned data as specified.")

        # If python_code still missing, look for raw function in text
        if "python_code" not in data or not data["python_code"]:
            for v in data.values():
                if isinstance(v, str) and "def clean_data" in v:
                    data["python_code"] = v
                    break

        return data