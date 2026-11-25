"use client";

import React, { useState } from "react";
import { FileText, Phone, Search, X } from "lucide-react";
import { WhatsAppIcon } from "../WhatsAppIcon";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import type { PortalUser } from "@/types/portal";

interface CustomerControlTabProps {
  allUsers: PortalUser[];
  custFilter: "all" | "issues";
  onChangeFilter: (filter: "all" | "issues") => void;
  onResetUserStrikes: (userId: string) => void;
  onToggleBlockUser: (userId: string, currentlyBlocked: boolean) => void;
  onUpdateCustomerNotes?: (
    userId: string,
    currentlyBlocked: boolean,
    adminNotes: string
  ) => Promise<void> | void;
}

export function CustomerControlTab({
  allUsers,
  custFilter,
  onChangeFilter,
  onResetUserStrikes,
  onToggleBlockUser,
  onUpdateCustomerNotes,
}: CustomerControlTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingNoteUserId, setEditingNoteUserId] = useState<string | null>(
    null
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const issueUsersCount = allUsers.filter(
    (u) => (u.noShowCount || 0) > 0 || u.isBlocked
  ).length;

  const q = searchQuery.trim().toLowerCase();
  const visibleUsers = allUsers.filter((u) => {
    const matchesIssue =
      custFilter === "issues" ? (u.noShowCount || 0) > 0 || u.isBlocked : true;
    if (!matchesIssue) return false;
    if (!q) return true;
    return [u.name, u.email, u.phone, u.adminNotes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">
            Control de Clientes y Faltas
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
            Al acumular 2 inasistencias se bloquean automáticamente. Al reiniciar faltas, las anteriores pasan al archivo histórico.
          </p>
        </div>
        <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-2.5 py-0.5 rounded-full self-start sm:self-auto whitespace-nowrap shrink-0">
          {allUsers.length} registrados
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => onChangeFilter("all")}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
            custFilter === "all"
              ? "bg-[#1F1F23] text-white shadow-sm"
              : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
          }`}
        >
          Todos ({allUsers.length})
        </button>
        <button
          type="button"
          onClick={() => onChangeFilter("issues")}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
            custFilter === "issues"
              ? "bg-[#1F1F23] text-white shadow-sm"
              : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
          }`}
        >
          <span>⚠️ Con faltas / Bloqueados</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-zinc-950 font-extrabold">
            {issueUsersCount}
          </span>
        </button>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar cliente por nombre, correo, teléfono o nota..."
          aria-label="Buscar clientes"
          className="w-full min-h-[38px] pl-9 pr-8 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Limpiar búsqueda de clientes"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {visibleUsers.map((u) => (
          <div
            key={u.id}
            className={`p-3.5 rounded-3xl border transition-all ${
              u.isBlocked
                ? "bg-red-50 border-red-200"
                : "bg-white border-zinc-200 shadow-sm"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-sm text-zinc-900 flex items-center gap-1.5 flex-wrap">
                  <span>{u.name}</span>
                  {u.isBlocked && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
                      BLOQUEADO
                    </span>
                  )}
                  {(u.noShowCount || 0) >= 2 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-zinc-950">
                      2+ Inasistencias
                    </span>
                  )}
                </div>
                <div className="text-zinc-500 text-[11px] mt-0.5 break-words">
                  {u.email} {u.phone ? `• ${u.phone}` : "• Sin teléfono"}
                </div>
              </div>

              <div className="sm:text-right shrink-0">
                <div className="text-[11px] text-zinc-600 whitespace-nowrap">
                  Asistidas: <b className="text-emerald-700">{u.completedCount || 0}</b> | Faltas vigentes:{" "}
                  <b className={(u.noShowCount || 0) > 0 ? "text-amber-700" : "text-zinc-600"}>
                    {u.noShowCount || 0}/2
                  </b>
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-zinc-100">
              {editingNoteUserId === u.id ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="text"
                    maxLength={500}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Nota interna privada (ej. Prefiere horario matutino)"
                    className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl border border-zinc-300 text-xs bg-white focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    type="button"
                    disabled={savingNote}
                    onClick={async () => {
                      if (!onUpdateCustomerNotes) return;
                      setSavingNote(true);
                      try {
                        await onUpdateCustomerNotes(
                          u.id,
                          u.isBlocked,
                          noteDraft.trim()
                        );
                        setEditingNoteUserId(null);
                      } finally {
                        setSavingNote(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-full bg-[#1F1F23] text-white text-[11px] font-bold"
                  >
                    {savingNote ? "Guardando..." : "Guardar nota"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingNoteUserId(null)}
                    className="px-2.5 py-1.5 rounded-full bg-zinc-100 text-zinc-700 text-[11px] font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 text-[11px] flex-wrap">
                  <div className="flex items-center gap-1.5 text-zinc-600 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">
                      {u.adminNotes ? (
                        <>
                          <b className="text-zinc-800">Nota interna:</b>{" "}
                          {u.adminNotes}
                        </>
                      ) : (
                        <span className="text-zinc-400 italic">
                          Sin notas internas
                        </span>
                      )}
                    </span>
                  </div>
                  {onUpdateCustomerNotes && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNoteUserId(u.id);
                        setNoteDraft(u.adminNotes || "");
                      }}
                      className="text-[11px] font-bold text-zinc-700 hover:text-black hover:underline shrink-0"
                    >
                      {u.adminNotes ? "Editar nota" : "+ Nota interna"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-zinc-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex gap-2">
                {u.phone && (
                  <>
                    <a
                      href={`tel:${u.phone}`}
                      className="px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-medium flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3" />
                      <span>Llamar</span>
                    </a>
                    <a
                      href={buildWhatsAppUrl(u.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold flex items-center gap-1"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(u.noShowCount || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => onResetUserStrikes(u.id)}
                    className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
                    title="Archivar faltas anteriores en su historial y devolver contador a 0/2"
                  >
                    {u.isBlocked
                      ? "🔄 Reiniciar faltas y Desbloquear"
                      : "🔄 Justificar / Archivar faltas"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onToggleBlockUser(u.id, u.isBlocked)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    u.isBlocked
                      ? "bg-zinc-800 text-white hover:bg-black"
                      : "bg-red-100 text-red-700 hover:bg-red-200"
                  }`}
                >
                  {u.isBlocked ? "Desbloquear" : "Bloquear Cuenta"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
