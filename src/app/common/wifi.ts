/**
 * La regla de la clave y del nombre del WiFi, escrita una sola vez.
 *
 * Tiene que decir exactamente lo mismo que el backend (App\Rules\ClaveWifi y
 * AprovisionamientoDeOnt::problemaDeLaClaveWifi). Aquí está para que el aviso
 * salga mientras el usuario escribe, no después de mandar el formulario y
 * esperar; el que manda sigue siendo el servidor.
 */

/** Los signos que la clave y el nombre pueden llevar. */
export const SIGNOS_WIFI = '-_.@#$%&*+=!?():,';

const patron = (conEspacio: boolean) =>
  new RegExp('^[A-Za-z0-9' + (conEspacio ? ' ' : '') + '\\-_.@#$%&*+=!?():,]+$');

function problemaDeLosCaracteres(texto: string, que: string, conEspacio: boolean): string | null {
  const re = patron(conEspacio);

  if (re.test(texto)) { return null; }

  const raros: string[] = [];

  for (const c of Array.from(texto)) {
    const nombre = c === ' ' ? 'espacios' : c;
    if (!re.test(c) && !raros.includes(nombre)) { raros.push(nombre); }
  }

  return `${que} no puede llevar ${raros.join(' ')}. Se admiten letras sin tilde ni eñe, `
    + `números y estos signos: ${SIGNOS_WIFI.split('').join(' ')}.`
    + (conEspacio ? ' Los espacios sí valen.' : '');
}

/**
 * Por qué una clave no va a entrar, o null si sirve.
 *
 * Sin espacios: hay marcas que pasan la clave por una línea de consola y ahí
 * el espacio la corta por la mitad.
 */
export function problemaDeLaClaveWifi(clave: string): string | null {
  if (clave.length < 8 || clave.length > 63) {
    return `La clave tiene que tener entre 8 y 63 caracteres; ésta tiene ${clave.length}.`;
  }

  return problemaDeLosCaracteres(clave, 'La clave', false);
}

/** Lo mismo para el nombre de la red. Una eñe en el SSID rompe igual. */
export function problemaDelNombreWifi(ssid: string): string | null {
  if (ssid.length < 1 || ssid.length > 32) {
    return 'El nombre de la red tiene que tener entre 1 y 32 caracteres.';
  }

  return problemaDeLosCaracteres(ssid, 'El nombre de la red', true);
}

/**
 * Saca de un texto lo que el equipo no admite.
 *
 * Se usa mientras escriben: la eñe no llega ni a aparecer en la casilla, así
 * nadie arma una clave entera para que después se la rechacen.
 */
export function limpiarTextoWifi(texto: string, conEspacio = false): string {
  const fuera = conEspacio
    ? /[^A-Za-z0-9 \-_.@#$%&*+=!?():,]/g
    : /[^A-Za-z0-9\-_.@#$%&*+=!?():,]/g;

  // Las tildes se convierten en su letra, que es lo que la gente quiso
  // escribir; la eñe se convierte en n. Lo demás se cae.
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(fuera, '');
}
