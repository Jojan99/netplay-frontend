import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * Pantallas de login que no deberían mostrarse a quien ya tiene sesión.
 *
 * Al escribir netplay.com.co la raíz llevaba siempre al formulario, aunque la
 * sesión siguiera vigente, y parecía que había que volver a entrar cada vez.
 * Con sesión, se sigue de largo; sin sesión o con el token vencido, se muestra
 * el login como siempre.
 */

/** El token existe y su vencimiento (exp) todavía no pasó. */
function tokenVigente(clave: string): boolean {
  // Durante el prerender no hay navegador ni sesión: se muestra el login.
  if (typeof localStorage === 'undefined') return false;

  let token: string | null = null;
  try { token = localStorage.getItem(clave); } catch { return false; }
  if (!token) return false;

  try {
    const cuerpo = token.split('.')[1] ?? '';
    const json = atob(cuerpo.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = Number(JSON.parse(json)?.exp ?? 0);

    // Se mira el vencimiento para no entrar en bucle: con un token vencido el
    // panel respondería 401, volvería al login y este guard lo mandaría de nuevo
    // adentro. Un minuto de margen por diferencias de reloj.
    return exp > Date.now() / 1000 + 60;
  } catch {
    return false;
  }
}

/** Login del panel: con sesión de operador, directo al panel. */
export const panelYaConectadoGuard: CanActivateFn = () =>
  tokenVigente('token') ? inject(Router).createUrlTree(['/dashboard/home']) : true;

/** Login del portal: con sesión de cliente, directo al portal. */
export const portalYaConectadoGuard: CanActivateFn = () =>
  tokenVigente('client_token') ? inject(Router).createUrlTree(['/portal/home']) : true;
