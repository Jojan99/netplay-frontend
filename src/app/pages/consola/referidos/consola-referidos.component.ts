import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ConsolaService, pesos } from '../../../services/consola.service';
import { ToastService } from '../../../services/toast.service';

/**
 * El programa de referidos: quién trae a quién, cuánto crédito se otorgó y
 * con qué reglas.
 */
@Component({
  selector: 'app-consola-referidos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consola-referidos.component.html',
  styleUrl: './consola-referidos.component.scss',
})
export class ConsolaReferidosComponent implements OnInit, OnDestroy {
  private destruir$ = new Subject<void>();
  private consola = inject(ConsolaService);
  private toast = inject(ToastService);

  cargando = true;
  guardando = false;

  ranking: any[] = [];
  referidos: any[] = [];
  creditos: any = {};

  ajustes = {
    activo: true,
    beneficio_referido: { tipo: 'porcentaje', valor: 25, periodos: 1 },
    beneficio_referidor: { tipo: 'monto', valor: 50000 },
    acreditar_en: 'primer_pago',
  };

  pesos = pesos;

  ngOnInit(): void { this.cargar(); }

  ngOnDestroy(): void { this.destruir$.next(); this.destruir$.complete(); }

  cargar(): void {
    this.cargando = true;

    this.consola.referidos().pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        const d = r?.data ?? {};
        this.ranking = d.ranking ?? [];
        this.referidos = d.referidos ?? [];
        this.creditos = d.creditos ?? {};
        if (d.ajustes) this.ajustes = { ...this.ajustes, ...d.ajustes };
        this.cargando = false;
      },
      error: e => { this.cargando = false; this.toast.error(e?.error?.message || 'No se pudo cargar el programa de referidos.'); },
    });
  }

  guardarAjustes(): void {
    this.guardando = true;

    this.consola.guardarAjustesReferidos(this.ajustes).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        this.guardando = false;
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
      },
      error: e => { this.guardando = false; this.toast.error(e?.error?.message || 'No se pudieron guardar los ajustes.'); },
    });
  }

  claseEstado(estado: string): string {
    switch (estado) {
      case 'activo':  return 'np-pill--active';
      case 'anulado': return 'np-pill--neutral';
      default:        return 'np-pill--info';
    }
  }

  textoEstado(estado: string): string {
    switch (estado) {
      case 'activo':  return 'Paga (acreditado)';
      case 'anulado': return 'Anulado';
      default:        return 'Registrado';
    }
  }

  fecha(d: string | null | undefined): string {
    return d ? new Date(d).toLocaleDateString('es-CO') : '—';
  }
}
