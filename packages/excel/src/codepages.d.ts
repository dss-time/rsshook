declare module 'xlsx/dist/cpexcel.full.mjs' {
  export const utils: {
    encode(codepage: number, value: string): Uint8Array;
    decode(codepage: number, value: Uint8Array): string;
  };
}
