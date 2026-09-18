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
