import json
import os
import re
from typing import Tuple, Optional, List
from dotenv import load_dotenv
from groq import Groq
from schemas import CleaningPlan
from executor import execute_cleaning_code

load_dotenv(override=True)

SCHEMA_SPEC = """{
  "summary": "Short explanation of the fixes",
  "steps": [
    {"column": "column_name", "action": "action_name", "rationale": "why"}
  ],
  "python_code": "def clean_data(df):\\n    # pandas code\\n    return df"
}"""

PANDAS_RULES = """
### PANDAS 2.x API COMPLIANCE RULES:
1. NEVER pass `infer_datetime_format=True` to `pd.to_datetime()`. It is removed in Pandas 2.x. Use `pd.to_datetime(df[col], errors='coerce', format='mixed')`.
2. `df.replace()` does NOT accept `case=False` or `regex` keywords on the whole DataFrame. For string regex, use `df[col].astype(str).str.replace(r'...', '', regex=True)`.
3. When using regex in strings, use raw strings with double slashes or simple character sets (e.g. `r"[$ ,]"`).
4. Do NOT drop rows unless explicitly instructed by the user. Always prioritize cleaning/imputation over truncation.
5. Function signature MUST be `def clean_data(df):` and return `df`.
"""

SYSTEM_PROMPT = f"""You are an expert Autonomous Data Engineer writing production Pandas 2.x code.
Your goal is to inspect a dataset's profile summary and generate a self-contained, robust Python cleaning script.

{PANDAS_RULES}

Return ONLY valid JSON adhering strictly to this schema:
{SCHEMA_SPEC}
"""

FIX_PROMPT = f"""You previously generated Python code that threw an error during execution or failed data invariants.
Fix the code so that it handles the error cleanly.

{PANDAS_RULES}

You MUST format your response as a JSON object matching this exact schema:
{SCHEMA_SPEC}
"""


def clean_extracted_code(code: str) -> str:
    """Removes accidental markdown code fences and unescapes string literals if needed."""
    code = re.sub(r"^```python\s*", "", code.strip(), flags=re.MULTILINE)
    code = re.sub(r"^```\s*", "", code, flags=re.MULTILINE)
    # Fix accidental double-escaped newlines in JSON strings
    if "\\n" in code and "\n" not in code:
        code = code.encode().decode('unicode_escape')
    return code.strip()


def generate_cleaning_pipeline(
    profile_data: dict, 
    user_prompt: str = "Clean, standardize, and format this dataset according to best practices.",
    model: str = "openai/gpt-oss-120b"
) -> CleaningPlan:
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))

    user_message = f"""
### DATASET PROFILE:
{json.dumps(profile_data, indent=2)}

### USER INSTRUCTIONS:
{user_prompt}

Generate a comprehensive CleaningPlan with valid Python code for `clean_data(df)`.
"""

    chat_completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message}
        ],
        response_format={"type": "json_object"},
        temperature=0.1
    )

    raw_json = chat_completion.choices[0].message.content
    plan = CleaningPlan.model_validate_json(raw_json)
    plan.python_code = clean_extracted_code(plan.python_code)
    return plan


def fix_cleaning_pipeline(
    failed_code: str,
    error_message: str,
    profile_data: dict,
    model: str = "openai/gpt-oss-120b"
) -> CleaningPlan:
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))

    user_message = (
        "### FAILED CODE:\n"
        + failed_code
        + "\n\n### ERROR TRACEBACK / INVARIANT FAILURE:\n"
        + error_message
        + "\n\n### DATASET PROFILE:\n"
        + json.dumps(profile_data, indent=2)
        + "\n\nFix the code to resolve the error while adhering to Pandas 2.x rules. Return ONLY the valid JSON schema."
    )

    chat_completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": FIX_PROMPT},
            {"role": "user", "content": user_message}
        ],
        response_format={"type": "json_object"},
        temperature=0.1
    )

    raw_json = chat_completion.choices[0].message.content
    plan = CleaningPlan.model_validate_json(raw_json)
    plan.python_code = clean_extracted_code(plan.python_code)
    return plan


def run_cleaning_agent(
    input_csv_path: str,
    output_csv_path: str,
    profile_data: dict,
    user_prompt: str,
    max_retries: int = 3,
    model: str = "openai/gpt-oss-120b"
) -> Tuple[bool, CleaningPlan, Optional[dict], List[str]]:
    logs = []
    logs.append("Phase 1: Generating initial cleaning plan and code via Groq...")
    current_plan = generate_cleaning_pipeline(profile_data, user_prompt, model=model)
    
    for attempt in range(1, max_retries + 1):
        logs.append(f"Phase 2: Executing in sandbox (Attempt {attempt}/{max_retries})...")
        success, exec_msg, metrics = execute_cleaning_code(
            code_str=current_plan.python_code,
            input_csv_path=input_csv_path,
            output_csv_path=output_csv_path
        )

        if success:
            logs.append("Phase 3: Execution and invariants verified successfully!")
            return True, current_plan, metrics, logs

        logs.append(f"Execution failed on attempt {attempt}: {exec_msg.splitlines()[-1] if exec_msg else 'Unknown error'}")
        
        if attempt < max_retries:
            logs.append(f"Self-correcting: Sending error traceback back to Groq for retry {attempt + 1}...")
            current_plan = fix_cleaning_pipeline(
                failed_code=current_plan.python_code,
                error_message=exec_msg,
                profile_data=profile_data,
                model=model
            )

    logs.append("Exhausted maximum retry attempts.")
    return False, current_plan, None, logs