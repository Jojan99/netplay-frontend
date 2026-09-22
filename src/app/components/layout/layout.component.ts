import {
  Component,
  ViewChild,
  ElementRef,
  HostListener,
  ChangeDetectorRef,
  OnInit,
  inject,
  PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { RouterModule, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CrmWidgetComponent } from '../../crm/components/crm-widget/crm-widget.component';
import { DialogHostComponent } from '../dialog-host/dialog-host.component';
import { TeamPanelComponent } from '../../crm/components/team-panel/team-panel.component';
import { LocationTrackerService } from '../../services/location-tracker.service';
import { filter } from 'rxjs/operators';

import { FooterComponent }           from '../footer/footer.component';
import { SidebarComponent }          from '../../common/sidebar.component';
import { SidebarItemGroupComponent } from '../../common/sidebar-item-group.component';
import { SidebarItemComponent }      from '../../common/sidebar-item.component';
import { DarkThemeToggleComponent }  from '../../common/dark-theme-toggle.component';
import { SanitizeHtmlPipe }          from '../../common/pipes';
import { NavbarComponent }           from '../../common/navbar.component';
import { SidebarService }            from '../../common/services/sidebar';
import { components, RouteProps }    from '../../common/components';
import { AuthService }               from '../../services/auth.service';
import { CompanyService }            from '../../services/company.service';
import { ToastService }             from '../../services/toast.service';
import { OauthService }             from '../../services/oauth.service';
import { TareasFlotantesComponent } from '../tareas-flotantes/tareas-flotantes.component';
import { CobranzaBurbujaComponent } from '../cobranza-burbuja/cobranza-burbuja.component';
import { AtajosService, ICONOS }    from '../../services/atajos.service';
import { NovedadesService }         from '../../services/novedades.service';
import { TareasEnSegundoPlanoService } from '../../services/tareas-en-segundo-plano.service';
import { BuscadorRapidoComponent }  from '../atajos/buscador-rapido.component';
import { VentanasRapidasComponent, MenuDeVentanasComponent } from '../atajos/ventanas-rapidas.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterModule,
    SidebarComponent, SidebarItemGroupComponent, SidebarItemComponent,
    DarkThemeToggleComponent, NavbarComponent, FooterComponent, CrmWidgetComponent, DialogHostComponent, TeamPanelComponent,
    SanitizeHtmlPipe, TareasFlotantesComponent, CobranzaBurbujaComponent,
    BuscadorRapidoComponent, VentanasRapidasComponent, MenuDeVentanasComponent,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent implements OnInit {

  @ViewChild('dropdownMenu')   dropdownMenu!:   ElementRef;
  @ViewChild('dropdownButton') dropdownButton!: ElementRef;

  private platformId = inject(PLATFORM_ID);
  private oauth = inject(OauthService);
  /** Favoritos, buscador Ctrl+K y ventanas rápidas (sólo en pantallas grandes). */
  readonly atajos = inject(AtajosService);
  private tareasSegundoPlano = inject(TareasEnSegundoPlanoService);
  readonly iconos = ICONOS;

  alternarFavorito(item: RouteProps): void {
    if (!item.href) return;
    const quedo = this.atajos.alternarFavorito(item.href);
    this.toastService.info(quedo ? `${item.title} quedó en tus atajos` : `${item.title} salió de tus atajos`);
  }

  /* ── Novedades ─────────────────────────────────────────────────────────
     Lo que Netvula le cuenta a la empresa. La campana venía siendo un botón
     muerto con el puntito siempre encendido: ahora el puntito sale sólo si
     hay algo sin leer, y al abrir la lista deja de ser nuevo. */
  private novedadesSvc = inject(NovedadesService);
  novedades: any[] = [];
  novedadesSinVer = 0;
  novedadesAbiertas = false;
  cargandoNovedades = false;

  verNovedades(): void {
    this.novedadesAbiertas = !this.novedadesAbiertas;

    if (!this.novedadesAbiertas) return;

    this.cargandoNovedades = true;
    this.novedadesSvc.lista().subscribe({
      next: (r: any) => {
        this.cargandoNovedades = false;
        this.novedades = r?.data?.novedades ?? [];
        // Se marcan vistas al abrir, no al cerrar: si el usuario se distrae y
        // cambia de pantalla, igual las vio.
        if (this.novedadesSinVer) {
          this.novedadesSinVer = 0;
          this.novedadesSvc.vistas().subscribe({ error: () => {} });
        }
        this.cdr.detectChanges();
      },
      error: () => { this.cargandoNovedades = false; this.cdr.detectChanges(); },
    });
  }

  /** Una novedad puede llevar a la pantalla de la que habla. */
  abrirNovedad(n: any): void {
    this.novedadesAbiertas = false;
    if (n?.ruta) this.router.navigate([n.ruta]);
  }

  /** El puntito del encabezado, sin abrir la lista. */
  private contarNovedades(): void {
    this.novedadesSvc.lista().subscribe({
      next: (r: any) => { this.novedadesSinVer = r?.data?.sin_ver ?? 0; this.cdr.detectChanges(); },
      error: () => {},
    });
  }

  selectedItem: any;
  isDropdownVisible = false;
  dropdownPosition  = { top: 0, left: 0 };
  isLoadingModules  = true;

  companyName = '';
  companyLogo = '';
  username    = '';
  /** Nombre de la persona para mostrar; la cédula si no hay. */
  nombre      = '';
  roleName    = '';
  filteredComponents: RouteProps[] = [];
  /** El widget flotante de WhatsApp sólo para quienes tienen el módulo CRM en el menú. */
  get hasCrm(): boolean { return this.filteredComponents.some((c: any) => JSON.stringify(c).includes('crm')); }

  /** La cobranza es de finanzas: sólo la ve quien tiene ese módulo. */
  hasFinanzas = false;
  currentGroup = '';
  currentSection = '';
  now = new Date();
  private clockTimer: any;

  private updateSection(url: string): void {
    const clean = url.split('?')[0];
    let group = '', section = '';
    for (const item of this.filteredComponents) {
      if (item.group && item.children) {
        const child = item.children.find(c => c.href && clean.startsWith(c.href));
        if (child) { group = item.title; section = child.title; break; }
      } else if (item.href && clean.startsWith(item.href)) { group = 'Operación'; section = item.title; break; }
    }
    this.currentGroup = group;
    this.currentSection = section;
  }

  constructor(
    readonly sidebarService: SidebarService,
    private cdr:             ChangeDetectorRef,
    private router:          Router,
    private authService:     AuthService,
    private companyService:  CompanyService,
    readonly toastService:   ToastService,
    private locationTracker: LocationTrackerService,
  ) {}

  ngOnInit(): void {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.updateSection(e.urlAfterRedirects || e.url);
      // En celular el menú tapa toda la pantalla: al elegir una opción se
      // cierra. Si quedaba abierto, la página nueva cargaba debajo sin verse.
      if (isPlatformBrowser(this.platformId) && window.innerWidth < 768) {
        this.sidebarService.setCollapsed(true);
      }
    });
    if (isPlatformBrowser(this.platformId)) this.clockTimer = setInterval(() => { this.now = new Date(); }, 30000);
    if (isPlatformBrowser(this.platformId)) this.contarNovedades();
    if (!isPlatformBrowser(this.platformId)) return;
    // Los técnicos comparten ubicación mientras tengan el panel abierto (también al recargar, no sólo al iniciar sesión)
    this.locationTracker.startTrackingIfTechnician();

    if (window.innerWidth < 768) {
      this.sidebarService.setCollapsed(true);
    }

    const user = this.authService.getUser();
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    // Las tareas en segundo plano y las ventanas rápidas son de cada empresa y
    // usuario: al entrar con otra cuenta se cargan las suyas, no las anteriores.
    this.tareasSegundoPlano.recargarSesion();
    this.atajos.recargarSesion();

    this.companyName = user.company_name || '';
    this.companyLogo = user.company_logo || '';
    this.username    = user.username || '';
    this.nombre      = this.authService.getNombre();

    // Las sesiones abiertas antes de este cambio no traían el nombre: se pide
    // una vez y queda guardado.
    if (!user.nombre) {
      this.oauth.getMe().subscribe({
        next: (r: any) => {
          const n = `${r?.data?.names ?? ''} ${r?.data?.lastname ?? ''}`.trim();
          if (!n) return;
          this.authService.setNombre(n);
          this.nombre = this.authService.getNombre();
          this.cdr.detectChanges();
        },
      });
    }
    this.roleName    = this.authService.getRoleName();

    // Siempre cargar módulos desde el backend (no confiar en cache entre sesiones)
    this.companyService.getMyModules().subscribe({
      next: (res) => {
        const modules: string[] = res.data ?? [];
        this.authService.setModules(modules);
        this.buildMenu(modules);
        this.isLoadingModules = false;
        this.cdr.detectChanges();
      },
      error: () => {
        // Fallback al cache local si el API falla
        this.buildMenu(this.authService.getAllowedModules());
        this.isLoadingModules = false;
      }
    });
  }

  private buildMenu(allowedModules: string[]): void {
    if (!allowedModules || allowedModules.length === 0) {
      this.filteredComponents = [];
      this.atajos.ponerMenu([]);
      return;
    }

    const isAllowed = (key: string) =>
      allowedModules.some(m => key === m || key.toLowerCase().startsWith(m.toLowerCase() + '/'));

    const filtered = components
      .map(item => {
        if (item.group && item.children) {
          const filteredChildren = item.children.filter(child => {
            // Usar module si existe, si no usar href como clave de módulo
            const key = child.module || child.href || '';
            if (child.soloAdmin && !this.authService.isAdmin()) return false;
            return !key || isAllowed(key);
          });
          if (filteredChildren.length === 0) return null;
          // Si el grupo tiene módulo propio, verificar que esté permitido
          const groupKey = item.module || '';
          if (groupKey && !isAllowed(groupKey)) return null;
          return { ...item, children: filteredChildren };
        }
        const key = item.module || item.href || '';
        if (!key || !isAllowed(key)) return null;
        return item;
      })
      .filter((item): item is RouteProps => item !== null);

    this.filteredComponents = filtered;
    this.hasFinanzas = allowedModules.some(m => m === 'finanzas');
    this.atajos.ponerMenu(filtered);
    this.updateSection(this.router.url);

    // Auto-expandir el grupo de la ruta activa
    const currentUrl = this.router.url;
    this.selectedItem = filtered.find(item =>
      item.group && item.children?.some(c => currentUrl.includes(c.href ?? ''))
    ) ?? null;
  }

  selectItem(item: any): void {
    this.selectedItem = item === this.selectedItem ? null : item;
  }

  toggleDropdown(): void {
    this.isDropdownVisible = !this.isDropdownVisible;
    if (this.isDropdownVisible) this.setPosition();
  }

  setPosition(): void {
    const rect = this.dropdownButton.nativeElement.getBoundingClientRect();
    this.dropdownPosition = { top: rect.bottom, left: rect.left - 180 };
  }

  signOut(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (
      this.isDropdownVisible &&
      !this.dropdownMenu?.nativeElement.contains(event.target) &&
      !this.dropdownButton?.nativeElement.contains(event.target)
    ) {
      this.isDropdownVisible = false;
      this.cdr.detectChanges();
    }
  }
}