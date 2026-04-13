declare module "culori" {
  export interface Oklch {
    mode: "oklch";
    l: number;
    c?: number;
    h?: number;
    alpha?: number;
  }

  export interface Rgb {
    mode: "rgb";
    r: number;
    g: number;
    b: number;
    alpha?: number;
  }

  export interface Okhsl {
    mode: "okhsl";
    h: number;
    s: number;
    l: number;
    alpha?: number;
  }

  export function oklch(color: string | object): Oklch | undefined;
  export function okhsl(color: string | object): Okhsl | undefined;
  export function rgb(color: string | object): Rgb;
  export function displayable(color: object): boolean;
  export function clampChroma(color: object, mode: string): object;
  export function differenceEuclidean(
    mode: string,
  ): (a: object, b: object) => number;
}
