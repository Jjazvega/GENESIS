import { AlertTriangle } from 'lucide-react';

export default function AuthErrorPage({ message = 'No se pudo validar la sesión.' }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#050505] px-6">
      <section className="w-full max-w-lg rounded-2xl border border-red-400/20 bg-[#080808] p-8 text-center shadow-2xl shadow-black/40">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-300">
          <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="mb-4 text-3xl font-bold text-red-100">
          Error de autenticación
        </h1>
        <p className="text-sm leading-6 text-stone-300">{message}</p>
      </section>
    </main>
  );
}
