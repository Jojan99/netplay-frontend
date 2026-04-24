import { AfterViewInit, Component } from '@angular/core';
import { Carousel } from 'flowbite';

@Component({
  selector: 'app-body',
  standalone: true,
  imports: [],
  templateUrl: './body.component.html',
  styleUrl: './body.component.scss'
})
export class BodyComponent implements AfterViewInit {

  ngAfterViewInit(): void {
    const carouselElement = document.getElementById('carousel-example');

    const el1 = document.getElementById('carousel-item-1');
    const el2 = document.getElementById('carousel-item-2');
    const el3 = document.getElementById('carousel-item-3');
    const el4 = document.getElementById('carousel-item-4');

    if (carouselElement && el1 && el2 && el3 && el4) {
      const items = [
        { position: 0, el: el1 },
        { position: 1, el: el2 },
        { position: 2, el: el3 },
        { position: 3, el: el4 }
      ];

      const options = {
        defaultPosition: 0,
        interval: 3000,
        indicators: {
          activeClasses: 'bg-white dark:bg-gray-800',
          inactiveClasses: 'bg-white/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800',
          items: [
            { position: 0, el: document.getElementById('carousel-indicator-1')! },
            { position: 1, el: document.getElementById('carousel-indicator-2')! },
            { position: 2, el: document.getElementById('carousel-indicator-3')! },
            { position: 3, el: document.getElementById('carousel-indicator-4')! },
          ],
        },
        onNext: () => console.log('next slider item is shown'),
        onPrev: () => console.log('previous slider item is shown'),
        onChange: () => console.log('new slider item has been shown'),
      };

      // ✅ Instanciar y activar el autoplay
      const carousel = new Carousel(carouselElement, items, options);

      // ✅ Forzar el inicio automático
      carousel.cycle();  // ← Este es el paso clave
    }
  }
}
