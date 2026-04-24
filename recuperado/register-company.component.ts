import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CompanyService } from '../../services/company.service';

@Component({
  selector: 'app-register-company',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register-company.component.html',
})
export class RegisterCompanyComponent {
  isLoading = false;
  errorMsg  = '';
  successMsg = '';

  form = {
    name:           '',
    nit:            '',
    email:          '',
    phone:          '',
    address:        '',
    admin_name:     '',
    admin_lastname: '',
    admin_password: '',
  };

  constructor(
    private companyService: CompanyService,
    private router: Router,
  ) {}

  register(): void {
    this.isLoading  = true;
    this.errorMsg   = '';
    this.successMsg = '';

    this.companyService.register(this.form).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (!res.error) {
          this.router.navigate(['/confirm-email']);
        } else {
          this.errorMsg = res.message || 'Error al registrar la empresa.';
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg  = err?.error?.message || 'Error al registrar la empresa.';
      },
    });
  }
}
