// frontend/src/components/WorkflowStepper.tsx
import React from "react";

const WORKFLOW_STEPS = [
  { id: "detect_languages", label: "Detect Languages" },
  { id: "collect_repo_summary", label: "Repo Summary" },
  { id: "language_metrics", label: "Language Metrics" },
  { id: "static_security", label: "Security Scan" },
  { id: "ai_code_review", label: "AI Code Review" },
  { id: "ai_summary", label: "Summary" },
] as const;

type StageStatus = "pending" | "running" | "done" | "error";

type WorkflowStepperProps = {
  report: any;
};

const getStageMap = (report: any): Record<string, StageStatus> => {
  const map: Record<string, StageStatus> = {};
  if (!report?.stages) return map;
  for (const s of report.stages) {
    map[s.name] = s.status as StageStatus;
  }
  return map;
};

const WorkflowStepper: React.FC<WorkflowStepperProps> = ({ report }) => {
  const stageStatusMap = getStageMap(report);

  const getStatusIcon = (status: StageStatus) => {
    if (status === "done") return "✅";
    if (status === "running") return "⏳";
    if (status === "error") return "⚠️";
    return "○"; // pending
  };

  return (
    <ol className="flex flex-row flex-wrap items-center gap-4 text-sm">
      {WORKFLOW_STEPS.map((step, idx) => {
        const status = stageStatusMap[step.id] || "pending";
        return (
          <li key={step.id} className="flex items-center gap-2">
            <span>{getStatusIcon(status)}</span>
            <span>
              {idx + 1}. {step.label}
            </span>
            {idx < WORKFLOW_STEPS.length - 1 && (
              <span className="mx-2 text-gray-400">›</span>
            )}
          </li>
        );
      })}
    </ol>
  );
};

export default WorkflowStepper;
