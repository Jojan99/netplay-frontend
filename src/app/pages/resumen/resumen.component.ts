import { Component, OnInit } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { Chart }         from 'chart.js/auto';
import { FinanceService }          from '../../services/finance.service';
import { FinanceSummaryInterface, IngresoDetalleInterface } from '../../models/finance-summary.interface';
import { EgressesInterface }       from '../../models/egresses-interface';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './resumen.component.html',
  styleUrl: './resumen.component.scss',
})
export class ResumenComponent implements OnInit {
  skeletorResumen  = true;
  skeletorIngresos = true;
  skeletorEgresos  = true;

  resumen:  FinanceSummaryInterface    = {};
  ingresos: IngresoDetalleInterface[]  = [];
  egresos:  EgressesInterface[]        = [];

  from = '';
  to   = '';

  activeTab: 'ingresos' | 'egresos' = 'ingresos';

  nuevoEgreso = { concept: '', value: 0, user_id: 0 };

  private chart: Chart | null = null;

  constructor(private financeService: FinanceService) {}

  ngOnInit() {
    const now      = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.from = this.fmt(firstDay);
    this.to   = this.fmt(lastDay);

    const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
    this.nuevoEgreso.user_id = authUser?.userId || 0;

    this.consultar();
  }

  fmt(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  consultar() {
    this.loadResumen();
    this.loadIngresos();
    this.loadEgresos();
  }

  loadResumen() {
    this.skeletorResumen = true;
    this.financeService.getResumen(this.from, this.to).subscribe(
      data => {
        this.resumen         = data.data || {};
        this.skeletorResumen = false;
        setTimeout(() => this.renderChart(), 150);
      },
      _err => { this.skeletorResumen = false; },
    );
  }

  loadIngresos() {
    this.skeletorIngresos = true;
    this.financeService.getIngresos(this.from, this.to).subscribe(
      data => { this.ingresos = data.data || []; this.skeletorIngresos = false; },
      _err => { this.skeletorIngresos = false; },
    );
  }

  loadEgresos() {
    this.skeletorEgresos = true;
    this.financeService.getEgresses().subscribe(
      data => { this.egresos = data.data || []; this.skeletorEgresos = false; },
      _err => { this.skeletorEgresos = false; },
    );
  }

  renderChart() {
    const canvas = document.getElementById('resumenChart') as HTMLCanvasElement;
    if (!canvas) return;
    if (this.chart) { this.chart.destroy(); this.chart = null; }

    const neto = this.resumen.net_value || 0;
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Abonos', 'Total ingresos', 'Egresos', 'Compras inv.', 'Total gastos', 'Neto'],
        datasets: [{
          label: 'Valor (COP)',
          data: [
            this.resumen.valor_ingreso              || 0,
            this.resumen.valor_abone                || 0,
            this.resumen.total_sum                  || 0,
            this.resumen.total_egresses             || 0,
            this.resumen.total_inventory_egresses   || 0,
            this.resumen.total_gastos               || 0,
            neto,
          ],
          backgroundColor: [
            'rgba(34,  197,  94, 0.7)',
            'rgba(59,  130, 246, 0.7)',
            'rgba(16,  185, 129, 0.7)',
            'rgba(239,  68,  68, 0.7)',
            'rgba(245, 158,  11, 0.7)',
            'rgba(220,  38,  38, 0.7)',
            neto >= 0 ? 'rgba(99, 102, 241, 0.7)' : 'rgba(239, 68, 68, 0.7)',
          ],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: (v: any) => '$' + Number(v).toLocaleString('es-CO') } },
        },
      },
    });
  }

  openEgresoModal() {
    this.nuevoEgreso.concept = '';
    this.nuevoEgreso.value   = 0;
    document.getElementById('egreso-modal')?.classList.remove('hidden');
  }

  closeEgresoModal() {
    document.getElementById('egreso-modal')?.classList.add('hidden');
  }

  saveEgreso() {
    if (!this.nuevoEgreso.concept.trim() || this.nuevoEgreso.value <= 0) {
      alert('Concepto y valor son obligatorios.');
      return;
    }
    this.financeService.createEgresoManual(this.nuevoEgreso).subscribe(data => {
      alert(data.message);
      if (!data.error) { this.closeEgresoModal(); this.loadEgresos(); }
    });
  }

  getStatusLabel(i: IngresoDetalleInterface): string {
    if (i.paid  === 1) return 'Pagado';
    if (i.abone === 1) return 'Abono';
    return 'Pendiente';
  }

  getStatusClass(i: IngresoDetalleInterface): string {
    if (i.paid  === 1) return 'bg-green-100  text-green-800  dark:bg-green-900  dark:text-green-300';
    if (i.abone === 1) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
  }

  getTypeLabel(i: IngresoDetalleInterface): string {
    return i.abone === 1 ? 'Abono parcial' : 'Pago completo';
  }
}
