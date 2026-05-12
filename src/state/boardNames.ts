import type { BoardMeta } from "../types";

export const UNTITLED_BOARD_NAME = "Untitled";

type BoardNameSource = Pick<BoardMeta, "name">;

export function resolveBoardName(
  boards: readonly BoardNameSource[],
  name?: string | null,
): string {
  const trimmed = name?.trim() ?? "";
  return trimmed || getNextUntitledBoardName(boards);
}

export function getNextUntitledBoardName(
  boards: readonly BoardNameSource[],
): string {
  const existingNames = new Set(
    boards.map((board) => board.name.trim().toLocaleLowerCase()),
  );

  let index = 1;
  while (existingNames.has(formatUntitledBoardName(index).toLocaleLowerCase())) {
    index += 1;
  }

  return formatUntitledBoardName(index);
}

function formatUntitledBoardName(index: number): string {
  return index === 1
    ? UNTITLED_BOARD_NAME
    : `${UNTITLED_BOARD_NAME} ${toRomanNumeral(index)}`;
}

function toRomanNumeral(value: number): string {
  const numerals: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = Math.max(1, Math.floor(value));
  let result = "";

  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }

  return result;
}
