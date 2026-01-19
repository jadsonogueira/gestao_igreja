"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

type FormState = {
  nome: string;
  telefoneDigits: string; // salva só dígitos
  email: string;
  data_nascimento: string; // yyyy-mm-dd
};

const initialState: FormState = {
  nome: "",
  telefoneDigits: "",
  email: "",
  data_nascimento: "",
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidEmail(email: string) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Formata telefone para exibir no input (sem mudar o valor real salvo).
 * Canada/US: (AAA) BBB-CCCC + extras
 */
function formatPhone(digits: string) {
  const d = onlyDigits(digits).slice(0, 15);

  // remove leading 1 (country code) para formatar melhor
  const hasLeading1 = d.length >= 11 && d.startsWith("1");
  const core = hasLeading1 ? d.slice(1) : d;

  const a = core.slice(0, 3);
  const b = core.slice(3, 6);
  const c = core.slice(6, 10);
  const rest = core.slice(10);

  let out = "";
  if (a) out += `(${a}`;
  if (a.length === 3) out += ") ";
  if (b) out += b;
  if (b.length === 3 && c) out += "-";
  if (c) out += c;
  if (rest) out += ` ${rest}`;

  return hasLeading1 ? `+1 ${out}`.trim() : out.trim();
}

export default function CheckinPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // refs para modo kiosk
  const nomeRef = useRef<HTMLInputElement | null>(null);
  const telRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const nascRef = useRef<HTMLInputElement | null>(null);
  const submitRef = useRef<HTMLButtonElement | null>(null);

  // foco automático ao abrir
  useEffect(() => {
    const t = setTimeout(() => nomeRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  const canSubmit = useMemo(() => {
    const nomeOk = form.nome.trim().length >= 2;
    const telOk = onlyDigits(form.telefoneDigits).length >= 10; // no Canadá geralmente 10 dígitos
    const emailOk = isValidEmail(form.email);
    return nomeOk && telOk && emailOk;
  }, [form.nome, form.telefoneDigits, form.email]);

  function goNext(current: "nome" | "tel" | "email" | "nasc") {
    if (current === "nome") return telRef.current?.focus();
    if (current === "tel") return emailRef.current?.focus();
    if (current === "email") return nascRef.current?.focus();
    if (current === "nasc") return submitRef.current?.focus();
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    current: "nome" | "tel" | "email" | "nasc"
  ) {
    if (e.key === "Enter") {
      e.preventDefault();

      // no último campo, tenta enviar
      if (current === "nasc") {
        if (canSubmit && !submitting) {
          submitRef.current?.click();
        } else {
          // se não pode enviar, volta pro primeiro erro provável
          if (form.nome.trim().length < 2) nomeRef.current?.focus();
          else if (onlyDigits(form.telefoneDigits).length < 10) telRef.current?.focus();
          else if (!isValidEmail(form.email)) emailRef.current?.focus();
        }
        return;
      }

      goNext(current);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        telefone: onlyDigits(form.telefoneDigits), // envia só dígitos
        email: form.email.trim() || null,
        data_nascimento: form.data_nascimento || null,
      };

      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        toast.error(json?.error || "Nao foi possivel concluir o cadastro.");
        return;
      }

      const action = json?.action === "updated" ? "Cadastro atualizado!" : "Cadastro realizado!";
      toast.success(action);

      setDone(true);
      setForm(initialState);
    } catch (err) {
      console.error(err);
      toast.error("Erro de conexao. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewPerson() {
    setDone(false);
    setForm(initialState);
    setTimeout(() => nomeRef.current?.focus(), 200);
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-6 sm:px-10 sm:py-8 border-b border-gray-100">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Seja bem-vindo(a)! 🤍</h1>
          <p className="mt-2 text-gray-600">
            Que alegria ter você com a gente!
Preencha seus dados para que possamos caminhar juntos e manter contato com você.
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
                onClick={handleNewPerson}
              >
                Cadastrar outra pessoa
              </button>

              <p className="mt-3 text-xs text-green-900/70 text-center">
                Dica: deixe esta tela aberta no tablet durante a recepcao.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-900">Nome completo *</label>
                <input
                  ref={nomeRef}
                  value={form.nome}
                  onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
                  onKeyDown={(e) => handleKeyDown(e, "nome")}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Maria Silva"
                  autoComplete="name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900">Telefone / WhatsApp *</label>

                {/* Input mostra formatado, mas salva só dígitos */}
                <input
                  ref={telRef}
                  value={formatPhone(form.telefoneDigits)}
                  onChange={(e) => {
                    const digits = onlyDigits(e.target.value);
                    setForm((s) => ({ ...s, telefoneDigits: digits }));
                  }}
                  onKeyDown={(e) => handleKeyDown(e, "tel")}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: (416) 555-1234"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                />

                <p className="mt-2 text-xs text-gray-500">
                  Dica: pode digitar apenas os numeros (ex.: 4165551234).
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900">E-mail</label>
                <input
                  ref={emailRef}
                  value={form.email}
                  onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  onKeyDown={(e) => handleKeyDown(e, "email")}
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
                  ref={nascRef}
                  type="date"
                  value={form.data_nascimento}
                  onChange={(e) => setForm((s) => ({ ...s, data_nascimento: e.target.value }))}
                  onKeyDown={(e) => handleKeyDown(e, "nasc")}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                ref={submitRef}
                type="submit"
                disabled={!canSubmit || submitting}
                className="w-full rounded-xl bg-blue-600 text-white py-4 text-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition"
              >
                {submitting ? "Enviando..." : "Enviar"}
              </button>

              <p className="text-xs text-gray-500 text-center">
  Ao enviar, voce autoriza a igreja a entrar em contato com voce por WhatsApp, SMS e/ou e-mail.
</p>
            </form>
          )}
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
  Se preferir, um voluntario pode te ajudar com o cadastro. 🤍
</div>
    </div>
  );
}