// Colour reading and contrast for recolouring a page. Pure functions only, so the rules can be
// tested without a browser. Colours come from getComputedStyle, which reports rgb()/rgba() for most
// colours and oklch() for some; both are read here.

export type Color = { r: number; g: number; b: number; alpha: number }; // r, g, b in 0..255

type Oklch = { L: number; C: number; h: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

// Reads the numbers of a CSS colour function. A value with a percent sign is divided by 100.
function numbersOf(text: string): { value: number; percent: boolean }[] {
  return [...text.matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)%?/g)].map((match) => ({
    value: Number.parseFloat(match[0]),
    percent: match[0].endsWith("%"),
  }));
}

// Parses rgb(), rgba(), and oklch() colours, with or without the modern "/ alpha" syntax.
export function parseColor(css: string): Color | undefined {
  const text = css.trim().toLowerCase();
  if (text.startsWith("rgb")) {
    const parts = numbersOf(text);
    if (parts.length < 3) return undefined;
    const alpha = parts[3] ? (parts[3].percent ? parts[3].value / 100 : parts[3].value) : 1;
    return { r: parts[0]!.value, g: parts[1]!.value, b: parts[2]!.value, alpha };
  }
  if (text.startsWith("oklch")) {
    const parts = numbersOf(text);
    if (parts.length < 3) return undefined;
    const L = parts[0]!.percent ? parts[0]!.value / 100 : parts[0]!.value;
    const alpha = parts[3] ? (parts[3].percent ? parts[3].value / 100 : parts[3].value) : 1;
    return { ...oklchToColor({ L, C: parts[1]!.value, h: parts[2]!.value }), alpha };
  }
  return undefined;
}

export function toCss(color: Color): string {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  return color.alpha >= 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${color.alpha.toFixed(2)})`;
}

// WCAG relative luminance: 0 for black, 1 for white.
export function relativeLuminance(color: Color): number {
  const r = srgbToLinear(color.r / 255);
  const g = srgbToLinear(color.g / 255);
  const b = srgbToLinear(color.b / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio: 1 for no contrast, 21 for black on white.
export function contrastRatio(first: Color, second: Color): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  return (high + 0.05) / (low + 0.05);
}

// OKLab and OKLCH conversions, used to change lightness and chroma while keeping the hue.
function colorToOklch(color: Color): Oklch {
  const r = srgbToLinear(color.r / 255);
  const g = srgbToLinear(color.g / 255);
  const b = srgbToLinear(color.b / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180) / Math.PI };
}

function oklchToColor(value: Oklch): Color {
  const hue = (value.h * Math.PI) / 180;
  const a = value.C * Math.cos(hue);
  const b = value.C * Math.sin(hue);
  const l = (value.L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (value.L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (value.L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return {
    r: linearToSrgb(r) * 255,
    g: linearToSrgb(g) * 255,
    b: linearToSrgb(bl) * 255,
    alpha: 1,
  };
}

// The surface a dark page uses for a light panel, and the tint used for a light coloured panel.
const DARK_SURFACE = 0.215;
const DARK_TINT_LIGHTNESS = 0.3;

// The dark version of a light, opaque background. Neutral whites and greys become the dark surface;
// a light tint keeps its hue at a dark lightness. Dark backgrounds and strong colours (a
// highlighter, say) are left alone, so undefined means "keep the site's colour".
export function darkVariant(color: Color): Color | undefined {
  if (color.alpha < 1) return undefined;
  const { L, C, h } = colorToOklch(color);
  if (L < 0.8) return undefined;
  if (C > 0.12) return undefined;
  // Whites and greys have no chroma; a warm cream has a little, which keeps it a tint.
  if (C < 0.008) return oklchToColor({ L: DARK_SURFACE, C: 0, h: 0 });
  return oklchToColor({ L: DARK_TINT_LIGHTNESS, C: Math.min(C * 1.5, 0.06), h });
}

// A text colour that reads on the background. Text that already has enough contrast (3:1, the
// level for large text and the least WCAG asks of body text in a bold panel) keeps its colour;
// otherwise a light or dark colour is chosen, whichever contrasts more.
export function readableText(text: Color, background: Color): Color | undefined {
  if (contrastRatio(text, background) >= 3) return undefined;
  const light = oklchToColor({ L: 0.96, C: 0, h: 0 });
  const dark = oklchToColor({ L: 0.2, C: 0, h: 0 });
  return contrastRatio(light, background) >= contrastRatio(dark, background) ? light : dark;
}
