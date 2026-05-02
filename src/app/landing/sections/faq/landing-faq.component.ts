import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LandingConfig } from '../../services/landing.service';

const DEFAULT_FAQS = [
  { q: '¿Cuánto tarda la instalación?', a: 'El proceso de instalación tarda entre 1 y 3 días hábiles después de contratar. Nuestros técnicos coordinan contigo la visita.' },
  { q: '¿Hay permanencia mínima?',       a: 'No exigimos contratos de permanencia. Puedes cancelar el servicio cuando quieras sin penalización.' },
  { q: '¿El router está incluido?',      a: 'Sí, el router WiFi de última generación está incluido en todos nuestros planes. Es en comodato mientras tengas el servicio activo.' },
  { q: '¿Qué pasa si tengo problemas?',  a: 'Contamos con soporte técnico 24/7. Puedes contactarnos por WhatsApp, teléfono o abrir un ticket desde tu portal de cliente.' },
  { q: '¿El precio incluye IVA?',        a: 'Sí, todos los precios mostrados son con IVA incluido. No hay costos ocultos.' },
];

@Component({
  selector: 'app-landing-faq',
  standalone: true,
  imports: [CommonModule],
  template: `
<section id="faq" class="py-20 bg-white dark:bg-gray-800">
  <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

    <div class="text-center mb-14">
      <h2 class="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">
        {{ section?.title || 'Preguntas frecuentes' }}
      </h2>
      <p class="text-lg text-gray-500 dark:text-gray-400">
        {{ section?.content?.subtitle || 'Todo lo que necesitas saber' }}
      </p>
    </div>

    <div class="space-y-3">
      <div *ngFor="let item of faqs; let i = index"
           class="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">

        <!-- Question -->
        <button (click)="toggle(i)"
                class="w-full flex items-center justify-between gap-4 px-6 py-5 text-left
                       bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
          <span class="font-semibold text-gray-900 dark:text-white text-sm md:text-base">
            {{ item.q }}
          </span>
          <span class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-transform"
                [style.background]="config.primary_color + '20'"
                [class.rotate-45]="openIndex() === i">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 [style.color]="config.primary_color">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
            </svg>
          </span>
        </button>

        <!-- Answer -->
        <div *ngIf="openIndex() === i"
             class="px-6 pb-5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed
                    border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 pt-4">
          {{ item.a }}
        </div>

      </div>
    </div>

  </div>
</section>
  `,
})
export class LandingFaqComponent {
  @Input() config!: LandingConfig;
  @Input() section: any;

  openIndex = signal<number | null>(null);

  toggle(i: number) {
    this.openIndex.set(this.openIndex() === i ? null : i);
  }

  get faqs(): any[] {
    return this.section?.content?.faqs?.length
      ? this.section.content.faqs
      : DEFAULT_FAQS;
  }
}
