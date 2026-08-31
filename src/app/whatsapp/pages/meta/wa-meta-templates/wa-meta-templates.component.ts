import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

@Component({
  selector: 'app-wa-meta-templates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-7xl mx-auto mt-8 p-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Plantillas (Templates)</h1>
      <div *ngIf="loading" class="animate-pulse space-y-4">
        <div *ngFor="let i of [1,2,3]" class="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      </div>
      <div *ngIf="!loading" class="space-y-3">
        <div *ngFor="let t of templates" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{{ t.name }}</p>
            <p class="text-sm text-gray-500">{{ t.language }} — {{ t.status }}</p>
          </div>
          <span class="px-2 py-1 text-xs rounded-full" [ngClass]="t.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'">{{ t.status }}</span>
        </div>
        <div *ngIf="templates.length === 0" class="text-center text-gray-500 py-8">No hay plantillas creadas.</div>
      </div>
    </div>
  `
})
export class WaMetaTemplatesComponent implements OnInit {
  loading = true;
  templates: any[] = [];

  constructor(private meta: MetaWhatsappService) {}

  ngOnInit(): void {
    this.meta.getTemplates().subscribe({
      next: (r: any) => { this.templates = r.data || []; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
}
