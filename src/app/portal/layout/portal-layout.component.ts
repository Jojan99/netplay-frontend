import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { ClientAuthService } from '../services/client-auth.service';
import { ClientApiService }  from '../services/client-api.service';

@Component({
  selector: 'app-portal-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule],
  templateUrl: './portal-layout.component.html',
})
export class PortalLayoutComponent implements OnInit {
  private auth   = inject(ClientAuthService);
  private api    = inject(ClientApiService);
  private router = inject(Router);

  fullName    = signal('');
  companyName = signal('');
  companyLogo = signal('');
  menuOpen    = signal(false);

  ngOnInit(): void {
    const user = this.auth.getUser();
    if (user) {
      this.fullName.set(this.auth.getFullName());
      this.companyName.set(this.auth.getCompanyName());
      this.companyLogo.set(this.auth.getCompanyLogo());
    }
  }

  toggleMenu(): void {
    this.menuOpen.set(!this.menuOpen());
  }

  logout(): void {
    this.api.logout().subscribe({ error: () => {} });
    this.auth.logout();
    this.router.navigate(['/portal/login']);
  }
}
