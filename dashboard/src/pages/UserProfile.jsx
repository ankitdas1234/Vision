import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { usersApi } from "../api/users";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import Avatar from "../components/common/Avatar";
import EmptyState from "../components/common/EmptyState";
const ROLES = ["USER", "TRUSTED", "ADMIN"];

export default function UserProfile() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  const refresh = () => usersApi.get(id).then(setUser).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, [id]);

  if (error) return <Card title="User"><p className="text-xs text-vision-danger">{error}</p></Card>;
  if (!user) return <Card title="User"><EmptyState message="Loading…" /></Card>;

  return (
    <div className="space-y-4">
      <Link to="/dashboard/users" className="text-xs text-vision-muted hover:text-vision-text">&larr; Back to Users</Link>
      <Card>
        <div className="flex items-start gap-5">
          <Avatar src={user.avatarUrl} name={user.name} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-vision-text">{user.name}</h2>
              <Badge tone={user.role === "ADMIN" ? "ok" : "neutral"}>{user.role}</Badge>
              <Badge tone={user.isActive ? "ok" : "danger"}>{user.isActive ? "ACTIVE" : "DISABLED"}</Badge>
              {!user.isVerified && <Badge tone="warn">UNVERIFIED EMAIL</Badge>}
            </div>
            <p className="text-sm text-vision-muted">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
          <div><div className="text-xs text-vision-muted">Account created</div><div>{new Date(user.createdAt).toLocaleString()}</div></div>
          <div><div className="text-xs text-vision-muted">Last updated</div><div>{new Date(user.updatedAt).toLocaleString()}</div></div>
          <div><div className="text-xs text-vision-muted">Last login</div><div>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "never"}</div></div>
          <div><div className="text-xs text-vision-muted">User ID</div><div className="text-vision-muted text-xs">{user.id}</div></div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-vision-border/10">
          <label className="text-xs text-vision-muted">Role</label>
          <select
            value={user.role}
            onChange={(e) => usersApi.setRole(user.id, e.target.value).then(refresh)}
            className="bg-vision-hover/5 rounded px-2 py-1 text-xs outline-none"
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <Button variant="ghost" onClick={() => usersApi.setStatus(user.id, !user.isActive).then(refresh)}>
            {user.isActive ? "Deactivate account" : "Reactivate account"}
          </Button>
        </div>
        <p className="text-xs text-vision-muted mt-3">Roles and account status are enforced server-side on every request — changing them here doesn't itself grant or revoke anything beyond what the server already checks.</p>
      </Card>

      <Card title="Linked person">
        <p className="text-xs text-vision-muted mb-2">Whether this login account is tied to the same identity Vision recognizes in person — see docs/people.md "One identity, however you first met".</p>
        {user.linkedPerson ? (
          <div className="flex items-center gap-3">
            <Avatar src={user.linkedPerson.photoUrl} name={user.linkedPerson.name} size="md" />
            <div>
              <Link to={`/dashboard/people/${user.linkedPerson.id}`} className="text-sm hover:text-vision-accent hover:underline">{user.linkedPerson.name ?? "Unnamed person"}</Link>
              <div className="text-xs text-vision-muted">View their full profile, timeline, and learned facts</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-vision-muted">Not linked yet — this account was created without a face capture (or one couldn't be matched/registered). They can link it later from Settings.</p>
        )}
      </Card>
    </div>
  );
}
