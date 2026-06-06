import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  ElementRef,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

export type ScanMode  = 'ref' | 'serial';
export type CodeClass = 'serial' | 'mac' | 'ref' | 'unknown';

export interface ScannedCode {
  raw:   string;
  clean: string;
  type:  CodeClass;
  label: string;
}

// Known ONT/router serial number prefixes (brand → regex)
const SN_PREFIXES = /^(HWTC|ZTEG|CDATA|FHTT|TPLK|ALPH|ADTN|ISKR|DASAN|BDCOM)[A-Z0-9]{4,18}$/i;

// MAC: 12 hex chars (with or without separators)
const MAC_RE = /^([0-9A-Fa-f]{2}[:\-.]?){5}[0-9A-Fa-f]{2}$|^[0-9A-Fa-f]{12}$/;

// Generic SN heuristic: 8–24 chars, mixed letters + digits, not pure hex-12
function classifyCode(raw: string): ScannedCode {
  const clean = raw.replace(/[:\-.\s]/g, '').toUpperCase();

  // MAC address
  if (MAC_RE.test(raw) || (clean.length === 12 && /^[0-9A-F]+$/.test(clean))) {
    return { raw, clean, type: 'mac',    label: 'Dirección MAC' };
  }

  // Known ONT SN prefix
  if (SN_PREFIXES.test(raw)) {
    return { raw, clean, type: 'serial', label: 'Número de Serie' };
  }

  // Generic SN: 8-24 alphanumeric, has BOTH letters and digits, not pure numeric
  if (
    /^[A-Z0-9]{8,24}$/i.test(raw) &&
    /[A-Z]/i.test(raw) &&
    /[0-9]/.test(raw)
  ) {
    return { raw, clean, type: 'serial', label: 'Número de Serie' };
  }

  // Short or pure-numeric → probably a model/ref code
  return { raw, clean, type: 'ref', label: 'Referencia / Modelo' };
}

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './barcode-scanner.component.html',
  styleUrl:    './barcode-scanner.component.scss',
})
export class BarcodeScannerComponent implements OnDestroy {
  /** 'ref'    → looking for item SKU/code (accepts anything)          */
  /** 'serial' → looking for equipment SN (rejects MACs automatically) */
  @Input()  mode: ScanMode = 'ref';
  @Output() scanned  = new EventEmitter<string>();
  @Output() rejected = new EventEmitter<ScannedCode>();  // emitted when MAC detected in serial mode

  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;

  manualInput   = '';
  cameraActive  = false;
  loading       = false;
  error         = '';
  torchSupported = false;
  torchOn       = false;

  lastCode: ScannedCode | null = null;

  private reader   = new BrowserMultiFormatReader();
  private controls: IScannerControls | null = null;
  private videoTrack: MediaStreamTrack | null = null;

  constructor(private cdr: ChangeDetectorRef, private zone: NgZone) {}

  get modeLabel(): string {
    return this.mode === 'serial'
      ? 'Apunta al CÓDIGO DE SERIE (SN) del equipo'
      : 'Apunta al código de referencia / SKU del equipo';
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  async toggleCamera(): Promise<void> {
    if (this.cameraActive || this.loading) { this.stopCamera(); return; }
    await this.startCamera();
  }

  private async startCamera(): Promise<void> {
    this.error = '';
    this.lastCode = null;
    this.loading = true;
    this.cameraActive = true;
    this.cdr.detectChanges();            // render <video> before ZXing needs it

    try {
      this.controls = await this.reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        this.videoEl!.nativeElement,
        (result, _err) => {
          if (!result) return;
          this.zone.run(() => this.handleResult(result.getText()));
        },
      );

      // Detect torch support after stream starts
      this.videoTrack = this.videoEl?.nativeElement
        .srcObject instanceof MediaStream
        ? (this.videoEl.nativeElement.srcObject as MediaStream).getVideoTracks()[0]
        : null;

      if (this.videoTrack) {
        const caps = this.videoTrack.getCapabilities() as any;
        this.torchSupported = !!caps?.torch;
      }

      this.loading = false;
      this.cdr.detectChanges();
    } catch (e: any) {
      this.loading = false;
      this.cameraActive = false;
      this.torchSupported = false;
      if (e?.name === 'NotAllowedError') {
        this.error = 'Permiso de cámara denegado. Habilítalo en Configuración del navegador.';
      } else if (e?.name === 'NotFoundError') {
        this.error = 'No se encontró ninguna cámara.';
      } else {
        this.error = 'No se pudo iniciar la cámara. Asegúrate de usar HTTPS.';
      }
      this.cdr.detectChanges();
    }
  }

  private handleResult(raw: string): void {
    const code = classifyCode(raw);
    this.lastCode = code;

    // In serial mode, reject MACs and show a clear message
    if (this.mode === 'serial' && code.type === 'mac') {
      this.error = `Código MAC detectado (${raw}). Apunta al código de SERIE del equipo.`;
      this.cdr.detectChanges();
      this.rejected.emit(code);
      return;         // keep camera open, let user try again
    }

    this.error = '';
    this.stopCamera();
    this.scanned.emit(raw);
  }

  stopCamera(): void {
    this.controls?.stop();
    this.controls   = null;
    this.videoTrack = null;
    this.cameraActive  = false;
    this.loading       = false;
    this.torchOn       = false;
    this.torchSupported = false;
  }

  async toggleTorch(): Promise<void> {
    if (!this.videoTrack || !this.torchSupported) return;
    this.torchOn = !this.torchOn;
    await (this.videoTrack.applyConstraints as any)({
      advanced: [{ torch: this.torchOn }],
    });
  }

  // ── Manual / USB ──────────────────────────────────────────────────────────

  onManualEnter(): void {
    const val = this.manualInput.trim();
    if (!val) return;
    this.manualInput = '';
    this.handleResult(val);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  ngOnDestroy(): void { this.stopCamera(); }
}
