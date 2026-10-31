import { render, type RenderResult } from "pele";
import { useMemo } from "react";
import type { FrameTheme } from "./frame";
import { useFrameTheme } from "./theme";

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

export function useDiagram(code: string): { diagram: RenderResult | null; theme: FrameTheme } {
  const theme = useFrameTheme();
  const font = theme.variables["--pele-font"];
  const mono = theme.variables["--pele-font-mono"];
  // Colors are CSS variables in the frame, so only text and fonts change the layout.
  const diagram = useMemo(() => renderDiagram(code, theme), [code, font, mono]);
  return { diagram, theme };
}
