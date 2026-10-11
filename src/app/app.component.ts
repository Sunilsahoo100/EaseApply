import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="app-header">
      <div class="brand">
        <img src="icons/icon32.png" alt="" width="20" height="20" />
        <span>EaseApply</span>
      </div>
      <nav class="tabs">
        <a routerLink="/fill" routerLinkActive="active">Fill</a>
        <a routerLink="/profile" routerLinkActive="active">Profile</a>
        <a routerLink="/settings" routerLinkActive="active">Settings</a>
      </nav>
    </header>
    <main class="app-main">
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
