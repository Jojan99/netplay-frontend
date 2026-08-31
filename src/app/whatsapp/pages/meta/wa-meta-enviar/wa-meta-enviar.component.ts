import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

@Component({
  selector: 'app-wa-meta-enviar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-3xl mx-auto mt-8 p-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Enviar Mensaje (Meta)</h1>

      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número destino</label>
          <input type="text" [(ngModel)]="to" class="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="573001234567" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
          <select [(ngModel)]="type" class="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
            <option value="text">Texto</option>
            <option value="template">Plantilla</option>
          </select>
        </div>

        <div *ngIf="type === 'text'">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensaje</label>
          <textarea [(ngModel)]="message" rows="4" class="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></textarea>
        </div>

        <div *ngIf="type === 'template'">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre plantilla</label>
          <input type="text" [(ngModel)]="templateName" class="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600" />
        </div>

        <div class="flex items-center gap-3">
          <button (click)="send()" [disabled]="sending" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {{ sending ? 'Enviando...' : 'Enviar' }}
          </button>
          <button (click)="checkWindow()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
            Verificar ventana 24h
          </button>
        </div>

        <div *ngIf="result" class="p-3 rounded-lg" [ngClass]="result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'">
          {{ result.message }}
        </div>

        <div *ngIf="windowInfo" class="p-3 rounded-lg bg-blue-50 text-blue-700">
          Ventana 24h: {{ windowInfo.has_window ? 'Activa hasta ' + windowInfo.expires_at : 'Inactiva — necesitas enviar una plantilla primero' }}
        </div>
      </div>
    </div>
  `
})
export class WaMetaEnviarComponent {
  to = '';
  type = 'text';
  message = '';
  templateName = '';
  sending = false;
  result: any = null;
  windowInfo: any = null;

  constructor(private meta: MetaWhatsappService) {}

  send(): void {
    this.sending = true;
    this.result = null;
    this.meta.sendTest({
      to: this.to,
      type: this.type,
      message: this.message,
      template_name: this.templateName,
    }).subscribe({
      next: (r: any) => {
        this.sending = false;
        this.result = { ok: true, message: 'Mensaje enviado correctamente' };
      },
      error: (e: any) => {
        this.sending = false;
        this.result = { ok: false, message: e.error?.error || 'Error al enviar' };
      }
    });
  }

  checkWindow(): void {
    if (!this.to) return;
    this.meta.checkWindow(this.to).subscribe({
      next: (r: any) => { this.windowInfo = r; }
    });
  }
}
