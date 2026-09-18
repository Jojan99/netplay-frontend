import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ConsolaService, pesos } from '../../../services/consola.service';
import { ToastService } from '../../../services/toast.service';

interface Barra { mes: string; etiqueta: string; altas: number; alto: number; }

/**
 * El tablero de Netvula: cuántas empresas hay, cuántos clientes tienen entre
 * todas, qué usan y cuánto factura la plataforma al mes.
 */
@Component({
  selector: 'app-consola-tablero',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './consola-tablero.component.html',
  styleUrl: './consola-tablero.component.scss',
})
export class ConsolaTableroComponent implements OnInit, OnDestroy {
  private destruir$ = new Subject<void>();
  private consola = inject(ConsolaService);
  private toast = inject(ToastService);

  cargando = true;
  refrescando = false;
  migrada = true;

  empresas: any = {};
  clientes: any = {};
  red: any = {};
  ingresos: any = {};
  porVencer: any[] = [];
  enMora: any[] = [];

  /** Series ya calculadas: en el *ngFor no se arma nada nuevo. */
  barrasEmpresas: Barra[] = [];
  barrasClientes: Barra[] = [];

  ngOnInit(): void { this.cargar(); }

  ngOnDestroy(): void { this.destruir$.next(); this.destruir$.complete(); }

  cargar(refrescar = false): void {
    this.cargando = !refrescar;
    this.refrescando = refrescar;

    this.consola.tablero(refrescar).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        const d = r?.data ?? {};
        this.empresas = d.empresas ?? {};
        this.clientes = d.clientes ?? {};
        this.red = d.red ?? {};
        this.ingresos = d.ingresos ?? {};
        this.migrada = d.migrada !== false;
        this.porVencer = d.avisos?.por_vencer ?? [];
        this.enMora = d.avisos?.en_mora ?? [];
        this.barrasEmpresas = this.aBarras(d.crecimiento?.empresas ?? []);
        this.barrasClientes = this.aBarras(d.crecimiento?.clientes ?? []);
        this.cargando = false;
        this.refrescando = false;
      },
      error: e => {
        this.cargando = false;
        this.refrescando = false;
        this.toast.error(e?.error?.message || 'No se pudo cargar el tablero de la plataforma.');
      },
    });
  }

  pesos = pesos;

  /** Alto de cada barra en porcentaje, contra el mes más alto. */
  private aBarras(serie: { mes: string; altas: number }[]): Barra[] {
    const tope = Math.max(1, ...serie.map(s => s.altas));

    return serie.map(s => ({
      mes: s.mes,
      etiqueta: this.mesCorto(s.mes),
      altas: s.altas,
      alto: Math.round((s.altas / tope) * 100),
    }));
  }

  private mesCorto(mes: string): string {
    const [anio, m] = mes.split('-');
    const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${nombres[Number(m) - 1] ?? m}·${anio.slice(2)}`;
  }
}
