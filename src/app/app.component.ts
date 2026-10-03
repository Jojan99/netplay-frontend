import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarService } from './common/services/sidebar';
import { components } from './common/components';
import { HttpClientModule } from '@angular/common/http';
import { LayoutComponent } from './components/layout/layout.component';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { TablasMovilService } from './services/tablas-movil.service';
import { SalidaSeguraService } from './services/salida-segura.service';
import { PantallaVisibleService } from './services/pantalla-visible.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HttpClientModule, LayoutComponent, MatSnackBarModule],
  template: '<router-outlet></router-outlet>',
})
export class AppComponent {
  // FFmpeg (32 MB) ya no se precarga al abrir cualquier pantalla: tardaba más
  // de 20 s, fallaba y dejaba un error en consola aunque nadie grabara audio.
  // Lo carga AudioFfmpegService la primera vez que el CRM convierte una nota de voz.
  constructor(readonly sidebarService: SidebarService, tablasMovil: TablasMovilService, salidaSegura: SalidaSeguraService, pantallaVisible: PantallaVisibleService) {
    tablasMovil.iniciar();
    // Las ventanas del teléfono terminan donde termina lo que se ve (barras del navegador, teclado).
    pantallaVisible.iniciar();
    // «¿Seguro que desea salir?» al cerrar un modal con algo ya diligenciado.
    salidaSegura.iniciar();
  }

  components = components;
}
