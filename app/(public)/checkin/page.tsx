"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";

type FormState = {
  nome: string;
  telefone: string;
  email: string;
  data_nascimento: string; // yyyy-mm-dd
};

const initialState: FormState = {
  nome: "",
  telefone: "",
  email: "",
  data_nascimento: "",
};

function normalizePhone(value: string) {
  const v = value.replace(/[^0-9+()\-\s]/g, "");
  return v.replace(/\s+/g, " ").trim();
}

function isValidEmail(email: string) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function CheckinPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = useMemo(() => {
    return form.nome.trim().length >= 2 && form.telefone.trim().length >= 7 && isValidEmail(form.email);
  }, [form.nome, form.telefone, form.email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          telefone: normalizePhone(form.telefone),
          email: form.email.trim() || null,
          data_nascimento: form.data_nascimento || null,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        toast.error(json?.error || "Nao foi possivel concluir o cadastro.");
        return;
      }

      toast.success("Cadastro enviado. Seja bem-vindo(a)!");
      setDone(true);
      setForm(initialState);
    } catch (err) {
      console.error(err);
      toast.error("Erro de conexao. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-6 sm:px-10 sm:py-8 border-b border-gray-100">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Cadastro rapido</h1>
          <p className="mt-2 text-gray-600">
            Preencha seus dados para a igreja manter contato com voce. Leva menos de 1 minuto.
          </p>
        </div>

        <div className="px-6 py-6 sm:px-10 sm:py-8">
          {done ? (
            <div className="rounded-xl bg-green-50 border border-green-200 p-5">
              <p className="text-lg font-semibold text-green-900">Obrigado! 😊</p>
              <p className="mt-1 text-green-900/80">Seu cadastro foi recebido com sucesso.</p>
              <button
                type="button"
                className="mt-4 w-full rounded-xl bg-gray-900 text-white py-4 text-lg font-semibold hover:bg-black transition"
                onClick={() => setDone(false)}
              >
                Cadastrar outra pessoa
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-900">Nome completo *</label>
                <input
                  value={form.nome}
                  onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Maria Silva"
                  autoComplete="name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900">Telefone / WhatsApp *</label>
                <input
                  value={form.telefone}
                  onChange={(e) => setForm((s) => ({ ...s, telefone: e.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: (416) 555-1234"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900">E-mail</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: maria@email.com"
                  autoComplete="email"
                  inputMode="email"
                />
                {!isValidEmail(form.email) && (
                  <p className="mt-2 text-sm text-red-600">Digite um e-mail valido.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900">Data de nascimento (opcional)</label>
                <input
                  type="date"
                  value={form.data_nascimento}
                  onChange={(e) => setForm((s) => ({ ...s, data_nascimento: e.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="w-full rounded-xl bg-blue-600 text-white py-4 text-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition"
              >
                {submitting ? "Enviando..." : "Enviar"}
              </button>

              <p className="text-xs text-gray-500 text-center">
                Ao enviar, voce concorda em receber contato da igreja por WhatsApp e/ou e-mail.
              </p>
            </form>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-gray-500">
        Se preferir, voce pode pedir ajuda a um voluntario.
      </p>
    </div>
  );
}