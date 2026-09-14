import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  const token = localStorage.getItem('token');
  if (!token) return inject(Router).createUrlTree(['/login']);

  // El panel es para operadores: una sesión de cliente (perfil USER) no entra.
  // El servidor también lo rechaza; esto evita mostrarle el panel vacío.
  let perfil = '';
  try { perfil = String(JSON.parse(localStorage.getItem('auth_user') || '{}')?.profile_name ?? '').toUpperCase(); } catch {}

  if (perfil === 'USER') {
    for (const clave of ['token', 'auth_user', 'allowed_modules', 'employee_id', 'user_role']) {
      localStorage.removeItem(clave);
    }
    return inject(Router).createUrlTree(['/portal/login']);
  }

  return true;
};
