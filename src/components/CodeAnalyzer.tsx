import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";

type AnalyzeResponse = {
  job_id: string;
  repo_name: string;
};

type JobStatusResponse = {
  status: "queued" | "started" | "finished" | "failed";
  result?: {
    report: any;
    repo_path: string;
  };
};

type Severity = "info" | "low" | "medium" | "high" | "critical";

type Score = {
  label: string;
  value: number; // 0-100
  description?: string;
};

type Issue = {
  id: string;
  title?: string; // for your existing flat issues
  description?: string;
  file?: string;
  line?: number;
  line_range?: string | null; // from ai_code_review tool
  severity: Severity | string;
  category?: string;
  recommendation?: string;
  summary?: string; // from ai_code_review
  details?: string; // from ai_code_review
  suggested_fix?: string; // from ai_code_review
};

type AiReview = {
  high_level_overview?: string;
  architecture?: {
    summary?: string;
    description?: string;
    components?: string[];
    layers?: string[];
    patterns?: string[];
    concerns?: string[];
  };
  strengths?: string[];
  key_risks?: string[];
  // unified issues: your older flat list OR structured section issues
  issues?: Issue[];
  code_quality?: { issues?: Issue[]; strengths?: string[] };
  performance?: { issues?: Issue[] };
  security?: { issues?: Issue[] };
  best_practices?: {
    observations?: string[];
    recommendations?: string[];
  };
  scores?: Score[];
  overall_recommendation?: string;
};

const API_BASE = "http://localhost:8000";

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  queued: "Queued",
  started: "Analyzing code",
  finished: "Analysis complete",
  failed: "Failed",
};

const severityColor = (severity: Severity | string) => {
  switch (severity.toLowerCase()) {
    case "critical":
      return "#b91c1c";
    case "high":
      return "#dc2626";
    case "medium":
      return "#f97316";
    case "low":
      return "#0ea5e9";
    case "info":
    default:
      return "#6b7280";
  }
};

const statusColor = (status: string | null) => {
  switch (status) {
    case "queued":
      return "#f97316";
    case "started":
      return "#2563eb";
    case "finished":
      return "#16a34a";
    case "failed":
      return "#dc2626";
    default:
      return "#6b7280";
  }
};

type WorkflowStepId =
  | "connecting_mcp"
  | "detecting_languages"
  | "collecting_summary"
  | "static_security"
  | "language_metrics"
  | "ai_review"
  | "finalizing";

type WorkflowStep = {
  id: WorkflowStepId;
  label: string;
};

const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: "connecting_mcp", label: "Connecting to MCP tools" },
  { id: "detecting_languages", label: "Detecting languages" },
  { id: "collecting_summary", label: "Collecting repo summary" },
  { id: "static_security", label: "Running static security scan" },
  { id: "language_metrics", label: "Gathering language metrics" },
  { id: "ai_review", label: "AI deep code review" },
  { id: "finalizing", label: "Finalizing report" }
];

