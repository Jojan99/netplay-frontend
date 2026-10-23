import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { environment } from '../../../environments/environment';

/** Lo que se leyó: el texto tal cual y, ya limpio, para usarlo como serial. */
export interface CodigoLeido {
  texto: string;
  /** Mayúsculas, sin espacios, guiones ni el prefijo «SN:». */
  limpio: string;
  /** Tiene pinta de MAC (12 hexadecimales con letras, o con dos puntos). */
  esMac: boolean;
  /** De dónde vino: la cámara, el teclado / la pistola USB, o la cámara de un celular (por QR). */
  origen: 'camara' | 'teclado' | 'celular';
}

const GUARDADO = 'np:lector:camara';
/** Formatos que traen las etiquetas de equipos y las cajas. Menos formatos = lectura más rápida. */
const NATIVOS = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'itf', 'codabar', 'qr_code', 'data_matrix'];
const DE_UNA_LECTURA = new Set(['qr_code', 'data_matrix', 'QR_CODE', 'DATA_MATRIX']);

/**
 * Lector de códigos de barras con la cámara del teléfono (o una pistola USB).
 *
 * Reescrito para las etiquetas de las ONT, que son lo más difícil de leer: códigos de una
 * dimensión, pequeños, varios juntos en la misma etiqueta. Lo que cambia frente al anterior:
 *
 *  - Sólo se lee lo que está DENTRO del recuadro. Antes se decodificaba el cuadro entero y se
 *    tomaba el primer código que apareciera: con la MAC y el serial uno encima del otro, salía
 *    el que no era.
 *  - Usa el lector del propio navegador (BarcodeDetector) cuando existe —es el del teléfono,
 *    rápido y con buen enfoque— y ZXing cuando no.
 *  - Un código de barras se acepta cuando se lee dos veces seguidas igual: una lectura parcial
 *    de un código fino da un serial al que le faltan caracteres.
 *  - Elige la cámara trasera principal (no el gran angular, que no enfoca de cerca), recuerda
 *    cuál sirvió, y deja cambiarla, acercar y prender la linterna.
 *  - La cámara se apaga siempre: al cerrar, al destruirse y si la página pasa a segundo plano.
 *  - En modo continuo sigue leyendo: para cargar una caja de equipos sin tocar la pantalla.
 */
@Component({
  selector: 'app-lector-codigos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lector-de-codigos.component.html',
  styleUrl: './lector-de-codigos.component.scss',
})
export class LectorDeCodigosComponent implements OnInit, OnDestroy {
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private http = inject(HttpClient);

  /** «serial»: avisa si lo leído parece una MAC. «producto»: cualquier código. */
  @Input() modo: 'serial' | 'producto' = 'producto';
  /** Sigue leyendo después de cada código (para varios seriales seguidos). */
  @Input() continuo = false;
  /** Prende la cámara al aparecer, sin esperar el botón. */
  @Input() auto = false;
  @Input() etiqueta = '';
  /**
   * La pantalla que lo usa contesta cada lectura con confirmar() o rechazar(): el lector
   * no suena por su cuenta, para no pitar «bien» y enseguida «mal» por un serial repetido.
   */
  @Input() conVeredicto = false;
  /** Ofrece «Usar el celular» (en el computador). La página del celular lo apaga. */
  @Input() conCelular = true;
  @Output() leido = new EventEmitter<CodigoLeido>();

  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('marco') marcoRef?: ElementRef<HTMLElement>;

  encendida = false;
  iniciando = false;
  error = '';
  aviso = '';
  ultimo = '';
  manual = '';
  /** El cartel grande que confirma (o rechaza) cada lectura. */
  flash: { texto: string; bien: boolean } | null = null;
  private relojFlash: any;

  camaras: MediaDeviceInfo[] = [];
  camaraId = '';
  conLinterna = false;
  linterna = false;
  zoom: { min: number; max: number; paso: number; valor: number } | null = null;

