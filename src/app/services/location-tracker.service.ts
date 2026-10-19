import { Injectable, OnDestroy, signal } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { BackgroundGeolocationPlugin, Location, CallbackError, WatcherOptions } from '@capacitor-community/background-geolocation';
import { EmployeeService } from './employee.service';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/**
 * Cómo está la ubicación de quien usa el panel.
 * - no_aplica: no es técnico, nada que pedir.
 * - verificando: se está pidiendo el permiso o la primera posición.
 * - activa: hay permiso y el GPS responde.
 * - denegada: el técnico (o el navegador) negó el permiso.
 * - apagada: hay permiso pero el GPS del equipo está apagado o no da posición.
 * - sin_soporte: el navegador no tiene geolocalización.
 */
export type EstadoUbicacion = 'no_aplica' | 'verificando' | 'activa' | 'denegada' | 'apagada' | 'sin_soporte';

@Injectable({ providedIn: 'root' })
export class LocationTrackerService implements OnDestroy {

  /**
   * El panel no deja trabajar a un técnico con la ubicación apagada (el marco de la app
   * muestra un bloqueo mientras no esté 'activa'). Sin esto el mapa de técnicos y la
   * ubicación al cerrar instalaciones dependían de que cada uno se acordara de activarla.
   */
  readonly estado = signal<EstadoUbicacion>('no_aplica');

  private isTracking = false;
  private webWatchId: number | null = null;
  private bgWatcherId: string | null = null;
  private visibilityHandler: (() => void) | null = null;
  private permisoWeb: PermissionStatus | null = null;

  constructor(private employeeService: EmployeeService) {}

  esTecnico(): boolean {
    const role = (localStorage.getItem('user_role') || '').toUpperCase();
    return role.includes('TECNICO') || role.includes('TÉCNICO') ||
           role.includes('INSTALADOR') || role.includes('SOPORTE');
  }

  async startTrackingIfTechnician(): Promise<void> {
    if (!this.esTecnico()) { this.estado.set('no_aplica'); return; }
    if (this.isTracking) return;

    this.estado.set('verificando');
    this.vigilarRegreso();

    if (Capacitor.isNativePlatform()) {
      await this.startNativeTracking();
    } else {
      await this.startWebTracking();
    }
  }

  /** Vuelve a pedir el permiso y la posición (al volver de los ajustes, o el botón). */
  async reintentar(): Promise<void> {
    this.stopTracking();
    await this.startTrackingIfTechnician();
  }

  /**
   * El botón «Activar ubicación» del bloqueo: hace todo lo que se puede desde la app.
   *
   * - App (Android): vuelve a mostrar la pregunta del permiso; si el celular ya no la
   *   muestra (lo negaron con «no volver a preguntar») o el GPS sigue apagado, abre los
   *   ajustes de la app para que lo active ahí, y al volver se revisa solo.
   * - Navegador: si todavía no respondió, aparece la pregunta del navegador. Si ya lo
   *   bloqueó, ninguna página puede volver a preguntar: devuelve 'bloqueada' para que la
   *   pantalla muestre cómo desbloquearlo en el candado.
   */
  async activar(): Promise<'activa' | 'ajustes' | 'bloqueada' | 'sin_gps'> {
    if (Capacitor.isNativePlatform()) {
      try {
        const actual = await Geolocation.checkPermissions();
        if (actual.location !== 'granted') {
          const pedido = await Geolocation.requestPermissions();
          if (pedido.location !== 'granted') {
            await BackgroundGeolocation.openSettings();
            return 'ajustes';
          }
        }
      } catch {
        await BackgroundGeolocation.openSettings().catch(() => {});
        return 'ajustes';
      }
      await this.reintentar();
      if (this.estado() === 'activa') return 'activa';
      // Con permiso pero sin posición: el GPS está apagado. Se abre a los ajustes.
      await BackgroundGeolocation.openSettings().catch(() => {});
      return 'sin_gps';
    }

    let permiso: PermissionState | null = null;
    try {
      permiso = (await navigator.permissions?.query({ name: 'geolocation' as PermissionName }))?.state ?? null;
    } catch { /* sin Permissions API: se intenta igual */ }

    if (permiso === 'denied') {
      this.estado.set('denegada');
      return 'bloqueada';
    }

    await this.reintentar();
    if (this.estado() === 'activa') return 'activa';
    return this.estado() === 'denegada' ? 'bloqueada' : 'sin_gps';
  }

