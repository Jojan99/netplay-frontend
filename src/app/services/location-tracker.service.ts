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

  private lastSent: { lat: number; lng: number; at: number } | null = null;
  private heartbeat: any = null;

  /** Envía como máximo cada 10 s y sólo si se movió ≥ 12 m; además un latido cada 2 min para seguir "en vivo" aunque esté quieto. */
  private sendLocation(lat: number, lng: number, force = false): void {
    const now = Date.now();
    if (!force && this.lastSent) {
      const moved = this.distanceM(this.lastSent.lat, this.lastSent.lng, lat, lng);
      if (now - this.lastSent.at < 10000 || (moved < 12 && now - this.lastSent.at < 120000)) return;
    }
    this.lastSent = { lat, lng, at: now };
    this.employeeService.updateMyLocation(lat, lng).subscribe({ error: () => {} });
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => { if (this.lastSent) this.sendLocation(this.lastSent.lat, this.lastSent.lng, true); }, 120000);
    }
  }
  private distanceM(a: number, b: number, c: number, d: number): number {
    const R = 6371000, toR = (x: number) => x * Math.PI / 180;
    const dLat = toR(c - a), dLng = toR(d - b);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
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
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }

    this.isTracking = false;
  }

  ngOnDestroy(): void {
    this.stopTracking();
  }
}
