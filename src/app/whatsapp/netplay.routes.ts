import { Routes } from '@angular/router';

export const NETPLAY_ROUTES: Routes = [
  { path: '', redirectTo: 'panel', pathMatch: 'full' },
  { path: 'panel', loadComponent: () => import('./pages/wa-panel/wa-panel.component').then(m => m.WaPanelComponent) },
  { path: 'instancias', loadComponent: () => import('./pages/wa-instancias/wa-instancias.component').then(m => m.WaInstanciasComponent) },
  { path: 'enviar', loadComponent: () => import('./pages/wa-enviar/wa-enviar.component').then(m => m.WaEnviarComponent) },
  { path: 'logs', loadComponent: () => import('./pages/wa-logs/wa-logs.component').then(m => m.WaLogsComponent) },
  { path: 'webhook', loadComponent: () => import('./pages/wa-webhook/wa-webhook.component').then(m => m.WaWebhookComponent) },
  { path: 'programados', loadComponent: () => import('./pages/wa-programados/wa-programados.component').then(m => m.WaProgramadosComponent) },
];
