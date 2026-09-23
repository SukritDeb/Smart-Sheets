export type Row = Record<string, unknown>;

export interface ProfileColumn {
  name: string;
  inferred_type: string;
  null_count: number;
  null_percentage: number;
  unique_values: number;
  samples: string[];
}

export interface DatasetProfile {
  total_rows: number;
  total_columns: number;
  columns: ProfileColumn[];
  sample_rows: Row[];
}

export interface UploadResponse {
  task_id: string;
  filename: string;
  profile: DatasetProfile;
}

export interface CleaningStep {
  column: string;
  action: string;
  rationale: string;
}

export interface CleaningMetrics {
  original_rows: number;
  cleaned_rows: number;
  original_nulls: number;
  remaining_nulls: number;
}

export interface CleanResponse {
  task_id: string;
  success: boolean;
  summary: string;
  steps: CleaningStep[];
  python_code: string;
  metrics: CleaningMetrics;
  logs: string[];
  download_url: string;
  preview_cleaned_rows: Row[];
}
