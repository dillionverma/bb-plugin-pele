import {
  experimental_copyToClipboard as copyToClipboard,
  experimental_Icon as Icon,
} from "@get-bb/plugin-sdk/app";
import { useEffect, useRef, useState, type ComponentProps } from "react";

// bb's own icon-button look, from the stock Mermaid block's toolbar.
const BUTTON_CLASS =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-state-hover hover:text-foreground hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-state-active aria-pressed:text-foreground";

export function ToolButton({
  label,
  icon,
  className,
  ...props
}: ComponentProps<"button"> & { label: string; icon: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={className === undefined ? BUTTON_CLASS : `${BUTTON_CLASS} ${className}`}
      {...props}
    >
      <Icon name={icon} aria-hidden className="size-4" />
    </button>
  );
}

type CopyResult = "idle" | "copied" | "failed";

const COPY_FEEDBACK: Record<CopyResult, { label: string; icon: string }> = {
  idle: { label: "Copy Mermaid source", icon: "Copy" },
  copied: { label: "Copied Mermaid source", icon: "Check" },
  failed: { label: "Could not copy Mermaid source", icon: "X" },
};
const FEEDBACK_MS = 2000;

export function CopyButton({ code }: { code: string }) {
  const [result, setResult] = useState<CopyResult>("idle");
  const timer = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    const copied = await copyToClipboard({ text: code });
    if (!mounted.current) return;
    setResult(copied ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setResult("idle"), FEEDBACK_MS);
  };

  const { label, icon } = COPY_FEEDBACK[result];
  return (
    <>
      <ToolButton
        label={label}
        icon={icon}
        onClick={copy}
        className={result === "failed" ? "text-destructive hover:text-destructive" : undefined}
      />
      <span role="status" className="sr-only">
        {result === "idle" ? "" : label}
      </span>
    </>
  );
}
