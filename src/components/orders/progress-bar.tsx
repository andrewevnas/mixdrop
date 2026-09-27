import type { Progress } from "@/server/orders/progress";

const BANNER_TONE = {
  info: "border-border bg-muted",
  warning: "border-amber-500/40 bg-amber-500/10",
  error: "border-destructive/40 bg-destructive/10",
} as const;

export function ProgressBar({ progress }: { progress: Progress }) {
  return (
    <div className="grid gap-3">
      {progress.banner && (
        <p role="note" className={`rounded-lg border p-3 text-sm ${BANNER_TONE[progress.banner.tone]}`}>
          {progress.banner.text}
        </p>
      )}
      <ol aria-label="Order progress" className="flex flex-wrap gap-x-2 gap-y-3">
        {progress.steps.map((step, i) => (
          <li
            key={step.key}
            data-state={step.state}
            aria-current={step.state === "current" ? "step" : undefined}
            className="flex items-center gap-2 text-sm"
          >
            {i > 0 && <span aria-hidden className="bg-border h-px w-4" />}
            <span
              aria-hidden
              className={
                step.state === "done"
                  ? "bg-primary size-2.5 rounded-full"
                  : step.state === "current"
                    ? "border-primary size-2.5 rounded-full border-2"
                    : "bg-muted-foreground/30 size-2.5 rounded-full"
              }
            />
            <span className={step.state === "upcoming" ? "text-muted-foreground" : "font-medium"}>
              {step.label}
              {step.detail && <span className="text-muted-foreground font-normal"> · {step.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
