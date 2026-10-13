import { errorMessage } from '../../shared/messages';
import type { AuthUser } from '../../shared/profile.model';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export const googleSignInConfigured = !!CLIENT_ID;

interface UserInfo {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

/**
 * Opens Google's account chooser and returns the chosen account. The access token is used once to read
 * the name, email and picture, then dropped; nothing else in the Google account is touched.
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  if (!CLIENT_ID) throw new Error('Google sign-in is not configured. Add VITE_GOOGLE_CLIENT_ID to .env.local and rebuild.');
  const redirectUri = chrome.identity.getRedirectURL();
  const state = crypto.randomUUID();
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
  }).toString();

  let redirect: string | undefined;
  try {
    redirect = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true });
  } catch (err) {
    const msg = errorMessage(err);
    if (/did not approve|cancel/i.test(msg)) throw new Error('Sign-in was cancelled.');
    if (/could not be loaded/i.test(msg)) {
      throw new Error(`Google sign-in page failed to load. Check that ${redirectUri} is an authorized redirect URI of your OAuth client.`);
    }
    throw err;
  }
  if (!redirect) throw new Error('Sign-in was cancelled.');

  const params = new URLSearchParams(new URL(redirect).hash.slice(1));
  const error = params.get('error');
  if (error) throw new Error(error === 'access_denied' ? 'Sign-in was cancelled.' : `Google sign-in failed: ${error}`);
  const token = params.get('access_token');
  if (!token || params.get('state') !== state) throw new Error('Google sign-in returned an unexpected response. Please try again.');

  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Couldn't read your Google profile (HTTP ${res.status}). Please try again.`);
  const info = (await res.json()) as UserInfo;
  if (!info.sub || !info.email) throw new Error('Google did not share an email address for this account.');
  return {
    id: info.sub,
    email: info.email,
    name: info.name ?? info.email,
    givenName: info.given_name ?? '',
    familyName: info.family_name ?? '',
    picture: info.picture ?? '',
    signedInAt: Date.now(),
  };
}
