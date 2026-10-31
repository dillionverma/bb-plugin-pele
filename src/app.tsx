import {
  definePluginApp,
  type ExperimentalCodeFenceRendererProps,
} from "@get-bb/plugin-sdk/app";
import { render, type RenderResult } from "pele";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  frameDocument,
  frameHeight,
  themeCss,
  THEME_STYLE_ID,
  type FrameTheme,
} from "./frame";
import { appFontCss, useFrameTheme } from "./theme";

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

function DiagramFrame({ diagram, theme }: { diagram: RenderResult; theme: FrameTheme }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0);
  const fontCss = appFontCss(theme.variables["--pele-font"]);
  const builtWith = useRef(theme);
  const srcDoc = useMemo(
    () => frameDocument({ svg: diagram.svg, theme: builtWith.current, fontCss }),
    [diagram.svg, fontCss],
  );

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box === null) return;
    setWidth(box.clientWidth);
    const observer = new ResizeObserver(() => setWidth(box.clientWidth));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const applyTheme = () => {
    const style = frameRef.current?.contentDocument?.getElementById(THEME_STYLE_ID);
    if (style) style.textContent = themeCss(theme);
  };
  useEffect(applyTheme, [theme]);

  return (
    <div
      ref={boxRef}
      className="my-2 overflow-hidden rounded-lg border border-border"
    >
      <iframe
        ref={frameRef}
        title={`Mermaid ${diagram.type} diagram`}
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        onLoad={applyTheme}
        className="block w-full border-0"
        style={{ height: frameHeight(diagram, width), colorScheme: theme.appearance }}
      />
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
      {diagram === null ? <Original /> : <DiagramFrame diagram={diagram} theme={theme} />}
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
