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

  export interface Oklab {
    mode: "oklab";
    l: number;
    a: number;
    b: number;
    alpha?: number;
  }

  export function oklch(color: string | object): Oklch | undefined;
  export function okhsl(color: string | object): Okhsl | undefined;
  export function oklab(color: string | object): Oklab | undefined;
  export function rgb(color: string | object): Rgb;
  export function p3(color: string | object): Rgb;
  export function displayable(color: object): boolean;
  export function inGamut(mode: string): (color: object) => boolean;
  export function clampChroma(
    color: object,
    mode: string,
    rgbGamut?: string,
  ): object;
  export function differenceEuclidean(
    mode: string,
  ): (a: object, b: object) => number;
  export function interpolate(
    colors: unknown[],
    mode?: string,
  ): (t: number) => object;
}
