import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ConsolaAuthService, UsuarioConsola } from '../../services/consola-auth.service';
import { DialogService } from '../../services/dialog.service';
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
  imports: [CommonModule, RouterModule, DarkThemeToggleComponent],
  templateUrl: './consola.component.html',
  styleUrl: './consola.component.scss',
  host: { class: 'np-console' },
})
export class ConsolaComponent implements OnInit {
  private sesion = inject(ConsolaAuthService);
  private dialog = inject(DialogService);
  private router = inject(Router);

  usuario: UsuarioConsola | null = null;

  readonly pestanas = [
    { ruta: 'tablero',   titulo: 'Tablero' },
    { ruta: 'empresas',  titulo: 'Empresas' },
    { ruta: 'cobros',    titulo: 'Cobros' },
    { ruta: 'planes',    titulo: 'Planes' },
    { ruta: 'cupones',   titulo: 'Cupones' },
    { ruta: 'referidos', titulo: 'Referidos' },
    { ruta: 'bitacora',  titulo: 'Bitácora' },
  ];

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
