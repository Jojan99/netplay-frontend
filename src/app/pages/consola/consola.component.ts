import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

/** El marco de la consola: las pestañas y el lugar donde entra cada pantalla. */
@Component({
  selector: 'app-consola',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './consola.component.html',
  styleUrl: './consola.component.scss',
  host: { class: 'np-console' },
})
export class ConsolaComponent {
  readonly pestanas = [
    { ruta: 'tablero',   titulo: 'Tablero' },
    { ruta: 'empresas',  titulo: 'Empresas' },
    { ruta: 'cobros',    titulo: 'Cobros' },
    { ruta: 'planes',    titulo: 'Planes' },
    { ruta: 'cupones',   titulo: 'Cupones' },
    { ruta: 'referidos', titulo: 'Referidos' },
    { ruta: 'bitacora',  titulo: 'Bitácora' },
  ];
}
