import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

@Component({
  selector: 'app-wa-meta-phone',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-7xl mx-auto mt-8 p-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Información del Número</h1>
      <div *ngIf="loading" class="animate-pulse space-y-4">
        <div class="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      </div>
      <div *ngIf="!loading && phoneInfo" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><span class="text-sm text-gray-500">Número:</span> <span class="font-medium">{{ phoneInfo.display_phone_number || phoneInfo.phone_number }}</span></div>
          <div><span class="text-sm text-gray-500">Nombre verificado:</span> <span class="font-medium">{{ phoneInfo.verified_name }}</span></div>
          <div><span class="text-sm text-gray-500">Calidad:</span> <span class="font-medium">{{ phoneInfo.quality_rating }}</span></div>
          <div><span class="text-sm text-gray-500">Modo:</span> <span class="font-medium">{{ phoneInfo.account_mode }}</span></div>
        </div>
      </div>
    </div>
  `
})
export class WaMetaPhoneComponent implements OnInit {
  loading = true;
  phoneInfo: any = null;

  constructor(private meta: MetaWhatsappService) {}

  ngOnInit(): void {
    this.meta.getPhoneInfo().subscribe({
      next: (r: any) => { this.phoneInfo = r.data; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
}
