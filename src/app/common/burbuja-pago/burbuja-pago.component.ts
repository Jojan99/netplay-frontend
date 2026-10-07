import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { PaymentProofService } from '../../services/payment-proof.service';
import { PagosPorAplicarService } from '../../services/pagos-por-aplicar.service';

/**
 * El punto verde al lado del nombre: este cliente mandó un pago que todavía
 * espera en la auditoría.
 *
 * Quien abre la ficha suele estar contestándole al cliente («ya pagué y sigo
 * sin internet»): sin esto, el comprobante estaba en otra pantalla y nadie lo
 * relacionaba con la persona que tenía delante.
 *
 * Al pasar por encima muestra el comprobante (la foto, el valor, la fecha y la
 * referencia), y desde ahí se va a la auditoría con ese comprobante abierto.
 * Va al lado de la burbuja de tickets y se dibuja igual: misma forma, misma
 * tarjeta con `position: fixed`, para que se lean como una familia.
 *
 * Si el cliente tiene un pago esperando lo dice el mapa de PagosPorAplicarService
 * (una consulta para toda la pantalla, así sirve también en la lista de
 * clientes); los comprobantes se piden al abrir la tarjeta.
 *
 * Uso: `<app-burbuja-pago [userId]="selectedUserId" />`
 */
