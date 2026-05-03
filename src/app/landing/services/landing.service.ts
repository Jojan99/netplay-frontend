import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LandingConfig {
  company_id:       number;
  logo_url:         string | null;
  primary_color:    string;
  secondary_color:  string;
  accent_color:     string;
  hero_title:       string | null;
  hero_subtitle:    string | null;
  hero_cta_text:    string;
  hero_cta_url:     string | null;
  hero_image_url:   string | null;
  hero_bg_color:    string | null;
  sections_order:   string | null;
  contact_whatsapp: string | null;
  contact_email:    string | null;
  contact_phone:    string | null;
  contact_address:  string | null;
  meta_title:       string | null;
  is_published:     boolean;
}

export interface LandingSection {
  id:         number;
  type:       string;
  title:      string | null;
  sort_order: number;
  is_visible: boolean;
  content:    any;
  styles:     any;
}

export interface LandingData {
  company:  any;
  config:   LandingConfig;
  sections: LandingSection[];
  nav:      any[];
  plans:    any[];
}

@Injectable({ providedIn: 'root' })
export class LandingService {
  private http    = inject(HttpClient);
  private baseUrl = `${environment.rootUrl}api`;

  getBySlug(slug: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/landing/${slug}`);
  }
}
