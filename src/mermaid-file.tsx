import { useSdk, type PluginFileOpenerProps } from "@get-bb/plugin-sdk/app";
import type { RenderResult } from "pele";
import { useEffect, useState, type ComponentType } from "react";
import { CopyButton, ToolButton } from "./controls";
import { readFileText, type FileText } from "./file-source";
import type { FrameTheme } from "./frame";
import { useDiagram } from "./render";
import { PanZoomCanvas, usePanZoom, ViewerHeader, ZoomControls } from "./viewer";

// Agents often rewrite a diagram file while it is open; Mermaid files are small.
export const REFRESH_MS = 3000;

type Load = { kind: "loading" } | { kind: "loaded"; file: FileText } | { kind: "failed" };

function useFileText({ path, source }: Pick<PluginFileOpenerProps, "path" | "source">): Load {
  const sdk = useSdk();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const sourceKey = JSON.stringify(source);
  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    setLoad({ kind: "loading" });
    const read = async () => {
      if (document.visibilityState === "visible") {
        try {
          const file = await readFileText(sdk, path, source, controller.signal);
          setLoad((current) =>
            current.kind === "loaded" && current.file.sha256 === file.sha256
              ? current
              : { kind: "loaded", file },
          );
        } catch {
          if (controller.signal.aborted) return;
          setLoad((current) => (current.kind === "loaded" ? current : { kind: "failed" }));
        }
      }
      if (!controller.signal.aborted) timer = window.setTimeout(read, REFRESH_MS);
    };
    void read();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [sdk, path, sourceKey]);
  return load;
}

function FileDiagram({
  path,
  code,
  diagram,
  theme,
  Original,
}: {
  path: string;
  code: string;
  diagram: RenderResult;
  theme: FrameTheme;
  Original: ComponentType;
}) {
  const panZoom = usePanZoom(diagram);
  const [showSource, setShowSource] = useState(false);
  return (
    <div
      data-pele-file=""
      className="flex h-full min-h-0 flex-col"
      onKeyDown={showSource ? undefined : panZoom.onKeyDown}
    >
      <ViewerHeader
        title={
          <h2 className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {path.split("/").pop()}
          </h2>
        }
      >
        {showSource ? null : <ZoomControls panZoom={panZoom} />}
        <ToolButton
          label="Show Mermaid source"
          icon="Code"
          aria-pressed={showSource}
          onClick={() => setShowSource((shown) => !shown)}
        />
        <CopyButton code={code} />
      </ViewerHeader>
      {showSource ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <Original />
        </div>
      ) : (
        <PanZoomCanvas panZoom={panZoom} diagram={diagram} theme={theme} />
      )}
    </div>
  );
}

function LoadedFile({ path, code, Original }: { path: string; code: string; Original: ComponentType }) {
  const { diagram, theme } = useDiagram(code);
  if (diagram === null) return <Original />;
  return <FileDiagram path={path} code={code} diagram={diagram} theme={theme} Original={Original} />;
}

export function MermaidFile({ path, source, Original }: PluginFileOpenerProps) {
  const load = useFileText({ path, source });
  switch (load.kind) {
    case "loading":
      return <p className="p-3 text-xs text-muted-foreground">Loading diagram…</p>;
    case "failed":
      return <Original />;
    case "loaded":
      return <LoadedFile path={path} code={load.file.text} Original={Original} />;
  }
}
