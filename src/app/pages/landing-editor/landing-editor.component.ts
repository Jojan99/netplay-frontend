import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LandingAdminService } from '../../landing/services/landing-admin.service';

@Component({
  selector: 'app-landing-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="p-6 max-w-5xl mx-auto space-y-8">

  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white">Landing Page</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Personaliza la página de inicio pública de tu empresa
      </p>
    </div>
    <div class="flex items-center gap-3">
      <span *ngIf="saveStatus() === 'saved'"
            class="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        Guardado
      </span>
      <button (click)="save()" [disabled]="saving()"
              class="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600
                     hover:bg-indigo-700 disabled:opacity-50 transition-colors">
        {{ saving() ? 'Guardando...' : 'Guardar cambios' }}
      </button>
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex gap-1 border-b border-gray-200 dark:border-gray-700">
    <button *ngFor="let tab of tabs" (click)="activeTab.set(tab.id)"
            class="px-4 py-2.5 text-sm font-medium rounded-t-xl transition-colors"
            [class.bg-white]="activeTab() === tab.id"
            [class.dark:bg-gray-800]="activeTab() === tab.id"
            [class.text-indigo-600]="activeTab() === tab.id"
            [class.border-b-2]="activeTab() === tab.id"
            [class.border-indigo-600]="activeTab() === tab.id"
            [class.text-gray-500]="activeTab() !== tab.id"
            [class.dark:text-gray-400]="activeTab() !== tab.id">
      {{ tab.label }}
    </button>
  </div>

  <div *ngIf="loading()" class="py-20 text-center text-gray-400">
    Cargando configuración...
  </div>

  <!-- TAB: Apariencia -->
  <div *ngIf="!loading() && activeTab() === 'branding'" class="space-y-6">
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-5">
      <h2 class="font-bold text-gray-900 dark:text-white">Colores y marca</h2>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color primario</label>
          <div class="flex items-center gap-2">
            <input type="color" [(ngModel)]="cfg.primary_color"
                   class="w-10 h-10 rounded-lg border-0 cursor-pointer p-0.5">
            <input type="text" [(ngModel)]="cfg.primary_color"
                   class="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                          bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-white">
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color secundario</label>
          <div class="flex items-center gap-2">
            <input type="color" [(ngModel)]="cfg.secondary_color"
                   class="w-10 h-10 rounded-lg border-0 cursor-pointer p-0.5">
            <input type="text" [(ngModel)]="cfg.secondary_color"
                   class="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                          bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-white">
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color de acento</label>
          <div class="flex items-center gap-2">
            <input type="color" [(ngModel)]="cfg.accent_color"
                   class="w-10 h-10 rounded-lg border-0 cursor-pointer p-0.5">
            <input type="text" [(ngModel)]="cfg.accent_color"
                   class="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                          bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-white">
          </div>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL del logo</label>
        <input type="url" [(ngModel)]="cfg.logo_url" placeholder="https://..."
               class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                      bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
        <img *ngIf="cfg.logo_url" [src]="cfg.logo_url" alt="Preview" class="mt-2 h-10 object-contain rounded">
      </div>
    </div>

    <!-- Publicación -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
      <h2 class="font-bold text-gray-900 dark:text-white mb-4">Publicación</h2>
      <label class="flex items-center gap-3 cursor-pointer">
        <div class="relative">
          <input type="checkbox" [(ngModel)]="cfg.is_published" class="sr-only peer">
          <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-indigo-600 transition-colors"></div>
          <div class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
        </div>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ cfg.is_published ? 'Landing publicada (visible al público)' : 'Landing oculta (solo admins)' }}
        </span>
      </label>
    </div>
  </div>

  <!-- TAB: Hero -->
  <div *ngIf="!loading() && activeTab() === 'hero'" class="space-y-6">
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
      <h2 class="font-bold text-gray-900 dark:text-white">Sección principal (Hero)</h2>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título principal</label>
        <input type="text" [(ngModel)]="cfg.hero_title" placeholder="Internet de alta velocidad"
               class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                      bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subtítulo</label>
        <textarea [(ngModel)]="cfg.hero_subtitle" rows="2" placeholder="Conectividad rápida, estable..."
                  class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                         bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white resize-none"></textarea>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Texto del botón CTA</label>
          <input type="text" [(ngModel)]="cfg.hero_cta_text" placeholder="Ver planes"
                 class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                        bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL del botón CTA</label>
          <input type="text" [(ngModel)]="cfg.hero_cta_url" placeholder="#planes"
                 class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                        bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL imagen hero</label>
        <input type="url" [(ngModel)]="cfg.hero_image_url" placeholder="https://..."
               class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                      bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color de fondo hero (CSS)</label>
        <input type="text" [(ngModel)]="cfg.hero_bg_color"
               placeholder="linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
               class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                      bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-white">
      </div>
    </div>
  </div>

  <!-- TAB: Contacto -->
  <div *ngIf="!loading() && activeTab() === 'contact'" class="space-y-6">
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
      <h2 class="font-bold text-gray-900 dark:text-white">Información de contacto</h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">WhatsApp</label>
          <input type="text" [(ngModel)]="cfg.contact_whatsapp" placeholder="573001234567"
                 class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                        bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
          <p class="text-xs text-gray-400 mt-1">Sin + ni espacios. Ej: 573001234567</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
          <input type="text" [(ngModel)]="cfg.contact_phone" placeholder="6016001234"
                 class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                        bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
          <input type="email" [(ngModel)]="cfg.contact_email" placeholder="info@empresa.com"
                 class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                        bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección</label>
          <input type="text" [(ngModel)]="cfg.contact_address" placeholder="Cra 10 #20-30, Bogotá"
                 class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                        bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
        </div>
      </div>
    </div>

    <!-- SEO -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
      <h2 class="font-bold text-gray-900 dark:text-white">SEO</h2>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título de la página (meta title)</label>
        <input type="text" [(ngModel)]="cfg.meta_title" placeholder="Mi ISP — Internet rápido"
               class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                      bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
      </div>
    </div>
  </div>

  <!-- TAB: Secciones -->
  <div *ngIf="!loading() && activeTab() === 'sections'" class="space-y-4">
    <div *ngFor="let sec of sections(); let i = index"
         class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm flex items-center gap-4">

      <!-- Drag handle (cosmetic) -->
      <div class="text-gray-300 dark:text-gray-600 cursor-grab">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
        </svg>
      </div>

      <!-- Type badge -->
      <span class="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 uppercase">
        {{ sec.type }}
      </span>

      <!-- Title -->
      <input type="text" [(ngModel)]="sec.title" placeholder="Título de la sección (opcional)"
             class="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
                    bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white">

      <!-- Visible toggle -->
      <label class="flex items-center gap-2 cursor-pointer flex-shrink-0">
        <div class="relative">
          <input type="checkbox" [(ngModel)]="sec.is_visible" class="sr-only peer">
          <div class="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-indigo-600 transition-colors"></div>
          <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
        </div>
        <span class="text-xs text-gray-500 dark:text-gray-400">Visible</span>
      </label>

      <!-- Move up/down -->
      <div class="flex gap-1">
        <button (click)="moveSection(i, -1)" [disabled]="i === 0"
                class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200
                       hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
          </svg>
        </button>
        <button (click)="moveSection(i, 1)" [disabled]="i === sections().length - 1"
                class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200
                       hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
      </div>

      <!-- Save section -->
      <button (click)="saveSection(sec)"
              class="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600
                     hover:bg-indigo-700 transition-colors flex-shrink-0">
        Guardar
      </button>
    </div>

    <!-- Add section -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Agregar sección</h3>
      <div class="flex flex-wrap gap-2">
        <button *ngFor="let type of sectionTypes"
                (click)="addSection(type)"
                class="px-4 py-2 rounded-xl text-sm font-medium border-2 border-dashed
                       border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400
                       hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
          + {{ type }}
        </button>
      </div>
    </div>
  </div>

  <!-- Preview link -->
  <div *ngIf="!loading() && companySlug()"
       class="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-4 flex items-center justify-between">
    <div>
      <p class="text-sm font-medium text-indigo-900 dark:text-indigo-300">Vista previa de tu landing</p>
      <p class="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">/p/{{ companySlug() }}</p>
    </div>
    <a [href]="'/p/' + companySlug()" target="_blank"
       class="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
      Abrir
    </a>
  </div>

