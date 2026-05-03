import { Component, Input } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { LandingConfig, LandingSection } from '../../services/landing.service';

@Component({
  selector: 'app-landing-plans',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
<section id="planes" class="py-20 bg-gray-50 dark:bg-gray-900">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

    <div class="text-center mb-14">
      <h2 class="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">
        {{ section?.title || 'Nuestros Planes' }}
      </h2>
      <p class="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
        {{ section?.content?.subtitle || 'Elige el plan perfecto para ti' }}
      </p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
      <div *ngFor="let plan of plans; let i = index"
           class="relative rounded-3xl overflow-hidden shadow-lg transition-transform hover:-translate-y-1"
           [class.ring-2]="plan.highlighted || i === 1"
           [style.--ring-color]="config.primary_color">

        <!-- Badge destacado -->
        <div *ngIf="plan.highlighted || i === 1"
             class="absolute top-0 left-0 right-0 text-center py-1.5 text-xs font-bold text-white"
             [style.background]="config.primary_color">
          RECOMENDADO
        </div>

        <div class="bg-white dark:bg-gray-800 p-8" [class.pt-10]="plan.highlighted || i === 1">
          <!-- Nombre -->
          <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-1">
            {{ plan.plan_name || plan.name }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {{ plan.description || '' }}
          </p>

          <!-- Precio -->
          <div class="mb-6">
            <span class="text-4xl font-extrabold text-gray-900 dark:text-white">
              &#36;{{ plan.monthly_price | number:'1.0-0' }}
            </span>
            <span class="text-gray-500 dark:text-gray-400 text-sm ml-1">/mes</span>
          </div>


          <!-- Velocidades -->
          <div class="flex gap-4 mb-6">
            <div class="flex-1 rounded-xl py-3 px-4 text-center"
                 [style.background]="config.primary_color + '15'">
              <div class="text-lg font-bold" [style.color]="config.primary_color">
                {{ plan.download_speed }} Mbps
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Descarga</div>
            </div>
            <div class="flex-1 rounded-xl py-3 px-4 text-center"
                 [style.background]="config.secondary_color + '15'">
              <div class="text-lg font-bold" [style.color]="config.secondary_color">
                {{ plan.upload_speed }} Mbps
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Subida</div>
            </div>
          </div>

          <!-- Features del plan -->
          <ul class="space-y-2 mb-8">
            <li *ngFor="let feat of getPlanFeatures(plan)"
                class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                   [style.color]="config.primary_color">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
              </svg>
              {{ feat }}
            </li>
          </ul>

          <!-- CTA -->
          <a [href]="config.contact_whatsapp ? 'https://wa.me/' + config.contact_whatsapp + '?text=' + getWaText(plan) : '#'"
             target="_blank"
             class="block w-full text-center py-3 px-6 rounded-2xl font-bold text-sm transition-all
                    hover:shadow-lg hover:-translate-y-0.5"
             [style.background]="(plan.highlighted || i === 1) ? config.primary_color : 'transparent'"
             [style.color]="(plan.highlighted || i === 1) ? 'white' : config.primary_color"
             [style.border]="'2px solid ' + config.primary_color">
            Contratar ahora
          </a>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div *ngIf="!plans || plans.length === 0"
         class="text-center py-16 text-gray-400 dark:text-gray-600">
      <svg class="w-16 h-16 mx-auto mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
      </svg>
      <p>No hay planes disponibles</p>
    </div>

  </div>
</section>
  `,
})
export class LandingPlansComponent {
  @Input() config!: LandingConfig;
  @Input() section: any;
  @Input() plans: any[] = [];

  getPlanFeatures(plan: any): string[] {
    if (plan.features && Array.isArray(plan.features)) return plan.features;
    const feats: string[] = [];
    feats.push('Fibra óptica');
    if (plan.download_speed >= 100) feats.push('Alta velocidad');
    feats.push('Soporte 24/7');
    feats.push('Sin contratos de permanencia');
    return feats;
  }

  getWaText(plan: any): string {
    return encodeURIComponent(`Hola, me interesa el plan ${plan.plan_name || plan.name} de ${plan.download_speed}/${plan.upload_speed} Mbps a $${plan.monthly_price}/mes`);
  }
}
