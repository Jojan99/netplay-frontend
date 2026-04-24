import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { OauthService } from '../../../services/oauth.service';
import { AuthService } from '../../../services/auth.service';
import { CompanyService } from '../../../services/company.service';
import { SignInInterface } from '../../../models/sign-in-interfaces';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss',
})
export class SignInComponent {
  isLoading = false;
  Islogin   = false;

  public SignInInterfaces: SignInInterface = { user: '', password: '' };

  constructor(
    private OauthService:   OauthService,
    private authService:    AuthService,
    private companyService: CompanyService,
    private router:         Router,
  ) {}

  signin(): void {
    this.isLoading = true;
    this.Islogin   = false;

    this.OauthService.signin(this.SignInInterfaces).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (!res.error && res.data?.access_token) {
          this.authService.login(res.data);
          this.companyService.getMyModules().subscribe({
            next: (mod) => {
              this.authService.setModules(mod.data ?? []);
              this.router.navigate(['/dashboard/home']);
            },
            error: () => this.router.navigate(['/dashboard/home']),
          });
        } else {
          this.Islogin = true;
        }
      },
      error: () => {
        this.isLoading = false;
        this.Islogin   = true;
      },
    });
  }
}
