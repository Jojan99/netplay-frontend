import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-confirm-email',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './confirm-email.component.html',
  styleUrl: '../sign-in/sign-in/sign-in.component.scss',
})
export class ConfirmEmailComponent {}
