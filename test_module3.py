import os
import pandas as pd
from profiler import profile_dataset
from agent import run_cleaning_agent

def test_full_pipeline():
    input_file = "dirty_test.csv"
    output_file = "clean_test.csv"

    print("=== 1. EXTRACTING METADATA ===")
    profile = profile_dataset(input_file)
    print(f"Loaded {profile['total_rows']} rows.")

    print("\n=== 2. RUNNING AGENTIC PIPELINE (PLAN -> EXECUTE -> VERIFY) ===")
    prompt = (
        "Clean phone numbers to digits only, format dates as YYYY-MM-DD, "
        "convert states to 2-letter codes, and clean total_spend as numeric float."
    )

    success, final_plan, metrics, logs = run_cleaning_agent(
        input_csv_path=input_file,
        output_csv_path=output_file,
        profile_data=profile,
        user_prompt=prompt
    )

    print("\n=== AGENT EXECUTION LOGS ===")
    for log in logs:
        print(f"• {log}")

    if success:
        print("\n=== CLEANING SUCCESSFUL ===")
        print(f"Metrics: {metrics}")
        
        print("\n--- ORIGINAL DATA ---")
        print(pd.read_csv(input_file))
        
        print("\n--- CLEANED DATA (FROM OUTPUT CSV) ---")
        print(pd.read_csv(output_file))
    else:
        print("\n=== PIPELINE FAILED ===")
        print("Check logs above to see why the sandbox or retries failed.")

if __name__ == "__main__":
    test_full_pipeline()