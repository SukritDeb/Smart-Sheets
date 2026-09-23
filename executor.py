import subprocess
import sys
import tempfile
import os
import json
import pandas as pd
from typing import Tuple, Dict, Any, Optional


def validate_invariants(original_path: str, output_path: str) -> Tuple[bool, str]:
    """
    Ensures that transformations did not destroy the dataset integrity.
    """
    try:
        df_orig = pd.read_csv(original_path)
        df_clean = pd.read_csv(output_path)
    except Exception as e:
        return False, f"Failed to load output CSV: {str(e)}"

    # Invariant 1: File is not completely empty
    if len(df_clean) == 0 and len(df_orig) > 0:
        return False, "Data integrity error: The cleaned dataset has 0 rows, but original had data."

    # Invariant 2: Detect massive unintentional row loss (>50% dropped without instruction)
    if len(df_clean) < (len(df_orig) * 0.5):
        return False, f"Warning: Over 50% of rows were dropped ({len(df_orig)} -> {len(df_clean)}). Check if filtering was overly aggressive."

    return True, "All invariants passed."


def execute_cleaning_code(
    code_str: str, 
    input_csv_path: str, 
    output_csv_path: str,
    timeout_seconds: int = 15
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Executes generated pandas code in an isolated subprocess.
    Returns: (success: bool, logs_or_error: str, metrics: Optional[dict])
    """

    # Create temporary script file
    script_content = f"""
import sys
import pandas as pd
import numpy as np

# Load original data
try:
    df = pd.read_csv(r"{os.path.abspath(input_csv_path)}")
except Exception as e:
    sys.stderr.write(f"Error reading input CSV: {{e}}")
    sys.exit(1)

# Injected Agent Code
{code_str}

# Run execution
try:
    df_result = clean_data(df)
    if not isinstance(df_result, pd.DataFrame):
        sys.stderr.write("TypeError: clean_data() must return a pandas DataFrame.")
        sys.exit(1)
        
    df_result.to_csv(r"{os.path.abspath(output_csv_path)}", index=False)
    print("EXECUTION_SUCCESS")
except Exception as e:
    import traceback
    sys.stderr.write(traceback.format_exc())
    sys.exit(1)
"""

    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as temp_script:
        temp_script.write(script_content)
        temp_script_path = temp_script.name

    try:
        # Run in independent Python subprocess
        proc = subprocess.run(
            [sys.executable, temp_script_path],
            capture_output=True,
            text=True,
            timeout=timeout_seconds
        )

        if proc.returncode != 0:
            error_trace = proc.stderr.strip()
            return False, f"Runtime Error:\n{error_trace}", None

        # Check invariants
        valid, inv_msg = validate_invariants(input_csv_path, output_csv_path)
        if not valid:
            return False, f"Invariant Violation: {inv_msg}", None

        # Collect basic metrics
        orig_df = pd.read_csv(input_csv_path)
        clean_df = pd.read_csv(output_csv_path)
        
        metrics = {
            "original_rows": len(orig_df),
            "cleaned_rows": len(clean_df),
            "original_nulls": int(orig_df.isnull().sum().sum()),
            "remaining_nulls": int(clean_df.isnull().sum().sum())
        }

        return True, "Executed and verified successfully.", metrics

    except subprocess.TimeoutExpired:
        return False, f"TimeoutError: Execution exceeded {timeout_seconds} seconds.", None
    except Exception as ex:
        return False, f"Unexpected sandbox failure: {str(ex)}", None
    finally:
        if os.path.exists(temp_script_path):
            os.remove(temp_script_path)