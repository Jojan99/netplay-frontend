import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarService } from './common/services/sidebar';
import { components } from './common/components';
import { HttpClientModule } from '@angular/common/http';
import { LayoutComponent } from './components/layout/layout.component';
import { MatSnackBarModule } from '@angular/material/snack-bar';

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
  constructor(readonly sidebarService: SidebarService) {}

  components = components;
}
