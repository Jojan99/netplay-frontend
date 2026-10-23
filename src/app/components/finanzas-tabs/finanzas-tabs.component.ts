import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PaymentProofService } from '../../services/payment-proof.service';

/**
 * Las pestañas de «Cobros y pagos» (21-10-2026): las mismas entradas, con los mismos nombres y
 * en el mismo orden que la parte de arriba de ese grupo en el menú (common/components.ts). Si se
 * agrega o renombra una, se cambia en los dos lados. Sólo aparecen las que el usuario puede abrir.
 */
@Component({
  selector: 'app-finanzas-tabs',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="ft" aria-label="Secciones de finanzas">
      <a *ngFor="let t of tabs" [routerLink]="t.ruta" routerLinkActive="is-on" [routerLinkActiveOptions]="{ exact: true }"
         #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null">
        {{ t.titulo }}<span class="ft-n" *ngIf="t.clave === 'pagos' && porRevisar" [title]="porRevisar + ' comprobantes por revisar'">{{ porRevisar }}</span>
      </a>
    </nav>
  `,
  styles: [`
    :host { display: block; }
    .ft { display: flex; gap: 22px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line); margin: 0 0 16px; font-family: 'Geist', var(--font-body); }
    .ft::-webkit-scrollbar { display: none; }
    a { display: inline-flex; align-items: center; gap: 6px; padding: 2px 0 11px; margin-bottom: -1px; border-bottom: 2px solid transparent; font-size: 13.5px; color: var(--text-2); text-decoration: none; white-space: nowrap; }
    a:hover { color: var(--text); }
    a.is-on { color: var(--text); font-weight: 500; border-bottom-color: var(--text); }
    .ft-n { height: 18px; padding: 0 6px; border-radius: 9px; display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 600;
      background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--warn); font-variant-numeric: tabular-nums; }
  `],
})
export class FinanzasTabsComponent implements OnInit {
  private auth = inject(AuthService);
  private comprobantes = inject(PaymentProofService);

  private static porRevisarCache: { n: number; en: number } | null = null;
  porRevisar = FinanzasTabsComponent.porRevisarCache?.n ?? 0;

  private readonly TODAS = [
    { clave: 'cartera', titulo: 'Cartera', ruta: '/dashboard/finanzas', modulo: 'finanzas' },
    { clave: 'pagos', titulo: 'Pagos y caja', ruta: '/dashboard/pagos', modulo: 'finanzas' },
    { clave: 'compromisos', titulo: 'Compromisos', ruta: '/dashboard/compromisos', modulo: 'finanzas' },
    { clave: 'cobranza', titulo: 'Cobranza', ruta: '/dashboard/cobranza', modulo: 'finanzas' },
    { clave: 'conciliacion', titulo: 'Conciliación', ruta: '/dashboard/conciliacion-pagos', modulo: 'finanzas' },
    { clave: 'egresos', titulo: 'Gastos', ruta: '/dashboard/egresos', modulo: 'egresos' },
  ];

  tabs = this.TODAS;

  ngOnInit(): void {
    const permitidos: string[] = this.auth.getAllowedModules?.() ?? [];
    if (permitidos.length) this.tabs = this.TODAS.filter(t => permitidos.includes(t.modulo));

    // Cuántos comprobantes esperan: una consulta por minuto, no una por pestaña.
    const c = FinanzasTabsComponent.porRevisarCache;
    if (c && Date.now() - c.en < 60_000) return;
    this.comprobantes.list({ status: 'pending', per_page: 1 }).subscribe({
      next: (r: any) => {
        this.porRevisar = Number(r?.data?.total ?? 0);
        FinanzasTabsComponent.porRevisarCache = { n: this.porRevisar, en: Date.now() };
      },
      error: () => {},
    });
  }
}
