import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { TicketsAbiertosService } from '../../services/tickets-abiertos.service';

/**
 * El punto de color al lado del nombre: este cliente tiene un ticket abierto.
 *
 * Se ve en todas las pantallas donde aparece un cliente, con el mismo color
 * que usa la lista de tickets: ámbar «por hacer», azul «en curso». El
 * finalizado no se pinta — un ticket cerrado no dice nada del cliente de hoy
 * y llenaría la pantalla de puntos que no piden nada.
 *
 * Uso: `<app-burbuja-ticket [userId]="c.user_id" />`
 */
@Component({
  selector: 'app-burbuja-ticket',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="bt" *ngIf="hay()" [attr.data-estado]="tono()" [title]="texto()" role="img" [attr.aria-label]="texto()">
      <i></i><b *ngIf="cuantos() > 1">{{ cuantos() }}</b>
    </span>
  `,
  styles: [`
    /* Va pegado al nombre, en la misma línea, sin empujar el texto. */
    .bt {
      display: inline-flex; align-items: center; gap: 4px;
      vertical-align: middle; margin-left: 6px;
      padding: 2px 5px 2px 4px; border-radius: 999px;
      background: var(--tono-suave); line-height: 1;
      cursor: help;
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

    /* Quien pidió que no le muevan la pantalla, no ve el latido. */
    @media (prefers-reduced-motion: reduce) { .bt > i { animation: none; } }
  `],
})
export class BurbujaTicketComponent implements OnInit {
  private tickets = inject(TicketsAbiertosService);

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
    return u ? this.tickets.mapa()[u] ?? null : null;
  });

  hay = computed(() => {
    const d = this.datos();
    return !!d && (d.por_hacer > 0 || d.en_curso > 0);
  });

  cuantos = computed(() => {
    const d = this.datos();
    return d ? d.por_hacer + d.en_curso : 0;
  });

  /** El que manda es el que ya está en la calle: si hay uno en curso, azul. */
  tono = computed(() => (this.datos()?.en_curso ? 'en_curso' : 'por_hacer'));

  texto = computed(() => {
    const d = this.datos();
    if (!d) return '';

    const partes: string[] = [];
    if (d.en_curso) partes.push(`${d.en_curso} en curso`);
    if (d.por_hacer) partes.push(`${d.por_hacer} por hacer`);

    return `Tiene ${partes.join(' y ')}${d.desde ? ' · el más viejo ' + this.desde(d.desde) : ''}`;
  });

  ngOnInit(): void { this.tickets.cargar(); }

  private desde(fecha: string): string {
    const s = Math.max(0, (Date.now() - new Date(fecha.replace(' ', 'T')).getTime()) / 1000);
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }
}
