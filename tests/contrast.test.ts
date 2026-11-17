import { describe, expect, test } from "bun:test";
import {
  contrastRatio,
  darkVariant,
  parseColor,
  readableText,
  relativeLuminance,
  toCss,
  type Color,
} from "../src/lib/contrast";

const WHITE: Color = { r: 255, g: 255, b: 255, alpha: 1 };
const BLACK: Color = { r: 0, g: 0, b: 0, alpha: 1 };
const DARK_PANEL = parseColor("rgb(25, 25, 25)")!;

describe("parseColor", () => {
  test("reads rgb and rgba, with or without the modern alpha syntax", () => {
    expect(parseColor("rgb(255, 249, 235)")).toEqual({ r: 255, g: 249, b: 235, alpha: 1 });
    expect(parseColor("rgba(0, 0, 0, 0.6)")).toEqual({ r: 0, g: 0, b: 0, alpha: 0.6 });
    expect(parseColor("rgb(10 20 30 / 50%)")).toEqual({ r: 10, g: 20, b: 30, alpha: 0.5 });
  });

  test("reads oklch, in both the number and the percent forms", () => {
    const grey = parseColor("oklch(0.215 0 0)")!;
    expect(grey.r).toBeGreaterThan(20);
    expect(grey.r).toBeLessThan(30);
    expect(grey.r).toBeCloseTo(grey.g, 0);
    expect(parseColor("oklch(21.5% 0 0)")).toEqual(grey);
  });

  test("returns undefined for a value it does not read", () => {
    expect(parseColor("")).toBeUndefined();
    expect(parseColor("red")).toBeUndefined();
    expect(parseColor("rgb(1, 2)")).toBeUndefined();
  });
});

describe("contrastRatio", () => {
  test("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 1);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  test("is low for the site's pale grey text on the dark surface, and high for its light text", () => {
    const paleGrey = parseColor("rgb(85, 85, 85)")!;
    expect(contrastRatio(paleGrey, DARK_PANEL)).toBeLessThan(3);
    expect(relativeLuminance(WHITE)).toBeGreaterThan(relativeLuminance(BLACK));
  });
});

describe("darkVariant", () => {
  test("turns a white panel into the dark surface", () => {
    const dark = darkVariant(WHITE)!;
    expect(dark).toBeDefined();
    expect(relativeLuminance(dark)).toBeLessThan(0.03);
  });

  test("turns the cream note box into a dark tint, not a light panel", () => {
    const cream = parseColor("rgb(255, 249, 235)")!;
    const dark = darkVariant(cream)!;
    expect(dark).toBeDefined();
    expect(relativeLuminance(dark)).toBeLessThan(0.05);
    // The tint keeps its warm hue: red and green stay above blue.
    expect(dark.r).toBeGreaterThan(dark.b);
  });

  test("leaves dark backgrounds, transparent layers, and strong colours alone", () => {
    expect(darkVariant(BLACK)).toBeUndefined();
    expect(darkVariant({ r: 255, g: 255, b: 255, alpha: 0.6 })).toBeUndefined();
    expect(darkVariant(parseColor("rgb(255, 255, 0)")!)).toBeUndefined();
  });
});

describe("readableText", () => {
  test("keeps text that already reads on its background", () => {
    expect(readableText(parseColor("rgb(34, 34, 34)")!, WHITE)).toBeUndefined();
  });

  test("lightens dark text on a dark panel", () => {
    const text = readableText(parseColor("rgb(34, 34, 34)")!, DARK_PANEL);
    expect(text).toBeDefined();
    expect(relativeLuminance(text!)).toBeGreaterThan(0.5);
  });

  test("lightens the site's pale grey tag text on the dark surface", () => {
    const text = readableText(parseColor("rgb(85, 85, 85)")!, DARK_PANEL);
    expect(text).toBeDefined();
    expect(contrastRatio(text!, DARK_PANEL)).toBeGreaterThanOrEqual(3);
  });

  test("darkens light text on a light panel that was not darkened", () => {
    const text = readableText(
      { r: 240, g: 240, b: 240, alpha: 1 },
      parseColor("rgb(245, 245, 245)")!,
    );
    expect(text).toBeDefined();
    expect(relativeLuminance(text!)).toBeLessThan(0.1);
  });

  test("writes colours in a form the stylesheet accepts", () => {
    expect(toCss({ r: 10.4, g: 20.6, b: 30, alpha: 1 })).toBe("rgb(10, 21, 30)");
    expect(toCss({ r: 0, g: 0, b: 0, alpha: 0.5 })).toBe("rgba(0, 0, 0, 0.50)");
  });
});
