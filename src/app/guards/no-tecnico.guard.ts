import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Pantallas que un técnico no debería alcanzar aunque tenga el módulo prendido, porque le da lo
 * mismo con la lista (por ejemplo, dar de alta una instalación: eso es de oficina, ver el módulo
 * de Instalaciones para técnicos). El módulo entero sigue con `roleGuard`; esto es un recorte
 * puntual adentro de un módulo que el técnico sí ve.
 */
export const noTecnicoGuard: CanActivateFn = () => {
  if (inject(AuthService).isTecnico()) return inject(Router).createUrlTree(['/dashboard/installations']);
  return true;
};
