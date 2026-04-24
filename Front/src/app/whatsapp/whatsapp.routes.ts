import { Routes } from '@angular/router';

export const WHATSAPP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/wa-dashboard/wa-dashboard.component')
        .then(m => m.WaDashboardComponent)
  },
  {
    path: 'instancias',
    loadComponent: () =>
      import('./pages/wa-instancias/wa-instancias.component')
        .then(m => m.WaInstanciasComponent)
  },
  {
    path: 'enviar',
    loadComponent: () =>
      import('./pages/wa-enviar/wa-enviar.component')
        .then(m => m.WaEnviarComponent)
  },
  {
    path: 'logs',
    loadComponent: () =>
      import('./pages/wa-logs/wa-logs.component')
        .then(m => m.WaLogsComponent)
  },
  {
    path: 'programados',
    loadComponent: () =>
      import('./pages/wa-programados/wa-programados.component')
        .then(m => m.WaProgramadosComponent)
  },
  {
    path: 'webhook',
    loadComponent: () =>
      import('./pages/wa-webhook/wa-webhook.component')
        .then(m => m.WaWebhookComponent)
  },
  {
    path: 'panel',
    loadComponent: () =>
      import('./pages/wa-panel/wa-panel.component')
        .then(m => m.WaPanelComponent)
  },
  {
    path: 'notificaciones',
    loadComponent: () =>
      import('./pages/wa-notifications/wa-notifications.component')
        .then(m => m.WaNotificationsComponent)
  }
];