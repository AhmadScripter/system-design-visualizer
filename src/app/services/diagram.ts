import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

interface SaveResponse {
  id: string;
}

@Injectable({
  providedIn: 'root',
})

export class Diagram {
  private API_URL = 'http://localhost:3000/api/diagram';
  constructor(private http: HttpClient) { }

  saveDiagram(diagram: any) {
    return this.http.post<SaveResponse>(this.API_URL, diagram);
  }
  fetchDiagram(id: string) {
    return this.http.get(`${this.API_URL}/${id}`)
  }
}