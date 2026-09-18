import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { ConsolaAuthService } from '../services/consola-auth.service';
import { esHostDeConsola } from '../common/host-consola';

/**
 * La consola sólo existe en su dirección.
 *
 * Si alguien llega a /consola desde el panel de una empresa, no se le muestra:
 * la API tampoco le respondería, porque esas rutas no están registradas para
 * ese Host.
 */
export const soloEnLaConsolaGuard: CanActivateFn = () => {
  if (typeof window === 'undefined') return false;

  return esHostDeConsola() ? true : inject(Router).createUrlTree(['/inicio']);
};

/** Y adentro de la consola hay que haber ingresado. */
export const consolaGuard: CanActivateFn = () => {
  if (typeof window === 'undefined') return false;
  if (!esHostDeConsola()) return inject(Router).createUrlTree(['/inicio']);

  return inject(ConsolaAuthService).estaDentro() ? true : inject(Router).createUrlTree(['/consola/ingresar']);
};

/**
 * Lo contrario: en admin.netvula.com no se entra al panel de empresas ni al
 * portal de clientes. La API ahí responde 404 a todo eso, así que mostrar sus
 * pantallas sólo serviría para confundir.
 */
export const fueraDeLaConsolaGuard: CanActivateFn = () => {
  if (typeof window === 'undefined') return true;

  return esHostDeConsola() ? inject(Router).createUrlTree(['/consola']) : true;
};
