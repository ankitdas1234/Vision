import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usersApi } from "../api/users";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";
import Avatar from "../components/common/Avatar";

const ROLES = ["USER", "TRUSTED", "ADMIN"];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const refresh = () => usersApi.list().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  return (
    <Card title="Users" className="x1">
      <p className="text-xs text-vision-muted mb-4">Admin-only. Roles and account status are enforced server side on every request this page cannot itself grant access.</p>
      {error && <p className="text-xs text-vision-danger mb-3">{error}</p>}
      {users.length === 0 ? <EmptyState className="text-sm" message="No users yet." /> : (
        <table className="w-full text-sm">
          <thead className="text-vision-muted text-left"><tr><th></th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-vision-border/5">
                <td className="py-2"><Avatar src={u.avatarUrl} name={u.name} size="sm" /></td>
                <td className="py-2">
                  <Link to={`/dashboard/users/${u.id}`} className="hover:text-vision-accent hover:underline">{u.name}</Link>
                </td>
                <td className="text-vision-muted">{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => usersApi.setRole(u.id, e.target.value).then(refresh)}
                    className="bg-vision-hover/5 rounded px-2 py-1 text-xs text-black outline-none"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td><Badge tone={u.isActive ? "ok" : "danger"}>{u.isActive ? "ACTIVE" : "DISABLED"}</Badge></td>
                <td className="text-vision-muted text-xs">{u.lastLoginAt ?? "never"}</td>
                <td>
                  <Button variant="ghost" onClick={() => usersApi.setStatus(u.id, !u.isActive).then(refresh)}>
                    {u.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
