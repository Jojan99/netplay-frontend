import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * La consola de Netvula es del dueño de la plataforma.
 *
 * Esto sólo evita mostrar una pantalla que no va a cargar: la puerta de verdad
 * está en el servidor (middleware 'plataforma' + users.es_plataforma), que
 * responde 403 a cualquiera sin la marca, aunque sea administrador.
 */
export const plataformaGuard: CanActivateFn = () => {
  if (inject(AuthService).esPlataforma()) return true;

  return inject(Router).createUrlTree(['/dashboard/home']);
};
