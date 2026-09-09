import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { OauthService } from '../../../services/oauth.service';
import { AuthService } from '../../../services/auth.service';
import { CompanyService } from '../../../services/company.service';
import { LocationTrackerService } from '../../../services/location-tracker.service';
import { SignInInterface } from '../../../models/sign-in-interfaces';
import { DarkThemeToggleComponent } from '../../../common/dark-theme-toggle.component';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DarkThemeToggleComponent],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss',
})
export class SignInComponent {
  isLoading = false;
  Islogin   = false;
  errorMsg  = '';
  needsConfirmation = false;   // la empresa existe pero falta activar el correo
  resendMsg = '';
  resending = false;

  public SignInInterfaces: SignInInterface = { user: '', password: '' };

  constructor(
    private OauthService:       OauthService,
    private authService:        AuthService,
    private companyService:     CompanyService,
    private locationTracker:    LocationTrackerService,
    private router:             Router,
  ) {}

  signin(): void {
    this.isLoading = true;
    this.Islogin   = false;

    this.OauthService.signin(this.SignInInterfaces).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (!res.error && res.data?.access_token) {
          this.authService.login(res.data);
          this.locationTracker.startTrackingIfTechnician();
          this.companyService.getMyModules().subscribe({
            next: (mod) => {
              this.authService.setModules(mod.data ?? []);
              this.router.navigate(['/dashboard/home']);
            },
            error: () => this.router.navigate(['/dashboard/home']),
          });
        } else {
          this.Islogin = true;
          this.needsConfirmation = !!res.data?.needs_confirmation;
          this.errorMsg = res.message || 'Documento o contraseña incorrectos.';
        }
      },
      error: () => {
        this.isLoading = false;
        this.Islogin   = true;
        this.needsConfirmation = false;
        this.errorMsg = 'No pudimos conectar. Revisá tu internet e intentá de nuevo.';
      },
    });
  }

  /** Vuelve a mandar el correo de activación cuando la cuenta quedó sin confirmar. */
  resendConfirmation(): void {
    if (this.resending || !this.SignInInterfaces.user) return;
    this.resending = true;
    this.resendMsg = '';
    this.companyService.resendConfirmation(this.SignInInterfaces.user).subscribe({
      next: (r: any) => { this.resending = false; this.resendMsg = r?.message || 'Te reenviamos el correo de activación.'; },
      error: () => { this.resending = false; this.resendMsg = 'No pudimos reenviar el correo. Escribinos para activarte la cuenta.'; },
    });
  }
}
