import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from '../../services/finance.service';

interface Deudor {
  user_id: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  estado_servicio: string | null;
  suspendido: boolean;
  retirado: boolean;
  facturas_en_mora: number;
  deuda_en_mora: number;
  deuda_total: number;
  factura_mas_vieja: string | null;
  dias: number;
  compromiso: string | null;
  ultimo_aviso: string | null;
}

interface Barra { etiqueta: string; valor: number; detalle: string; alto: number; }

/** Nombres de los avisos automáticos, como los ve el operador. */
const EVENTOS: Record<string, string> = {
  recordatorio_pago: 'Recordatorio de pago',
  suspension_mora: 'Aviso de suspensión',
  servicio_reactivado: 'Servicio reactivado',
};

@Component({
  selector: 'app-cartera',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cartera.component.html',
  styleUrl: './cartera.component.scss',
  host: { class: 'np-console' },
})
export class CarteraComponent implements OnInit {
  private finance = inject(FinanceService);

  cargando = signal(true);
  error = signal<string | null>(null);
  datos = signal<any>(null);

  lista = signal<'en_mora' | 'retirados'>('en_mora');
  buscar = signal('');
  tablaAntiguedad = signal(false);
  tablaRecaudo = signal(false);

  deudores = computed<Deudor[]>(() => {
    const d = this.datos();
    if (!d) return [];
    const q = this.buscar().trim().toLowerCase();
    const filas: Deudor[] = d[this.lista()] ?? [];
    return q
      ? filas.filter(f => f.nombre.toLowerCase().includes(q) || (f.documento ?? '').includes(q) || (f.telefono ?? '').includes(q))
      : filas;
  });

  /** Barras horizontales: el largo es proporcional al mayor tramo. */
  antiguedad = computed<Barra[]>(() => {
    const tramos: any[] = this.datos()?.antiguedad ?? [];
    const max = Math.max(1, ...tramos.map(t => t.monto));
    return tramos.map(t => ({
      etiqueta: t.tramo,
      valor: t.monto,
      detalle: `${t.clientes} cliente${t.clientes === 1 ? '' : 's'}`,
      alto: (t.monto / max) * 100,
    }));
  });

  /** Columnas: el alto es proporcional al mes con más recaudo. */
  recaudo = computed<Barra[]>(() => {
    const meses: any[] = this.datos()?.recaudo_meses ?? [];
    const max = Math.max(1, ...meses.map(m => m.total));
    return meses.map(m => ({
      etiqueta: this.nombreMes(m.mes),
      valor: m.total,
      detalle: `de mora: $ ${this.miles(m.de_mora)}`,
      alto: (m.total / max) * 100,
    }));
  });

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.error.set(null);
    this.cargando.set(true);
    this.finance.getCartera().subscribe({
      next: (res) => { this.datos.set(res?.data ?? null); this.cargando.set(false); },
      error: () => { this.error.set('No se pudo calcular la cartera. Probá de nuevo en un momento.'); this.cargando.set(false); },
    });
  }

  nombreEvento(evento: string): string {
    return EVENTOS[evento] ?? evento.replace(/_/g, ' ');
  }

  porcentaje(parte: number, total: number): number {
    return total ? Math.round((parte * 100) / total) : 0;
  }

  /** $ 12,9 M / $ 850 K: para los rótulos cortos de las barras. */
  compacto(valor: number): string {
    if (valor >= 1_000_000) return `$ ${(valor / 1_000_000).toFixed(1).replace('.', ',')} M`;
    if (valor >= 1_000) return `$ ${Math.round(valor / 1_000)} K`;
    return `$ ${Math.round(valor)}`;
  }

  miles(valor: number): string {
    return Math.round(valor || 0).toLocaleString('es-CO');
  }

  private nombreMes(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    const nombre = new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
    return `${nombre} ${String(y).slice(2)}`;
  }
}
