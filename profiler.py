import pandas as pd
from typing import Dict, Any, List


def profile_dataset(file_path: str, sample_size: int = 5) -> Dict[str, Any]:
    """
    Reads a CSV and extracts structured metadata and statistical summaries
    without loading massive files entirely into memory when profiling.
    """
    # Read the full dataset into Pandas
    df = pd.read_csv(file_path)
    
    total_rows, total_cols = df.shape
    
    columns_summary: List[Dict[str, Any]] = []
    
    for col in df.columns:
        series = df[col]
        null_count = int(series.isnull().sum())
        null_percentage = round((null_count / total_rows) * 100, 2) if total_rows > 0 else 0.0
        unique_count = int(series.nunique(dropna=True))
        
        # Grab non-null sample values to show data representation
        samples = series.dropna().head(3).tolist()
        # Convert any timestamps or complex objects to simple strings
        samples = [str(val) for val in samples]
        
        columns_summary.append({
            "name": col,
            "inferred_type": str(series.dtype),
            "null_count": null_count,
            "null_percentage": null_percentage,
            "unique_values": unique_count,
            "samples": samples
        })
        
    # Extract head sample rows as lightweight dictionaries
    sample_rows = df.head(sample_size).fillna("NULL").to_dict(orient="records")
    
    profile = {
        "total_rows": total_rows,
        "total_columns": total_cols,
        "columns": columns_summary,
        "sample_rows": sample_rows
    }
    
    return profile