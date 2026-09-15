import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { SignInInterface } from '../models/sign-in-interfaces';

@Injectable({
  providedIn: 'root'
})
export class OauthService {

  env = environment

  constructor(private http: HttpClient) { }

  headers: HttpHeaders = new HttpHeaders({
    "Content-Type": "application/json",
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  });


  signin(signin: any): Observable<any> {
    var parameter = JSON.stringify({
      user: signin.user,
      password: signin.password,
      recordar: !!signin.recordar,
      // El subdominio de la empresa cuando se entra desde la raíz o se eligió de la lista.
      ...(signin.empresa ? { empresa: signin.empresa } : {}),
    });

    const url = this.env.rootUrl + 'api/oauth/signin'
    return this.http.post<SignInInterface>(url, parameter, { headers: this.headers })
  }


  /** Datos de quien inició sesión (nombre incluido). */
  getMe(): Observable<any> {
    return this.http.get(this.env.rootUrl + 'api/oauth/me', { headers: this.headers });
  }
}
