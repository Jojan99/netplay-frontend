import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { OltTr069Component } from '../olt-tr069/olt-tr069.component';
import { OltAccesoRemotoComponent } from '../olt-acceso-remoto/olt-acceso-remoto.component';

/**
 * Gestión remota: antes eran dos pantallas, «TR-069» y «Acceso remoto», que
 * mostraban lo mismo por la mitad (las dos con su diagnóstico, las dos
 * explicando cómo llegan las ONT al TR-069 y las dos con la lista de equipos).
 *
 * Ahora es una sola. Arriba, los equipos: es lo que se usa todos los días.
 * Abajo, plegado, el servidor: se configura una vez y no se vuelve a mirar,
 * así que no tiene por qué ocupar media pantalla todos los días.
 */
@Component({
  selector: 'app-olt-gestion',
  standalone: true,
  imports: [CommonModule, OltNavComponent, OltTr069Component, OltAccesoRemotoComponent],
  templateUrl: './olt-gestion.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-gestion.component.scss'],
  host: { class: 'np-console' },
})
export class OltGestionComponent {
  /** El servidor arranca plegado: casi nadie viene a tocarlo. */
  verServidor = false;
}
