"use client";

import { useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: "superadmin" | "member";
  ms_oid: string | null;
  phone: string | null;
}

interface Me {
  user: { id: string; email: string; role: string };
  company: { name: string } | null;
}

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"member" | "superadmin">("member");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  async function loadUsers() {
    const res = await fetch("/api/admin/users");
    if (res.status === 403 || res.status === 401) {
      setAllowed(false);
      return;
    }
    setAllowed(true);
    const data = await res.json();
    setUsers(data.users ?? []);
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.authenticated && setMe(d))
      .catch(() => {});
    loadUsers();
  }, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name || undefined,
          role,
          phone: phone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "No se pudo crear el usuario.");
      } else {
        setEmail("");
        setName("");
        setPhone("");
        setRole("member");
        await loadUsers();
      }
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(id: string, newRole: "member" | "superadmin") {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo cambiar el rol.");
    }
    await loadUsers();
  }

  function startEdit(u: User) {
    setEditingId(u.id);
    setEditName(u.name ?? "");
    setEditPhone(u.phone ?? "");
    setError(null);
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, phone: editPhone }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo guardar.");
    } else {
      setEditingId(null);
    }
    await loadUsers();
  }

  async function removeUser(id: string, who: string) {
    if (!confirm(`¿Eliminar a ${who}? Perderá el acceso.`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo eliminar.");
    }
    await loadUsers();
  }

  if (allowed === false) {
    return (
      <>
        <h1>Administración</h1>
        <div className="card">
          <p className="error">
            ✗ No tienes permiso para ver esta página (solo el superadmin).
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Administración</h1>
      <p className="subtitle">
        Usuarios de {me?.company?.name ?? "tu empresa"}. Da de alta a alguien por
        email; podrá entrar con su cuenta de Microsoft.
      </p>

      {error && (
        <div className="card">
          <p className="error">✗ {error}</p>
        </div>
      )}

      <form onSubmit={addUser} className="card">
        <h2 className="card-title">Agregar usuario</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@empresa.com"
            required
            style={{ flex: "2 1 220px" }}
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (opcional)"
            style={{ flex: "1 1 140px" }}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="WhatsApp (52155…)"
            style={{ flex: "1 1 150px" }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "member" | "superadmin")}
          >
            <option value="member">Miembro</option>
            <option value="superadmin">Superadmin</option>
          </select>
          <button type="submit" disabled={adding || !email.trim()}>
            {adding ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </form>

      <div className="card">
        <h2 className="card-title">Usuarios ({users.length})</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>WhatsApp</th>
              <th>Rol</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const editing = editingId === u.id;
              return (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    {editing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nombre"
                        style={{ width: 150 }}
                      />
                    ) : (
                      u.name || "—"
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="52155…"
                        style={{ width: 150 }}
                      />
                    ) : (
                      u.phone || "—"
                    )}
                  </td>
                  <td>
                    <select
                      value={u.role}
                      onChange={(e) =>
                        changeRole(u.id, e.target.value as "member" | "superadmin")
                      }
                      disabled={u.id === me?.user.id}
                    >
                      <option value="member">Miembro</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </td>
                  <td>
                    {u.ms_oid ? (
                      <span className="success">activo</span>
                    ) : (
                      <span className="muted">sin primer login</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {editing ? (
                      <>
                        <button type="button" onClick={() => saveEdit(u.id)}>
                          Guardar
                        </button>{" "}
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => startEdit(u)}
                        >
                          Editar
                        </button>{" "}
                        {u.id !== me?.user.id && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => removeUser(u.id, u.email)}
                          >
                            Eliminar
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
