import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

const WA_API = 'http://181.48.150.43:3001';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // El WA API externo usa x-api-key, no JWT
  if (req.url.startsWith(WA_API)) return next(req);

  // Si la request ya trae Authorization (ej: portal cliente usa client_token),
  // no sobreescribir — cada servicio gestiona su propio token.
  if (req.headers.has('Authorization')) return next(req);

  const token = localStorage.getItem('token');

  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req).pipe(
    catchError((err) => {
      const status = err?.status;
      const router = inject(Router);

      // Token expirado o inválido → desloguear y mandar al login
      if (status === 401 || status === 403) {
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
