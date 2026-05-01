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
import { RouterModule, RouterOutlet, Router } from '@angular/router';

import { FooterComponent }           from '../footer/footer.component';
import { SidebarComponent }          from '../../common/sidebar.component';
import { SidebarItemGroupComponent } from '../../common/sidebar-item-group.component';
import { SidebarItemComponent }      from '../../common/sidebar-item.component';
import { DarkThemeToggleComponent }  from '../../common/dark-theme-toggle.component';
import { NavbarComponent }           from '../../common/navbar.component';
import { SidebarService }            from '../../common/services/sidebar';
import { components, RouteProps }    from '../../common/components';
import { AuthService }               from '../../services/auth.service';
import { CompanyService }            from '../../services/company.service';
import { ToastService }             from '../../services/toast.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterModule,
    SidebarComponent, SidebarItemGroupComponent, SidebarItemComponent,
    DarkThemeToggleComponent, NavbarComponent, FooterComponent,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent implements OnInit {

  @ViewChild('dropdownMenu')   dropdownMenu!:   ElementRef;
  @ViewChild('dropdownButton') dropdownButton!: ElementRef;

  private platformId = inject(PLATFORM_ID);

  selectedItem: any;
  isDropdownVisible = false;
  dropdownPosition  = { top: 0, left: 0 };
  isLoadingModules  = true;

  companyName = '';
  companyLogo = '';
  username    = '';
  roleName    = '';
  filteredComponents: RouteProps[] = [];

  constructor(
    readonly sidebarService: SidebarService,
    private cdr:             ChangeDetectorRef,
    private router:          Router,
    private authService:     AuthService,
    private companyService:  CompanyService,
    readonly toastService:   ToastService,
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (window.innerWidth < 768) {
      this.sidebarService.setCollapsed(true);
    }

    const user = this.authService.getUser();
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    this.companyName = user.company_name || '';
    this.companyLogo = user.company_logo || '';
    this.username    = user.username || '';
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
      return;
    }

    const isAllowed = (key: string) =>
      allowedModules.some(m => key === m || key.toLowerCase().startsWith(m.toLowerCase() + '/'));

    const filtered = components
      .map(item => {
        if (item.group && item.children) {
          const filteredChildren = item.children.filter(child => {
            const key = child.module || '';
            return key && isAllowed(key);
          });
          if (filteredChildren.length === 0) return null;
          return { ...item, children: filteredChildren };
        }
        const key = item.module || item.href || '';
        if (!key || !isAllowed(key)) return null;
        return item;
      })
      .filter((item): item is RouteProps => item !== null);

    this.filteredComponents = filtered;

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