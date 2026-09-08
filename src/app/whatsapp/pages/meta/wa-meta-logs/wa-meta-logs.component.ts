import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

@Component({
  selector: 'app-wa-meta-logs',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'np-console' },
  template: `
    <div class="np-page">
      <header class="np-head">
        <div><p class="np-kicker">WhatsApp <b>/</b> API de Meta <b>/</b> Logs</p><h1 class="np-title">Logs de mensajes</h1><div class="np-ribbon"><span><span class="np-n">{{ logs.length }}</span>registros</span></div></div>
      </header>
      <div class="np-workspace"><section class="np-registry"><div class="np-registry-wrap"><table class="np-table np-table--registry">
        <thead><tr><th class="np-th-stripe"></th><th>Fecha</th><th>Teléfono</th><th>Tipo</th><th>Dirección</th><th>Estado</th></tr></thead>
        <tbody>
          <tr *ngIf="loading" class="np-empty"><td colspan="6"><span class="np-spinner"></span></td></tr>
          <tr *ngIf="!loading && logs.length === 0" class="np-empty"><td colspan="6"><strong>No hay logs registrados.</strong></td></tr>
          <tr *ngFor="let log of logs" class="np-row np-row--static">
            <td class="np-stripe"><i [style.background]="log.status === 'sent' || log.status === 'delivered' || log.status === 'read' ? 'var(--ok)' : 'var(--danger)'"></i></td>
            <td class="np-data np-nowrap">{{ log.created_at | date:'dd/MM/yy HH:mm' }}</td>
            <td class="np-data np-strong">{{ log.phone }}</td>
            <td><span class="np-tag np-tag--neutral">{{ log.type }}</span></td>
            <td><span class="np-pill" [ngClass]="log.direction === 'outbound' ? 'np-pill--info' : 'np-pill--active'">{{ log.direction === 'outbound' ? 'Enviado' : 'Recibido' }}</span></td>
            <td><span class="np-pill" [ngClass]="log.status === 'sent' || log.status === 'delivered' || log.status === 'read' ? 'np-pill--active' : 'np-pill--suspended'">{{ log.status }}</span></td>
          </tr>
        </tbody>
      </table></div></section></div>
    </div>
    <style>.np-row--static { cursor: default; }</style>
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
