import type { RenderResult } from "pele";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
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
  const srcDoc = useMemo(
    () => frameDocument({ svg: diagram.svg, theme: builtWith.current, fontCss }),
    [diagram.svg, fontCss],
  );

  const applyTheme = () => {
    const style = frameRef.current?.contentDocument?.getElementById(THEME_STYLE_ID);
    if (style) style.textContent = themeCss(theme);
  };
  useEffect(applyTheme, [theme]);

  return (
    <iframe
      ref={frameRef}
      title={`Mermaid ${diagram.type} diagram`}
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      onLoad={applyTheme}
      className={className}
      style={{ ...style, colorScheme: theme.appearance }}
    />
  );
}
