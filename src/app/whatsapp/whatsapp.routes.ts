import { Routes } from '@angular/router';

export const WHATSAPP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/wa-landing/wa-landing.component')
        .then(m => m.WaLandingComponent)
  },
  {
    path: 'netplay',
    loadChildren: () => import('./netplay.routes').then(m => m.NETPLAY_ROUTES)
  },
  {
    path: 'meta',
    loadChildren: () => import('./meta.routes').then(m => m.META_ROUTES)
  },
];
