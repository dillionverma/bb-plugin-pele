import { useSyncExternalStore } from "react";
import { frameTheme, frameThemesEqual, type FrameTheme } from "./frame";

let current: FrameTheme | null = null;
let stopWatching: (() => void) | null = null;
const listeners = new Set<() => void>();

function readTheme(): FrameTheme {
  const root = document.documentElement;
  const style = window.getComputedStyle(root);
  const next = frameTheme(
    root.classList.contains("dark") ? "dark" : "light",
    (token) => style.getPropertyValue(token),
  );
  if (current === null || !frameThemesEqual(current, next)) current = next;
  return current;
}

// bb switches mode with a class on <html> and palettes by swapping <head> styles.
function watch(): () => void {
  let frame = 0;
  const refresh = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      const before = current;
      if (readTheme() !== before) for (const listener of listeners) listener();
    });
  };
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  observer.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => {
    window.cancelAnimationFrame(frame);
    observer.disconnect();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  stopWatching ??= watch();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stopWatching?.();
    stopWatching = null;
    current = null;
  };
}

export function useFrameTheme(): FrameTheme {
  return useSyncExternalStore(subscribe, () => current ?? readTheme());
}

const unquoted = (family: string) => family.trim().replace(/^["']|["']$/g, "");

function collectFontFaces(rules: CSSRuleList, found: CSSFontFaceRule[]): void {
  for (const rule of rules) {
    if (rule instanceof CSSFontFaceRule) found.push(rule);
    else if (rule instanceof CSSGroupingRule) collectFontFaces(rule.cssRules, found);
  }
}

const fontCssByFamily = new Map<string, string>();

// The frame cannot see bb's stylesheets, so copy the @font-face rules for
// bb's sans family with absolute URLs. The frame shares bb's origin, so
// they load from the same cache.
export function appFontCss(fontFamily: string | undefined): string {
  const family = unquoted(fontFamily?.split(",")[0] ?? "");
  if (family.length === 0) return "";
  const cached = fontCssByFamily.get(family);
  if (cached !== undefined) return cached;
  const faces: CSSFontFaceRule[] = [];
  for (const sheet of document.styleSheets) {
    try {
      collectFontFaces(sheet.cssRules, faces);
    } catch {
      continue;
    }
  }
  const css = faces
    .filter((face) => unquoted(face.style.getPropertyValue("font-family")) === family)
    .map((face) => {
      const base = face.parentStyleSheet?.href ?? document.baseURI;
      return face.cssText.replace(
        /url\(\s*(["']?)([^"')]+)\1\s*\)/g,
        (match, _quote: string, url: string) => {
          try {
            return `url("${new URL(url, base).href}")`;
          } catch {
            return match;
          }
        },
      );
    })
    .join("");
  if (css.length > 0) fontCssByFamily.set(family, css);
  return css;
}
