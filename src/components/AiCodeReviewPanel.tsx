// frontend/src/components/AiCodeReviewPanel.tsx
import React from "react";

type Issue = {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  file: string;
  line_range: string | null;
  summary: string;
  details: string;
  suggested_fix: string;
};

type AiCodeReview = {
  high_level_overview?: string;
  architecture?: {
    description?: string;
    layers?: string[];
    components?: string[];
    patterns?: string[];
    concerns?: string[];
  };
  code_quality?: {
    strengths?: string[];
    issues?: Issue[];
  };
  performance?: {
    issues?: Issue[];
  };
  security?: {
    issues?: Issue[];
  };
  best_practices?: {
    observations?: string[];
    recommendations?: string[];
  };
  overall_recommendation?: string;
};

type AiCodeReviewPanelProps = {
  report: any;
};

const getAiReview = (report: any): AiCodeReview | null => {
  if (!report?.ai_code_review) return null;
  if (report.ai_code_review.review) return report.ai_code_review.review;
  return report.ai_code_review as AiCodeReview;
};

const IssuesTable: React.FC<{ issues: Issue[] }> = ({ issues }) => {
  if (!issues || issues.length === 0) {
    return <p className="text-sm text-gray-500">No issues found.</p>;
  }

  const badgeClass = (severity: Issue["severity"]) => {
    switch (severity) {
      case "critical":
      case "high":
        return "bg-red-100 text-red-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-green-100 text-green-800";
    }
  };

  return (
    <table className="min-w-full text-sm border border-gray-200 rounded-md overflow-hidden">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2 text-left">Severity</th>
          <th className="px-3 py-2 text-left">File</th>
          <th className="px-3 py-2 text-left">Lines</th>
          <th className="px-3 py-2 text-left">Summary</th>
          <th className="px-3 py-2 text-left">Suggested Fix</th>
        </tr>
      </thead>
      <tbody>
        {issues.map((issue) => (
          <tr key={issue.id} className="border-t border-gray-200 align-top">
            <td className="px-3 py-2">
              <span
                className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badgeClass(
                  issue.severity,
                )}`}
              >
                {issue.severity}
              </span>
            </td>
            <td className="px-3 py-2 whitespace-nowrap">{issue.file}</td>
            <td className="px-3 py-2 whitespace-nowrap">
              {issue.line_range || "-"}
            </td>
            <td className="px-3 py-2">
              <div className="font-medium">{issue.summary}</div>
              <div className="text-xs text-gray-500">{issue.details}</div>
            </td>
            <td className="px-3 py-2 text-xs">{issue.suggested_fix}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const AiCodeReviewPanel: React.FC<AiCodeReviewPanelProps> = ({ report }) => {
  const review = getAiReview(report);
  if (!review) {
    return (
      <div className="text-sm text-gray-500">
        No AI code review available.
      </div>
    );
  }

  const codeIssues = review.code_quality?.issues || [];
  const perfIssues = review.performance?.issues || [];
  const secIssues = review.security?.issues || [];

  return (
    <div className="space-y-6">
      {/* High-level overview */}
      <section>
        <h2 className="text-lg font-semibold mb-1">AI Code Review Overview</h2>
        <p className="text-sm text-gray-800">
          {review.high_level_overview || "No overview provided."}
        </p>
      </section>

      {/* Architecture */}
      {review.architecture && (
        <section>
          <h3 className="text-md font-semibold mb-2">Architecture</h3>
          <p className="text-sm mb-3">
            {review.architecture.description}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-medium">Layers</div>
              <ul className="list-disc list-inside text-gray-700">
                {review.architecture.layers?.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium">Components</div>
              <ul className="list-disc list-inside text-gray-700">
                {review.architecture.components?.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium">Patterns</div>
              <ul className="list-disc list-inside text-gray-700">
                {review.architecture.patterns?.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium">Concerns</div>
              <ul className="list-disc list-inside text-gray-700">
                {review.architecture.concerns?.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Issues by category */}
      <section className="space-y-4">
        <h3 className="text-md font-semibold">Issues by Category</h3>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">Code Quality</span>
              <span className="text-xs text-gray-500">
                {codeIssues.length} issues
              </span>
            </div>
            <IssuesTable issues={codeIssues} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">Performance</span>
              <span className="text-xs text-gray-500">
                {perfIssues.length} issues
              </span>
            </div>
            <IssuesTable issues={perfIssues} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">Security</span>
              <span className="text-xs text-gray-500">
                {secIssues.length} issues
              </span>
            </div>
            <IssuesTable issues={secIssues} />
          </div>
        </div>
      </section>

      {/* Best practices */}
      {review.best_practices && (
        <section>
          <h3 className="text-md font-semibold mb-1">Best Practices</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-medium">Observations</div>
              <ul className="list-disc list-inside text-gray-700">
                {review.best_practices.observations?.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium">Recommendations</div>
              <ul className="list-disc list-inside text-gray-700">
                {review.best_practices.recommendations?.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Overall recommendation */}
      {review.overall_recommendation && (
        <section>
          <h3 className="text-md font-semibold mb-1">
            Overall Recommendation
          </h3>
          <p className="text-sm text-gray-800">
            {review.overall_recommendation}
          </p>
        </section>
      )}
    </div>
  );
};

export default AiCodeReviewPanel;
