import { HttpInterceptorFn } from '@angular/common/http';

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

  return next(req);
};
