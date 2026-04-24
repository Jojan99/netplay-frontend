import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Interceptor heredado — ya no necesario.
 * Las llamadas al WA service van por el proxy Laravel (HTTPS) y no necesitan
 * keys en localStorage. Se mantiene vacío para no romper la configuración de app.config.ts.
 */
export const waInterceptor: HttpInterceptorFn = (req, next) => next(req);
