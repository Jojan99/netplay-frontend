import { Component, OnInit, OnDestroy, inject, signal, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { LandingService, LandingConfig, LandingSection, LandingData } from './services/landing.service';
import { LandingHeroComponent }     from './sections/hero/landing-hero.component';
import { LandingPlansComponent }    from './sections/plans/landing-plans.component';
import { LandingFeaturesComponent } from './sections/features/landing-features.component';
import { LandingContactComponent }  from './sections/contact/landing-contact.component';
import { LandingFaqComponent }      from './sections/faq/landing-faq.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    LandingHeroComponent, LandingPlansComponent,
    LandingFeaturesComponent, LandingContactComponent, LandingFaqComponent,
  ],
  template: `
<!-- Loading -->
<div *ngIf="loading()" class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
  <div class="text-center">
    <div class="w-12 h-12 border-4 border-gray-200 rounded-full animate-spin mx-auto mb-4"
         [style.border-top-color]="'var(--color-primary, #4f46e5)'"></div>
    <p class="text-gray-500 dark:text-gray-400">Cargando...</p>
  </div>
</div>

<!-- 404 -->
<div *ngIf="!loading() && notFound()"
     class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
  <div class="text-center px-4">
    <div class="text-8xl font-extrabold text-gray-200 dark:text-gray-700 mb-4">404</div>
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Página no encontrada</h1>
    <p class="text-gray-500 dark:text-gray-400">La empresa que buscas no existe o no está disponible.</p>
  </div>
</div>

<!-- Landing content -->
<div *ngIf="!loading() && !notFound() && data()">

  <!-- Navbar -->
  <nav class="sticky top-0 z-50 shadow-sm backdrop-blur-md bg-white/90 dark:bg-gray-900/90">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">

        <!-- Logo / Company name -->
        <a href="#inicio" class="flex items-center gap-2">
          <img *ngIf="data()?.config?.logo_url"
               [src]="data()!.config.logo_url"
               alt="Logo" class="h-8 w-auto object-contain">
          <span *ngIf="!data()?.config?.logo_url"
                class="text-lg font-extrabold" [style.color]="'var(--color-primary)'">
            {{ data()?.company?.name }}
          </span>
        </a>

        <!-- Desktop nav links -->
        <div class="hidden md:flex items-center gap-1">
          <ng-container *ngFor="let item of navItems()">
            <a [href]="item.href || item.url"
               [target]="item.target || '_self'"
               class="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300
                      hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              {{ item.label }}
            </a>
          </ng-container>
        </div>

        <!-- CTA button -->
        <a [href]="data()?.config?.hero_cta_url || '#planes'"
           class="hidden md:inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold
                  text-white shadow-sm hover:shadow-md hover:-translate-y-px transition-all"
           [style.background]="'var(--color-primary)'">
          {{ data()?.config?.hero_cta_text || 'Ver planes' }}
        </a>

        <!-- Mobile menu button -->
        <button (click)="mobileOpen.set(!mobileOpen())"
                class="md:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path *ngIf="!mobileOpen()" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 6h16M4 12h16M4 18h16"/>
            <path *ngIf="mobileOpen()" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>

      </div>
    </div>

    <!-- Mobile menu -->
    <div *ngIf="mobileOpen()" class="md:hidden border-t border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95">
      <div class="px-4 py-3 space-y-1">
        <a *ngFor="let item of navItems()"
           [href]="item.href || item.url" [target]="item.target || '_self'"
           (click)="mobileOpen.set(false)"
           class="block px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300
                  hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          {{ item.label }}
        </a>
        <a [href]="data()?.config?.hero_cta_url || '#planes'"
           (click)="mobileOpen.set(false)"
           class="block text-center px-4 py-2.5 rounded-xl text-sm font-bold text-white mt-2"
           [style.background]="'var(--color-primary)'">
          {{ data()?.config?.hero_cta_text || 'Ver planes' }}
        </a>
      </div>
    </div>
  </nav>

  <!-- Sections -->
  <main>
    <ng-container *ngFor="let section of visibleSections()">

      <app-landing-hero
        *ngIf="section.type === 'hero'"
        [config]="data()!.config">
      </app-landing-hero>

      <app-landing-plans
        *ngIf="section.type === 'plans'"
        [config]="data()!.config"
        [section]="section"
        [plans]="data()!.plans">
      </app-landing-plans>

      <app-landing-features
        *ngIf="section.type === 'features'"
        [config]="data()!.config"
        [section]="section">
      </app-landing-features>

      <app-landing-contact
        *ngIf="section.type === 'contact'"
        [config]="data()!.config"
        [section]="section">
      </app-landing-contact>

      <app-landing-faq
        *ngIf="section.type === 'faq'"
        [config]="data()!.config"
        [section]="section">
      </app-landing-faq>

    </ng-container>
  </main>

  <!-- Footer -->
  <footer class="bg-gray-900 text-gray-400 py-10">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <div class="flex items-center justify-center gap-2 mb-3">
        <img *ngIf="data()?.config?.logo_url"
             [src]="data()!.config.logo_url" alt="Logo" class="h-6 w-auto object-contain opacity-80">
        <span class="text-white font-bold">{{ data()?.company?.name }}</span>
      </div>
      <p class="text-sm">{{ data()?.config?.contact_address }}</p>
      <p class="text-xs mt-4 opacity-60">© {{ year }} {{ data()?.company?.name }}. Todos los derechos reservados.</p>
    </div>
  </footer>

</div>
  `,
})
export class LandingComponent implements OnInit {
  private route    = inject(ActivatedRoute);
  private svc      = inject(LandingService);
  private titleSvc = inject(Title);
  private metaSvc  = inject(Meta);
  private platform = inject(PLATFORM_ID);

  loading  = signal(true);
  notFound = signal(false);
  data     = signal<LandingData | null>(null);
  mobileOpen = signal(false);

  year = new Date().getFullYear();

  navItems() {
    const nav = this.data()?.nav ?? [];
    if (nav.length) return nav;
    // Default nav from visible sections
    const defaults: any[] = [];
    this.visibleSections().forEach(s => {
      if (s.type === 'plans')    defaults.push({ label: 'Planes',    href: '#planes' });
      if (s.type === 'features') defaults.push({ label: 'Nosotros',  href: '#caracteristicas' });
      if (s.type === 'faq')      defaults.push({ label: 'FAQ',       href: '#faq' });
      if (s.type === 'contact')  defaults.push({ label: 'Contacto',  href: '#contacto' });
    });
    return defaults;
  }

  visibleSections() {
    return (this.data()?.sections ?? []).filter(s => s.is_visible);
  }

  ngOnInit() {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.svc.getBySlug(slug).subscribe({
      next: (res: LandingData) => {
        this.data.set(res);
        this.loading.set(false);
        this.applyBranding(res.config);
        this.applyMeta(res);
      },
      error: () => {
        this.loading.set(false);
        this.notFound.set(true);
      },
    });
  }

  private applyBranding(config: LandingConfig) {
    if (!isPlatformBrowser(this.platform)) return;
    const root = document.documentElement;
    root.style.setProperty('--color-primary',   config.primary_color   || '#4f46e5');
    root.style.setProperty('--color-secondary', config.secondary_color || '#7c3aed');
    root.style.setProperty('--color-accent',    config.accent_color    || '#06b6d4');
  }

  private applyMeta(data: LandingData) {
    const title = data.config.meta_title || data.company?.name || 'Internet';
    this.titleSvc.setTitle(title);
    this.metaSvc.updateTag({ name: 'description', content: data.config.hero_subtitle || '' });
  }
}
