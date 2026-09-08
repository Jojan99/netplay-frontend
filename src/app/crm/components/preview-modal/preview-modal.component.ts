import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-preview-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './preview-modal.component.html',
  styleUrl: './preview-modal.component.scss'
})
export class PreviewModalComponent {

  @Input() url!: string;
  @Input() type!: 'image' | 'video' | 'audio' | 'document' |'pdf' | 'office';

  @Output() close = new EventEmitter<void>();

  constructor(private sanitizer: DomSanitizer) {}

  get safeUrl(): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.toEmbeddableUrl(this.url));
  }

  /** El backend de medios sirve por http; embeberlo en un iframe HTTPS lo bloquea (mixed content). */
  private toEmbeddableUrl(url: string): string {
    return this.type === 'pdf' && url.startsWith('http://')
      ? 'https://docs.google.com/gview?embedded=true&url=' + encodeURIComponent(url)
      : url;
  }
  

  get safeOfficeUrl(): SafeResourceUrl {
    const office =
      'https://view.officeapps.live.com/op/embed.aspx?src=' +
      encodeURIComponent(this.url);

    return this.sanitizer.bypassSecurityTrustResourceUrl(office);
  }

  download(): void {
    const link = document.createElement('a');
    link.href = this.url;
    link.download = this.fileName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  get fileLabel(): string { return this.fileName; }

  private get fileName(): string {
    const path = this.url.split('?')[0].split('#')[0];
    const name = path.substring(path.lastIndexOf('/') + 1);
    return name || (this.type === 'pdf' ? 'documento.pdf' : 'documento');
  }
}
