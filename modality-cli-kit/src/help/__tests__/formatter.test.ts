import { describe, test, expect } from "bun:test";
import {
  visibleWidth,
  padVisible,
  padName,
  flagPad,
  wrapText,
  Lines,
  DEFAULT_COL_NAME_WIDTH,
} from "../formatter";

describe("visibleWidth", () => {
  test("strips ANSI codes", () => {
    expect(visibleWidth("\x1b[36mhello\x1b[0m")).toBe(5);
    expect(visibleWidth("\x1b[1m\x1b[32mdone\x1b[0m")).toBe(4);
  });

  test("plain string returns its length", () => {
    expect(visibleWidth("hello")).toBe(5);
    expect(visibleWidth("")).toBe(0);
  });
});

describe("padVisible", () => {
  test("pads short string to width", () => {
    expect(padVisible("hi", 5)).toBe("hi   ");
  });

  test("does not truncate long strings", () => {
    expect(padVisible("hello world", 5)).toBe("hello world");
  });

  test("accounts for ANSI codes length", () => {
    const colored = "\x1b[36mhi\x1b[0m"; // visible: 2
    const padded = padVisible(colored, 5);
    expect(visibleWidth(padded)).toBe(5);
  });
});

describe("padName", () => {
  test("pads short name to default width", () => {
    const result = padName("open", DEFAULT_COL_NAME_WIDTH);
    expect(result.length).toBe(16);
    expect(result).toBe("open            ");
  });

  test("pads to custom width", () => {
    expect(padName("x", 4)).toBe("x   ");
  });

  test("handles already-long names", () => {
    const long = "very-long-command-name";
    expect(padName(long, 10)).toBe(long);
  });
});

describe("flagPad", () => {
  test("compact mode uses narrower target", () => {
    const c = flagPad(10, true);
    expect(c.length).toBe(12); // 22 - 10 = 12
  });

  test("detailed mode uses wider target", () => {
    const c = flagPad(10, false);
    expect(c.length).toBe(14); // 24 - 10 = 14
  });

  test("minimum 2 spaces", () => {
    const c = flagPad(30, true); // 30 > 22
    expect(c.length).toBe(2);
  });
});

describe("wrapText", () => {
  test("does not wrap short text", () => {
    expect(wrapText("hello", 80)).toBe("hello");
  });

  test("wraps long text at word boundary", () => {
    const text = "a b c d e f g h i j";
    const wrapped = wrapText(text, 10);
    for (const line of wrapped.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(12); // slop for spaces
    }
  });

  test("preserves existing newlines", () => {
    expect(wrapText("hello\nworld", 80)).toBe("hello\nworld");
  });

  test("applies indent to continuation lines", () => {
    const text = "a b c d e f g h i j k l m n o p";
    const wrapped = wrapText(text, 8, 4);
    const lines = wrapped.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]!.startsWith("    ")).toBe(true);
    }
  });
});

describe("Lines", () => {
  test("builds lines and joins with newlines", () => {
    const l = new Lines();
    l.push("a").push("b").push("c");
    expect(l.toString()).toBe("a\nb\nc");
  });

  test("flush returns content and resets", () => {
    const l = new Lines();
    l.push("hello").push("world");
    expect(l.flush()).toBe("hello\nworld");
    expect(l.flush()).toBe("");
  });

  test("push with empty string adds empty line", () => {
    const l = new Lines();
    l.push("a").push().push("b");
    expect(l.toString()).toBe("a\n\nb");
  });

  test("concat appends multiple lines", () => {
    const l = new Lines();
    l.push("a");
    l.concat(["b", "c", "d"]);
    expect(l.toString()).toBe("a\nb\nc\nd");
  });
});
