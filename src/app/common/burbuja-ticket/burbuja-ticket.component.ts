import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TicketsAbiertosService } from '../../services/tickets-abiertos.service';

/**
 * El punto de color al lado del nombre: este cliente tiene un ticket abierto.
 *
 * Se ve en todas las pantallas donde aparece un cliente, con el mismo color
 * que usa la lista de tickets: ámbar «por hacer», azul «en curso». El
 * finalizado no se pinta — un ticket cerrado no dice nada del cliente de hoy
 * y llenaría la pantalla de puntos que no piden nada.
 *
 * Al pasar por encima abre una tarjeta con los tickets de verdad —número,
 * servicio, técnico y hace cuánto— y desde ahí se entra al ticket. Se probó
 * antes con el tooltip de la plataforma y no alcanzaba: un renglón de texto
 * no dice cuál ticket es ni deja ir a él.
 *
 * La tarjeta se dibuja con `position: fixed` y coordenadas calculadas al
 * abrirla: dentro de una celda con scroll, una tarjeta absoluta queda
 * recortada por la tabla.
 *
 * Uso: `<app-burbuja-ticket [userId]="c.user_id" />`
 */
@Component({
  selector: 'app-burbuja-ticket',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="bt-wrap" *ngIf="hay()"
          (mouseenter)="abrir()" (mouseleave)="cerrarConDemora()"
          (focusin)="abrir()" (focusout)="cerrarConDemora()">
      <button #ancla type="button" class="bt" [attr.data-estado]="tono()"
              [attr.aria-expanded]="abierta()" [attr.aria-label]="resumen()"
              (click)="alternar($event)">
        <i></i><b *ngIf="cuantos() > 1">{{ cuantos() }}</b>
      </button>

      <div class="bt-card" *ngIf="abierta()" [style.left.px]="x()" [style.top.px]="y()" role="dialog"
           (mouseenter)="quedate()" (mouseleave)="cerrarConDemora()">
        <p class="bt-card-h">{{ resumen() }}</p>
        <ul>
          <li *ngFor="let t of tickets()" (click)="irAlTicket(t.id)" tabindex="0" (keydown.enter)="irAlTicket(t.id)">
            <span class="bt-estado" [attr.data-estado]="t.status_id === 2 ? 'en_curso' : 'por_hacer'">
              {{ t.status_id === 2 ? 'En curso' : 'Por hacer' }}
            </span>
            <b>#{{ t.id }}</b>
            <span class="bt-serv">{{ t.servicio }}</span>
            <small>{{ desde(t.desde) }}<ng-container *ngIf="t.tecnico"> · {{ primerNombre(t.tecnico) }}</ng-container></small>
          </li>
        </ul>
        <p class="bt-card-f" *ngIf="cuantos() > tickets().length">y {{ cuantos() - tickets().length }} más</p>
      </div>
    </span>
  `,
  styles: [`
    .bt-wrap { display: inline-flex; vertical-align: middle; }

    /* Va pegado al nombre, en la misma línea, sin empujar el texto. */
    .bt {
      appearance: none; border: 0; cursor: pointer;
      display: inline-flex; align-items: center; gap: 4px;
      margin-left: 6px; padding: 2px 5px 2px 4px;
      border-radius: 999px; background: var(--tono-suave); line-height: 1;
      transition: transform .12s ease;
      &:hover, &:focus-visible { transform: scale(1.12); }
      &:focus-visible { outline: 2px solid var(--tono); outline-offset: 2px; }
    }
    .bt > i {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--tono); flex: none;
      /* El halo late suave: se nota de reojo sin ser una alarma. */
      box-shadow: 0 0 0 0 var(--tono);
      animation: bt-latido 2.4s ease-out infinite;
    }
    .bt > b { font-size: 9.5px; font-weight: 800; color: var(--tono); font-variant-numeric: tabular-nums; }

    .bt[data-estado="por_hacer"] { --tono: var(--warn); --tono-suave: var(--warn-soft); }
    .bt[data-estado="en_curso"]  { --tono: var(--info); --tono-suave: var(--info-soft); }

    @keyframes bt-latido {
      0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--tono) 55%, transparent); }
      70%  { box-shadow: 0 0 0 5px color-mix(in srgb, var(--tono) 0%, transparent); }
      100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--tono) 0%, transparent); }
    }
    @media (prefers-reduced-motion: reduce) { .bt > i { animation: none; } }

    /* ── La tarjeta ── */
    .bt-card {
      position: fixed; z-index: 9000;
      width: 272px; padding: 9px 10px 8px;
      background: var(--surface); color: var(--text);
      border: 1px solid var(--line-strong); border-radius: var(--radius-lg, 10px);
      box-shadow: 0 16px 38px -12px rgba(0, 10, 30, .42);
      display: grid; gap: 7px;
      animation: bt-entra .14s ease-out;
      text-align: left; cursor: default;
    }
    @keyframes bt-entra { from { opacity: 0; transform: translateY(-4px); } }

    .bt-card-h { margin: 0; font-size: 11px; font-weight: 700; color: var(--text-2); }
    .bt-card-f { margin: 0; font-size: 11px; color: var(--text-3); }

    .bt-card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
    .bt-card li {
      display: grid; grid-template-columns: auto auto 1fr; align-items: center;
      column-gap: 7px; row-gap: 2px;
      padding: 6px 7px; border-radius: 7px; cursor: pointer;
      background: var(--surface-2, transparent);
      transition: background .12s ease;
      &:hover, &:focus-visible { background: var(--surface-3); outline: none; }
      b { font-family: var(--font-mono); font-size: 11.5px; color: var(--text); }
      small { grid-column: 1 / -1; font-size: 10.5px; color: var(--text-3); }
    }
    .bt-serv { font-size: 11.5px; font-weight: 600; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .bt-estado {
      font-size: 9.5px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase;
      padding: 2px 6px; border-radius: 999px; white-space: nowrap;
      background: var(--warn-soft); color: var(--warn);
      &[data-estado="en_curso"] { background: var(--info-soft); color: var(--info); }
    }
  `],
})
export class BurbujaTicketComponent implements OnInit {
  private tickets_ = inject(TicketsAbiertosService);
  private router = inject(Router);

  private ancla = viewChild<ElementRef<HTMLElement>>('ancla');
  private id = signal<number | null>(null);

  /**
   * Acepta texto además de número: en la lista de clientes el id viene como
   * cadena («2834») y en la red como número.
   */
  @Input() set userId(v: number | string | null | undefined) {
    const n = Number(v);
    this.id.set(Number.isFinite(n) && n > 0 ? n : null);
  }

  private datos = computed(() => {
    const u = this.id();
    return u ? this.tickets_.mapa()[u] ?? null : null;
  });

  hay = computed(() => {
    const d = this.datos();
    return !!d && (d.por_hacer > 0 || d.en_curso > 0);
  });

  cuantos = computed(() => {
    const d = this.datos();
    return d ? d.por_hacer + d.en_curso : 0;
  });

  tickets = computed(() => this.datos()?.tickets ?? []);

  /** El que manda es el que ya está en la calle: si hay uno en curso, azul. */
  tono = computed(() => (this.datos()?.en_curso ? 'en_curso' : 'por_hacer'));

  resumen = computed(() => {
    const d = this.datos();
    if (!d) return '';

    const partes: string[] = [];
    if (d.en_curso) partes.push(`${d.en_curso} en curso`);
    if (d.por_hacer) partes.push(`${d.por_hacer} por hacer`);

    return `Tickets sin cerrar: ${partes.join(' y ')}`;
  });

  abierta = signal(false);
  x = signal(0);
  y = signal(0);

  private cierre: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void { this.tickets_.cargar(); }

  abrir(): void {
    this.quedate();
    if (this.abierta()) return;

    const caja = this.ancla()?.nativeElement.getBoundingClientRect();
    if (!caja) return;

    const ancho = 272;
    const margen = 8;

    // Centrada bajo el punto, pero sin salirse de la pantalla.
    let izq = caja.left + caja.width / 2 - ancho / 2;
    izq = Math.max(margen, Math.min(izq, window.innerWidth - ancho - margen));

    // Si abajo no entra, va arriba. Alto estimado: cabecera + hasta 5 filas.
    const alto = 48 + Math.min(this.tickets().length, 5) * 40;
    const abajo = caja.bottom + 6;
    const arriba = caja.top - alto - 6;

    this.x.set(Math.round(izq));
    this.y.set(Math.round(abajo + alto > window.innerHeight - margen && arriba > margen ? arriba : abajo));
    this.abierta.set(true);
  }

  /** El mouse viaja del punto a la tarjeta: no se cierra en ese salto. */
  cerrarConDemora(): void {
    this.quedate();
    this.cierre = setTimeout(() => this.abierta.set(false), 180);
  }

  quedate(): void {
    if (this.cierre) { clearTimeout(this.cierre); this.cierre = null; }
  }

  /** En el teléfono no hay «pasar por encima»: se toca. */
  alternar(e: Event): void {
    e.stopPropagation();
    this.abierta() ? this.abierta.set(false) : this.abrir();
  }

  @HostListener('document:keydown.escape')
  alEscape(): void { this.abierta.set(false); }

  @HostListener('window:scroll')
  alRodar(): void { this.abierta.set(false); }

  irAlTicket(id: number): void {
    this.abierta.set(false);
    this.router.navigate(['/dashboard/view-ticket'], { queryParams: { ticket: id } });
  }

  primerNombre(n: string): string {
    return String(n ?? '').trim().split(/\s+/)[0] ?? '';
  }

  desde(fecha: string): string {
    const s = Math.max(0, (Date.now() - new Date(String(fecha).replace(' ', 'T')).getTime()) / 1000);
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }
}
