import { Routes } from '@angular/router';

/**
 * La consola de Netvula: la plataforma vista por su dueño.
 *
 * Cuelga de /dashboard/consola y cada pantalla es una pestaña. El guard sólo
 * evita mostrar algo que no va a cargar: el permiso real lo pone el servidor.
 */
export const CONSOLA_ROUTES: Routes = [
  {
    path: '',
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
