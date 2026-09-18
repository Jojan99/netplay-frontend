/**
 * ¿Esta página se abrió en la dirección de la consola de Netvula?
 *
 * La consola vive en admin.netvula.com: otra dirección, otros usuarios y otro
 * token que el panel de las empresas. Se mira el primer tramo del host, así
 * sirve igual para admin.netvula.com que para cualquier otro dominio base.
 *
 * En el prerender no hay navegador y la respuesta es "no": lo que se genera
 * estático es el sitio público, nunca la consola.
 */
export const HOST_CONSOLA = 'admin';

export function esHostDeConsola(): boolean {
  if (typeof window === 'undefined' || !window.location?.hostname) return false;

  return window.location.hostname.toLowerCase().split('.')[0] === HOST_CONSOLA;
}
