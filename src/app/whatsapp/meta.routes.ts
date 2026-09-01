import { Routes } from '@angular/router';
import { MetaLayoutComponent } from './layouts/meta-layout/meta-layout.component';

export const META_ROUTES: Routes = [
  {
    path: '',
    component: MetaLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./pages/meta/wa-meta-dashboard/wa-meta-dashboard.component').then(m => m.WaMetaDashboardComponent) },
      { path: 'phone', loadComponent: () => import('./pages/meta/wa-meta-phone/wa-meta-phone.component').then(m => m.WaMetaPhoneComponent) },
      { path: 'templates', loadComponent: () => import('./pages/meta/wa-meta-templates/wa-meta-templates.component').then(m => m.WaMetaTemplatesComponent) },
      { path: 'enviar', loadComponent: () => import('./pages/meta/wa-meta-enviar/wa-meta-enviar.component').then(m => m.WaMetaEnviarComponent) },
      { path: 'logs', loadComponent: () => import('./pages/meta/wa-meta-logs/wa-meta-logs.component').then(m => m.WaMetaLogsComponent) },
      { path: 'panel', loadComponent: () => import('./pages/meta/wa-meta-panel/wa-meta-panel.component').then(m => m.WaMetaPanelComponent) },
      { path: 'bot', loadComponent: () => import('./pages/meta/wa-meta-bot/wa-meta-bot.component').then(m => m.WaMetaBotComponent) },
    ]
  }
];
