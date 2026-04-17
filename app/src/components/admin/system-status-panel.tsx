"use client";

import { useState } from "react";

type HealthState = "ok" | "warn" | "error";
type SetupState = "not_started" | "needs_attention" | "ready";

type DiagnosticsPayload = {
  checks: Array<{
    key: string;
    label: string;
    state: HealthState;
    detail: string | null;
  }>;
  queueCounts: {
    photos: Record<string, number>;
    imports: Record<string, number>;
  };
  failures: {
    photos: number;
    imports: number;
  };
  lastSuccess: {
    photoProcessedAt: string | null;
    importCompletedAt: string | null;
  };
  setup: {
    state: SetupState;
    steps: Array<{
      key: string;
      label: string;
      state: SetupState;
      detail: string;
      href: string;
    }>;
  };
  warnings: string[];
};

type SystemStatusPanelProps = {
  initialDiagnostics: DiagnosticsPayload;
  compact?: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function stateClasses(state: HealthState | SetupState) {
  if (state === "ok" || state === "ready") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  }

  if (state === "warn" || state === "needs_attention") {
    return "border-[#c5965c]/30 bg-[#c5965c]/10 text-[#f3d1aa]";
  }

  return "border-white/10 bg-white/[0.04] text-white/60";
}

export function SystemStatusPanel({
  initialDiagnostics,
  compact = false,
}: SystemStatusPanelProps) {
  const [diagnostics, setDiagnostics] = useState(initialDiagnostics);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rerunDiagnostics() {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/system/diagnostics", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        diagnostics?: DiagnosticsPayload;
      };

      if (!response.ok || !payload.diagnostics) {
        throw new Error(payload.error ?? "Could not run diagnostics.");
      }

      setDiagnostics(payload.diagnostics);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not run diagnostics.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="editorial-label">System</p>
          <h2 className="font-serif text-[1.65rem] tracking-[-0.03em] text-white">
            {compact ? "Status" : "Setup and diagnostics"}
          </h2>
        </div>
        <button
          type="button"
          onClick={rerunDiagnostics}
          disabled={running}
          className="admin-button-muted"
        >
          {running ? "Running..." : "Run diagnostics"}
        </button>
      </div>

      {error ? (
        <p className="rounded-2xl border border-[#c5965c]/30 bg-[#c5965c]/10 px-4 py-3 text-sm text-[#f3d1aa]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-[0.68rem] uppercase tracking-[0.24em] ${stateClasses(
            diagnostics.setup.state,
          )}`}
        >
          {diagnostics.setup.state.replaceAll("_", " ")}
        </span>
        {diagnostics.warnings.map((warning) => (
          <span
            key={warning}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.68rem] uppercase tracking-[0.22em] text-white/56"
          >
            {warning}
          </span>
        ))}
      </div>

      {!compact ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {diagnostics.setup.steps.map((step) => (
            <a
              key={step.key}
              href={step.href}
              className={`rounded-[1.1rem] border px-4 py-3 transition hover:border-white/14 ${stateClasses(
                step.state,
              )}`}
            >
              <p className="text-[0.68rem] uppercase tracking-[0.24em]">
                {step.label}
              </p>
              <p className="mt-2 text-sm leading-6">{step.detail}</p>
            </a>
          ))}
        </div>
      ) : null}

      <div className={`grid gap-3 ${compact ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-6"}`}>
        {diagnostics.checks.map((check) => (
          <div
            key={check.key}
            className={`rounded-[1.1rem] border px-4 py-3 ${stateClasses(check.state)}`}
          >
            <p className="text-[0.68rem] uppercase tracking-[0.24em]">{check.label}</p>
            <p className="mt-2 text-sm leading-6">{check.detail ?? "OK"}</p>
          </div>
        ))}
      </div>

      <div className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-4"}`}>
        <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
          <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/42">
            Photo queue
          </p>
          <p className="mt-2 text-sm text-white/72">
            {diagnostics.queueCounts.photos.waiting ?? 0} waiting ·{" "}
            {diagnostics.queueCounts.photos.active ?? 0} active
          </p>
        </div>
        <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
          <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/42">
            Import queue
          </p>
          <p className="mt-2 text-sm text-white/72">
            {diagnostics.queueCounts.imports.waiting ?? 0} waiting ·{" "}
            {diagnostics.queueCounts.imports.active ?? 0} active
          </p>
        </div>
        <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
          <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/42">
            Failures
          </p>
          <p className="mt-2 text-sm text-white/72">
            {diagnostics.failures.photos} photos · {diagnostics.failures.imports} imports
          </p>
        </div>
        <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
          <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/42">
            Last success
          </p>
          <p className="mt-2 text-sm text-white/72">
            Photos: {formatDateTime(diagnostics.lastSuccess.photoProcessedAt)}
          </p>
          <p className="mt-1 text-sm text-white/56">
            Imports: {formatDateTime(diagnostics.lastSuccess.importCompletedAt)}
          </p>
        </div>
      </div>
    </section>
  );
}
