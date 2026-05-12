import { describe, expect, it } from "vitest";
import { getNextUntitledBoardName, resolveBoardName } from "../boardNames";

describe("board naming", () => {
  it("uses Untitled for the first unnamed board", () => {
    expect(getNextUntitledBoardName([])).toBe("Untitled");
  });

  it("assigns roman numeral suffixes for later unnamed boards", () => {
    expect(
      getNextUntitledBoardName([
        { name: "Untitled" },
        { name: "Untitled II" },
        { name: "Untitled III" },
      ]),
    ).toBe("Untitled IV");
  });

  it("fills the first available untitled gap", () => {
    expect(
      getNextUntitledBoardName([
        { name: "Untitled" },
        { name: "Untitled III" },
      ]),
    ).toBe("Untitled II");
  });

  it("preserves explicit names but defaults blank names", () => {
    expect(resolveBoardName([], "  Moodboard  ")).toBe("Moodboard");
    expect(resolveBoardName([{ name: "Untitled" }], "   ")).toBe("Untitled II");
  });
});
