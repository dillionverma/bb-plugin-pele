import { describe, expect, test } from "vitest";
import { FRAME_PADDING, frameDocument, frameHeight, frameTheme, themeCss } from "./frame";

const tokens: Record<string, string> = {
  "--background": "rgb(255, 255, 255)",
  "--foreground": "rgb(10, 10, 10)",
  "--font-sans": '"Inter Variable", Inter, sans-serif',
};

describe("frameTheme", () => {
  test("maps bb tokens onto Pele variables and skips missing ones", () => {
    const theme = frameTheme("dark", (name) => tokens[name] ?? "");
    expect(theme.appearance).toBe("dark");
    expect(theme.variables).toEqual({
      "--pele-bg": "rgb(255, 255, 255)",
      "--pele-fg": "rgb(10, 10, 10)",
      "--pele-font": '"Inter Variable", Inter, sans-serif',
    });
  });

  test("a token value cannot close the rule or the style element", () => {
    const theme = frameTheme("light", () => "red;}</style><script>alert(1)</script>");
    const css = themeCss(theme);
    expect(css).not.toMatch(/[<>]/);
    expect(css.match(/[{}]/g)).toEqual(["{", "}"]);
  });
});

describe("frameDocument", () => {
  const html = frameDocument({
    svg: '<svg class="pele"></svg>',
    theme: frameTheme("light", (name) => tokens[name] ?? ""),
    fontCss: "@font-face{font-family:X}</style><script>alert(1)</script>",
  });

  test("forbids scripts and every remote load except same-origin fonts", () => {
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
    expect(csp).toBe("default-src 'none'; style-src 'unsafe-inline'; font-src 'self' data:");
  });

  test("font CSS cannot break out of its style element", () => {
    expect(html).not.toContain("</style><script>");
    expect(html.match(/<\/style>/g)).toHaveLength(2);
  });

  test("puts the svg in the body and the theme in its own style element", () => {
    expect(html).toContain('<body><svg class="pele"></svg></body>');
    expect(html).toContain('<style id="pele-theme">:root{color-scheme:light;');
  });
});

describe("frameHeight", () => {
  const natural = { width: 400, height: 100 };

  test("keeps the natural height when the diagram fits", () => {
    expect(frameHeight(natural, 800)).toBe(100 + 2 * FRAME_PADDING);
  });

  test("scales the height with the width when the diagram is too wide", () => {
    expect(frameHeight(natural, 200 + 2 * FRAME_PADDING)).toBe(50 + 2 * FRAME_PADDING);
  });

  test("uses the natural height before the width is known", () => {
    expect(frameHeight(natural, 0)).toBe(100 + 2 * FRAME_PADDING);
  });
});
