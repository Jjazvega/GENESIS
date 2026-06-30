import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function AuthRequiredPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setErrorMessage(error?.message || 'No se pudo iniciar sesión. Revisa tus credenciales.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-[100svh] overflow-x-hidden overflow-y-auto bg-[#050505] px-5 pb-[clamp(1.5rem,4svh,3rem)] pt-[clamp(1.25rem,5svh,4rem)] text-amber-50 sm:px-8">
      <img
        className="absolute inset-0 h-full w-full object-cover object-center"
        src="/assets/auth-bg.png"
        alt=""
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-clamp(2.75rem,9svh,7rem))] w-full max-w-[760px] flex-col items-center justify-start">
        <img
          className="h-auto max-h-[34svh] w-[min(72vw,34rem)] shrink-0 object-contain"
          src="/assets/logo-full.png"
          alt="Gemailla IA"
        />

        <p className="mt-[clamp(0.75rem,2svh,1.25rem)] text-center text-base font-medium leading-7 text-amber-50/90 sm:text-lg">
          Inicia sesión con tu correo y contraseña para acceder al panel.
        </p>

        <form
          className="mt-[clamp(1rem,2.75svh,2rem)] w-full max-w-[680px] space-y-4 rounded-2xl border border-amber-300/20 bg-[#080808]/92 p-5 text-left shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-7"
          onSubmit={handleSubmit}
        >
          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/70" htmlFor="auth-email">
            Correo autorizado
          </label>
          <input
            id="auth-email"
            className="w-full rounded-lg border border-amber-300/20 bg-black/30 px-4 py-3 text-sm text-amber-50 outline-none transition focus:border-amber-200/70"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/70" htmlFor="auth-password">
            Contraseña
          </label>
          <input
            id="auth-password"
            className="w-full rounded-lg border border-amber-300/20 bg-black/30 px-4 py-3 text-sm text-amber-50 outline-none transition focus:border-amber-200/70"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {errorMessage && (
            <p className="rounded-lg border border-red-300/20 bg-red-500/10 p-3 text-xs leading-5 text-red-100" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            className="w-full rounded-lg bg-amber-200 px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-stone-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </main>
  );
}
