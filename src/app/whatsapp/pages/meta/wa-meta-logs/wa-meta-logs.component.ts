import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

@Component({
  selector: 'app-wa-meta-logs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-7xl mx-auto mt-8 p-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Logs Meta WhatsApp</h1>
      <div *ngIf="loading" class="animate-pulse space-y-4">
        <div *ngFor="let i of [1,2,3]" class="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      </div>
      <div *ngIf="!loading" class="overflow-x-auto rounded-lg">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="p-3 text-xs font-medium text-left text-gray-500 uppercase">Fecha</th>
              <th class="p-3 text-xs font-medium text-left text-gray-500 uppercase">Teléfono</th>
              <th class="p-3 text-xs font-medium text-left text-gray-500 uppercase">Tipo</th>
              <th class="p-3 text-xs font-medium text-left text-gray-500 uppercase">Dirección</th>
              <th class="p-3 text-xs font-medium text-left text-gray-500 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            <tr *ngFor="let log of logs">
              <td class="p-3 text-sm text-gray-900 dark:text-white">{{ log.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
              <td class="p-3 text-sm text-gray-500 dark:text-gray-400">{{ log.phone }}</td>
              <td class="p-3 text-sm text-gray-500 dark:text-gray-400">{{ log.type }}</td>
              <td class="p-3 text-sm">
                <span class="px-2 py-0.5 text-xs rounded-full" [ngClass]="log.direction === 'outbound' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'">{{ log.direction === 'outbound' ? 'Enviado' : 'Recibido' }}</span>
              </td>
              <td class="p-3 text-sm">
                <span class="px-2 py-0.5 text-xs rounded-full" [ngClass]="log.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">{{ log.status }}</span>
              </td>
            </tr>
            <tr *ngIf="logs.length === 0">
              <td colspan="5" class="p-8 text-center text-gray-500">No hay logs registrados.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class WaMetaLogsComponent implements OnInit {
  loading = true;
  logs: any[] = [];

  constructor(private meta: MetaWhatsappService) {}

  ngOnInit(): void {
    this.meta.getLogs().subscribe({
      next: (r: any) => { this.logs = r.data || []; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
}
