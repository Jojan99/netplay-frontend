import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LandingConfig, LandingSection } from '../../services/landing.service';

const DEFAULT_FEATURES = [
  { icon: 'bolt',    title: 'Alta velocidad',     desc: 'Conexión de fibra óptica con velocidades simétricas garantizadas.' },
  { icon: 'shield',  title: 'Estabilidad 99.9%',  desc: 'Infraestructura redundante para mantener tu conexión siempre activa.' },
  { icon: 'support', title: 'Soporte 24/7',        desc: 'Técnicos disponibles en cualquier momento para resolver tus problemas.' },
  { icon: 'router',  title: 'Equipo incluido',     desc: 'Router WiFi de última generación incluido en todos los planes.' },
  { icon: 'lock',    title: 'IP fija opcional',    desc: 'Obtén una dirección IP fija para tus servicios y aplicaciones.' },
  { icon: 'chart',   title: 'Sin límite de datos', desc: 'Navega, transmite y trabaja sin preocuparte por límites de consumo.' },
];

@Component({
  selector: 'app-landing-features',
  standalone: true,
  imports: [CommonModule],
  template: `
<section id="caracteristicas" class="py-20 bg-white dark:bg-gray-800">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

    <div class="text-center mb-14">
      <h2 class="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">
        {{ section?.title || '¿Por qué elegirnos?' }}
      </h2>
      <p class="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
        {{ section?.content?.subtitle || 'Internet diseñado para personas que exigen lo mejor' }}
      </p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
      <div *ngFor="let feat of features"
           class="group p-6 rounded-2xl border border-gray-100 dark:border-gray-700
                  hover:shadow-xl transition-all hover:-translate-y-1 cursor-default">

        <!-- Icono -->
        <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
             [style.background]="config.primary_color + '20'">
          <ng-container [ngSwitch]="feat.icon">
            <!-- bolt -->
            <svg *ngSwitchCase="'bolt'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 [style.color]="config.primary_color">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            <!-- shield -->
            <svg *ngSwitchCase="'shield'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 [style.color]="config.primary_color">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            <!-- support -->
            <svg *ngSwitchCase="'support'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 [style.color]="config.primary_color">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>
            </svg>
            <!-- router -->
            <svg *ngSwitchCase="'router'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 [style.color]="config.primary_color">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
            </svg>
            <!-- lock -->
            <svg *ngSwitchCase="'lock'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 [style.color]="config.primary_color">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <!-- chart / default -->
            <svg *ngSwitchDefault class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 [style.color]="config.primary_color">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          </ng-container>
        </div>

        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">{{ feat.title }}</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{{ feat.desc }}</p>
      </div>
    </div>

  </div>
</section>
  `,
})
export class LandingFeaturesComponent {
  @Input() config!: LandingConfig;
  @Input() section: any;

  get features(): any[] {
    return this.section?.content?.features?.length
      ? this.section.content.features
      : DEFAULT_FEATURES;
  }
}
