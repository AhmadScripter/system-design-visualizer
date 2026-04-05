import { Routes } from '@angular/router';
import { Canvas } from './components/canvas/canvas';

export const routes: Routes = [
    { path: '', component: Canvas },
    { path: 'diagram/:id', component: Canvas },
];