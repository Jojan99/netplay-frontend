/**
 * La entrada de navegador de `qrcode` no trae tipos propios.
 *
 * Se apunta a ella y no a «qrcode» a secas porque eso resuelve a la versión de
 * Node, que arrastra pngjs y dibuja por otro camino. Acá sólo se usa
 * toDataURL, así que alcanza con declararla.
 */
declare module 'qrcode/lib/browser' {
  export function toDataURL(texto: string, opciones?: Record<string, unknown>): Promise<string>;
}
