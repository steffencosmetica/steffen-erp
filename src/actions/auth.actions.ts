'use server';

import { redirect } from 'next/navigation';
import { requireAuthenticatedUser, getUserServerSupabaseClient } from '@/auth/guard';
import { isSupabaseAuthCookie } from '@/auth/auth-routing';
import { StockDomainService } from '@/services/stock.service';
import { StockRepository } from '@/repositories/stock.repository';
import { serverSupabase } from '@/database/server';

/**
 * Server Action para cerrar sesión.
 * Invalida la sesión actual en Supabase Auth y redirige a /login.
 */
export async function logoutAction() {
  try {
    const supabase = await getUserServerSupabaseClient();
    await supabase.auth.signOut();
  } catch {
    // Continuar con la redirección incluso si la llamada remota falla
  }

  // Si signOut falló (p. ej. red), la sesión local seguiría viva y /login devolvería a /:
  // se expiran explícitamente las cookies de sesión SSR para que /login quede accesible.
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    cookieStore
      .getAll()
      .filter((cookie) => isSupabaseAuthCookie(cookie.name))
      .forEach((cookie) => cookieStore.delete(cookie.name));
  } catch {
    // Fuera del contexto de request no hay cookies que limpiar.
  }

  redirect('/login');
}

/**
 * Server Action protegida de ejemplo que demuestra el guard central:
 * Toda operación server-side privilegiada exige requireAuthenticatedUser()
 * ANTES de invocar repositorios o domain services con service_role.
 */
export async function executeProtectedStockQuery(stockItemId: string, explicitToken?: string) {
  // 1. Guard server-side obligatorio: verifica sesión del usuario
  const user = await requireAuthenticatedUser(explicitToken);

  // 2. Solo después de la verificación se autoriza el uso de servicios de dominio con service_role
  const repo = new StockRepository(serverSupabase);
  const service = new StockDomainService(repo);
  const balance = await service.getStockBalance(stockItemId);

  return {
    authorizedByUserId: user.id,
    stockItemId,
    balance: balance.toString(),
  };
}
