import { Component } from '@angular/core';

@Component({
  selector: 'app-finance-design-concepts',
  standalone: true,
  template: `
    <iframe
      class="design-concepts-frame"
      src="/finance-design-concepts.html"
      title="Propuestas de diseño para Finanzas">
    </iframe>
  `,
  styles: [`
    :host { display: block; height: 100%; min-height: calc(100vh - 120px); }
    .design-concepts-frame { display: block; width: 100%; min-height: calc(100vh - 120px); border: 0; background: #e7edef; }
  `],
})
export class FinanceDesignConceptsComponent {}