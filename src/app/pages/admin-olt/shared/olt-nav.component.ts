import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

/** Navegación común del módulo OLT: misma barra en todas sus pantallas. */
@Component({
  selector: 'app-olt-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="np-seg np-olt-nav" aria-label="Secciones OLT">
      <a *ngFor="let l of links" [routerLink]="l.path" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: l.exact }">{{ l.label }}</a>
    </nav>
  `,
  styles: [`
    .np-olt-nav { overflow-x: auto; scrollbar-width: none; }
    .np-olt-nav::-webkit-scrollbar { display: none; }
    .np-olt-nav a { display: inline-flex; align-items: center; height: 32px; padding: 0 11px; font-size: 12px; font-weight: 700; color: var(--text-2); border-right: 1px solid var(--line-strong); text-decoration: none; white-space: nowrap; }
    .np-olt-nav a:last-child { border-right: 0; }
    .np-olt-nav a:hover { background: var(--surface-3); }
    .np-olt-nav a.is-active { background: var(--text); color: var(--bg); }
  `],
})
export class OltNavComponent {
  readonly links = [
    { path: '/dashboard/olt',               label: 'OLTs',          exact: true },
    { path: '/dashboard/olt/dashboard',     label: 'Estado',        exact: false },
    { path: '/dashboard/olt/autorizadas',   label: 'Autorizadas',   exact: false },
    { path: '/dashboard/olt/sin-autorizar', label: 'Sin autorizar', exact: false },
    { path: '/dashboard/olt/online',        label: 'En línea',      exact: false },
    { path: '/dashboard/olt/service-ports', label: 'Service ports', exact: false },
    { path: '/dashboard/olt/perfiles',      label: 'Perfiles',      exact: false },
    { path: '/dashboard/olt/config',        label: 'Configuración', exact: false },
    { path: '/dashboard/olt/cli',           label: 'CLI',           exact: false },
  ];
}
