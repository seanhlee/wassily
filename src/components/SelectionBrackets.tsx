// ---- Selection chrome ----
//
// Corner brackets replace the old CSS outline on selected objects.
// All geometry on a 4px / 2px grid for visual consistency.

const SEL = {
  gap: 4,          // bracket corner offset from object edge
  arm: 8,          // bracket arm length
  stroke: 0.75,    // bracket stroke weight
};

/** Four corner brackets framing a selected object. */
export function SelectionBrackets({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  color: string;
}) {
  const { gap: g, arm: a, stroke } = SEL;
  const l = -g;
  const r = width + g;
  const t = -g;
  const b = height + g;
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <path
        d={[
          `M${l + a},${t} L${l},${t} L${l},${t + a}`,
          `M${r - a},${t} L${r},${t} L${r},${t + a}`,
          `M${l},${b - a} L${l},${b} L${l + a},${b}`,
          `M${r},${b - a} L${r},${b} L${r - a},${b}`,
        ].join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
      />
    </svg>
  );
}

/** Small padlock icon at lower-right of its parent. Color adapts to swatch. */
export function LockIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 9 10"
      width={9}
      height={10}
      style={{
        position: "absolute",
        bottom: 6,
        right: 6,
        pointerEvents: "none",
      }}
    >
      <path
        d="M2.5,4 L2.5,2.5 Q2.5,0.5 4.5,0.5 Q6.5,0.5 6.5,2.5 L6.5,4"
        fill="none"
        stroke={color}
        strokeWidth={1}
      />
      <rect x={1} y={4} width={7} height={6} fill={color} />
    </svg>
  );
}
