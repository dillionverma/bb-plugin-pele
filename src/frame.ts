export type Appearance = "light" | "dark";

export interface FrameTheme {
  appearance: Appearance;
  variables: Readonly<Record<string, string>>;
}

const PELE_VARIABLES = [
  ["--pele-bg", "--background"],
  ["--pele-fg", "--foreground"],
  ["--pele-line", "--muted-foreground"],
  ["--pele-muted", "--muted-foreground"],
  ["--pele-surface", "--surface-recessed-solid"],
  ["--pele-surface-alt", "--muted"],
  ["--pele-border", "--border"],
  ["--pele-accent", "--timeline-accent"],
  ["--pele-radius", "--radius"],
  ["--pele-font", "--font-sans"],
  ["--pele-font-mono", "--font-mono"],
] as const;

export function frameTheme(
  appearance: Appearance,
  readToken: (name: string) => string,
): FrameTheme {
  const variables: Record<string, string> = {};
  for (const [name, token] of PELE_VARIABLES) {
    const value = readToken(token).trim();
    if (value.length > 0) variables[name] = value;
  }
  return { appearance, variables };
}

export function frameThemesEqual(left: FrameTheme, right: FrameTheme): boolean {
  const names = Object.keys(left.variables);
  return (
    left.appearance === right.appearance &&
    names.length === Object.keys(right.variables).length &&
    names.every((name) => left.variables[name] === right.variables[name])
  );
}

const withoutCssTerminators = (value: string) => value.replace(/[;{}<>]/g, "");

export function themeCss(theme: FrameTheme): string {
  const declarations = Object.entries(theme.variables)
    .map(([name, value]) => `${name}:${withoutCssTerminators(value)};`)
    .join("");
  return `:root{color-scheme:${theme.appearance};${declarations}}`;
}

export const THEME_STYLE_ID = "pele-theme";
export const FRAME_PADDING = 12;

// No script-src, so nothing in the frame can run even if markup slipped through.
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; font-src 'self' data:";

const BASE_CSS =
  `html{background:var(--pele-bg);overflow:hidden}` +
  `body{margin:0;padding:${FRAME_PADDING}px}` +
  `svg{display:block;margin:0 auto}`;

export function frameDocument(input: {
  svg: string;
  theme: FrameTheme;
  fontCss: string;
}): string {
  const fonts = input.fontCss.replace(/<\/?style/gi, "");
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<style>${fonts}${BASE_CSS}</style>` +
    `<style id="${THEME_STYLE_ID}">${themeCss(input.theme)}</style>` +
    `</head><body>${input.svg}</body></html>`
  );
}

export function frameHeight(
  natural: { width: number; height: number },
  frameWidth: number,
): number {
  const available = frameWidth - 2 * FRAME_PADDING;
  const scale =
    available > 0 && natural.width > available ? available / natural.width : 1;
  return Math.ceil(natural.height * scale) + 2 * FRAME_PADDING;
}
