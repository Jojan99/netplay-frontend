import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { SitioService } from '../services/sitio.service';

/**
 * La raíz: en netvula.com es la página pública de la plataforma; en el
 * subdominio de una empresa no tiene sentido, se va directo a su login.
 *
 * En el prerender no se dibuja nada: el HTML de la raíz es el index.html que
 * nginx entrega para cualquier ruta, y al recargar el panel se veía un
 * instante la página pública antes de arrancar la aplicación.
 */
export const raizDelSitioGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return false;

  const router = inject(Router);

  return inject(SitioService).cargar().pipe(
    map(s => s.tipo === 'plataforma' ? true : router.createUrlTree(['/inicio'])),
  );
};

/**
 * El registro de empresas es de la raíz: desde netplay.netvula.com se crearía
 * una empresa nueva con la marca de otra en pantalla.
 */
export const soloEnLaRaizGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const sitio = inject(SitioService);

  return sitio.cargar().pipe(
    map(s => {
      if (s.tipo === 'plataforma') return true;
      const raiz = sitio.raiz(s);
      if (raiz) window.location.href = raiz + '/register';
      return false;
    }),
  );
};
