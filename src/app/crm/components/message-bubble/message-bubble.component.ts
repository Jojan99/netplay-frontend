import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Output,
  EventEmitter,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

export interface ChatMessage {
  id: number;
  from: 'customer' | 'agent' | 'system';
  content: string | null;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'reaction';
  media_url?: string | null;
  mime_type?: string | null;
  at: string;
  pending?: boolean;
  is_forwarded?: boolean;
  agent_signature?: string | null;
  is_note?: boolean;
  _renderKey?: number;
}

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-bubble.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageBubbleComponent implements OnChanges {

  @Input() message!: ChatMessage;

  @Output() openPreview  = new EventEmitter<{ url: string; type: 'pdf' | 'office' | 'image' }>();
  @Output() forwardMsg   = new EventEmitter<ChatMessage>();
  @Output() saveSticker  = new EventEmitter<string>();

  showContextMenu = false;
  contextX = 0;
  contextY = 0;

  constructor(
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['message']) {
      this.cdr.markForCheck();
    }
  }

  /* ── Tipo de mensaje ─────────────────────────────────────────── */
  get isImage()    { return this.message?.message_type === 'image'; }
  get isVideo()    { return this.message?.message_type === 'video'; }
  get isAudio()    { return this.message?.message_type === 'audio'; }
  get isDocument() { return this.message?.message_type === 'document'; }
  get isSticker()  { return this.message?.message_type === 'sticker'; }
  get isLocation() { return this.message?.message_type === 'location'; }
  get isContact()  { return this.message?.message_type === 'contact'; }
  get isReaction() { return this.message?.message_type === 'reaction'; }
  get isNote()     { return this.message?.is_note; }

  /* ── Documentos ──────────────────────────────────────────────── */
  get isPdf(): boolean {
    if (!this.isDocument) return false;
    return this.message?.mime_type === 'application/pdf'
      || !!this.message?.media_url?.toLowerCase().endsWith('.pdf');
  }

  get isOffice(): boolean {
    if (!this.isDocument) return false;
    return !!this.message?.mime_type?.startsWith('application/vnd.openxmlformats')
      || this.message?.mime_type === 'application/msword'
      || !!this.message?.media_url?.toLowerCase().match(/\.(docx?|xlsx?|pptx?)$/);
  }

  get isArchive(): boolean {
    if (!this.isDocument) return false;
    return !!this.message?.mime_type?.match(/zip|rar|octet-stream/)
      || !!this.message?.media_url?.toLowerCase().match(/\.(zip|rar|7z|tar|gz|bin)$/);
  }

  /* ── URLs seguras ────────────────────────────────────────────── */
  get safePdfUrl(): SafeResourceUrl | null {
    if (!this.message?.media_url) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.message.media_url);
  }

  get safeOfficeUrl(): SafeResourceUrl | null {
    if (!this.message?.media_url) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(this.message.media_url)
    );
  }

  /* ── Localización ────────────────────────────────────────────── */
  get locationCoords(): { lat: string; lng: string } | null {
    if (!this.isLocation || !this.message.content) return null;
    const m = this.message.content.match(/lat ([0-9.-]+), lng ([0-9.-]+)/);
    if (!m) return null;
    return { lat: m[1], lng: m[2] };
  }

  get mapsUrl(): string {
    const c = this.locationCoords;
    if (!c) return '#';
    return `https://www.google.com/maps?q=${c.lat},${c.lng}`;
  }

  /* ── Acciones ────────────────────────────────────────────────── */
  openPdf()    { if (this.message?.media_url) this.openPreview.emit({ url: this.message.media_url, type: 'pdf' }); }
  openOffice() { if (this.message?.media_url) this.openPreview.emit({ url: this.message.media_url, type: 'office' }); }
  openImage()  { if (this.message?.media_url) this.openPreview.emit({ url: this.message.media_url, type: 'image' }); }

  toggleVideo(v: HTMLVideoElement)     { v.paused ? v.play() : v.pause(); }
  openFullscreen(v: HTMLVideoElement)  { document.querySelectorAll('video').forEach(x => { if (x !== v) x.pause(); }); v.requestFullscreen?.(); v.play(); }
  onVideoEnded(v: HTMLVideoElement)    { v.currentTime = 0; }
  onImageError(e: Event)               { (e.target as HTMLImageElement).style.display = 'none'; }

  /* ── Menú contextual (reenviar, copiar) ──────────────────────── */
  onRightClick(event: MouseEvent): void {
    event.preventDefault();
    this.contextX = event.clientX;
    this.contextY = event.clientY;
    this.showContextMenu = true;
    this.cdr.markForCheck();
  }

  @HostListener('document:click')
  closeContextMenu(): void {
    if (this.showContextMenu) {
      this.showContextMenu = false;
      this.cdr.markForCheck();
    }
  }

  copyText(): void {
    if (this.message.content) {
      navigator.clipboard.writeText(this.message.content).catch(() => {});
    }
    this.showContextMenu = false;
  }

  forward(): void {
    this.forwardMsg.emit(this.message);
    this.showContextMenu = false;
  }
}
