import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ClientApiService } from '../services/client-api.service';

@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ticket-list.component.html',
})
export class TicketListComponent implements OnInit {
  private api = inject(ClientApiService);

  loading = signal(true);
  tickets = signal<any[]>([]);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.getTickets().subscribe({
      next: (res) => {
        this.tickets.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
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

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    if (days > 0)  return `hace ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
    return `hace ${mins} min`;
  }
}
