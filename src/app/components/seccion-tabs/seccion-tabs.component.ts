import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * Pestañas de un grupo del menú (21-10-2026), como las de «Cobros y pagos»: las mismas
 * entradas, con el mismo nombre y orden que el grupo en common/components.ts. Sólo aparecen
 * las que el usuario puede abrir. El chat de WhatsApp no las lleva: conserva su diseño.
 */
@Component({
  selector: 'app-seccion-tabs',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="st" [attr.aria-label]="'Secciones de ' + grupo">
      <a *ngFor="let t of tabs" [routerLink]="t.ruta" routerLinkActive="is-on" [routerLinkActiveOptions]="{ exact: true }"
         #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null">{{ t.titulo }}</a>
    </nav>
  `,
  styles: [`
    :host { display: block; }
    .st { display: flex; gap: 22px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line); margin: 0 0 16px; font-family: 'Geist', var(--font-body); }
    .st::-webkit-scrollbar { display: none; }
    a { display: inline-flex; align-items: center; gap: 6px; padding: 2px 0 11px; margin-bottom: -1px; border-bottom: 2px solid transparent; font-size: 13.5px; color: var(--text-2); text-decoration: none; white-space: nowrap; }
    a:hover { color: var(--text); }
    a.is-on { color: var(--text); font-weight: 500; border-bottom-color: var(--text); }
  `],
})
export class SeccionTabsComponent implements OnInit {
  @Input() grupo: 'atencion' | 'instalaciones' | 'bodega' = 'atencion';
  private auth = inject(AuthService);

  private readonly GRUPOS: Record<string, Array<{ titulo: string; ruta: string; modulo: string }>> = {
    atencion: [
      { titulo: 'Chats de WhatsApp', ruta: '/dashboard/crm/inbox', modulo: 'crm' },
      { titulo: 'Tickets', ruta: '/dashboard/view-ticket', modulo: 'view-ticket' },
      { titulo: 'Asistente de soporte', ruta: '/dashboard/soporte-asistente', modulo: 'crm' },
    ],
    instalaciones: [
      { titulo: 'Mi día', ruta: '/dashboard/mi-dia', modulo: 'installations' },
      { titulo: 'Órdenes de instalación', ruta: '/dashboard/installations', modulo: 'installations' },
      { titulo: 'Técnicos en el mapa', ruta: '/dashboard/technician-map', modulo: 'technician-map' },
    ],
    // La bodega es su propio grupo del menú (22-10-2026): ya no cuelga de Instalaciones.
    bodega: [
      { titulo: 'Existencias y técnicos', ruta: '/dashboard/inventory', modulo: 'inventory' },
      { titulo: 'Tipos de equipo', ruta: '/dashboard/inventory/categories', modulo: 'inventory' },
    ],
  };

  tabs: Array<{ titulo: string; ruta: string; modulo: string }> = [];

  ngOnInit(): void {
    const todas = this.GRUPOS[this.grupo] ?? [];
    const permitidos: string[] = this.auth.getAllowedModules?.() ?? [];
    this.tabs = permitidos.length ? todas.filter(t => permitidos.includes(t.modulo)) : todas;
  }
}
