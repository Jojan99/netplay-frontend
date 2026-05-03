import { Injectable, OnDestroy } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { BackgroundGeolocationPlugin, Location, CallbackError, WatcherOptions } from '@capacitor-community/background-geolocation';
import { EmployeeService } from './employee.service';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

@Injectable({ providedIn: 'root' })
export class LocationTrackerService implements OnDestroy {

  private isTracking = false;
  private webWatchId: number | null = null;
  private bgWatcherId: string | null = null;
  private visibilityHandler: (() => void) | null = null;

  constructor(private employeeService: EmployeeService) {}

  async startTrackingIfTechnician(): Promise<void> {
    const role = (localStorage.getItem('user_role') || '').toUpperCase();
    const isTechnician = role.includes('TECNICO') || role.includes('TÉCNICO') ||
                         role.includes('INSTALADOR') || role.includes('SOPORTE');

    if (!isTechnician || this.isTracking) return;

    if (Capacitor.isNativePlatform()) {
      await this.startNativeTracking();
    } else {
      this.startWebTracking();
    }
  }

  // ─── Android nativo ───────────────────────────────────────────────────────

  private async startNativeTracking(): Promise<void> {
    try {
      const permission = await Geolocation.requestPermissions();
      if (permission.location !== 'granted') return;

      const options: WatcherOptions = {
        backgroundMessage: 'WispSmart está registrando tu ubicación para el seguimiento de servicio.',
        backgroundTitle: 'Ubicación activa',
        requestPermissions: true,
        stale: false,
        distanceFilter: 10,
      };

      this.bgWatcherId = await BackgroundGeolocation.addWatcher(
        options,
        (position: Location | undefined, error: CallbackError | undefined) => {
          if (error || !position) return;
          this.sendLocation(position.latitude, position.longitude);
        }
      );

      this.isTracking = true;
    } catch {
      this.startWebTracking();
    }
  }

  // ─── Web (browser) ────────────────────────────────────────────────────────

  private startWebTracking(): void {
    if (!navigator.geolocation) return;

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    this.webWatchId = navigator.geolocation.watchPosition(
      (pos) => this.sendLocation(pos.coords.latitude, pos.coords.longitude),
      () => {},
      geoOptions,
    );

    // Al volver a primer plano, enviar ubicación inmediatamente
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        navigator.geolocation.getCurrentPosition(
          (pos) => this.sendLocation(pos.coords.latitude, pos.coords.longitude),
          () => {},
          geoOptions,
        );
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    this.isTracking = true;
  }

  // ─── Común ───────────────────────────────────────────────────────────────

  private sendLocation(lat: number, lng: number): void {
    this.employeeService.updateMyLocation(lat, lng).subscribe({ error: () => {} });
  }

  stopTracking(): void {
    if (this.bgWatcherId) {
      BackgroundGeolocation.removeWatcher({ id: this.bgWatcherId });
      this.bgWatcherId = null;
    }

    if (this.webWatchId !== null) {
      navigator.geolocation.clearWatch(this.webWatchId);
      this.webWatchId = null;
    }

    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    this.isTracking = false;
  }

  ngOnDestroy(): void {
    this.stopTracking();
  }
}
