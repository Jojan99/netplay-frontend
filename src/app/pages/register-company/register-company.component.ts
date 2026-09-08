import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DarkThemeToggleComponent } from '../../common/dark-theme-toggle.component';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CompanyService } from '../../services/company.service';

type Step = 1 | 2 | 3;

@Component({
  selector: 'app-register-company',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DarkThemeToggleComponent],
  templateUrl: './register-company.component.html',
  styleUrls: ['../sign-in/sign-in/sign-in.component.scss', './register-company.component.scss'],
})
export class RegisterCompanyComponent {
  isLoading = false;
  errorMsg  = '';
  successMsg = '';
  step: Step = 1;
  showPw = false;

  readonly steps = [
    { n: 1 as Step, label: 'Empresa',      hint: 'Datos legales y de contacto' },
    { n: 2 as Step, label: 'Facturación',  hint: 'Cómo se ve tu factura' },
    { n: 3 as Step, label: 'Administrador', hint: 'Con qué cuenta vas a entrar' },
  ];

  form = {
    name:           '',
    nit:            '',
    email:          '',
    phone:          '',
    address:        '',
    city:           '',
    country:        'Colombia',
    invoice_prefix: '',
    admin_name:     '',
    admin_lastname: '',
    admin_dni:      '',
    admin_phone:    '',
    admin_username: '',
    admin_password: '',
  };
  passwordConfirm = '';

  /* ── Validación por paso ─────────────────────────────────────── */
  private req(v: string): boolean { return !!v && v.trim().length > 1; }
  get emailOk(): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email.trim()); }
  get phoneOk(): boolean { return this.form.phone.replace(/\D/g, '').length >= 7; }
  get usernameOk(): boolean { return !this.form.admin_username || /^[A-Za-z0-9._-]+$/.test(this.form.admin_username); }
  get passwordStrength(): { score: number; label: string; cls: string } {
    const p = this.form.admin_password;
    let score = 0;
    if (p.length >= 6) score++;
    if (p.length >= 10) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    const label = score <= 1 ? 'Débil' : score <= 3 ? 'Aceptable' : 'Fuerte';
    return { score, label, cls: score <= 1 ? 'is-weak' : score <= 3 ? 'is-mid' : 'is-strong' };
  }
  get passwordsMatch(): boolean { return !this.passwordConfirm || this.form.admin_password === this.passwordConfirm; }

  step1Ok(): boolean {
    return this.req(this.form.name) && this.req(this.form.nit) && this.emailOk && this.phoneOk && this.req(this.form.address);
  }
  step2Ok(): boolean { return true; }   // todo opcional, se puede completar luego
  step3Ok(): boolean {
    return this.req(this.form.admin_name) && this.req(this.form.admin_lastname)
      && this.form.admin_password.length >= 6 && this.form.admin_password === this.passwordConfirm
      && this.usernameOk;
  }
  stepOk(n: Step): boolean { return n === 1 ? this.step1Ok() : n === 2 ? this.step2Ok() : this.step3Ok(); }

  /** El usuario por defecto es el NIT, igual que lo crea el backend. */
  get usernamePreview(): string { return this.form.admin_username.trim() || this.form.nit.trim() || 'tu-nit'; }
  get prefixPreview(): string { return (this.form.invoice_prefix.trim() || 'FAC').toUpperCase(); }

  constructor(
    private companyService: CompanyService,
    private router: Router,
  ) {}

  next(): void {
    this.errorMsg = '';
    if (!this.stepOk(this.step)) { this.errorMsg = 'Completá los campos marcados para continuar.'; return; }
    if (this.step < 3) this.step = (this.step + 1) as Step;
  }
  back(): void { this.errorMsg = ''; if (this.step > 1) this.step = (this.step - 1) as Step; }
  goTo(n: Step): void { if (n < this.step || this.stepOk(this.step)) { this.errorMsg = ''; this.step = n; } }

  register(): void {
    if (this.step < 3) { this.next(); return; }
    if (!this.step1Ok() || !this.step3Ok()) { this.errorMsg = 'Revisá los datos: hay campos incompletos.'; return; }

    this.isLoading  = true;
    this.errorMsg   = '';
    this.successMsg = '';

    // Sólo se mandan los campos con valor: los vacíos los completa el backend
    const payload: Record<string, string> = {};
    Object.entries(this.form).forEach(([k, v]) => { if (String(v ?? '').trim()) payload[k] = String(v).trim(); });

    this.companyService.register(payload).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (!res.error) {
          this.router.navigate(['/confirm-email']);
        } else {
          this.errorMsg = res.message || 'No pudimos registrar la empresa.';
          if (/NIT|correo|usuario/i.test(this.errorMsg)) this.step = /usuario/i.test(this.errorMsg) ? 3 : 1;
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg  = err?.error?.message || 'No pudimos registrar la empresa. Intentá de nuevo.';
      },
    });
  }
}
