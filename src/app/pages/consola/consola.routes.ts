import { Routes } from '@angular/router';
import { consolaGuard, soloEnLaConsolaGuard } from '../../guards/consola.guard';

/**
 * La consola de Netvula: su propia aplicación dentro del mismo paquete.
 *
 * Cuelga de /consola y sólo existe en admin.netvula.com. No está debajo del
 * layout del panel de empresas y no comparte su sesión.
 */
export const CONSOLA_ROUTES: Routes = [
  {
    path: 'ingresar',
    canActivate: [soloEnLaConsolaGuard],
    loadComponent: () => import('./ingresar/consola-ingresar.component').then(m => m.ConsolaIngresarComponent),
  },
  {
    path: '',
    canActivate: [consolaGuard],
    loadComponent: () => import('./consola.component').then(m => m.ConsolaComponent),
    children: [
      { path: 'tablero',   loadComponent: () => import('./tablero/consola-tablero.component').then(m => m.ConsolaTableroComponent) },
      { path: 'empresas',  loadComponent: () => import('./empresas/consola-empresas.component').then(m => m.ConsolaEmpresasComponent) },
      { path: 'cobros',    loadComponent: () => import('./cobros/consola-cobros.component').then(m => m.ConsolaCobrosComponent) },
      { path: 'planes',    loadComponent: () => import('./planes/consola-planes.component').then(m => m.ConsolaPlanesComponent) },
      { path: 'cupones',   loadComponent: () => import('./cupones/consola-cupones.component').then(m => m.ConsolaCuponesComponent) },
      { path: 'referidos', loadComponent: () => import('./referidos/consola-referidos.component').then(m => m.ConsolaReferidosComponent) },
      { path: 'bitacora',  loadComponent: () => import('./bitacora/consola-bitacora.component').then(m => m.ConsolaBitacoraComponent) },
      { path: '', redirectTo: 'tablero', pathMatch: 'full' },
    ],
  },
];
