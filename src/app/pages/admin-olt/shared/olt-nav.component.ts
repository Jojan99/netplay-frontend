import { AfterViewInit, Component, DestroyRef, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

/** Navegación común del módulo OLT: misma barra en todas sus pantallas. */
@Component({
  selector: 'app-olt-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="np-seg np-olt-nav" aria-label="Secciones OLT" [class.al-final]="alFinal" (scroll)="medir($event.target)">
      <a *ngFor="let l of links" [routerLink]="l.path" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: l.exact }">{{ l.label }}</a>
    </nav>
  `,
  styles: [`
    :host { display: block; min-width: 0; max-width: 100%; }
    .np-olt-nav { max-width: 100%; overflow-x: auto; scrollbar-width: none; scroll-snap-type: x proximity; }
    .np-olt-nav::-webkit-scrollbar { display: none; }
    .np-olt-nav a { display: inline-flex; align-items: center; height: 32px; padding: 0 11px; font-size: 12px; font-weight: 700; color: var(--text-2); border-right: 1px solid var(--line-strong); text-decoration: none; white-space: nowrap; scroll-snap-align: start; }
    .np-olt-nav a:last-child { border-right: 0; }
    .np-olt-nav a:hover { background: var(--surface-3); }
    .np-olt-nav a.is-active { background: var(--text); color: var(--bg); }

    /* En el teléfono son catorce secciones en una fila: se desplaza con el
       dedo, cada una del alto de un dedo, y un degradado avisa que hay más. */
    @media (max-width: 760px) {
      :host { flex: 1 1 100%; }
      .np-olt-nav { display: flex; width: 100%; -webkit-mask-image: linear-gradient(90deg, #000 85%, transparent); mask-image: linear-gradient(90deg, #000 85%, transparent); }
      .np-olt-nav a { height: 42px; padding: 0 14px; font-size: 13px; }
      .np-olt-nav a:last-child { margin-right: 8px; }
      /* Al final no queda nada por ver: sin degradado, la última no se tapa. */
      .np-olt-nav.al-final { -webkit-mask-image: none; mask-image: none; }
    }
  `],
})
export class OltNavComponent implements AfterViewInit {
  private host = inject(ElementRef<HTMLElement>);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly links = [
    { path: '/dashboard/olt',               label: 'OLTs',          exact: true },
    { path: '/dashboard/olt/dashboard',     label: 'Estado',        exact: false },
    { path: '/dashboard/olt/alertas',       label: 'Avisos',        exact: false },
    { path: '/dashboard/olt/autorizadas',   label: 'Autorizadas',   exact: false },
    { path: '/dashboard/olt/sin-autorizar', label: 'Sin autorizar', exact: false },
    { path: '/dashboard/olt/online',        label: 'En línea',      exact: false },
    { path: '/dashboard/olt/service-ports', label: 'Service ports', exact: false },
    { path: '/dashboard/olt/vinculos',      label: 'Vincular',      exact: false },
    { path: '/dashboard/olt/perfiles',      label: 'Perfiles',      exact: false },
    { path: '/dashboard/olt/vpn',           label: 'VPN',           exact: false },
    { path: '/dashboard/olt/tr069',         label: 'TR-069',        exact: false },
    { path: '/dashboard/olt/acceso-remoto', label: 'Acceso remoto', exact: false },
    { path: '/dashboard/olt/config',        label: 'Configuración', exact: false },
    { path: '/dashboard/olt/cli',           label: 'CLI',           exact: false },
  ];

  /**
   * En el teléfono la sección actual puede quedar fuera de la vista (CLI es
   * la última de catorce): se desplaza la barra hasta dejarla a la vista.
   */
  ngAfterViewInit(): void {
    this.mostrarActiva();
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.mostrarActiva());
  }

  /** La barra llegó al final: se quita el aviso de que hay más a la derecha. */
  alFinal = false;

  medir(nav: EventTarget | null): void {
    const el = nav as HTMLElement | null;
    if (!el) return;
    this.alFinal = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
  }

  private mostrarActiva(): void {
    setTimeout(() => {
      const nav = this.host.nativeElement.querySelector('.np-olt-nav') as HTMLElement | null;
      const activa = nav?.querySelector('a.is-active') as HTMLElement | null;
      if (!nav || !activa) return;
      // Posición real dentro de la barra: offsetLeft se mide contra otro
      // contenedor y la desplazaba de más, cortando el nombre de la sección.
      const destino = nav.scrollLeft + activa.getBoundingClientRect().left - nav.getBoundingClientRect().left - 16;
      nav.scrollTo({ left: Math.max(0, destino), behavior: 'auto' });
      this.medir(nav);
    });
  }
}
