import { Check } from "lucide-react";
import { PIPELINE_STEPS } from "@shared/catalog";

export type PipelineStage = "script" | "prompt" | "image" | "video" | "upload";

interface PipelineStepperProps {
  current: PipelineStage;
  completed?: Record<PipelineStage, boolean>;
}

const ORDER: PipelineStage[] = ["script", "prompt", "image", "video", "upload"];

export function PipelineStepper({ current, completed = {} as Record<PipelineStage, boolean> }: PipelineStepperProps) {
  const currentIndex = ORDER.indexOf(current);
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {PIPELINE_STEPS.map((step, idx) => {
          const isDone = completed[step.key as PipelineStage] || idx < currentIndex;
          const isActive = idx === currentIndex;
          return (
            <div
              key={step.id}
              className={[
                "relative rounded-lg border p-4 transition-all",
                isActive
                  ? "border-primary/40 bg-card shadow-sm"
                  : isDone
                  ? "border-accent/40 bg-card/80"
                  : "border-border bg-muted/40",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <div
                  className={[
                    "h-8 w-8 rounded-full flex items-center justify-center font-serif text-sm",
                    isDone
                      ? "bg-accent text-accent-foreground"
                      : isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {isDone ? <Check className="h-4 w-4" /> : step.id}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Step {step.id}
                  </p>
                  <p className="font-serif text-base leading-tight truncate">{step.title}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{step.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
