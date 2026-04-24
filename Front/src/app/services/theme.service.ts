import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly KEY = 'crm_theme';
  isDark = signal<boolean>(true);

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(this.KEY);
      if (saved) {
        this.isDark.set(saved === 'dark');
      } else {
        this.isDark.set(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
      }
      this.apply();
    }
  }

  toggle(): void {
    this.isDark.set(!this.isDark());
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.KEY, this.isDark() ? 'dark' : 'light');
    }
    this.apply();
  }

  private apply(): void {
    if (typeof document !== 'undefined') {
      if (this.isDark()) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }
}
