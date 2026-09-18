import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ConsolaService, pesos } from '../../../services/consola.service';
import { DialogService } from '../../../services/dialog.service';
import { ToastService } from '../../../services/toast.service';

type FiltroCobro = 'todos' | 'pendiente' | 'vencidos' | 'pagado' | 'anulado';

/** Todos los cobros de la plataforma, con quién está por vencer y quién en mora. */
@Component({
  selector: 'app-consola-cobros',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './consola-cobros.component.html',
  styleUrl: './consola-cobros.component.scss',
})
export class ConsolaCobrosComponent implements OnInit, OnDestroy {
  private destruir$ = new Subject<void>();
  private consola = inject(ConsolaService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  cargando = true;
  filtro: FiltroCobro = 'todos';

  cobros: any[] = [];
  resumen: any = {};
  porVencer: any[] = [];
  enMora: any[] = [];

  readonly FILTROS: { valor: FiltroCobro; titulo: string }[] = [
    { valor: 'todos', titulo: 'Todos' },
    { valor: 'pendiente', titulo: 'Pendientes' },
    { valor: 'vencidos', titulo: 'Vencidos' },
    { valor: 'pagado', titulo: 'Pagados' },
    { valor: 'anulado', titulo: 'Anulados' },
  ];

  pesos = pesos;

  /** Filas de mentira mientras llega la lista. */
  readonly esqueleto = [1, 2, 3, 4, 5, 6];

  porId(i: number, c: { id?: number }): number { return c?.id ?? i; }
  porAviso(i: number, a: { company_id?: number }): number { return a?.company_id ?? i; }
  porIndice(i: number): number { return i; }

  ngOnInit(): void { this.cargar(); }

  ngOnDestroy(): void { this.destruir$.next(); this.destruir$.complete(); }

  cargar(): void {
    this.cargando = true;

    const filtros: Record<string, string> = {};
    if (this.filtro === 'vencidos') filtros['vencidos'] = '1';
    else if (this.filtro !== 'todos') filtros['estado'] = this.filtro;

    this.consola.cobros(filtros).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        const d = r?.data ?? {};
        this.cobros = d.items ?? [];
        this.resumen = d.resumen ?? {};
        this.porVencer = d.avisos?.por_vencer ?? [];
        this.enMora = d.avisos?.en_mora ?? [];
        this.cargando = false;
      },
      error: e => { this.cargando = false; this.toast.error(e?.error?.message || 'No se pudieron cargar los cobros.'); },
    });
  }

  cambiarFiltro(f: FiltroCobro): void { this.filtro = f; this.cargar(); }

  async marcarMoras(): Promise<void> {
    const ok = await this.dialog.confirm(
      'Esto pasa a "en mora" las suscripciones con cobros vencidos. No suspende a nadie: suspender es una decisión aparte.',
      { okLabel: 'Marcar' }
    );

    if (!ok) return;

    this.consola.marcarMoras().pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.cargar();
      },
      error: e => this.toast.error(e?.error?.message || 'No se pudo actualizar.'),
    });
  }

  claseEstado(c: any): string {
    if (c.estado === 'pagado')  return 'np-pill--active';
    if (c.estado === 'anulado') return 'np-pill--neutral';
    return c.vencido ? 'np-pill--suspended' : 'np-pill--info';
  }

  textoEstado(c: any): string {
    if (c.estado === 'pagado')  return 'Pagado';
    if (c.estado === 'anulado') return 'Anulado';
    return c.vencido ? 'Vencido' : 'Pendiente';
  }

  /** El color de la raya de la izquierda de la fila. */
  claseRaya(c: any): string {
    if (c.estado === 'pagado')  return 'np-stripe--ok';
    if (c.estado === 'anulado') return 'np-stripe--neutral';
    return c.vencido ? 'np-stripe--danger' : 'np-stripe--info';
  }
}
