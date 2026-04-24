import { Routes } from '@angular/router';

export const OLT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/olt-list/olt-list.component').then(m => m.OltListComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/olt-dashboard/olt-dashboard.component').then(m => m.OltDashboardComponent),
  },
  {
    path: 'autorizadas',
    loadComponent: () => import('./pages/olt-autorizadas/olt-autorizadas.component').then(m => m.OltAutorizadasComponent),
  },
  {
    path: 'sin-autorizar',
    loadComponent: () => import('./pages/olt-sin-autorizar/olt-sin-autorizar.component').then(m => m.OltSinAutorizarComponent),
  },
  {
    path: 'online',
    loadComponent: () => import('./pages/olt-online/olt-online.component').then(m => m.OltOnlineComponent),
  },
  {
    path: 'service-ports',
    loadComponent: () => import('./pages/olt-service-ports/olt-service-ports.component').then(m => m.OltServicePortsComponent),
  },
  {
    path: 'cli',
    loadComponent: () => import('./pages/olt-cli/olt-cli.component').then(m => m.OltCliComponent),
  },
  {
    path: 'perfiles',
    loadComponent: () => import('./pages/olt-perfiles/olt-perfiles.component').then(m => m.OltPerfilesComponent),
  },
  {
    path: 'config',
    loadComponent: () => import('./pages/olt-config/olt-config.component').then(m => m.OltConfigComponent),
  },
];