  private stream: MediaStream | null = null;
  private pista: MediaStreamTrack | null = null;
  private reloj: any;
  /** Sube en cada arranque: una cámara que llega tarde, de un arranque ya cancelado, se apaga. */
  private turno = 0;
  private lienzo = document.createElement('canvas');
  private nativo: any = null;
  private zxing: BrowserMultiFormatReader | null = null;
  private candidato = { texto: '', veces: 0, en: 0 };
  private recientes = new Map<string, number>();
  private audio: AudioContext | null = null;
  private alOcultar = () => { if (document.hidden) this.apagar(); };

  // ── El celular como cámara (por QR) ──
  /** Con mouse (computador): ahí es donde sirve prestar la cámara de un celular. */
  readonly ofrecerCelular = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;
  celular: { token: string; qr: string; conectado: boolean; leidos: number } | null = null;
  abriendoCelular = false;
  private relojCelular: any;
  private relojVeredicto: any;
  private desde = 0;
  private cola: Array<{ id: number; codigo: string }> = [];
  /** La lectura del celular que se está procesando: a ella va la respuesta (confirmar/rechazar). */
  private remota: number | null = null;

  ngOnInit(): void {
    document.addEventListener('visibilitychange', this.alOcultar);
    if (this.auto) setTimeout(() => this.encender(), 0);
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.alOcultar);
    this.cerrarCelular();
    this.apagar();
    clearTimeout(this.relojFlash);
    this.audio?.close().catch(() => {});
  }

  // ── Cámara ────────────────────────────────────────────────────────────────

  alternar(): void {
    // El toque del botón es el permiso del navegador para sonar: sin esto, en el
    // teléfono el pitido de la lectura queda mudo.
    this.prepararSonido();
    this.encendida || this.iniciando ? this.apagar() : this.encender();
  }

  async encender(deviceId?: string): Promise<void> {
    this.apagar();
    this.error = '';
    this.aviso = '';

    if (!window.isSecureContext) { this.error = 'La cámara sólo funciona en una dirección segura (https). Escriba el código o use una pistola lectora.'; return; }
    if (!navigator.mediaDevices?.getUserMedia) { this.error = 'Este navegador no deja usar la cámara. Abra el sistema en Chrome o Safari, o escriba el código.'; return; }

    const turno = ++this.turno;
    this.iniciando = true;
    const preferida = deviceId ?? this.guardada();

    try {
      let stream = await this.pedir(preferida);

      // Con el permiso ya dado se conocen los nombres de las cámaras: si la que tocó es un gran
      // angular o la frontal y hay una trasera principal, se cambia a esa.
      if (turno === this.turno && !preferida) {
        const mejor = await this.mejorCamara(stream);
        if (mejor) { stream.getTracks().forEach(t => t.stop()); stream = await this.pedir(mejor); }
      }

      // Cerraron o destruyeron el lector mientras el navegador pedía permiso.
      if (turno !== this.turno) { stream.getTracks().forEach(t => t.stop()); return; }

      this.stream = stream;
      this.pista = stream.getVideoTracks()[0] ?? null;
      this.camaraId = this.pista?.getSettings().deviceId ?? '';
      if (this.camaraId) this.guardar(this.camaraId);

      const video = this.videoRef?.nativeElement;
      if (!video) { this.apagar(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});

      await this.ajustar();
      this.camaras = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(d => d.kind === 'videoinput');
      this.prepararLectores();

      this.encendida = true;
      this.iniciando = false;
      this.cdr.detectChanges();
      this.zone.runOutsideAngular(() => this.bucle(turno));
    } catch (e: any) {
      if (turno !== this.turno) return;
      this.apagar();
      this.error = this.explicar(e);
      this.cdr.detectChanges();
    }
  }

  private async pedir(deviceId?: string): Promise<MediaStream> {
    const calidad = { width: { ideal: 1920 }, height: { ideal: 1080 } };

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId }, ...calidad } : { facingMode: { ideal: 'environment' }, ...calidad },
      });
    } catch (e: any) {
      // La cámara recordada ya no existe, o no da esa resolución: se pide la que haya.
      if (e?.name === 'OverconstrainedError' || e?.name === 'NotFoundError') {
        if (deviceId) this.olvidar();
        return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
      }
      throw e;
    }
  }

  /** La trasera principal, si la que se abrió no lo es. */
  private async mejorCamara(actual: MediaStream): Promise<string | null> {
    const lista = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(d => d.kind === 'videoinput');
    const usando = actual.getVideoTracks()[0]?.getSettings().deviceId;
    const traseras = lista.filter(d => /back|rear|trasera|environment|posterior/i.test(d.label));
    // El gran angular, el tele y el macro enfocan mal una etiqueta a quince centímetros.
    const principal = traseras.find(d => !/wide|ultra|angular|tele|macro|depth/i.test(d.label)) ?? traseras[0];

    return principal && principal.deviceId !== usando ? principal.deviceId : null;
  }

  /** Enfoque continuo, y qué controles ofrece esta cámara. */
  private async ajustar(): Promise<void> {
    const p: any = this.pista;
    if (!p) return;

    let cap: any = {};
    try { cap = p.getCapabilities?.() ?? {}; } catch { cap = {}; }

    this.conLinterna = !!cap.torch;
    this.linterna = false;
    this.zoom = cap.zoom && cap.zoom.max > cap.zoom.min
      ? { min: cap.zoom.min, max: Math.min(cap.zoom.max, cap.zoom.min + 4), paso: cap.zoom.step || 0.1, valor: p.getSettings?.().zoom ?? cap.zoom.min }
      : null;

    if (Array.isArray(cap.focusMode) && cap.focusMode.includes('continuous')) {
      await p.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }
  }

  apagar(): void {
    this.turno++;
    clearTimeout(this.reloj);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.pista = null;
    const v = this.videoRef?.nativeElement;
    if (v) { v.pause(); v.srcObject = null; }
    this.encendida = false;
    this.iniciando = false;
    this.linterna = false;
    this.candidato = { texto: '', veces: 0, en: 0 };
  }

  cambiarCamara(): void {
    if (this.camaras.length < 2) return;
    const i = this.camaras.findIndex(c => c.deviceId === this.camaraId);
    this.encender(this.camaras[(i + 1) % this.camaras.length].deviceId);
  }

  alternarLinterna(): void {
    const p: any = this.pista;
    if (!p || !this.conLinterna) return;
    this.linterna = !this.linterna;
    p.applyConstraints({ advanced: [{ torch: this.linterna }] }).catch(() => { this.linterna = false; });
  }

  acercar(valor: number | string): void {
    const p: any = this.pista;
    if (!p || !this.zoom) return;
    this.zoom.valor = Number(valor);
    p.applyConstraints({ advanced: [{ zoom: this.zoom.valor }] }).catch(() => {});
  }

  // ── Lectura ───────────────────────────────────────────────────────────────

  private prepararLectores(): void {
    const BD = (window as any).BarcodeDetector;

    if (BD && !this.nativo) {
      // Si el teléfono no trae alguno de los formatos, se piden sólo los que sí.
      BD.getSupportedFormats?.().then((soportados: string[]) => {
        const formatos = NATIVOS.filter(f => soportados.includes(f));
        if (formatos.includes('code_128')) this.nativo = new BD({ formats: formatos });
      }).catch(() => {});
    }

    if (!this.zxing) {
      const pistas = new Map<DecodeHintType, any>();
      pistas.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]);
      pistas.set(DecodeHintType.TRY_HARDER, true);
      this.zxing = new BrowserMultiFormatReader(pistas);
    }
  }

  private bucle(turno: number): void {
    if (turno !== this.turno) return;

    this.cuadro().then(leidos => {
      if (turno !== this.turno) return;
      leidos.length ? this.considerar(leidos[0].texto, leidos[0].formato) : this.sinNada();
    }).catch(() => {}).finally(() => {
      // Unas ocho lecturas por segundo: suficiente para no perder el código y sin calentar el teléfono.
      if (turno === this.turno) this.reloj = setTimeout(() => this.bucle(turno), 120);
    });
  }

  /** Recorta el recuadro del video y busca códigos sólo ahí. */
  private async cuadro(): Promise<Array<{ texto: string; formato: string }>> {
    const v = this.videoRef?.nativeElement;
    if (!v || v.readyState < 2 || !v.videoWidth) return [];

    // Exactamente el recuadro que la persona ve. El video se muestra recortado para llenar el
    // visor (object-fit: cover), así que hay que traducir del recuadro en pantalla a los
    // píxeles del cuadro de la cámara.
    const caja = v.getBoundingClientRect();
    const marco = this.marcoRef?.nativeElement.getBoundingClientRect();
    let x: number, y: number, ancho: number, alto: number;

    if (marco && caja.width > 0 && caja.height > 0) {
      const escala = Math.max(caja.width / v.videoWidth, caja.height / v.videoHeight);
      const sobraX = (v.videoWidth * escala - caja.width) / 2;
      const sobraY = (v.videoHeight * escala - caja.height) / 2;
      x = (marco.left - caja.left + sobraX) / escala;
      y = (marco.top - caja.top + sobraY) / escala;
      ancho = marco.width / escala;
      alto = marco.height / escala;
    } else {
      ancho = v.videoWidth * 0.86;
      alto = Math.min(v.videoHeight * 0.42, ancho * 0.5);
      x = (v.videoWidth - ancho) / 2;
      y = (v.videoHeight - alto) / 2;
    }

    x = Math.max(0, x); y = Math.max(0, y);
    ancho = Math.min(ancho, v.videoWidth - x); alto = Math.min(alto, v.videoHeight - y);
    if (ancho < 40 || alto < 20) return [];

    this.lienzo.width = Math.round(ancho);
    this.lienzo.height = Math.round(alto);
    const ctx = this.lienzo.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(v, x, y, ancho, alto, 0, 0, this.lienzo.width, this.lienzo.height);

    if (this.nativo) {
      try {
        const r = await this.nativo.detect(this.lienzo);
        if (r?.length) {
          // Con varios en el recuadro, el que está bajo la mira (el centro): primero los que la
          // tocan y, si ninguno, el más cercano a ella en las dos direcciones. Antes sólo se
          // miraba la altura, y con dos códigos lado a lado salía el que no era.
          const cx = this.lienzo.width / 2, cy = this.lienzo.height / 2;
          const bajoLaMira = (b: any) => b && cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height;
          const distancia = (b: any) => b ? Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy) : Infinity;
          r.sort((a: any, b: any) => Number(bajoLaMira(b.boundingBox)) - Number(bajoLaMira(a.boundingBox)) || distancia(a.boundingBox) - distancia(b.boundingBox));
          return r.map((c: any) => ({ texto: String(c.rawValue ?? ''), formato: String(c.format ?? '') })).filter((c: any) => c.texto).slice(0, 1);
        }
        return [];
      } catch { this.nativo = null; }
    }

    // ZXing devuelve el primer código que encuentra en todo el recorte: primero se busca en una
    // franja angosta alrededor de la mira y sólo si ahí no hay nada, en el recuadro completo.
    const franja = this.franjaDeLaMira();
    for (const lienzo of franja ? [franja, this.lienzo] : [this.lienzo]) {
      try {
        const r = this.zxing!.decodeFromCanvas(lienzo);
        if (r) return [{ texto: r.getText(), formato: BarcodeFormat[r.getBarcodeFormat()] }];
      } catch {
        // nada en este recorte: se prueba el siguiente
      }
    }
    return [];
  }

  private lienzoFranja = document.createElement('canvas');

  /** El centro del recuadro: 80 % del ancho y 45 % del alto, donde está la mira. */
  private franjaDeLaMira(): HTMLCanvasElement | null {
    const w = this.lienzo.width, h = this.lienzo.height;
    const ancho = Math.round(w * 0.8), alto = Math.round(h * 0.45);
    if (ancho < 40 || alto < 20) return null;
    this.lienzoFranja.width = ancho;
    this.lienzoFranja.height = alto;
    const ctx = this.lienzoFranja.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(this.lienzo, (w - ancho) / 2, (h - alto) / 2, ancho, alto, 0, 0, ancho, alto);
    return this.lienzoFranja;
  }

  private sinNada(): void {
    // Dos lecturas seguidas no tienen que ser en cuadros pegados, pero sí cercanas en el tiempo.
    if (this.candidato.veces && Date.now() - this.candidato.en > 1500) this.candidato = { texto: '', veces: 0, en: 0 };
  }

  private considerar(texto: string, formato: string): void {
    const t = texto.trim();
    if (t.length < 4) return;

    if (!DE_UNA_LECTURA.has(formato)) {
      const ahora = Date.now();
      this.candidato = this.candidato.texto === t && ahora - this.candidato.en < 1500 ? { texto: t, veces: this.candidato.veces + 1, en: ahora } : { texto: t, veces: 1, en: ahora };
      if (this.candidato.veces < 2) return;
    }

    // El mismo código frente a la cámara no se informa una y otra vez.
    const antes = this.recientes.get(t) ?? 0;
    if (Date.now() - antes < 3000) return;
    this.recientes.set(t, Date.now());
    this.candidato = { texto: '', veces: 0, en: 0 };

    this.zone.run(() => this.entregar(t, 'camara'));
  }

  private entregar(texto: string, origen: 'camara' | 'teclado' | 'celular'): void {
    const codigo: CodigoLeido = { texto, limpio: this.limpiar(texto), esMac: this.esMac(texto), origen };

    if (this.modo === 'serial' && codigo.esMac) {
      // No se devuelve: se le dice qué leyó y se sigue buscando el serial.
      this.aviso = `Eso es la MAC (${texto}). Apunte al código que dice SN o Serial.`;
      this.pitar(false);
      this.responderAlCelular(false, this.aviso);
      this.cdr.detectChanges();
      return;
    }

    this.aviso = '';
    this.ultimo = codigo.limpio || texto;
    if (!this.conVeredicto) {
      this.pitar(true);
      this.mostrar(`Leído: ${this.ultimo}`, true);
    }
    if (!this.continuo && origen === 'camara') this.apagar();
    this.leido.emit(codigo);
    // Sin veredicto de la pantalla, al celular se le dice que llegó.
    if (origen === 'celular' && !this.conVeredicto) this.responderAlCelular(true, `Leído: ${this.ultimo}`);
    this.cdr.detectChanges();
  }

  // ── Lo que la pantalla que lo usa le contesta a cada lectura ──────────────

  /** La lectura sirvió: el cartel verde dice qué pasó con ella («Agregado · van 3»). */
  confirmar(texto: string): void {
    if (this.conVeredicto) this.pitar(true);
    this.mostrar(texto || `Leído: ${this.ultimo}`, true);
    this.responderAlCelular(true, texto || `Leído: ${this.ultimo}`);
  }

  /** La lectura no sirvió (repetido, de otro producto…): cartel rojo, vibración y tono grave. */
  rechazar(texto: string): void {
    this.pitar(false);
    this.mostrar(texto, false, 3800);
    this.responderAlCelular(false, texto);
  }

  // ── El celular como cámara ────────────────────────────────────────────────
  // El computador abre una sesión y muestra un QR; el celular lo escanea, abre su cámara y
  // manda cada código. Aquí se recogen cada segundo y entran por el mismo camino que los de
  // la cámara, de a uno: la respuesta de la pantalla (agregado, repetido…) vuelve al celular.

  private cabeceras(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` });
  }

  alternarCelular(): void {
    this.prepararSonido();
    this.celular || this.abriendoCelular ? this.cerrarCelular() : this.abrirCelular();
  }

  private abrirCelular(): void {
    this.apagar();
    this.error = '';
    this.abriendoCelular = true;
    this.http.post<any>(`${environment.rootUrl}api/escaner/sesiones`, { modo: this.modo, titulo: this.etiqueta || null }, { headers: this.cabeceras() }).subscribe({
      next: async r => {
        const token = r?.data?.token;
        if (!token) { this.abriendoCelular = false; this.error = 'No se pudo preparar el código para el celular.'; this.cdr.detectChanges(); return; }
        try {
          // La entrada de navegador de «qrcode» (la de Node arrastra pngjs); CommonJS: raíz o default.
          const modulo: any = await import('qrcode/lib/browser');
          const qr = typeof modulo?.toDataURL === 'function' ? modulo : modulo?.default;
          const imagen = await qr.toDataURL(`${location.origin}/escaner/${token}`, { width: 220, margin: 1 });
          this.celular = { token, qr: imagen, conectado: false, leidos: 0 };
          this.desde = 0;
          this.cola = [];
          this.remota = null;
          this.sondear();
        } catch {
          this.error = 'No se pudo dibujar el código QR.';
        }
        this.abriendoCelular = false;
        this.cdr.detectChanges();
      },
      error: () => { this.abriendoCelular = false; this.error = 'No se pudo preparar el código para el celular. Vuelva a intentar.'; this.cdr.detectChanges(); },
    });
  }

  cerrarCelular(): void {
    clearTimeout(this.relojCelular);
    clearTimeout(this.relojVeredicto);
    const token = this.celular?.token;
    this.celular = null;
    this.abriendoCelular = false;
    this.cola = [];
    this.remota = null;
    if (token) this.http.delete(`${environment.rootUrl}api/escaner/sesiones/${token}`, { headers: this.cabeceras() }).subscribe({ error: () => {} });
  }

  private sondear(): void {
    clearTimeout(this.relojCelular);
    const s = this.celular;
    if (!s) return;

    this.http.get<any>(`${environment.rootUrl}api/escaner/sesiones/${s.token}/lecturas`, { headers: this.cabeceras(), params: { desde: this.desde } }).subscribe({
      next: r => {
        if (this.celular?.token !== s.token) return;
        const d = r?.data ?? {};
        s.conectado = !!d.conectado;
        for (const l of d.lecturas ?? []) {
          this.desde = Math.max(this.desde, l.id);
          this.cola.push({ id: l.id, codigo: String(l.codigo) });
        }
        this.procesarCola();
        this.cdr.detectChanges();
        this.relojCelular = setTimeout(() => this.sondear(), 1000);
      },
      error: e => {
        if (this.celular?.token !== s.token) return;
        if (e?.status === 410) {
          this.celular = null;
          this.aviso = 'La conexión con el celular venció. Vuelva a tocar «Usar el celular».';
          this.cdr.detectChanges();
          return;
        }
        // Un corte de red: se sigue intentando, más despacio.
        this.relojCelular = setTimeout(() => this.sondear(), 3000);
      },
    });
  }

  private procesarCola(): void {
    if (this.remota !== null || !this.cola.length || !this.celular) return;
    const l = this.cola.shift()!;
    this.remota = l.id;
    this.celular.leidos++;
    // Si la pantalla no contesta en unos segundos, al celular se le dice que llegó.
    clearTimeout(this.relojVeredicto);
    this.relojVeredicto = setTimeout(() => this.responderAlCelular(true, 'Recibido en el computador'), 5000);
    this.entregar(l.codigo, 'celular');
  }

  private responderAlCelular(bien: boolean, texto: string): void {
    const id = this.remota;
    const s = this.celular;
    if (id === null || !s) return;
    clearTimeout(this.relojVeredicto);
    this.remota = null;
    this.http.post(`${environment.rootUrl}api/escaner/sesiones/${s.token}/veredicto`, { id, bien, texto: (texto || '').slice(0, 160) }, { headers: this.cabeceras() }).subscribe({ error: () => {} });
    // Para una sola lectura, con la primera alcanza.
    if (!this.continuo) { this.cerrarCelular(); return; }
    setTimeout(() => this.procesarCola(), 0);
  }

  private mostrar(texto: string, bien: boolean, ms = 2400): void {
    clearTimeout(this.relojFlash);
    this.flash = { texto, bien };
    this.relojFlash = setTimeout(() => { this.flash = null; this.cdr.detectChanges(); }, ms);
    this.cdr.detectChanges();
  }

  escrito(): void {
    const t = this.manual.trim();
    if (!t) return;
    this.prepararSonido();
    this.manual = '';
    this.entregar(t, 'teclado');
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  private limpiar(texto: string): string {
    return texto.toUpperCase().trim().replace(/^(S\/?N|SERIAL|GPON\s*SN|PON\s*SN)\s*[:#]?\s*/, '').replace(/[^0-9A-Z]/g, '');
  }

  private esMac(texto: string): boolean {
    const t = texto.toUpperCase().trim();
    // Doce dígitos sin letras es un serial numérico, no una MAC.
    return /^([0-9A-F]{2}[:\-]){5}[0-9A-F]{2}$/.test(t) || /^(?=.*[A-F])[0-9A-F]{12}$/.test(t);
  }

  /** Crea (o despierta) el audio dentro de un toque del usuario, que es cuando el navegador lo permite. */
  private prepararSonido(): void {
    try {
      this.audio ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audio.state === 'suspended') this.audio.resume().catch(() => {});
    } catch { /* sin sonido */ }
  }

  /**
   * Vibración y sonido: con el teléfono pegado a la etiqueta no se ve la pantalla.
   * Bien: dos tonos agudos, como una caja registradora. Mal: un zumbido grave.
   */
  private pitar(bien: boolean): void {
    try { navigator.vibrate?.(bien ? 120 : [80, 70, 80, 70, 80]); } catch { /* sin vibración */ }

    try {
      this.prepararSonido();
      const a = this.audio;
      if (!a) return;

      const tono = (frecuencia: number, desde: number, dura: number, forma: OscillatorType) => {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = forma;
        o.frequency.value = frecuencia;
        // Entrada y salida suaves: sin ellas el parlante del teléfono hace «clic».
        g.gain.setValueAtTime(0.0001, a.currentTime + desde);
        g.gain.exponentialRampToValueAtTime(0.5, a.currentTime + desde + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + desde + dura);
        o.connect(g); g.connect(a.destination);
        o.start(a.currentTime + desde); o.stop(a.currentTime + desde + dura + 0.02);
      };

      if (bien) { tono(1175, 0, 0.11, 'sine'); tono(1760, 0.11, 0.16, 'sine'); }
      else { tono(220, 0, 0.16, 'square'); tono(196, 0.2, 0.26, 'square'); }
    } catch { /* sin sonido */ }
  }

  private explicar(e: any): string {
    switch (e?.name) {
      case 'NotAllowedError':
      case 'SecurityError': return 'No hay permiso para usar la cámara. Actívelo en el candado de la barra de direcciones y vuelva a intentar' + (this.conCelular && this.ofrecerCelular ? ', o use la cámara del celular con «Usar el celular».' : '.');
      case 'NotFoundError': return 'Este equipo no tiene cámara. ' + (this.conCelular && this.ofrecerCelular ? 'Use la cámara del celular con «Usar el celular», escriba el código o use una pistola lectora.' : 'Escriba el código o use una pistola lectora.');
      case 'NotReadableError':
      case 'AbortError': return 'La cámara está ocupada por otra aplicación. Ciérrela y vuelva a intentar.';
      default: return 'No se pudo abrir la cámara. Escriba el código o vuelva a intentar.';
    }
  }

  private guardada(): string | undefined { try { return localStorage.getItem(GUARDADO) || undefined; } catch { return undefined; } }
  private guardar(id: string): void { try { localStorage.setItem(GUARDADO, id); } catch { /* sin almacenamiento */ } }
  private olvidar(): void { try { localStorage.removeItem(GUARDADO); } catch { /* sin almacenamiento */ } }
}
