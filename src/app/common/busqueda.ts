/**
 * La búsqueda de los cuadros de texto que filtran en el navegador: por palabras,
 * en cualquier orden, sin tildes ni mayúsculas.
 *
 * Antes cada pantalla buscaba el texto entero, tal cual: «gabriel giraldo» no
 * encontraba a «GABRIEL DE JESUS GIRALDO SUESCUN» porque las dos palabras no van
 * juntas, y «311 629 0588» no encontraba el celular «+573116290588». Es la misma
 * regla que usa el backend (App\Support\BusquedaPorPalabras), para que buscar se
 * sienta igual en toda la plataforma.
 *
 * Uso: `filas.filter(f => coincide(q, f.nombre, f.documento, f.telefono))`
 */

/** Sin tildes, en minúsculas y con un solo espacio entre palabras. */
export function normalizarBusqueda(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Con menos dígitos, «buscar por número» encontraría a medio mundo. */
const MINIMO_DE_DIGITOS = 5;

/**
 * ¿Lo que se escribió coincide con alguno de estos campos?
 *
 * Cada palabra tiene que aparecer en alguno de los campos, en cualquier orden.
 * Si lo escrito es un número (cédula, celular), se compara además solo por sus
 * dígitos: «311 629 0588» y «+57 311-629-0588» encuentran «+573116290588».
 * Sin nada escrito, todo coincide.
 */
export function coincide(busqueda: unknown, ...campos: unknown[]): boolean {
  const palabras = normalizarBusqueda(busqueda).split(' ').filter(Boolean);
  if (!palabras.length) return true;

  const pajar = normalizarBusqueda(campos.map(c => c ?? '').join(' '));
  if (palabras.every(p => pajar.includes(p))) return true;

  const escrito = String(busqueda ?? '').trim();
  const digitos = escrito.replace(/\D/g, '');
  if (digitos.length < MINIMO_DE_DIGITOS || !/^[\d\s+\-().]+$/.test(escrito)) return false;

  return campos.some(c => String(c ?? '').replace(/\D/g, '').includes(digitos));
}
