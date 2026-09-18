import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ConsolaService } from '../../../services/consola.service';
import { ToastService } from '../../../services/toast.service';

/** Todo lo que se hizo desde la consola: quién, qué y cuándo. */
@Component({
  selector: 'app-consola-bitacora',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consola-bitacora.component.html',
  styleUrl: './consola-bitacora.component.scss',
})
export class ConsolaBitacoraComponent implements OnInit, OnDestroy {
  private destruir$ = new Subject<void>();
  private consola = inject(ConsolaService);
  private toast = inject(ToastService);

  cargando = true;

  items: any[] = [];
  acciones: string[] = [];
  total = 0;
  pagina = 1;
  porPagina = 30;
  paginas = 1;

  accion = '';
  desde = '';
  hasta = '';

  /** Filas de mentira mientras llega la página. */
  readonly esqueleto = [1, 2, 3, 4, 5, 6, 7, 8];

  ngOnInit(): void { this.cargar(); }

  ngOnDestroy(): void { this.destruir$.next(); this.destruir$.complete(); }

  cargar(): void {
    this.cargando = true;

    const filtros: Record<string, string> = { pagina: String(this.pagina), por_pagina: String(this.porPagina) };
    if (this.accion) filtros['accion'] = this.accion;
    if (this.desde)  filtros['desde'] = this.desde;
    if (this.hasta)  filtros['hasta'] = this.hasta;

    this.consola.bitacora(filtros).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        const d = r?.data ?? {};
        this.items = d.items ?? [];
        this.total = d.total ?? 0;
        this.acciones = d.acciones ?? [];
        this.paginas = Math.max(1, Math.ceil(this.total / this.porPagina));
        this.cargando = false;
      },
      error: e => { this.cargando = false; this.toast.error(e?.error?.message || 'No se pudo cargar la bitácora.'); },
    });
  }

  filtrar(): void { this.pagina = 1; this.cargar(); }

  limpiar(): void {
    this.accion = '';
    this.desde = '';
    this.hasta = '';
    this.filtrar();
  }

  /**
   * El color de la anotación por familia de acción: lo que se suspende o
   * se anula se ve distinto de lo que sólo se guarda.
   */
  claseAccion(accion: string): string {
    const a = accion || '';
    if (a.includes('suspend') || a.includes('anul') || a.includes('borr') || a.includes('elimin')) return 'np-tag--peligro';
    if (a.includes('reactiv') || a.includes('pago')  || a.includes('cobro')) return 'np-tag--bien';
    if (a.includes('mora')) return 'np-tag--aviso';
    return 'np-tag--neutral';
  }

  claseRaya(accion: string): string {
    switch (this.claseAccion(accion)) {
      case 'np-tag--peligro': return 'np-stripe--danger';
      case 'np-tag--bien':    return 'np-stripe--ok';
      case 'np-tag--aviso':   return 'np-stripe--warn';
      default:                return 'np-stripe--neutral';
    }
  }

  porId(i: number, b: { id?: number }): number { return b?.id ?? i; }
  porTexto(i: number, t: string): string { return t ?? String(i); }
  porIndice(i: number): number { return i; }

  ir(p: number): void {
    if (p < 1 || p > this.paginas) return;
    this.pagina = p;
    this.cargar();
  }

  /** El detalle se guarda como JSON; acá se muestra legible. */
  detalle(d: any): string {
    if (!d) return '';
    if (typeof d === 'string') return d;

    return Object.entries(d)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' · ');
  }

  fechaHora(d: string | null | undefined): string {
    return d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' }) : '—';
  }
}
