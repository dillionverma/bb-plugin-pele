import {
  definePluginApp,
  experimental_SourceCode as SourceCode,
  type ExperimentalCodeFenceRendererProps,
} from "@get-bb/plugin-sdk/app";
import { render, type RenderResult } from "pele";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CopyButton, ToolButton } from "./controls";
import { DiagramFrame } from "./diagram-frame";
import { frameHeight, type FrameTheme } from "./frame";
import { useFrameTheme } from "./theme";
import { DiagramViewer } from "./viewer";

// Code is model output: never emit links or remote images, whatever it asks for.
function renderDiagram(code: string, theme: FrameTheme): RenderResult | null {
  try {
    return render(code, {
      links: false,
      images: false,
      fontFamily: theme.variables["--pele-font"],
      fontFamilyMono: theme.variables["--pele-font-mono"],
    });
  } catch {
    return null;
  }
}

function DiagramCard({
  code,
  diagram,
  theme,
}: {
  code: string;
  diagram: RenderResult;
  theme: FrameTheme;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box === null) return;
    setWidth(box.clientWidth);
    const observer = new ResizeObserver(() => setWidth(box.clientWidth));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between pl-3 pr-1.5 pt-1.5">
        <span className="font-mono text-xs uppercase text-muted-foreground">mermaid</span>
        <div role="group" aria-label="Diagram controls" className="flex items-center gap-1">
          <ToolButton
            label="Show Mermaid source"
            icon="Code"
            aria-pressed={showSource}
            onClick={() => setShowSource((shown) => !shown)}
          />
          <DiagramViewer
            open={expanded}
            onOpenChange={setExpanded}
            trigger={<ToolButton label="Open Mermaid diagram" icon="Maximize2" />}
            code={code}
            diagram={diagram}
            theme={theme}
          />
          <CopyButton code={code} />
        </div>
      </div>
      <div ref={boxRef}>
        {showSource ? (
          <SourceCode content={code} path="diagram.mmd" overflow="wrap" className="px-3 py-2" />
        ) : (
          <DiagramFrame
            diagram={diagram}
            theme={theme}
            className="block w-full border-0"
            style={{ height: frameHeight(diagram, width) }}
          />
        )}
      </div>
    </div>
  );
}

type Props = ExperimentalCodeFenceRendererProps;

function ClosedFence({ code, index, Original }: Pick<Props, "code" | "index" | "Original">) {
  const theme = useFrameTheme();
  const font = theme.variables["--pele-font"];
  const mono = theme.variables["--pele-font-mono"];
  // Colors are CSS variables in the frame, so only text and fonts change the layout.
  const diagram = useMemo(() => renderDiagram(code, theme), [code, font, mono]);
  return (
    <div data-pele-fence={index} data-pele-view={diagram === null ? "error" : "diagram"}>
      {diagram === null ? (
        <Original />
      ) : (
        <DiagramCard code={code} diagram={diagram} theme={theme} />
      )}
    </div>
  );
}

function PeleFence({ code, status, index, Original }: Props) {
  if (status === "closed") return <ClosedFence code={code} index={index} Original={Original} />;
  return (
    <div data-pele-fence={index} data-pele-view={status === "streaming" ? "source" : "original"}>
      {status === "streaming" ? (
        <pre className="my-2 overflow-x-auto rounded-lg border border-border px-3 py-2 font-mono text-xs text-muted-foreground">
          {code}
        </pre>
      ) : (
        <Original />
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_codeFenceRenderer({
    id: "pele",
    languages: ["mermaid"],
    component: PeleFence,
  });
});
