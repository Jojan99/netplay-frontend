import { Component } from '@angular/core';
import { FooterComponent } from '../footer/footer.component';
import { NavbarComponent } from '../navbar/navbar.component';
import { BodyComponent } from '../body/body.component';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [FooterComponent,
    NavbarComponent,
    BodyComponent
  ],
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.scss'
})
export class InicioComponent {

}
