import { Component, forwardRef,OnInit } from '@angular/core';
import { UserService } from '../../services/user.service';
import { UserInterface } from '../../models/user-interface';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
@Component({
  selector: 'app-history-facture',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './history-facture.component.html',
  styleUrl: './history-facture.component.scss'
})
export class HistoryFactureComponent  implements OnInit{
  constructor(
    private userService: UserService,
    private http: HttpClient
  ) { }
    
  ngOnInit() {
    this.getTypeContacte()
  }

  UserInterface: UserInterface[] = [];
  procesando = false; 
  getTypeContacte() {
    this.userService.getfile().subscribe(
      (data) => {
        console.log(data);

        this.UserInterface = data.files.map((e: any) => {
          return {
            names: e,
          };
        });
        // this.form.get('typecontacte')?.setValue(this.typeContacte[0]?.id);
      },
      (error) => {
        // this.alertService.showError('Error al obtener los generos');

      }
    );
  }


  ejecutarComando() {
    if (!confirm("¿Estás seguro de que deseas ejecutar este proceso?")) {
      return; // Si cancela, no hace nada
    }

    let password = prompt("Ingrese la contraseña para continuar:");

    if (password !== "n3t4dm1n") {
      alert("Contraseña incorrecta. No se ejecutará el proceso.");
      return;
    }

    this.procesando = true; // Desactivar botón
    alert("iniciando proceso")

    this.http.get("http://localhost:8000/api/facturation/ejecutar-comando", {})
      .subscribe({
        next: (response: any) => {
          alert(response.message);
        },
        error: (error) => {
          console.error("Error:", error);
          alert("Ocurrió un error al ejecutar el comando.");
        },
        complete: () => {
          this.procesando = false; // Habilitar botón nuevamente
    alert("proceso terminado")

        }
      });
  }


  getAuthToken(): string | null {
    return localStorage.getItem('token'); // Recupera el token desde localStorage
  }

  downloadFiles(name: any) {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getAuthToken()}`
     });
    const url = `https://netplay.com.co/netplay/public/api/dni/downloadFiles/${name}`;
    this.http.get(url, { headers, responseType: 'blob' }).subscribe(
      (data) => {
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = name;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      (error) => {
        console.error(error);
      }
    );
  }
}
