import { Component, OnDestroy, OnInit } from '@angular/core';
import { ThemeService } from './services';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'flowbite-dark-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dark-theme-toggle.component.html'  
})
export class DarkThemeToggleComponent implements OnInit, OnDestroy {
  private themeSubscription: Subscription | undefined = undefined;
  constructor(readonly themeService: ThemeService) {}

  ngOnInit(): void {
    if (typeof document !== 'undefined' && typeof localStorage !== 'undefined' && (
      localStorage.getItem('color-theme') === 'dark' ||
      (!('color-theme' in localStorage) &&
        'matchMedia' in window &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    )) {
      this.themeService.setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      this.themeService.setTheme('light');
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('dark');
      }
    }

    this.themeSubscription = this.themeService.$theme
      .asObservable()
      .subscribe((theme) => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('color-theme', theme);
        }
        if (typeof document !== 'undefined') {
          if (theme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      });
  }

  ngOnDestroy(): void {
    this.themeSubscription?.unsubscribe();
  }
}


// 2