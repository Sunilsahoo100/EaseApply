import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { StorageService } from './services/storage.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LoginComponent],
  template: `
    @if (!store.loaded()) {
      <p class="muted app-main">Loading…</p>
    } @else if (store.user(); as user) {
      <header class="app-header">
        <div class="brand">
          <img src="icons/icon32.png" alt="" width="20" height="20" />
          <span class="grow">EaseApply</span>
          <a class="avatar-link" routerLink="/settings" [title]="user.name + ' (' + user.email + ')'">
            @if (user.picture) {
              <img class="avatar" [src]="user.picture" alt="" referrerpolicy="no-referrer" />
            } @else {
              <span class="avatar">{{ user.name.charAt(0).toUpperCase() }}</span>
            }
          </a>
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
    } @else {
      <main class="app-main">
        <app-login />
      </main>
    }
  `,
})
export class AppComponent {
  protected readonly store = inject(StorageService);
}
