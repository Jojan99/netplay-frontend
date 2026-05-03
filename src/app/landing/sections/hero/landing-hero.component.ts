import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LandingConfig } from '../../services/landing.service';

@Component({
  selector: 'app-landing-hero',
  standalone: true,
  imports: [CommonModule],
  template: `
<section id="inicio" class="relative overflow-hidden"
         [style.background]="config.hero_bg_color || 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)'">

  <!-- Fondo decorativo -->
  <div class="absolute inset-0 opacity-10">
    <div class="absolute top-0 right-0 w-96 h-96 rounded-full translate-x-1/3 -translate-y-1/3"
         style="background: white"></div>
    <div class="absolute bottom-0 left-0 w-72 h-72 rounded-full -translate-x-1/3 translate-y-1/3"
         style="background: white"></div>
  </div>

  <div class="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

      <!-- Texto -->
      <div class="text-white">
        <h1 class="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
          {{ config.hero_title || 'Internet de alta velocidad' }}
        </h1>
        <p class="text-lg md:text-xl opacity-90 mb-8 leading-relaxed">
          {{ config.hero_subtitle || 'Conectividad rápida, estable y confiable para tu hogar y empresa.' }}
        </p>
        <div class="flex flex-wrap gap-4">
          <a [href]="config.hero_cta_url || '#planes'"
             class="inline-flex items-center gap-2 px-8 py-4 bg-white font-bold rounded-2xl shadow-lg
                    hover:shadow-xl hover:-translate-y-0.5 transition-all text-base"
             [style.color]="config.primary_color">
            {{ config.hero_cta_text || 'Ver planes' }}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </a>
          <a *ngIf="config.contact_whatsapp"
             [href]="'https://wa.me/' + config.contact_whatsapp"
             target="_blank"
             class="inline-flex items-center gap-2 px-8 py-4 bg-white/20 text-white font-bold rounded-2xl
                    border-2 border-white/40 hover:bg-white/30 transition-all text-base backdrop-blur-sm">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </a>
        </div>
      </div>

      <!-- Imagen o ilustración -->
      <div class="flex justify-center">
        <img *ngIf="config.hero_image_url" [src]="config.hero_image_url" alt="Hero"
             class="rounded-3xl shadow-2xl max-h-80 object-cover w-full">
        <div *ngIf="!config.hero_image_url"
             class="w-72 h-72 bg-white/10 rounded-3xl flex items-center justify-center backdrop-blur-sm border border-white/20">
          <svg class="w-32 h-32 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
          </svg>
        </div>
      </div>

    </div>
  </div>

  <!-- Wave bottom -->
  <div class="absolute bottom-0 left-0 right-0">
    <svg viewBox="0 0 1440 60" preserveAspectRatio="none" class="w-full h-8 md:h-12 fill-gray-50 dark:fill-gray-900">
      <path d="M0,60 C360,0 1080,60 1440,20 L1440,60 Z"/>
    </svg>
  </div>
</section>
  `,
})
export class LandingHeroComponent {
  @Input() config!: LandingConfig;
}
