from profiler import profile_dataset
from agent import generate_cleaning_pipeline

def test():
    print("--- 1. PROFILING DATASET ---")
    profile = profile_dataset("dirty_test.csv")
    print(f"Profiled {profile['total_rows']} rows and {profile['total_columns']} columns.")
    
    print("\n--- 2. RUNNING GROQ AGENT GENERATOR (gpt-oss-120b) ---")
    prompt = (
        "Format dates to ISO 8601 (YYYY-MM-DD), clean phone numbers to digits only, "
        "standardize states to 2-letter codes, and convert total_spend to float."
    )
    
    plan = generate_cleaning_pipeline(profile, user_prompt=prompt, model="openai/gpt-oss-120b")
    
    print("\n[PLAN SUMMARY]")
    print(plan.summary)
    
    print("\n[STEPS PROPOSED]")
    for i, step in enumerate(plan.steps, 1):
        print(f"{i}. [{step.column}] {step.action} -> {step.rationale}")
        
    print("\n[GENERATED PYTHON CODE BY GROQ]")
    print(plan.python_code)

if __name__ == "__main__":
    test()