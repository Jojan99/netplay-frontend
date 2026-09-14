import { ErrorHandler } from '@angular/core';
import { ReporteDeErrores } from './services/reporte-de-errores';
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { waInterceptor }   from './interceptors/wa.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, waInterceptor])),
    provideAnimations(),
    provideAnimationsAsync(),
    // Los errores del navegador llegan al servidor (storage/logs/errores-navegador.log).
    { provide: ErrorHandler, useClass: ReporteDeErrores },
  ],
};
