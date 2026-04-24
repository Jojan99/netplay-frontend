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

  // ✅ variables seguras (NO getters)
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
    readonly toastService:   ToastService,
  ) {}

  ngOnInit(): void {
    // ✅ evitar SSR
    if (!isPlatformBrowser(this.platformId)) return;

    // Collapse sidebar by default on mobile
    if (window.innerWidth < 768) {
      this.sidebarService.setCollapsed(true);
    }

    const user = this.authService.getUser();

    if (user) {
      this.companyName = user.company_name || '';
      this.companyLogo = user.company_logo || '';
      this.username    = user.username || '';
      this.roleName    = this.authService.getRoleName();

      this.buildMenu(this.authService.getAllowedModules());
    }
  }

  private buildMenu(allowedModules: string[]) {
    this.filteredComponents = components
      .map(item => ({
        ...item,
        children: item.children?.filter(
          child => !child.module || allowedModules.includes(child.module)
        ),
      }))
      .filter(item =>
        item.children !== undefined
          ? item.children.length > 0
          : (!item.module || allowedModules.includes(item.module))
      );
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