</div>
  `,
})
export class LandingEditorComponent implements OnInit {
  private svc = inject(LandingAdminService);

  loading   = signal(true);
  saving    = signal(false);
  saveStatus = signal<'idle' | 'saved' | 'error'>('idle');
  sections  = signal<any[]>([]);
  companySlug = signal<string>('');
  activeTab = signal('branding');

  tabs = [
    { id: 'branding',  label: 'Apariencia' },
    { id: 'hero',      label: 'Hero' },
    { id: 'contact',   label: 'Contacto & SEO' },
    { id: 'sections',  label: 'Secciones' },
  ];

  sectionTypes = ['hero', 'plans', 'features', 'faq', 'contact'];

  cfg: any = {
    primary_color:   '#4f46e5',
    secondary_color: '#7c3aed',
    accent_color:    '#06b6d4',
    hero_cta_text:   'Ver planes',
    is_published:    false,
  };

  ngOnInit() {
    this.svc.getConfig().subscribe({
      next: (res: any) => {
        const d = res.data ?? res;
        if (d.config) {
          Object.assign(this.cfg, d.config);
        }
        this.companySlug.set(d.company?.slug || '');
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.svc.getSections().subscribe({
      next: (res: any) => {
        const arr = res.data ?? res;
        this.sections.set(Array.isArray(arr) ? arr : []);
      },
    });
  }

  save() {
    this.saving.set(true);
    this.svc.saveConfig(this.cfg).subscribe({
      next: () => {
        this.saving.set(false);
        this.saveStatus.set('saved');
        setTimeout(() => this.saveStatus.set('idle'), 3000);
      },
      error: () => {
        this.saving.set(false);
        this.saveStatus.set('error');
      },
    });
  }

  saveSection(sec: any) {
    if (sec.id) {
      this.svc.updateSection(sec.id, sec).subscribe();
    }
    // After reorder, save order too
    const order = this.sections().map(s => s.id);
    this.svc.reorderSections(order).subscribe();
  }

  moveSection(index: number, dir: number) {
    const arr = [...this.sections()];
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    this.sections.set(arr);
    this.svc.reorderSections(arr.map(s => s.id)).subscribe();
  }

  addSection(type: string) {
    this.svc.createSection({
      type,
      title: null,
      sort_order: this.sections().length + 1,
      is_visible: true,
      content: {},
      styles: {},
    }).subscribe({
      next: (res: any) => this.sections.set([...this.sections(), res]),
    });
  }
}
