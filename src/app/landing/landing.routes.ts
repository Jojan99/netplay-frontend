import { Routes } from '@angular/router';

export const LANDING_ROUTES: Routes = [
  {
    path: ':slug',
    loadComponent: () => import('./landing.component').then(m => m.LandingComponent),
  },
];
