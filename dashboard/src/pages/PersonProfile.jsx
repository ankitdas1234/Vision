import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { peopleApi } from "../api/people";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import Avatar from "../components/common/Avatar";
import EmptyState from "../components/common/EmptyState";

const VERIFICATION_TONE = { VERIFIED: "ok", UNVERIFIED: "neutral", REQUIRES_REVIEW: "warn", REJECTED: "danger" };

/** One learned/inferred fact about this person, with an honest trail of
 * where it came from. Read-only on purpose — there's no Confirm/Reject/
 * Correct button here. Vision handles corrections itself, out loud,
 * next time it sees the admin (see docs/people.md "Provenance" and
 * server/src/people/PendingMemoryReview.ts) — this card exists so an
 * admin can see what Vision currently believes, not to change it from
 * the dashboard.
 *
 * Shows the raw `source` value rather than bucketing it into a
 * "stated by person" vs "AI-generated" label — this codebase doesn't
 * actually have that clean a taxonomy today (real values are things
 * like "PI_SCRIPT" and "SYSTEM"; only "ADMIN" is currently treated as
 * special, auto-verified — see memory/dynamic/verification.ts).
 * Inventing a friendlier-sounding bucket that isn't grounded in what
 * the source field actually contains would be actively misleading. */
function MemoryRow({ memory }) {
  return (
    <div className="border-t border-vision-border/5 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">{memory.title}</span>
        <Badge tone={VERIFICATION_TONE[memory.verificationStatus] || "neutral"}>{memory.verificationStatus}</Badge>
        <Badge tone={memory.source === "ADMIN" ? "ok" : "neutral"}>SOURCE: {memory.source}</Badge>
        <span className="text-xs text-vision-muted">{Math.round((memory.confidence ?? 0) * 100)}% confidence</span>
      </div>
      <p className="text-sm text-vision-text">{memory.content}</p>
      <p className="text-xs text-vision-muted mt-1">
        Learned {new Date(memory.createdAt).toLocaleString()}
        {memory.requiresReview && " · Vision will ask about this next time it sees an admin"}
      </p>
    </div>
  );
}

export default function PersonProfile() {
  const { id } = useParams();
  const [person, setPerson] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [memories, setMemories] = useState([]);
  const [favoriteSong, setFavoriteSong] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    peopleApi.get(id).then(setPerson).catch((e) => setError(e.message));
    peopleApi.timeline(id).then((r) => setTimeline(r.timeline)).catch(() => setTimeline([]));
    peopleApi.memories(id).then(setMemories).catch(() => {});
    peopleApi.favoriteSong(id).then((r) => setFavoriteSong(r.favoriteTrack)).catch(() => {});
  }, [id]);

  if (error) return <Card title="Person"><p className="text-xs text-vision-danger">{error}</p></Card>;
  if (!person) return <Card title="Person"><EmptyState message="Loading…" /></Card>;

  return (
    <div className="space-y-4">
      <Link to="/dashboard/people" className="text-xs text-vision-muted hover:text-vision-text">&larr; Back to People</Link>

      <Card>
        <div className="flex items-start gap-6">
          <div className="flex gap-3">
            <div className="text-center">
              <Avatar src={person.firstMetPhotoUrl} name={person.name} size="lg" />
              <div className="text-[10px] text-vision-muted mt-1">First met</div>
            </div>
            <div className="text-center">
              <Avatar src={person.mostRecentPhotoUrl} name={person.name} size="lg" />
              <div className="text-[10px] text-vision-muted mt-1">Most recent</div>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-vision-text">{person.name ?? "Unknown person"}</h2>
              <Badge tone={person.category === "ADMIN" ? "ok" : "neutral"}>{person.category}</Badge>
            </div>
            <div className="grid grid-cols-4 gap-4 text-sm mt-3">
              <div><div className="text-xs text-vision-muted">Trust score</div><div>{person.trustScore}</div></div>
              <div><div className="text-xs text-vision-muted">Relationship score</div><div>{person.relationshipScore}</div></div>
              <div><div className="text-xs text-vision-muted">Visits</div><div>{person.visitCount}</div></div>
              <div><div className="text-xs text-vision-muted">First seen</div><div>{person.firstSeen ? new Date(person.firstSeen).toLocaleDateString() : "—"}</div></div>
            </div>
            {favoriteSong && <p className="text-xs text-vision-muted mt-3">Favorite track: {favoriteSong.title}</p>}
          </div>
        </div>
      </Card>

      <Card title="What Vision has learned about this person">
        <p className="text-xs text-vision-muted mb-1">Every fact below shows exactly how it was recorded (its raw <code>source</code> — e.g. a Vision Script command, or an admin entry, which is the one source auto-verified on arrival), Vision's confidence at the time, and whether a human has since confirmed, corrected, or rejected it. Read-only here: Vision confirms or corrects these itself, out loud, the next time it sees an admin — not from a dashboard button.</p>
        {memories.length === 0 ? <EmptyState message="Nothing learned yet." /> : (
          <div>{memories.map((m) => <MemoryRow key={m.id} memory={m} />)}</div>
        )}
      </Card>

      <Card title="Timeline">
        {!timeline || timeline.length === 0 ? <EmptyState message="No recorded sightings yet." /> : (
          <ul className="space-y-3">
            {timeline.map((t, i) => (
              <li key={i} className="flex gap-3 border-t border-vision-border/5 pt-3 first:border-t-0 first:pt-0">
                {t.photoUrl ? (
                  <img src={t.photoUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-vision-hover/5 shrink-0" />
                )}
                <div>
                  <div className="text-sm">
                    {t.type === "INTERACTION" ? (t.summary || "Conversation") : (t.talkedTo ? "Talked with Vision" : "Seen by Vision")}
                  </div>
                  <div className="text-xs text-vision-muted">{new Date(t.createdAt).toLocaleString()}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
