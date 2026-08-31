import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CompanyWhatsappService } from '../../../../services/company-whatsapp.service';

@Component({
  selector: 'app-wa-meta-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-3xl mx-auto mt-8 p-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Panel de Configuración Meta</h1>

      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number ID</label>
          <input type="text" [(ngModel)]="phoneNumberId" class="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Token</label>
          <input type="password" [(ngModel)]="accessToken" class="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600" />
        </div>
        <div class="flex items-center gap-3">
          <button (click)="save()" [disabled]="saving" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {{ saving ? 'Guardando...' : 'Guardar' }}
          </button>
          <p *ngIf="msg" class="text-sm" [ngClass]="error ? 'text-red-600' : 'text-green-600'">{{ msg }}</p>
        </div>
      </div>

      <div class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p class="text-sm font-medium text-blue-800 dark:text-blue-300">Webhook URL:</p>
        <code class="text-xs text-blue-700 dark:text-blue-400">https://netplay.com.co/api/webhooks/whatsapp-meta</code>
      </div>
    </div>
  `
})
export class WaMetaPanelComponent implements OnInit {
  phoneNumberId = '';
  accessToken = '';
  saving = false;
  msg = '';
  error = false;

  constructor(private cwa: CompanyWhatsappService) {}

  ngOnInit(): void {
    this.cwa.getConfig().subscribe({
      next: (r: any) => {
        const d = r.data ?? r;
        this.phoneNumberId = d.wa_phone_number_id || '';
      }
    });
  }

  save(): void {
    this.saving = true;
    this.msg = '';
    this.cwa.updateConfig({
      wa_provider: 'meta',
      wa_phone_number_id: this.phoneNumberId || null,
      wa_access_token: this.accessToken || null,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.msg = 'Configuración guardada';
        this.error = false;
      },
      error: (e: any) => {
        this.saving = false;
        this.msg = e.error?.message || 'Error al guardar';
        this.error = true;
      }
    });
  }
}
