import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { OltTr069Component } from '../olt-tr069/olt-tr069.component';
import { OltAccesoRemotoComponent } from '../olt-acceso-remoto/olt-acceso-remoto.component';
import { CuentaService } from '../../../../services/cuenta.service';
import { ComplementoBloqueadoComponent } from '../../../../components/complemento-bloqueado/complemento-bloqueado.component';

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
  imports: [CommonModule, OltNavComponent, OltTr069Component, OltAccesoRemotoComponent, ComplementoBloqueadoComponent],
  templateUrl: './olt-gestion.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-gestion.component.scss'],
  host: { class: 'np-console' },
})
export class OltGestionComponent {
  /** Sin el complemento TR-069 la pantalla explica qué es y cómo activarlo. */
  readonly bloqueado = computed(() => !!CuentaService.tr069()?.bloqueado);

  /** El servidor arranca plegado: casi nadie viene a tocarlo. */
  verServidor = false;
}
