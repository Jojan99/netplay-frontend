import { Component, OnInit } from '@angular/core';
import { CommonModule }      from '@angular/common';
import { FormsModule }       from '@angular/forms';
import { FinanceService }    from '../../services/finance.service';
import { ToastService }      from '../../services/toast.service';
import { AuthService }       from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {

  tab: 'info' | 'password' = 'info';
  loading  = true;
  saving   = false;

  profile: any = {};

  infoForm = { names: '', lastname: '', phone: '', email: '' };

  pwForm = { current_password: '', new_password: '', new_password_confirmation: '' };
  pwError = '';
  showCurrent = false;
  showNew     = false;
  showConfirm = false;

  constructor(
    private financeService: FinanceService,
    private toast: ToastService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.financeService.getMe().subscribe({
      next: (res) => {
        this.profile  = res.data;
        this.infoForm = {
          names:    res.data.names    || '',
          lastname: res.data.lastname || '',
          phone:    res.data.phone    || '',
          email:    res.data.email    || '',
        };
        this.loading = false;
      },
      error: () => { this.loading = false; this.toast.error('Error al cargar el perfil'); },
    });
  }

  saveInfo(): void {
    this.saving = true;
    this.financeService.updateProfile(this.infoForm).subscribe({
      next: () => {
        this.saving = false;
        this.toast.success('Perfil actualizado');
      },
      error: () => { this.saving = false; this.toast.error('Error al guardar'); },
    });
  }

  savePassword(): void {
    this.pwError = '';
    if (this.pwForm.new_password !== this.pwForm.new_password_confirmation) {
      this.pwError = 'Las contraseñas nuevas no coinciden.'; return;
    }
    if (this.pwForm.new_password.length < 6) {
      this.pwError = 'La contraseña debe tener al menos 6 caracteres.'; return;
    }
    this.saving = true;
    this.financeService.changePassword(this.pwForm).subscribe({
      next: (res) => {
        this.saving = false;
        if (res.status !== 0 && res.status !== false) {
          this.pwError = res.message || 'Contraseña actual incorrecta.'; return;
        }
        this.toast.success('Contraseña actualizada');
        this.pwForm = { current_password: '', new_password: '', new_password_confirmation: '' };
      },
      error: (e) => {
        this.saving = false;
        this.pwError = e.error?.message || 'Error al cambiar contraseña';
      },
    });
  }

  get roleClass(): string {
    const map: Record<number, string> = {
      2: 'bg-blue-100 text-blue-800',
      3: 'bg-green-100 text-green-800',
      4: 'bg-purple-100 text-purple-800',
    };
    return map[this.profile?.profile_id] ?? 'bg-gray-100 text-gray-800';
  }
}
