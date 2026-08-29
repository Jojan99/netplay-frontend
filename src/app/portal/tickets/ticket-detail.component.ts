import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ClientApiService } from '../services/client-api.service';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ticket-detail.component.html',
})
export class TicketDetailComponent implements OnInit {
  private api    = inject(ClientApiService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  ticket   = signal<any>(null);
  loading  = signal(true);
  errorMsg = signal('');

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.router.navigate(['/portal/reportes']);
      return;
    }
    this.load(id);
  }

  load(id: number): void {
    this.loading.set(true);
    this.api.getTicket(id).subscribe({
      next: (res) => {
        this.ticket.set(res.data ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('No se pudo cargar el reporte');
        this.loading.set(false);
      },
    });
  }

  categoryLabel(cat: string): string {
    const map: Record<string, string> = {
      sin_internet:  'Sin Internet',
      lentitud:      'Conexión lenta',
      intermitencia: 'Intermitencia',
      wifi:          'Problemas WiFi',
      otro:          'Otro',
    };
    return map[cat] ?? cat;
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      'Por hacer':  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'En curso':   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      'Finalizado': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  timelineItems(): { label: string; date: string | null; icon: string; active: boolean; done: boolean }[] {
    const t = this.ticket();
    if (!t) return [];
    return [
      { label: 'Reporte recibido',   date: t.created_at,  icon: '📥', active: true, done: true },
      { label: 'En atención',        date: t.started_at,  icon: '🔧', active: !!t.started_at,  done: !!t.started_at },
      { label: 'Resuelto',           date: t.finished_at, icon: '✅', active: !!t.finished_at, done: !!t.finished_at },
      { label: 'Cerrado',            date: t.closed_at,   icon: '🔒', active: !!t.closed_at,   done: !!t.closed_at },
    ];
  }
}