@Component({
  selector: 'app-burbuja-pago',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="bp-wrap" *ngIf="total()"
          (mouseenter)="abrir()" (mouseleave)="cerrarConDemora()"
          (focusin)="abrir()" (focusout)="cerrarConDemora()">
      <button #ancla type="button" class="bp" [attr.aria-expanded]="abierta()" [attr.aria-label]="resumen()"
              (click)="alternar($event)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 6v12M15.5 8.5c-.6-1-1.9-1.6-3.5-1.6-2 0-3.4 1-3.4 2.5 0 3.4 7 1.8 7 5.2 0 1.6-1.5 2.6-3.6 2.6-1.7 0-3.1-.7-3.7-1.8"/></svg>
        <b *ngIf="total() > 1">{{ total() }}</b>
      </button>

      <div class="bp-card" *ngIf="abierta()" [style.left.px]="x()" [style.top.px]="y()" role="dialog"
           (mouseenter)="quedate()" (mouseleave)="cerrarConDemora()">
        <p class="bp-card-h">{{ resumen() }}</p>
        <p class="bp-card-f" *ngIf="cargando()">Cargando comprobante…</p>

        <a class="bp-pago" *ngFor="let p of pagos()" (click)="irALaAuditoria(p, $event)" href="#" tabindex="0">
          <span class="bp-foto" [class.is-vacia]="!esImagen(p.file_path)">
            <img *ngIf="esImagen(p.file_path)" [src]="p.file_path" alt="Comprobante de pago" loading="lazy" />
            <span *ngIf="!esImagen(p.file_path)">{{ p.file_path ? 'PDF' : 'Sin archivo' }}</span>
          </span>
          <span class="bp-datos">
            <b class="bp-monto">{{ monto(p) }}</b>
            <small>{{ p.bank_name || 'Entidad no identificada' }}</small>
            <small *ngIf="p.reference_number" class="bp-mono">Ref. {{ p.reference_number }}</small>
            <small *ngIf="p.invoice?.number_facture" class="bp-mono">Factura {{ p.invoice.number_facture }}</small>
            <small>Recibido {{ desde(p.created_at) }}</small>
          </span>
        </a>

        <p class="bp-card-f" *ngIf="!cargando()">
          <span *ngIf="total() > pagos().length">y {{ total() - pagos().length }} más · </span>Clic para revisarlo en la auditoría
        </p>
      </div>
    </span>
  `,
  styles: [`
    .bp-wrap { display: inline-flex; vertical-align: middle; }

    /* Misma pastilla que la de tickets, en verde: es plata que llegó, no un problema. */
    .bp {
      appearance: none; border: 0; cursor: pointer;
      display: inline-flex; align-items: center; gap: 2px;
      margin-left: 6px; padding: 2px 5px 2px 3px;
      border-radius: 999px; line-height: 1;
      background: var(--ok-soft); color: var(--ok);
      transition: transform .12s ease;
      &:hover, &:focus-visible { transform: scale(1.12); }
      &:focus-visible { outline: 2px solid var(--ok); outline-offset: 2px; }
      svg { width: 11px; height: 11px; flex: none; }
      b { font-size: 9.5px; font-weight: 800; font-variant-numeric: tabular-nums; }
    }

    .bp-card {
      position: fixed; z-index: 9000;
      width: 288px; padding: 9px 10px 8px;
      background: var(--surface); color: var(--text);
      border: 1px solid var(--line-strong); border-radius: var(--radius-lg, 10px);
      box-shadow: 0 16px 38px -12px rgba(0, 10, 30, .42);
      display: grid; gap: 7px;
      animation: bp-entra .14s ease-out;
      text-align: left; cursor: default;
      font-size: 12px; font-weight: 400; letter-spacing: normal;
    }
    @keyframes bp-entra { from { opacity: 0; transform: translateY(-4px); } }

    .bp-card-h { margin: 0; font-size: 11px; font-weight: 700; color: var(--text-2); }
    .bp-card-f { margin: 0; font-size: 10.5px; color: var(--text-3); }

    .bp-pago {
      display: grid; grid-template-columns: 76px 1fr; gap: 9px; align-items: start;
      padding: 6px; border-radius: 7px; color: inherit; text-decoration: none; cursor: pointer;
      background: var(--surface-2, transparent);
      transition: background .12s ease;
      &:hover, &:focus-visible { background: var(--surface-3); outline: none; }
    }

    .bp-foto {
      width: 76px; height: 96px; border-radius: 6px; overflow: hidden;
      background: var(--surface-3); display: grid; place-items: center;
      img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
      &.is-vacia span { font-size: 10px; font-weight: 700; color: var(--text-3); }
    }

    .bp-datos { display: grid; gap: 2px; min-width: 0; }
    .bp-datos small { font-size: 10.5px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bp-monto { font-size: 14px; font-weight: 800; color: var(--ok); font-variant-numeric: tabular-nums; }
    .bp-mono { font-family: var(--font-mono); }
  `],
})
export class BurbujaPagoComponent implements OnInit {
  private proofs = inject(PaymentProofService);
  private pendientes = inject(PagosPorAplicarService);
  private router = inject(Router);

  private ancla = viewChild<ElementRef<HTMLElement>>('ancla');

  /** Los que se muestran en la tarjeta: con más, la auditoría los lista todos. */
  private static readonly MAXIMO = 3;

  private id = signal<number | null>(null);

  /** Acepta texto además de número, como la burbuja de tickets. */
  @Input() set userId(v: number | string | null | undefined) {
    const n = Number(v);
    this.id.set(Number.isFinite(n) && n > 0 ? n : null);
    this.pagos.set([]);
    this.cargadoDe = null;
    this.abierta.set(false);
  }

  total = computed(() => this.pendientes.de(this.id())?.total ?? 0);

  pagos = signal<any[]>([]);
  cargando = signal(false);
  private cargadoDe: number | null = null;

  resumen = computed(() => this.total() === 1
    ? 'Pago por aplicar en la auditoría'
    : `${this.total()} pagos por aplicar en la auditoría`);

  abierta = signal(false);
  x = signal(0);
  y = signal(0);

  private cierre: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void { this.pendientes.cargar(); }

  /** Los comprobantes, la primera vez que se abre la tarjeta de este cliente. */
  private traerComprobantes(): void {
    const userId = this.id();
    if (!userId || this.cargadoDe === userId) return;

    this.cargadoDe = userId;
    this.cargando.set(true);

    this.proofs.list({ user_id: userId, status: 'pending', per_page: BurbujaPagoComponent.MAXIMO }).subscribe({
      next: (r: any) => {
        // Si mientras tanto cambió de cliente, la respuesta vieja no se pinta.
        if (this.id() !== userId) return;
        this.pagos.set(r?.data?.data ?? []);
        this.cargando.set(false);
      },
      error: () => { this.cargando.set(false); this.cargadoDe = null; },
    });
  }

  abrir(): void {
    this.quedate();
    if (this.abierta()) return;

    this.traerComprobantes();

    const caja = this.ancla()?.nativeElement.getBoundingClientRect();
    if (!caja) return;

    const ancho = 288;
    const margen = 8;

    let izq = caja.left + caja.width / 2 - ancho / 2;
    izq = Math.max(margen, Math.min(izq, window.innerWidth - ancho - margen));

    // Cabecera y pie, más una fila por comprobante (la foto mide 96px).
    const alto = 56 + Math.min(this.total(), BurbujaPagoComponent.MAXIMO) * 115;
    const abajo = caja.bottom + 6;
    const arriba = caja.top - alto - 6;

    this.x.set(Math.round(izq));
    this.y.set(Math.round(abajo + alto > window.innerHeight - margen && arriba > margen ? arriba : abajo));
    this.abierta.set(true);
  }

  cerrarConDemora(): void {
    this.quedate();
    this.cierre = setTimeout(() => this.abierta.set(false), 180);
  }

  quedate(): void {
    if (this.cierre) { clearTimeout(this.cierre); this.cierre = null; }
  }

  alternar(e: Event): void {
    e.stopPropagation();
    this.abierta() ? this.abierta.set(false) : this.abrir();
  }

  @HostListener('document:keydown.escape')
  alEscape(): void { this.abierta.set(false); }

  @HostListener('window:scroll')
  alRodar(): void { this.abierta.set(false); }

  /** A la auditoría, filtrada por el cliente y con ese comprobante abierto. */
  irALaAuditoria(p: any, e: Event): void {
    e.preventDefault();
    this.abierta.set(false);
    this.router.navigate(['/dashboard/payment-proof-audit'], {
      queryParams: { comprobante: p.id, client: p.user?.dni || null },
    });
  }

  esImagen(ruta: string | null | undefined): boolean {
    return !!ruta && /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(ruta);
  }

  monto(p: any): string {
    const v = Number(p.reported_amount ?? p.detected_amount ?? 0);
    return v > 0
      ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
      : 'Valor sin leer';
  }

  desde(fecha: string): string {
    const s = Math.max(0, (Date.now() - new Date(String(fecha).replace(' ', 'T')).getTime()) / 1000);
    if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }
}
