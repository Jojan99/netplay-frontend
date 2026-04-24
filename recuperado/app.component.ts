import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, RouterOutlet } from '@angular/router';
import { OnInit } from '@angular/core';
import { initFlowbite } from 'flowbite';
import { DarkThemeToggleComponent } from './common/dark-theme-toggle.component';
import { SidebarService } from './common/services/sidebar';
import { components } from './common/components';
import { SidebarComponent } from './common/sidebar.component';
import { SidebarItemGroupComponent } from './common/sidebar-item-group.component';
import { SidebarItemComponent } from './common/sidebar-item.component';
import { NavbarComponent } from './common/navbar.component';
import { HttpClientModule } from '@angular/common/http';
import { LayoutComponent } from './components/layout/layout.component';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { AudioFfmpegService } from './core/audio-ffmpeg.service';



@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet,HttpClientModule,LayoutComponent,MatSnackBarModule],
  template: '<router-outlet></router-outlet>',
})
export class AppComponent implements OnInit {
  constructor(readonly sidebarService: SidebarService,private audioFfmpeg: AudioFfmpegService

  ) {}

  components = components;



  async ngOnInit(): Promise<void> {
    try {
      await this.audioFfmpeg.preload();
    } catch {
      // FFmpeg assets no disponibles; solo afecta conversión de audio en CRM
    }
  }
}
