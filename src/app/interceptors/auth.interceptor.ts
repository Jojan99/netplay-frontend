import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

const WA_API = 'http://181.48.150.43:3001';

/** La consola de Netvula tiene su propia sesión y su propio ingreso. */
const CONSOLA = '/api/consola/';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Se resuelve aquí, dentro del contexto de inyección: los callbacks de
  // catchError corren después y ahí ya no se puede pedir.
  const router = inject(Router);

  // El WA API externo usa x-api-key, no JWT
  if (req.url.startsWith(WA_API)) return next(req);

  // La consola maneja su token aparte: aquí no se le pone el del panel, y su
  // 401 lo resuelve ella misma (mandar a /login sería mandarla al panel).
  if (req.url.includes(CONSOLA)) {
    return next(req).pipe(
      catchError(err => {
        if (err?.status === 401) {
          try {
            localStorage.removeItem('consola_token');
            localStorage.removeItem('consola_usuario');
          } catch { /* sin almacenamiento */ }
          router.navigate(['/consola/ingresar']);
        }

        return throwError(() => err);
      }),
    );
  }

  // Si la request ya trae Authorization (ej: portal cliente usa client_token),
  // no sobreescribir — cada servicio gestiona su propio token.
  if (req.headers.has('Authorization')) return next(req);

  // En el prerender no hay navegador: leer localStorage ahí tira una
  // excepción por cada petición que sale durante el armado del sitio.
  const token = typeof localStorage === 'undefined' ? null : localStorage.getItem('token');

  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req).pipe(
    catchError((err) => {
      const status = err?.status;

      // Sólo un 401 (token vencido o inválido) cierra la sesión. Un 403 es
      // "no tiene permiso para esto": antes también sacaba al usuario del
      // panel aunque su sesión siguiera vigente.
      if (status === 401 && typeof localStorage !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('allowed_modules');
        localStorage.removeItem('employee_id');
        localStorage.removeItem('user_role');
        router.navigate(['/login']);
      }

      return throwError(() => err);
    })
  );
};
