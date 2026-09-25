import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ConsolaAuthService, UsuarioConsola } from '../../services/consola-auth.service';
import { DialogService } from '../../services/dialog.service';
import { DialogHostComponent } from '../../components/dialog-host/dialog-host.component';
import { ToastHostComponent } from '../../components/toast-host/toast-host.component';
import { DarkThemeToggleComponent } from '../../common/dark-theme-toggle.component';

/**
 * El armazón de la consola de Netvula: su barra, sus pestañas y el lugar
 * donde entra cada pantalla.
 *
 * No comparte nada con el panel de las empresas: ni menú lateral, ni logo de
 * empresa, ni sesión. Es otra aplicación que resulta estar en el mismo
 * paquete.
 */
@Component({
  selector: 'app-consola',
  standalone: true,
  imports: [CommonModule, RouterModule, DarkThemeToggleComponent, DialogHostComponent, ToastHostComponent],
  templateUrl: './consola.component.html',
  styleUrl: './consola.component.scss',
  host: { class: 'np-console' },
})
export class ConsolaComponent implements OnInit {
  private sesion = inject(ConsolaAuthService);
  private dialog = inject(DialogService);
  private router = inject(Router);

  usuario: UsuarioConsola | null = null;

  /** Las secciones de la consola. El ícono es el `d` de un trazo solo. */
  readonly pestanas = [
    { ruta: 'tablero',   titulo: 'Tablero',   icono: 'M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z' },
    { ruta: 'empresas',  titulo: 'Empresas',  icono: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 10h2a2 2 0 0 1 2 2v9M9 7h2M9 11h2M9 15h2' },
    { ruta: 'cobros',    titulo: 'Cobros',    icono: 'M2 6h20v12H2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M5.5 10v.01M18.5 14v.01' },
    { ruta: 'planes',    titulo: 'Planes',    icono: 'M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5' },
    { ruta: 'cupones',   titulo: 'Cupones',   icono: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4 2 2 0 0 0 0-4ZM14 6.5v2M14 11v2M14 15.5v2' },
    { ruta: 'referidos', titulo: 'Referidos', icono: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' },
    { ruta: 'bitacora',  titulo: 'Bitácora',  icono: 'M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01' },
    { ruta: 'seguridad', titulo: 'Seguridad', icono: 'M12 3l8 4v5c0 5-3.4 8.4-8 9.5C7.4 20.4 4 17 4 12V7l8-4Zm-3 9 2 2 4-4' },
  ];

  /** La letra del avatar de quien está adentro. */
  get inicial(): string {
    const quien = this.usuario?.nombre || this.usuario?.email || 'N';
    return quien.charAt(0).toUpperCase();
  }

  /** Las pestañas no cambian nunca, pero Angular no tiene por qué rehacerlas. */
  porRuta(_: number, p: { ruta: string }): string { return p.ruta; }

  ngOnInit(): void {
    this.usuario = this.sesion.usuario();

    // Confirma contra el servidor que la sesión sigue viva; si no, el
    // interceptor manda al ingreso.
    this.sesion.yo().subscribe({
      next: r => { if (r?.data) this.usuario = { id: r.data.id, nombre: r.data.nombre, email: r.data.email }; },
      error: () => {},
    });
  }

  async salir(): Promise<void> {
    if (!await this.dialog.confirm('¿Cerrar sesión en la consola?', { okLabel: 'Cerrar sesión' })) return;

    this.sesion.salir();
    this.router.navigate(['/consola/ingresar']);
  }
}
