import type { RenderResult } from "pele";
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { frameDocument, themeCss, THEME_STYLE_ID, type FrameTheme } from "./frame";
import { appFontCss } from "./theme";

export function DiagramFrame({
  diagram,
  theme,
  className,
  style,
}: {
  diagram: RenderResult;
  theme: FrameTheme;
  className: string;
  style: CSSProperties;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const fontCss = appFontCss(theme.variables["--pele-font"]);
  const builtWith = useRef(theme);
  const html = useMemo(
    () => frameDocument({ svg: diagram.svg, theme: builtWith.current, fontCss }),
    [diagram.svg, fontCss],
  );
  const latest = useRef({ html, theme });
  latest.current = { html, theme };

  const applyTheme = () => {
    const style = frameRef.current?.contentDocument?.getElementById(THEME_STYLE_ID);
    if (style) style.textContent = themeCss(latest.current.theme);
  };

  // srcdoc would be a subframe navigation to about:srcdoc, which bb's iOS app
  // cancels. Writing into the frame's initial about:blank document navigates nowhere.
  const write = () => {
    const document = frameRef.current?.contentDocument;
    if (!document) return;
    document.open();
    document.write(latest.current.html);
    document.close();
    applyTheme();
  };
  useLayoutEffect(write, [html]);
  useEffect(applyTheme, [theme]);

  return (
    <iframe
      ref={frameRef}
      title={`Mermaid ${diagram.type} diagram`}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      // A frame moved in the page reloads about:blank and loses what was written.
      onLoad={() => {
        if (frameRef.current?.contentDocument?.getElementById(THEME_STYLE_ID)) applyTheme();
        else write();
      }}
      className={className}
      style={{ ...style, colorScheme: theme.appearance }}
    />
  );
}
