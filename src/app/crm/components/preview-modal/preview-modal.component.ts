import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-preview-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './preview-modal.component.html'
})
export class PreviewModalComponent {

  @Input() url!: string;
  @Input() type!: 'image' | 'video' | 'audio' | 'document' |'pdf' | 'office';

  @Output() close = new EventEmitter<void>();

  constructor(private sanitizer: DomSanitizer) {}

  get safeUrl(): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
  }
  

  get safeOfficeUrl(): SafeResourceUrl {
    const office =
      'https://view.officeapps.live.com/op/embed.aspx?src=' +
      encodeURIComponent(this.url);

    return this.sanitizer.bypassSecurityTrustResourceUrl(office);
  }
}
