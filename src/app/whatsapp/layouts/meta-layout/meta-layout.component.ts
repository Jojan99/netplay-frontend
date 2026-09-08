import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-meta-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  host: { class: 'np-console' },
  template: `
    <div class="np-page np-wa-shell">
      <div class="np-toolbar np-wa-nav">
        <a routerLink="/dashboard/whatsapp" class="np-btn np-btn--ghost np-btn--sm" title="Volver a proveedores">‹ WhatsApp</a>
        <nav class="np-seg" aria-label="API de Meta">
          <a *ngFor="let l of links" [routerLink]="l.path" routerLinkActive="is-active">{{ l.label }}</a>
        </nav>
        <span class="np-spacer"></span>
        <span class="np-tag">API oficial de Meta</span>
      </div>
      <div class="np-wa-outlet"><router-outlet></router-outlet></div>
    </div>
  `,
  styles: [`
    .np-wa-nav { border-top: 0; padding-top: 0; }
    .np-seg { overflow-x: auto; scrollbar-width: none; }
    .np-seg::-webkit-scrollbar { display: none; }
    .np-seg a { display: inline-flex; align-items: center; height: 32px; padding: 0 11px; font-size: 12px; font-weight: 700; color: var(--text-2); border-right: 1px solid var(--line-strong); text-decoration: none; white-space: nowrap; }
    .np-seg a:last-child { border-right: 0; }
    .np-seg a:hover { background: var(--surface-3); }
    .np-seg a.is-active { background: var(--text); color: var(--bg); }
    .np-wa-outlet { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .np-wa-outlet > * { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  `],
})
export class MetaLayoutComponent {
  readonly links = [
    { path: 'dashboard', label: 'Resumen' }, { path: 'phone', label: 'Número' }, { path: 'templates', label: 'Plantillas' }, { path: 'comunicados', label: 'Comunicados' },
    { path: 'enviar', label: 'Enviar' }, { path: 'logs', label: 'Logs' }, { path: 'bot', label: 'Bot' }, { path: 'panel', label: 'Configuración' },
  ];
}
