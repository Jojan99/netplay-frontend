import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WhatsappService } from '../../services/whatsapp.service';
import { NpSelectComponent } from '../../../common/np-select/np-select.component';
import { PRESENTACION_LINEAS_WA, conValor } from '../../../common/np-select/presentaciones';

type ActiveTab = 'logs' | 'queue';

@Component({
  selector: 'app-wa-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent],
  templateUrl: './wa-logs.component.html',
  styleUrl: './wa-logs.component.scss',
  host: { class: 'np-console' },
})
export class WaLogsComponent implements OnInit {

  // Instancias
  instances: any[]      = [];
  selectedInstance      = '';
  /** Número y estado de cada línea; en el modelo queda el instanceId en texto, como con [value]. */
  readonly presLineas   = conValor(PRESENTACION_LINEAS_WA, i => String(i?.instanceId ?? ''));

  // Datos
  logs: any[]           = [];
  filteredLogs: any[]   = [];
  queue: any[]          = [];
  stats: any            = null;
  pending               = 0;

  // Estado
  loading               = false;
  tab: ActiveTab        = 'logs';
  activeFilter          = 'all';

  readonly filters = [
    { label: 'Todos',     value: 'all'    },
    { label: '✓ Enviados', value: 'sent'  },
    { label: '✗ Fallidos', value: 'failed'}
  ];

  constructor(private wa: WhatsappService) {}

  ngOnInit(): void {
    this.wa.ensureApiKey().subscribe({
      next: () => {
        this.wa.getInstances().subscribe({
          next: (r: any) => { this.instances = r.instances || []; }
        });
      }
    });
  }

  onInstanceChange(): void {
    if (!this.selectedInstance) return;
    this.load();
  }

  load(): void {
    if (!this.selectedInstance) return;
    this.loading = true;

    // Logs
    this.wa.getLogs(this.selectedInstance).subscribe({
      next: (r: any) => {
        this.logs  = r.logs  || [];
        this.stats = r.stats || null;
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });

    // Cola
    this.wa.getQueue(this.selectedInstance).subscribe({
      next: (r: any) => {
        this.queue   = r.items  || [];
        this.pending = r.pending || 0;
      }
    });
  }

  applyFilter(): void {
    if (this.activeFilter === 'all') {
      this.filteredLogs = this.logs;
    } else {
      this.filteredLogs = this.logs.filter(l => l.status === this.activeFilter);
    }
  }

  setFilter(val: string): void {
    this.activeFilter = val;
    this.applyFilter();
  }

  setTab(tab: ActiveTab): void {
    this.tab = tab;
  }
}