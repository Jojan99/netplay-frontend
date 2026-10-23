import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-netplay-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  host: { class: 'np-console' },
  template: `
    <div class="np-page np-wa-shell">
      <div class="np-toolbar np-wa-nav">
        <a routerLink="/dashboard/whatsapp" class="np-btn np-btn--ghost np-btn--sm" title="Volver a proveedores">‹ WhatsApp</a>
        <nav class="np-seg" aria-label="WhatsApp Web">
          <a *ngFor="let l of links" [routerLink]="l.path" routerLinkActive="is-active">{{ l.label }}</a>
        </nav>
        <span class="np-spacer"></span>
        <span class="np-tag">WhatsApp Web · QR</span>
      </div>
      <div class="np-wa-outlet"><router-outlet></router-outlet></div>
    </div>
  `,
  styles: [`
    .np-wa-nav { border-top: 0; padding-top: 0; }
    /* Pestañas subrayadas, como el resto del panel (21-10-2026). */
    .np-seg { display: flex; gap: 20px; height: auto; padding: 0; background: none; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; overflow-x: auto; scrollbar-width: none; }
    .np-seg a { display: inline-flex; align-items: center; padding: 0 0 10px; margin-bottom: -1px; font-size: 13px; font-weight: 400; color: var(--text-2); border-bottom: 2px solid transparent; text-decoration: none; white-space: nowrap; }
    .np-seg a:hover { color: var(--text); }
    .np-seg a.is-active { color: var(--text); font-weight: 500; border-bottom-color: var(--text); }
    .np-wa-outlet { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    /* Angular deja el <router-outlet> en el DOM y cuelga el componente a su
       lado, como hermano. Con el selector de hijos el outlet —que está vacío—
       también recibía
       flex:1 y se quedaba con la mitad del alto: eso era la media pantalla en
       blanco arriba de cada pestaña. */
    .np-wa-outlet > router-outlet { display: none; }
    .np-wa-outlet > *:not(router-outlet) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  `],
})
export class NetplayLayoutComponent {
  readonly links = [
    { path: 'panel', label: 'Configuración' }, { path: 'instancias', label: 'Instancias' }, { path: 'avisos', label: 'Avisos' }, { path: 'enviar', label: 'Enviar' },
    { path: 'programados', label: 'Programados' }, { path: 'logs', label: 'Logs' }, { path: 'webhook', label: 'Webhook' },
  ];
}
