import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrmService } from '../../../services/crm.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-crm-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './crm-dashboard.component.html'
})
export class CrmDashboardComponent implements OnInit, AfterViewInit {

  @ViewChild('chartStatus')  chartStatusRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartDays')    chartDaysRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartAgents')  chartAgentsRef!: ElementRef<HTMLCanvasElement>;

  metrics: any = null;
  loading = true;

  private chartStatus?: Chart;
  private chartDays?: Chart;
  private chartAgents?: Chart;

  constructor(private crmService: CrmService) {}

  ngOnInit(): void {
    this.loadMetrics();
  }

  ngAfterViewInit(): void {}

  loadMetrics(): void {
    this.loading = true;
    this.crmService.getDashboard().subscribe({
      next: res => {
        this.metrics = res.data;
        this.loading = false;
        setTimeout(() => this.renderCharts(), 100);
      },
      error: () => this.loading = false
    });
  }

  private renderCharts(): void {
    if (!this.metrics) return;

    // Destruir charts anteriores
    this.chartStatus?.destroy();
    this.chartDays?.destroy();
    this.chartAgents?.destroy();

    const m = this.metrics;

    // ── Chart por estado ──────────────────────────────────────
    if (this.chartStatusRef?.nativeElement) {
      this.chartStatus = new Chart(this.chartStatusRef.nativeElement, {
        type: 'doughnut',
        data: {
          labels: ['Nuevas', 'En progreso', 'Cerradas'],
          datasets: [{
            data: [
              m.by_status?.new || 0,
              m.by_status?.in_progress || 0,
              m.by_status?.closed || 0
            ],
            backgroundColor: ['#10b981', '#3b82f6', '#64748b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#94a3b8', font: { size: 11 } } }
          }
        }
      });
    }

    // ── Chart últimos 7 días ──────────────────────────────────
    if (this.chartDaysRef?.nativeElement && m.last_7_days) {
      this.chartDays = new Chart(this.chartDaysRef.nativeElement, {
        type: 'bar',
        data: {
          labels: m.last_7_days.map((d: any) => d.date),
          datasets: [{
            label: 'Conversaciones',
            data: m.last_7_days.map((d: any) => d.total),
            backgroundColor: '#10b98180',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
            y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' }, beginAtZero: true }
          },
          plugins: { legend: { display: false } }
        }
      });
    }

    // ── Chart por agente ──────────────────────────────────────
    if (this.chartAgentsRef?.nativeElement && m.by_agent?.length) {
      this.chartAgents = new Chart(this.chartAgentsRef.nativeElement, {
        type: 'bar',
        data: {
          labels: m.by_agent.map((a: any) => a.agent || 'Sin asignar'),
          datasets: [{
            label: 'Conversaciones activas',
            data: m.by_agent.map((a: any) => a.total),
            backgroundColor: '#3b82f680',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          scales: {
            x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' }, beginAtZero: true },
            y: { ticks: { color: '#94a3b8' }, grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }
}
