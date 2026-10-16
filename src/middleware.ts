import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isPublicPath } from '@/auth/public-paths';
import { isUserAuthorized } from '@/auth/authorization';
import { decideAuthRouting, isSupabaseAuthCookie } from '@/auth/auth-routing';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;

  // Recursos públicos que no son /login (health, internos de Next, estáticos): sin sesión.
  if (pathname !== '/login' && isPublicPath(pathname)) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Verificar la sesión real con Supabase Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const decision = decideAuthRouting({
    pathname,
    isAuthenticated: Boolean(user),
    isAuthorized: user ? isUserAuthorized(user) : false,
  });

  if (decision.clearSession) {
    // Sesión válida pero NO autorizada: se cierra (local) y se expiran sus cookies
    // en esta misma respuesta, aunque la llamada remota falle.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // La expiración explícita de cookies de abajo garantiza el cierre igualmente.
    }
  }

  let result: NextResponse;
  if (decision.kind === 'next') {
    result = response;
  } else if (decision.kind === 'json') {
    result = NextResponse.json({ error: decision.error }, { status: decision.status });
  } else {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    url.search = decision.error ? `?error=${decision.error}` : '';
    result = NextResponse.redirect(url);
  }

  if (result !== response) {
    // Conservar en redirects / JSON las cookies que Supabase haya escrito (refresh o signOut).
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
  }

  if (decision.clearSession) {
    request.cookies
      .getAll()
      .filter((cookie) => isSupabaseAuthCookie(cookie.name))
      .forEach((cookie) => result.cookies.set(cookie.name, '', { path: '/', maxAge: 0 }));
  }

  return result;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images/assets with extensions (.svg, .png, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
