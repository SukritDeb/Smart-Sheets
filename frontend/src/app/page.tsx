"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, ArrowUpRight, Check, CheckCircle2, ChevronDown, Clipboard, Columns3,
  Database, Download, FileCode2, FileSpreadsheet, Github, HardDriveUpload, Loader2, LockKeyhole,
  Play, RotateCcw, Rows3, ScanSearch, ShieldCheck, Sparkles, Terminal, UploadCloud, X
} from "lucide-react";
import { cleanDataset, downloadUrl, uploadCsv } from "@/lib/api";
import type { CleanResponse, DatasetProfile, Row } from "@/lib/types";

const PROMPTS = [
  "Standardize Dates & Phone",
  "Trim Whitespace & Cast Currencies",
  "Drop Strict Duplicates"
];

type Tab = "diff" | "code" | "logs";

type Notice = { tone: "error" | "success"; message: string } | null;

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "NULL";
  return String(value);
}

function valueIsNull(value: unknown): boolean {
  return value === null || value === undefined || value === "" || value === "NULL";
}

function schemaHealth(profile: DatasetProfile): number {
  if (!profile.total_rows || !profile.total_columns) return 100;
  const nulls = profile.columns.reduce((sum, column) => sum + column.null_percentage, 0);
  return Math.max(0, Math.round(100 - nulls / profile.total_columns));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function DataGrid({ rows, referenceRows, cleaned }: { rows: Row[]; referenceRows?: Row[]; cleaned?: boolean }) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return (
    <div className="scrollbar overflow-auto">
      <table className="min-w-[620px] w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-white/10 bg-[#111927]">
            <th className="w-12 px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[.18em] text-slate-600">#</th>
            {columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[.15em] text-slate-400">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-white/[.06] last:border-0">
              <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{String(rowIndex + 1).padStart(2, "0")}</td>
              {columns.map((column) => {
                const value = row[column];
                const changed = cleaned && referenceRows && displayValue(value) !== displayValue(referenceRows[rowIndex]?.[column]);
                const empty = valueIsNull(value);
                return <td key={column} className={`whitespace-nowrap px-4 py-3 font-mono text-[11px] ${changed ? "bg-emerald-400/[.09] text-emerald-200" : empty ? "bg-rose-400/[.07] text-rose-200" : "text-slate-300"}`}>
                  {changed && <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-300 align-middle" />}
                  {empty && !changed && <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-rose-300 align-middle" />}
                  {displayValue(value)}
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-8 text-center font-mono text-xs text-slate-600">NO SAMPLE ROWS</div>}
    </div>
  );
}

export default function HomePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [filename, setFilename] = useState("");
  const [taskId, setTaskId] = useState("");
  const [cleaned, setCleaned] = useState<CleanResponse | null>(null);
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [tab, setTab] = useState<Tab>("diff");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<"upload" | "clean" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [copied, setCopied] = useState(false);
  const [showColumns, setShowColumns] = useState(false);

  const nullCount = profile?.columns.reduce((sum, column) => sum + column.null_count, 0) ?? 0;
  const health = profile ? schemaHealth(profile) : 0;
  const rawRows = profile?.sample_rows ?? [];
  const cleanedRows = cleaned?.preview_cleaned_rows ?? [];

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setNotice({ tone: "error", message: "Only CSV files are supported." });
      return;
    }
    setNotice(null);
    setBusy("upload");
    setCleaned(null);
    try {
      const response = await uploadCsv(file);
      setProfile(response.profile);
      setFilename(response.filename);
      setTaskId(response.task_id);
      setNotice({ tone: "success", message: "Dataset profiled and ready for instructions." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "The profiling engine is unreachable." });
    } finally {
      setBusy(null);
    }
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => void handleFile(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  };

  const executePipeline = async () => {
    if (!taskId) {
      setNotice({ tone: "error", message: "Upload a CSV before executing the pipeline." });
      return;
    }
    setNotice(null);
    setBusy("clean");
    try {
      setCleaned(await cleanDataset(taskId, prompt));
      setTab("diff");
      setNotice({ tone: "success", message: "Pipeline verified. Cleaned output is ready." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "The cleaning agent could not complete the run." });
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setProfile(null); setCleaned(null); setFilename(""); setTaskId(""); setNotice(null); setPrompt(PROMPTS[0]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const metrics = useMemo(() => cleaned?.metrics, [cleaned]);

  return (
    <main className="noise relative min-h-screen overflow-hidden">
      <div className="grid-atmosphere" />
      <div className="relative mx-auto max-w-[1440px] px-5 pb-28 sm:px-8 lg:px-12">
        <header className="flex h-[76px] items-center justify-between border-b border-white/[.09]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-white/15 bg-white/[.04] text-indigo-300"><Database size={17} strokeWidth={1.5} /></div>
            <div><div className="text-[12px] font-semibold tracking-[.16em] text-slate-200">SMARTSHEETS</div><div className="font-mono text-[9px] tracking-[.2em] text-slate-600">AUTONOMOUS DATA OPS</div></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 border border-emerald-300/20 bg-emerald-300/[.05] px-3 py-2 sm:flex"><span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-300" /><span className="font-mono text-[10px] tracking-[.08em] text-emerald-200">ENGINE ONLINE</span><span className="text-slate-700">•</span><span className="font-mono text-[10px] text-slate-500">LPU SANDBOX READY</span></div>
            <a href="https://github.com" target="_blank" rel="noreferrer" aria-label="Open GitHub" className="border border-white/10 p-2 text-slate-400 transition hover:border-white/25 hover:text-white"><Github size={15} /></a>
            <button onClick={reset} aria-label="Reset workspace" className="border border-white/10 p-2 text-slate-400 transition hover:border-white/25 hover:text-white"><RotateCcw size={15} /></button>
          </div>
        </header>

        <section className="grid gap-12 pb-12 pt-16 lg:grid-cols-[1fr_440px] lg:items-end lg:pt-24">
          <div className="animate-rise">
            <div className="mb-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[.22em] text-indigo-300"><span className="h-px w-8 bg-indigo-400" /> Autonomous data cleaning / 01</div>
            <h1 className="max-w-[760px] font-display text-[clamp(3.8rem,8vw,7.5rem)] leading-[.84] tracking-[-.035em] text-slate-100">Make messy data<br /><span className="text-slate-500">operational.</span></h1>
            <p className="mt-8 max-w-[500px] text-[15px] leading-7 text-slate-400">Upload a dataset. Describe the outcome. Let the agent profile, transform, and verify every row in a contained sandbox.</p>
          </div>
          <div className="font-mono text-[10px] leading-5 text-slate-600 lg:pb-2"><div className="mb-3 text-slate-500">// SYSTEM NOTE</div><div>Precision is a feature.</div><div>Every transformation is observable.</div><div>Every output is downloadable.</div></div>
        </section>

        <section className="panel animate-rise" style={{ animationDelay: ".08s" }}>
          <div className="flex items-center justify-between border-b border-white/[.09] px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><span className="font-mono text-[10px] tracking-[.18em] text-indigo-300">01 / INGEST</span><span className="text-slate-600">•</span><span className="font-mono text-[10px] text-slate-500">PROFILE YOUR SOURCE</span></div><LockKeyhole size={14} className="text-slate-600" /></div>
          <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} className={`group m-4 flex min-h-[210px] cursor-pointer flex-col items-center justify-center border border-dashed transition sm:m-6 ${dragging ? "border-indigo-300 bg-indigo-400/[.08]" : "border-slate-700 hover:border-slate-500 hover:bg-white/[.02]"}`}>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onInputChange} />
            {busy === "upload" ? <Loader2 className="mb-4 animate-spin text-indigo-300" size={27} strokeWidth={1.5} /> : filename ? <CheckCircle2 className="mb-4 text-emerald-300" size={28} strokeWidth={1.5} /> : <UploadCloud className="mb-4 text-slate-500 transition group-hover:-translate-y-1 group-hover:text-indigo-300" size={28} strokeWidth={1.5} />}
            <div className="text-sm text-slate-200">{busy === "upload" ? "Profiling dataset..." : filename || "Drop your CSV here"}</div>
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[.14em] text-slate-600">{filename ? `${profile?.total_rows ?? 0} rows / ${profile?.total_columns ?? 0} columns detected` : "or click to browse · CSV up to 50MB"}</div>
          </div>
          {notice && <div className={`mx-4 mb-4 flex items-center gap-2 border px-4 py-3 font-mono text-[11px] sm:mx-6 sm:mb-6 ${notice.tone === "error" ? "border-rose-300/20 bg-rose-300/[.06] text-rose-200" : "border-emerald-300/20 bg-emerald-300/[.06] text-emerald-200"}`}><span>{notice.tone === "error" ? <AlertCircle size={14} /> : <Check size={14} />}</span>{notice.message}</div>}
        </section>

        {profile && <>
          <section className="animate-rise pt-12" style={{ animationDelay: ".14s" }}>
            <div className="mb-4 flex items-end justify-between"><div><div className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-indigo-300">02 / SIGNAL</div><h2 className="font-display text-4xl text-slate-100">Dataset telemetry</h2></div><button onClick={() => setShowColumns((value) => !value)} className="flex items-center gap-2 border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[.12em] text-slate-400 transition hover:border-white/25 hover:text-white">Schema detail <ChevronDown size={13} className={`transition ${showColumns ? "rotate-180" : ""}`} /></button></div>
            <div className="grid grid-cols-2 border-y border-white/[.1] sm:grid-cols-4">
              {[[<Rows3 size={15} />, "TOTAL ROWS", formatNumber(profile.total_rows), "text-slate-100"], [<Columns3 size={15} />, "COLUMNS INFERRED", formatNumber(profile.total_columns), "text-slate-100"], [<AlertCircle size={15} />, "NULL OCCURRENCES", formatNumber(nullCount), nullCount ? "text-amber-200" : "text-emerald-200"], [<ShieldCheck size={15} />, "SCHEMA HEALTH", `${health}%`, health > 90 ? "text-emerald-200" : "text-amber-200"]].map(([icon, label, value, tone], index) => <div key={String(label)} className={`px-5 py-5 sm:px-6 ${index % 2 ? "border-l border-white/[.07]" : ""} ${index > 1 ? "border-t border-white/[.07] sm:border-t-0" : ""} ${index === 2 ? "sm:border-l" : ""}`}><div className="mb-3 flex items-center gap-2 text-slate-500">{icon}<span className="font-mono text-[9px] tracking-[.14em]">{label}</span></div><div className={`font-mono text-2xl ${tone}`}>{value}</div></div>)}
            </div>
            {showColumns && <div className="grid gap-px border-b border-white/[.1] bg-white/[.08] sm:grid-cols-2 lg:grid-cols-3">{profile.columns.map((column) => <div key={column.name} className="bg-[#0e1420] p-4"><div className="mb-3 flex items-center justify-between"><span className="font-mono text-xs text-slate-200">{column.name}</span><span className="font-mono text-[9px] uppercase text-indigo-300">{column.inferred_type}</span></div><div className="mb-3 flex gap-2 font-mono text-[10px] text-slate-500"><span className={column.null_percentage ? "text-amber-200" : "text-emerald-200"}>{column.null_percentage}% null</span><span>·</span><span>{column.unique_values} unique</span></div><div className="flex flex-wrap gap-1.5">{column.samples.map((sample) => <span key={sample} className="max-w-full truncate border border-white/10 px-2 py-1 font-mono text-[10px] text-slate-400">{sample}</span>)}</div></div>)}</div>}
          </section>

          <section className="animate-rise pt-14" style={{ animationDelay: ".2s" }}>
            <div className="mb-4"><div className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-indigo-300">03 / COMMAND</div><h2 className="font-display text-4xl text-slate-100">Direct the agent</h2></div>
            <div className="panel p-4 sm:p-5"><div className="mb-4 flex flex-wrap gap-2">{PROMPTS.map((item) => <button key={item} onClick={() => setPrompt(item)} className={`border px-3 py-2 font-mono text-[10px] transition ${prompt === item ? "border-indigo-300/50 bg-indigo-400/[.1] text-indigo-200" : "border-white/10 text-slate-500 hover:border-white/25 hover:text-slate-300"}`}>{item}</button>)}</div><div className="flex flex-col gap-3 sm:flex-row"><div className="flex min-h-14 flex-1 items-center border border-white/10 bg-[#090d16] px-4"><Sparkles size={16} className="mr-3 shrink-0 text-indigo-300" /><input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-700" placeholder="Describe the transformation you need..." /></div><button onClick={() => void executePipeline()} disabled={busy === "clean"} className="flex min-h-14 items-center justify-center gap-3 bg-indigo-500 px-5 text-xs font-semibold tracking-[.05em] text-white transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60 sm:min-w-[250px]">{busy === "clean" ? <Loader2 className="animate-spin" size={16} /> : <Play size={15} fill="currentColor" />} {busy === "clean" ? "AGENT EXECUTING" : "EXECUTE AUTONOMOUS PIPELINE"}</button></div></div>
          </section>
        </>}

        {cleaned && profile && <section className="animate-rise pt-14" style={{ animationDelay: ".25s" }}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-indigo-300">04 / VERIFY</div><h2 className="font-display text-4xl text-slate-100">The workbench</h2></div><div className="flex items-center gap-3 font-mono text-[10px] text-emerald-200"><CheckCircle2 size={14} /> INVARIANTS PASSED <span className="text-slate-600">/</span> {cleaned.steps.length} OPERATIONS</div></div>
          <div className="panel overflow-hidden"><div className="flex border-b border-white/[.1] overflow-x-auto">{([["diff", "DATA DIFF", ScanSearch], ["code", "GENERATED PYTHON", FileCode2], ["logs", "SANDBOX AUDIT", Terminal]] as const).map(([value, label, Icon]) => <button key={value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-4 font-mono text-[10px] tracking-[.12em] transition ${tab === value ? "border-indigo-300 text-indigo-200" : "border-transparent text-slate-500 hover:text-slate-300"}`}><Icon size={14} />{label}</button>)}</div>
            {tab === "diff" && <div className="grid lg:grid-cols-2"><div className="border-b border-white/[.1] lg:border-b-0 lg:border-r"><div className="flex items-center justify-between border-b border-white/[.08] px-5 py-3"><span className="font-mono text-[10px] tracking-[.16em] text-rose-200">RAW SAMPLE</span><span className="font-mono text-[10px] text-slate-600">SOURCE / {filename}</span></div><DataGrid rows={rawRows} /></div><div><div className="flex items-center justify-between border-b border-white/[.08] px-5 py-3"><span className="font-mono text-[10px] tracking-[.16em] text-emerald-200">CLEANED OUTPUT</span><span className="font-mono text-[10px] text-slate-600">VERIFIED / {cleanedRows.length} ROWS</span></div><DataGrid rows={cleanedRows} referenceRows={rawRows} cleaned /></div></div>}
            {tab === "code" && <div className="relative min-h-[330px] bg-[#080b12] p-5 sm:p-7"><button onClick={() => { void navigator.clipboard?.writeText(cleaned.python_code); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }} className="absolute right-5 top-5 flex items-center gap-2 border border-white/10 px-3 py-2 font-mono text-[10px] text-slate-400 transition hover:text-white">{copied ? <Check size={13} /> : <Clipboard size={13} />} {copied ? "COPIED" : "COPY"}</button><pre className="scrollbar overflow-auto pt-10 font-mono text-xs leading-6 text-slate-300"><code>{cleaned.python_code}</code></pre></div>}
            {tab === "logs" && <div className="min-h-[330px] bg-[#080b12] p-5 sm:p-7"><div className="mb-5 flex items-center gap-2 font-mono text-[10px] tracking-[.15em] text-slate-500"><Activity size={13} className="text-emerald-300" /> LIVE EXECUTION TRACE</div><div className="space-y-3 font-mono text-xs">{cleaned.logs.map((log, index) => <div key={`${log}-${index}`} className="flex gap-4"><span className="shrink-0 text-slate-700">{String(index + 1).padStart(2, "0")}</span><span className={log.toLowerCase().includes("error") ? "text-rose-300" : "text-slate-300"}>{log}</span><span className="ml-auto hidden text-[10px] text-emerald-300/70 sm:block">OK</span></div>)}</div></div>}
          </div>
          <div className="mt-4 flex flex-col justify-between gap-5 border border-white/[.1] bg-[#101725] p-5 sm:flex-row sm:items-center"><div><div className="mb-2 font-mono text-[10px] uppercase tracking-[.14em] text-slate-500">RUN SUMMARY</div><div className="text-sm text-slate-200">{cleaned.summary}</div><div className="mt-2 font-mono text-[10px] text-slate-500">{metrics?.original_nulls ?? 0} nulls observed <span className="mx-2 text-slate-700">→</span> {metrics?.remaining_nulls ?? 0} remaining</div></div><a href={downloadUrl(taskId)} download className="flex items-center justify-center gap-2 bg-emerald-300 px-5 py-3 text-xs font-semibold text-[#07110d] transition hover:bg-emerald-200"><Download size={15} /> EXPORT CLEANED CSV</a></div>
        </section>}

        {!profile && <section className="grid gap-4 pb-16 pt-14 sm:grid-cols-3"><div className="border-t border-white/10 pt-4"><HardDriveUpload size={16} className="mb-4 text-indigo-300" /><div className="mb-1 text-sm text-slate-300">Ingest anything</div><div className="text-xs leading-5 text-slate-600">CSV profiling with inferred types, null ratios, and sample values.</div></div><div className="border-t border-white/10 pt-4"><Sparkles size={16} className="mb-4 text-indigo-300" /><div className="mb-1 text-sm text-slate-300">Describe the intent</div><div className="text-xs leading-5 text-slate-600">A natural-language command becomes a repeatable cleaning plan.</div></div><div className="border-t border-white/10 pt-4"><ShieldCheck size={16} className="mb-4 text-indigo-300" /><div className="mb-1 text-sm text-slate-300">Verify the result</div><div className="text-xs leading-5 text-slate-600">See code, logs, metrics, and a side-by-side output before export.</div></div></section>}

        <footer className="flex flex-col justify-between gap-3 border-t border-white/[.09] py-6 font-mono text-[9px] uppercase tracking-[.15em] text-slate-700 sm:flex-row"><span>SMARTSHEETS AGENT / BUILD 01.0</span><span>LOCAL-FIRST · SANDBOXED · OBSERVABLE</span></footer>
      </div>
    </main>
  );
}
