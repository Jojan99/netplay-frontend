import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../services/client-api.service';

@Component({
  selector: 'app-client-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-profile.component.html',
})
export class ClientProfileComponent implements OnInit {
  private api = inject(ClientApiService);

  loading  = signal(true);
  saving   = signal(false);
  profile  = signal<any>(null);
  editing  = signal(false);
  successMsg = signal('');
  errorMsg   = signal('');

  // Campos editables
  phone   = '';
  email   = '';

  // Cambio de contraseña
  pwModalOpen     = signal(false);
  pwCurrent       = '';
  pwNew           = '';
  pwConfirm       = '';
  pwLoading       = signal(false);
  pwSuccess       = signal('');
  pwError         = signal('');

  ngOnInit(): void {
    this.api.getProfile().subscribe({
      next: (res) => {
        this.profile.set(res.data);
        this.phone = res.data?.phone ?? '';
        this.email = res.data?.email ?? '';
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
  }

  startEdit(): void {
    const p = this.profile();
    this.phone = p?.phone ?? '';
    this.email = p?.email ?? '';
    this.editing.set(true);
    this.successMsg.set('');
    this.errorMsg.set('');
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.errorMsg.set('');
  }

  save(): void {
    this.saving.set(true);
    this.errorMsg.set('');

    this.api.updateProfile({ phone: this.phone, email: this.email }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.editing.set(false);
        this.successMsg.set('Perfil actualizado correctamente');
        // Actualizar perfil local
        this.profile.update(p => ({ ...p, phone: this.phone, email: this.email }));
        setTimeout(() => this.successMsg.set(''), 4000);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMsg.set(err.error?.message ?? 'Error al actualizar el perfil');
      },
    });
  }

  // ── Cambio de contraseña ─────────────────────────────────────────────────

  openPwModal(): void {
    this.pwModalOpen.set(true);
    this.pwCurrent = '';
    this.pwNew = '';
    this.pwConfirm = '';
    this.pwSuccess.set('');
    this.pwError.set('');
  }

  closePwModal(): void {
    this.pwModalOpen.set(false);
  }

  submitChangePassword(): void {
    if (!this.pwCurrent || !this.pwNew || !this.pwConfirm) {
      this.pwError.set('Todos los campos son obligatorios');
      return;
    }
    if (this.pwNew.length < 6) {
      this.pwError.set('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (this.pwNew !== this.pwConfirm) {
      this.pwError.set('Las contraseñas no coinciden');
      return;
    }

    this.pwLoading.set(true);
    this.pwError.set('');

    this.api.changePassword(this.pwCurrent, this.pwNew, this.pwConfirm).subscribe({
      next: (res) => {
        this.pwLoading.set(false);
        this.pwSuccess.set(res.message ?? 'Contraseña actualizada correctamente');
        setTimeout(() => this.closePwModal(), 2000);
      },
      error: (err) => {
        this.pwLoading.set(false);
        this.pwError.set(err.error?.message ?? 'Error al cambiar la contraseña');
      },
    });
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }
}