  /**
   * Al volver a la app (desde los ajustes del celular, donde activó el GPS o el permiso)
   * se revisa de nuevo sin que tenga que tocar nada; si ya estaba activa, se manda la
   * posición de inmediato.
   */
  private vigilarRegreso(): void {
    if (this.visibilityHandler || typeof document === 'undefined') return;
    this.visibilityHandler = () => {
      if (document.visibilityState !== 'visible' || !this.esTecnico()) return;
      if (this.estado() === 'activa') {
        if (!Capacitor.isNativePlatform() && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => this.sendLocation(pos.coords.latitude, pos.coords.longitude, true),
            (err) => this.errorWeb(err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
          );
        }
      } else if (this.estado() !== 'verificando') {
        this.reintentar();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  // ─── Android nativo ───────────────────────────────────────────────────────

  private async startNativeTracking(): Promise<void> {
    try {
      const permission = await Geolocation.requestPermissions();
      if (permission.location !== 'granted') { this.estado.set('denegada'); return; }

      // Con permiso pero con el GPS apagado no llega ninguna posición: se prueba una.
      try {
        const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
        this.sendLocation(p.coords.latitude, p.coords.longitude, true);
      } catch {
        this.estado.set('apagada');
        return;
      }

      const options: WatcherOptions = {
        backgroundMessage: 'WispSmart está registrando su ubicación para el seguimiento de servicio.',
        backgroundTitle: 'Ubicación activa',
        requestPermissions: true,
        stale: false,
        distanceFilter: 10,
      };

      this.bgWatcherId = await BackgroundGeolocation.addWatcher(
        options,
        (position: Location | undefined, error: CallbackError | undefined) => {
          if (error) {
            // Quitó el permiso con la app abierta: vuelve el bloqueo.
            if (error.code === 'NOT_AUTHORIZED') this.estado.set('denegada');
            return;
          }
          if (!position) return;
          this.estado.set('activa');
          this.sendLocation(position.latitude, position.longitude);
        }
      );

      this.isTracking = true;
      this.estado.set('activa');
    } catch {
      await this.startWebTracking();
    }
  }

  // ─── Web (browser) ────────────────────────────────────────────────────────

  private async startWebTracking(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { this.estado.set('sin_soporte'); return; }

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    };

    // La primera posición decide: pide el permiso si hace falta y confirma que el GPS da datos.
    const primera = await new Promise<GeolocationPosition | GeolocationPositionError>(resolve =>
      navigator.geolocation.getCurrentPosition(resolve, resolve, geoOptions));

    if ('code' in primera) { this.errorWeb(primera); return; }

    this.sendLocation(primera.coords.latitude, primera.coords.longitude, true);
    this.estado.set('activa');

    this.webWatchId = navigator.geolocation.watchPosition(
      (pos) => { this.estado.set('activa'); this.sendLocation(pos.coords.latitude, pos.coords.longitude); },
      (err) => this.errorWeb(err),
      geoOptions,
    );

    // Si quita el permiso desde el candado del navegador, el bloqueo vuelve al instante.
    try {
      this.permisoWeb = await navigator.permissions?.query({ name: 'geolocation' as PermissionName }) ?? null;
      if (this.permisoWeb) {
        this.permisoWeb.onchange = () => {
          if (this.permisoWeb?.state === 'denied') this.estado.set('denegada');
          else if (this.permisoWeb?.state === 'granted' && this.estado() !== 'activa') this.reintentar();
        };
      }
    } catch { /* navegadores sin Permissions API: queda el error de watchPosition */ }

    this.isTracking = true;
  }

  /** 1 = permiso negado; 2 y 3 = sin posición (GPS apagado, sin señal o se demoró). */
  private errorWeb(err: GeolocationPositionError): void {
    // Un timeout suelto con la ubicación ya activa no bloquea: el siguiente dato llega solo.
    if (err.code === err.TIMEOUT && this.estado() === 'activa') return;
    this.estado.set(err.code === err.PERMISSION_DENIED ? 'denegada' : 'apagada');
  }

  /**
   * La posición de este momento, para una acción puntual (cerrar una instalación ubica al
   * cliente en el mapa). Null si no hay permiso, no hay señal o tarda más de `esperaMs`:
   * quien la pide sigue sin ella.
   */
  async posicionActual(esperaMs = 12000): Promise<{ lat: number; lng: number; precision: number } | null> {
    try {
      if (Capacitor.isNativePlatform()) {
        const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: esperaMs, maximumAge: 30000 });
        return { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy };
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
      return await new Promise(resolve => navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: esperaMs, maximumAge: 30000 },
      ));
    } catch {
      return null;
    }
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

    if (this.permisoWeb) { this.permisoWeb.onchange = null; this.permisoWeb = null; }
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }

    // El aviso de regreso (vigilarRegreso) se queda: es lo que levanta el bloqueo cuando
    // el técnico vuelve de activar el GPS. Sólo se quita al destruir el servicio.
    this.isTracking = false;
  }

  ngOnDestroy(): void {
    this.stopTracking();
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}