export const CodeAnalyzer: React.FC = () => {
  const [repoPath, setRepoPath] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [repoName, setRepoName] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "queued" | "started" | "finished" | "failed" | null
  >(null);
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const isRunning = status === "queued" || status === "started";

  const startAnalysis = async () => {
    setError(null);
    setDeleted(false);
    setReport(null);
    setStatus(null);
    setJobId(null);
    setRepoName(null);

    if (!repoPath.trim()) {
      setError("Please enter a repository URL or local path.");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post<AnalyzeResponse>(
        `${API_BASE}/analyze`,
        null,
        { params: { repo_path: repoPath.trim() } }
      );
      setJobId(res.data.job_id);
      setRepoName(res.data.repo_name);
      setStatus("queued");
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await axios.get<JobStatusResponse>(
          `${API_BASE}/status/${jobId}`
        );
        if (cancelled) return;
        setStatus(res.data.status);

        if (res.data.status === "finished" && res.data.result) {
          setReport(res.data.result.report);
        } else if (res.data.status === "failed") {
          setError("Job failed. Please check backend logs for details.");
        } else if (
          res.data.status === "queued" ||
          res.data.status === "started"
        ) {
          setTimeout(poll, 3000);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.response?.data?.detail || e.message);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const deleteTemp = async () => {
    if (!jobId) return;
    setDeleting(true);
    setError(null);
    try {
      await axios.delete(`${API_BASE}/temp/${jobId}`);
      setDeleted(true);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setDeleting(false);
    }
  };

  // Download full report as JSON
  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = repoName || "report";
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Extract AI review safely (supports your current shape and ai_code_review tool shape)
  const review: AiReview | string | null = useMemo(() => {
    if (!report) return null;
    const ai =
      report.ai_code_review ??
      report.ai_code_review_raw ??
      report.ai_review ??
      report.ai_code_analysis;
    if (!ai) return null;

    // ai might be {review: {...}} or {review_raw: "..."} or already structured
    if (typeof ai === "string") return ai;
    if (typeof ai.review === "string" || typeof ai.review_raw === "string") {
      return (ai.review ?? ai.review_raw) as string;
    }

    // unify fields from your ai_code_review JSON schema
    const base: any = ai.review ?? ai;
    const merged: AiReview = {
      ...base,
      architecture: {
        summary: base.architecture?.summary ?? base.architecture?.description,
        description: base.architecture?.description,
        layers: base.architecture?.layers,
        components: base.architecture?.components,
        patterns: base.architecture?.patterns,
        concerns: base.architecture?.concerns
      },
      best_practices: {
        observations: base.best_practices?.observations,
        recommendations: base.best_practices?.recommendations
      }
    };

    // Flatten all issues into review.issues for easier rendering
    const allIssues: Issue[] = [];
    const sections = ["code_quality", "performance", "security"] as const;

    sections.forEach((section) => {
      const sec = base[section];
      if (sec?.issues) {
        sec.issues.forEach((issue: any) => {
          allIssues.push({
            id: issue.id,
            severity: issue.severity,
            file: issue.file,
            line_range: issue.line_range,
            summary: issue.summary,
            details: issue.details,
            suggested_fix: issue.suggested_fix,
            category: section
          });
        });
      }
    });

    // Merge any legacy flat issues array
    if (base.issues && Array.isArray(base.issues)) {
      allIssues.push(...(base.issues as Issue[]));
    }

    merged.issues = allIssues;

    return merged;
  }, [report]);

  // Derive scores: prefer backend summary.scores if present; else review.scores
  const scores: Score[] | null = useMemo(() => {
    if (!report) {
      if (!review || typeof review === "string") return null;
      return (review as AiReview).scores ?? null;
    }

    const backendSummaryScores = report.summary?.scores;
    if (backendSummaryScores) {
      // normalize to Score[]
      const list: Score[] = [];
      if (typeof backendSummaryScores.overall_score === "number") {
        list.push({
          label: "Overall",
          value: backendSummaryScores.overall_score,
          description: "Combined code quality across all dimensions."
        });
      }
      if (typeof backendSummaryScores.security_score === "number") {
        list.push({
          label: "Security",
          value: backendSummaryScores.security_score,
          description: `Risk level: ${
            backendSummaryScores.security_risk_level || "n/a"
          }`
        });
      }
      if (typeof backendSummaryScores.performance_score === "number") {
        list.push({
          label: "Performance",
          value: backendSummaryScores.performance_score
        });
      }
      if (backendSummaryScores.total_issues !== undefined) {
        list.push({
          label: "Total Issues",
          value: Math.max(
            0,
            100 - Math.min(backendSummaryScores.total_issues * 2, 100)
          ),
          description: `${backendSummaryScores.total_issues} issue(s) found`
        });
      }
      if (list.length > 0) return list;
    }

    if (!review || typeof review === "string") return null;
    return review.scores ?? null;
  }, [report, review]);

  // Determine progress percentage & current step (heuristic based on status)
  const progress = useMemo(() => {
    if (!status) return 0;
    if (status === "queued") return 20;
    if (status === "started") return 60;
    if (status === "finished") return 100;
    if (status === "failed") return 100;
    return 0;
  }, [status]);

  const currentStepIndex = useMemo(() => {
    if (!status) return 0;
    if (status === "queued") return 1;
    if (status === "started") return 4;
    if (status === "finished") return WORKFLOW_STEPS.length - 1;
    if (status === "failed") return 3;
    return 0;
  }, [status]);

  // Per-file breakdown: group issues by file
  const issuesByFile: Record<string, Issue[]> = useMemo(() => {
    if (!review || typeof review === "string") return {};
    const r = review as AiReview;
    const map: Record<string, Issue[]> = {};
    const allIssues = r.issues || [];

    allIssues.forEach((issue) => {
      const fileKey = issue.file || "Unknown file";
      if (!map[fileKey]) map[fileKey] = [];
      map[fileKey].push(issue);
    });

    return map;
  }, [review]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem"
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.25rem",
          borderRadius: "0.75rem",
          background:
            "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(56,189,248,0.95))",
          color: "white",
          boxShadow: "0 10px 20px rgba(15, 23, 42, 0.25)"
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
            AI Code Analyzer
          </h1>
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: "0.9rem",
              opacity: 0.9
            }}
          >
            Deep repository inspection with security, performance, and quality
            insights.
          </p>
        </div>
        <div
          style={{
            padding: "0.35rem 0.75rem",
            borderRadius: "999px",
            backgroundColor: "rgba(15,23,42,0.25)",
            fontSize: "0.8rem",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem"
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "999px",
              backgroundColor: isRunning ? "#22c55e" : "#e5e7eb"
            }}
          />
          <span>{STATUS_LABELS[status || "idle"]}</span>
        </div>
      </header>

      {/* Controls + Stepper */}
      <section
        style={{
          borderRadius: "0.75rem",
          border: "1px solid #e5e7eb",
          padding: "1.25rem 1.5rem",
          backgroundColor: "#ffffff",
          boxShadow: "0 6px 18px rgba(15,23,42,0.06)"
        }}
      >
        <label
          htmlFor="repoPath"
          style={{
            display: "block",
            marginBottom: 8,
            fontSize: "0.9rem",
            fontWeight: 500,
            color: "#111827"
          }}
        >
          Repository URL or local path
        </label>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            flexWrap: "wrap"
          }}
        >
          <input
            id="repoPath"
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="https://github.com/owner/repo or /path/to/local/repo"
            style={{
              flex: 1,
              minWidth: "260px",
              padding: "0.6rem 0.75rem",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: "0.9rem"
            }}
          />
          <button
            onClick={startAnalysis}
            disabled={loading || isRunning}
            style={{
              padding: "0.65rem 1.4rem",
              borderRadius: 999,
              border: "none",
              backgroundColor: loading || isRunning ? "#9ca3af" : "#2563eb",
              color: "white",
              cursor: loading || isRunning ? "default" : "pointer",
              fontSize: "0.9rem",
              fontWeight: 500
            }}
          >
            {loading
              ? "Starting..."
              : isRunning
              ? "Analyzing..."
              : "Start Analysis"}
          </button>
        </div>

        {/* Progress */}
        {status && (
          <>
            <div style={{ marginTop: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.8rem",
                  color: "#6b7280",
                  marginBottom: "0.25rem"
                }}
              >
                <span>Analysis Progress</span>
                <span>{progress}%</span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: "#f3f4f6",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background:
                      status === "failed"
                        ? "#dc2626"
                        : "linear-gradient(90deg,#2563eb,#22c55e)",
                    transition: "width 300ms ease-out"
                  }}
                />
              </div>
            </div>

            {/* Stepper */}
            <div
              style={{
                marginTop: "0.85rem",
                display: "flex",
                gap: "0.75rem",
                overflowX: "auto",
                paddingBottom: "0.25rem"
              }}
            >
              {WORKFLOW_STEPS.map((step, index) => {
                const isCompleted = index <= currentStepIndex && status === "finished";
                const isActive = index === currentStepIndex && status !== "finished";

                return (
                  <div
                    key={step.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      fontSize: "0.75rem",
                      whiteSpace: "nowrap"
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "999px",
                        border: "2px solid #d1d5db",
                        backgroundColor: isCompleted
                          ? "#22c55e"
                          : isActive
                          ? "#2563eb"
                          : "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: isCompleted || isActive ? "#ffffff" : "#6b7280",
                        fontSize: "0.6rem",
                        transition: "background-color 200ms ease-out"
                      }}
                    >
                      {index + 1}
                    </div>
                    <span
                      style={{
                        color: isCompleted
                          ? "#16a34a"
                          : isActive
                          ? "#2563eb"
                          : "#6b7280"
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: "0.75rem",
              backgroundColor: "#fef2f2",
              color: "#b91c1c",
              padding: "0.75rem 0.9rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              border: "1px solid #fecaca"
            }}
          >
            {error}
          </div>
        )}
      </section>

      {/* Job info */}
      {jobId && (
        <section
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            fontSize: "0.85rem"
          }}
        >
          <div
            style={{
              flex: "1 1 180px",
              borderRadius: 10,
              padding: "0.85rem 1rem",
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb"
            }}
          >
            <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Job ID</div>
            <div style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
              {jobId}
            </div>
          </div>
          {repoName && (
            <div
              style={{
                flex: "1 1 180px",
                borderRadius: 10,
                padding: "0.85rem 1rem",
                backgroundColor: "#f9fafb",
                border: "1px solid #e5e7eb"
              }}
            >
              <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                Repository
              </div>
              <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                {repoName}
              </div>
            </div>
          )}
          <div
            style={{
              flex: "0 0 auto",
              borderRadius: 999,
              padding: "0.6rem 0.9rem",
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem"
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "999px",
                backgroundColor: statusColor(status)
              }}
            />
            <span style={{ fontSize: "0.8rem", color: "#374151" }}>
              {STATUS_LABELS[status || "idle"]}
            </span>
          </div>
        </section>
      )}

      {/* Analysis result */}
      {report && (
        <section
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            padding: "1.25rem 1.5rem",
            backgroundColor: "#ffffff",
            boxShadow: "0 8px 20px rgba(15,23,42,0.06)"
          }}
        >
          <div
            style={{
              marginTop: 0,
              marginBottom: "0.75rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem"
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "1.1rem",
                fontWeight: 600,
                color: "#111827"
              }}
            >
              Analysis Report
            </h2>
            <button
              onClick={downloadReport}
              style={{
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                padding: "0.35rem 0.7rem",
                backgroundColor: "#f9fafb",
                fontSize: "0.8rem",
                cursor: "pointer"
              }}
            >
              Download full report (JSON)
            </button>
          </div>

          {/* Scores */}
          {scores && scores.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginBottom: "1rem"
              }}
            >
              {scores.map((score) => (
                <div
                  key={score.label}
                  style={{
                    flex: "1 1 140px",
                    borderRadius: 10,
                    padding: "0.8rem 0.9rem",
                    backgroundColor: "#f9fafb",
                    border: "1px solid #e5e7eb"
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#6b7280",
                      marginBottom: "0.35rem"
                    }}
                  >
                    {score.label}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "0.3rem"
                    }}
                  >
                    <span
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: 600,
                        color: "#111827"
                      }}
                    >
                      {score.value}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                      / 100
                    </span>
                  </div>
                  {score.description && (
                    <div
                      style={{
                        marginTop: "0.3rem",
                        fontSize: "0.75rem",
                        color: "#6b7280"
                      }}
                    >
                      {score.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* High-level overview */}
          {review &&
            typeof review !== "string" &&
            review.high_level_overview && (
              <section style={{ marginTop: "0.75rem" }}>
                <h3
                  style={{
                    marginBottom: "0.25rem",
                    fontSize: "0.95rem",
                    fontWeight: 600
                  }}
                >
                  High-level Overview
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.9rem",
                    color: "#374151"
                  }}
                >
                  {review.high_level_overview}
                </p>
              </section>
            )}

          {/* Architecture */}
          {review &&
            typeof review !== "string" &&
            review.architecture && (
              <section style={{ marginTop: "0.75rem" }}>
                <h3
                  style={{
                    marginBottom: "0.25rem",
                    fontSize: "0.95rem",
                    fontWeight: 600
                  }}
                >
                  Architecture
                </h3>
                <p
                  style={{
                    marginTop: 0,
                    fontSize: "0.85rem",
                    color: "#374151"
                  }}
                >
                  {review.architecture.summary ||
                    review.architecture.description}
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    fontSize: "0.8rem"
                  }}
                >
                  {review.architecture.layers?.map((c) => (
                    <span
                      key={`layer-${c}`}
                      style={{
                        borderRadius: 999,
                        padding: "0.2rem 0.6rem",
                        backgroundColor: "#eef2ff",
                        color: "#4f46e5"
                      }}
                    >
                      {c}
                    </span>
                  ))}
                  {review.architecture.components?.map((c) => (
                    <span
                      key={`component-${c}`}
                      style={{
                        borderRadius: 999,
                        padding: "0.2rem 0.6rem",
                        backgroundColor: "#eff6ff",
                        color: "#1d4ed8"
                      }}
                    >
                      {c}
                    </span>
                  ))}
                  {review.architecture.patterns?.map((p) => (
                    <span
                      key={`pattern-${p}`}
                      style={{
                        borderRadius: 999,
                        padding: "0.2rem 0.6rem",
                        backgroundColor: "#ecfeff",
                        color: "#0891b2"
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </section>
            )}

          {/* Key risks & strengths */}
          {review && typeof review !== "string" && (
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem",
                marginTop: "0.75rem"
              }}
            >
              {review.key_risks && review.key_risks.length > 0 && (
                <div
                  style={{
                    borderRadius: 10,
                    padding: "0.7rem 0.8rem",
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca"
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      marginBottom: "0.25rem",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      color: "#b91c1c"
                    }}
                  >
                    Key Risks
                  </h4>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "1.1rem",
                      fontSize: "0.8rem",
                      color: "#7f1d1d"
                    }}
                  >
                    {review.key_risks.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {review.strengths && review.strengths.length > 0 && (
                <div
                  style={{
                    borderRadius: 10,
                    padding: "0.7rem 0.8rem",
                    backgroundColor: "#ecfdf3",
                    border: "1px solid #bbf7d0"
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      marginBottom: "0.25rem",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      color: "#166534"
                    }}
                  >
                    Strengths
                  </h4>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "1.1rem",
                      fontSize: "0.8rem",
                      color: "#166534"
                    }}
                  >
                    {review.strengths.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Best practices */}
          {review &&
            typeof review !== "string" &&
            review.best_practices &&
            (review.best_practices.observations?.length ||
              review.best_practices.recommendations?.length) && (
              <section style={{ marginTop: "0.75rem" }}>
                <h3
                  style={{
                    marginBottom: "0.25rem",
                    fontSize: "0.95rem",
                    fontWeight: 600
                  }}
                >
                  Best Practices & Recommendations
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "0.75rem",
                    fontSize: "0.8rem"
                  }}
                >
                  {review.best_practices.observations &&
                    review.best_practices.observations.length > 0 && (
                      <div
                        style={{
                          borderRadius: 10,
                          padding: "0.6rem 0.7rem",
                          backgroundColor: "#eff6ff",
                          border: "1px solid #dbeafe"
                        }}
                      >
                        <h4
                          style={{
                            margin: 0,
                            marginBottom: "0.25rem",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            color: "#1d4ed8"
                          }}
                        >
                          Observations
                        </h4>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: "1.1rem",
                            color: "#1e3a8a"
                          }}
                        >
                          {review.best_practices.observations.map((o, idx) => (
                            <li key={idx}>{o}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  {review.best_practices.recommendations &&
                    review.best_practices.recommendations.length > 0 && (
                      <div
                        style={{
                          borderRadius: 10,
                          padding: "0.6rem 0.7rem",
                          backgroundColor: "#ecfdf5",
                          border: "1px solid #bbf7d0"
                        }}
                      >
                        <h4
                          style={{
                            margin: 0,
                            marginBottom: "0.25rem",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            color: "#15803d"
                          }}
                        >
                          Recommendations
                        </h4>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: "1.1rem",
                            color: "#166534"
                          }}
                        >
                          {review.best_practices.recommendations.map(
                            (o, idx) => (
                              <li key={idx}>{o}</li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                </div>
              </section>
            )}

          {/* Issues overview */}
          {review &&
            typeof review !== "string" &&
            review.issues &&
            review.issues.length > 0 && (
              <section style={{ marginTop: "1rem" }}>
                <h3
                  style={{
                    marginBottom: "0.35rem",
                    fontSize: "0.95rem",
                    fontWeight: 600
                  }}
                >
                  Issues & Findings
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem"
                  }}
                >
                  {review.issues.map((issue) => (
                    <div
                      key={issue.id}
                      style={{
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        padding: "0.6rem 0.75rem",
                        backgroundColor: "#f9fafb"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: "0.75rem"
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "0.9rem",
                              fontWeight: 600,
                              color: "#111827"
                            }}
                          >
                            {issue.title || issue.summary || issue.id}
                          </div>
                          <div
                            style={{
                              marginTop: "0.15rem",
                              fontSize: "0.8rem",
                              color: "#4b5563"
                            }}
                          >
                            {issue.description || issue.details}
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: "0.25rem",
                            fontSize: "0.75rem"
                          }}
                        >
                          {issue.category && (
                            <span
                              style={{
                                borderRadius: 999,
                                padding: "0.15rem 0.5rem",
                                backgroundColor: "#ffffff",
                                border: "1px solid #e5e7eb",
                                color: "#4b5563"
                              }}
                            >
                              {issue.category}
                            </span>
                          )}
                          <span
                            style={{
                              borderRadius: 999,
                              padding: "0.15rem 0.5rem",
                              backgroundColor: severityColor(
                                issue.severity || "info"
                              ),
                              color: "white"
                            }}
                          >
                            {(issue.severity || "")
                              .toString()
                              .toUpperCase()}
                          </span>
                        </div>
                      </div>
                      {(issue.file ||
                        issue.recommendation ||
                        issue.suggested_fix ||
                        issue.line ||
                        issue.line_range) && (
                        <div
                          style={{
                            marginTop: "0.4rem",
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.75rem",
                            color: "#6b7280",
                            gap: "0.5rem",
                            flexWrap: "wrap"
                          }}
                        >
                          {issue.file && (
                            <div
                              style={{
                                fontFamily: "monospace"
                              }}
                            >
                              {issue.file}
                              {issue.line
                                ? `:${issue.line}`
                                : issue.line_range
                                ? ` (${issue.line_range})`
                                : ""}
                            </div>
                          )}
                          {(issue.recommendation || issue.suggested_fix) && (
                            <div
                              style={{
                                maxWidth: "380px"
                              }}
                            >
                              <strong>Fix:</strong>{" "}
                              {issue.recommendation || issue.suggested_fix}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

          {/* Per-file findings */}
          {Object.keys(issuesByFile).length > 0 && (
            <section style={{ marginTop: "1rem" }}>
              <h3
                style={{
                  marginBottom: "0.35rem",
                  fontSize: "0.95rem",
                  fontWeight: 600
                }}
              >
                Per-file Findings
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem"
                }}
              >
                {Object.entries(issuesByFile).map(([file, issues]) => (
                  <details
                    key={file}
                    style={{
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      padding: "0.5rem 0.75rem",
                      backgroundColor: "#f9fafb"
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <span style={{ fontFamily: "monospace" }}>{file}</span>
                      <span
                        style={{ fontSize: "0.75rem", color: "#6b7280" }}
                      >
                        {issues.length} issue
                        {issues.length !== 1 ? "s" : ""}
                      </span>
                    </summary>
                    <div
                      style={{
                        marginTop: "0.4rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.4rem"
                      }}
                    >
                      {issues.map((issue) => (
                        <div
                          key={issue.id}
                          style={{
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            padding: "0.5rem 0.6rem",
                            backgroundColor: "#ffffff"
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "0.5rem"
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: "0.85rem",
                                  fontWeight: 600
                                }}
                              >
                                {issue.title || issue.summary || issue.id}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.8rem",
                                  color: "#4b5563"
                                }}
                              >
                                {issue.description || issue.details}
                              </div>
                            </div>
                            <span
                              style={{
                                borderRadius: 999,
                                padding: "0.15rem 0.5rem",
                                backgroundColor: severityColor(
                                  issue.severity || "info"
                                ),
                                color: "white",
                                fontSize: "0.75rem",
                                height: "fit-content"
                              }}
                            >
                              {(issue.severity || "")
                                .toString()
                                .toUpperCase()}
                            </span>
                          </div>
                          <div
                            style={{
                              marginTop: "0.25rem",
                              fontSize: "0.75rem",
                              color: "#6b7280",
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "0.5rem",
                              flexWrap: "wrap"
                            }}
                          >
                            <span>
                              {issue.line
                                ? `Line ${issue.line}`
                                : issue.line_range
                                ? `Lines ${issue.line_range}`
                                : "Line info N/A"}
                            </span>
                            {(issue.recommendation || issue.suggested_fix) && (
                              <span>
                                <strong>Fix:</strong>{" "}
                                {issue.recommendation || issue.suggested_fix}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Repo summary */}
          {report.repo_summary && (
            <section style={{ marginTop: "1rem" }}>
              <h3
                style={{
                  marginBottom: "0.35rem",
                  fontSize: "0.95rem",
                  fontWeight: 600
                }}
              >
                Repository Scope
              </h3>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  fontSize: "0.8rem"
                }}
              >
                <div
                  style={{
                    borderRadius: 10,
                    padding: "0.6rem 0.8rem",
                    backgroundColor: "#f9fafb",
                    border: "1px solid #e5e7eb"
                  }}
                >
                  <div style={{ color: "#6b7280" }}>Files</div>
                  <div style={{ fontWeight: 600 }}>
                    {report.repo_summary.file_count}
                  </div>
                </div>
                <div
                  style={{
                    minWidth: "220px",
                    borderRadius: 10,
                    padding: "0.6rem 0.8rem",
                    backgroundColor: "#f9fafb",
                    border: "1px solid #e5e7eb"
                  }}
                >
                  <div
                    style={{
                      color: "#6b7280",
                      marginBottom: "0.25rem"
                    }}
                  >
                    Top directories by size
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "1.1rem"
                    }}
                  >
                    {report.repo_summary.dirs_by_size
                      .slice(0, 5)
                      .map((d: any) => (
                        <li key={d.path}>{d.path}</li>
                      ))}
                  </ul>
                </div>
                <div
                  style={{
                    minWidth: "220px",
                    borderRadius: 10,
                    padding: "0.6rem 0.8rem",
                    backgroundColor: "#f9fafb",
                    border: "1px solid #e5e7eb"
                  }}
                >
                  <div
                    style={{
                      color: "#6b7280",
                      marginBottom: "0.25rem"
                    }}
                  >
                    Entrypoints
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "1.1rem"
                    }}
                  >
                    {report.repo_summary.entrypoints
                      .slice(0, 5)
                      .map((e: string) => (
                        <li key={e}>{e}</li>
                      ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* Raw review fallback */}
          {typeof review === "string" && (
            <section style={{ marginTop: "1rem" }}>
              <h3
                style={{
                  marginBottom: "0.35rem",
                  fontSize: "0.95rem",
                  fontWeight: 600
                }}
              >
                AI Code Review
              </h3>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  backgroundColor: "#f9fafb",
                  padding: "0.75rem",
                  borderRadius: 8,
                  fontSize: "0.85rem"
                }}
              >
                {review}
              </pre>
            </section>
          )}

          {/* Delete temp repo */}
          {jobId && (
            <div style={{ marginTop: "1rem" }}>
              <button
                onClick={deleteTemp}
                disabled={deleting || deleted}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: 999,
                  border: "none",
                  backgroundColor: deleted ? "#9ca3af" : "#dc2626",
                  color: "white",
                  cursor: deleted ? "default" : "pointer",
                  fontSize: "0.85rem"
                }}
              >
                {deleting
                  ? "Deleting temporary clone..."
                  : deleted
                  ? "Temporary repo deleted"
                  : "Delete cloned repository"}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
