import { personFacesRepository } from "../repositories/personFaces.repository";
import { personObservationsRepository } from "../repositories/people-observations.repository";
import { mediaFilesRepository } from "../repositories/mediaFiles.repository";

export interface PersonPhotos {
  /** The earliest photo on record — either their first registered
   * reference face or their first camera sighting, whichever came
   * first. Null only if nothing with a stored photo has happened yet. */
  firstMetPhotoUrl: string | null;
  /** Their latest photo — kept fresh every time they're seen again, so
   * "what do they look like now" doesn't go stale like a single
   * best-quality shot from years ago would. */
  mostRecentPhotoUrl: string | null;
}

interface PhotoEvent { mediaId: string; at: Date }

/**
 * Deliberately looks across BOTH `person_faces` (deliberate
 * registrations — dashboard uploads, admin-added reference photos, the
 * webcam capture at account signup) and `person_observations` (every
 * ordinary camera sighting) rather than assuming one table always has
 * the earliest/latest — a person's very first photo might be an
 * observation from before any face passed the quality gate to be
 * registered as a reference, and their most recent might be a sighting
 * that happened without a fresh reference registration.
 */
export async function resolvePersonPhotos(personId: string): Promise<PersonPhotos> {
  const [faces, observations] = await Promise.all([
    personFacesRepository.forPerson(personId),
    personObservationsRepository.forPerson(personId).catch(() => []),
  ]);

  const events: PhotoEvent[] = [
    ...faces.filter((f) => f.mediaId).map((f) => ({ mediaId: f.mediaId as string, at: f.createdAt })),
    ...observations.filter((o) => o.mediaId).map((o) => ({ mediaId: o.mediaId as string, at: o.createdAt })),
  ];
  if (events.length === 0) return { firstMetPhotoUrl: null, mostRecentPhotoUrl: null };

  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  const first = events[0];
  const last = events[events.length - 1];

  const [firstMedia, lastMedia] = await Promise.all([
    mediaFilesRepository.findById(first.mediaId),
    first.mediaId === last.mediaId ? Promise.resolve(null) : mediaFilesRepository.findById(last.mediaId),
  ]);

  return {
    firstMetPhotoUrl: firstMedia?.googleDriveUrl ?? null,
    mostRecentPhotoUrl: (first.mediaId === last.mediaId ? firstMedia : lastMedia)?.googleDriveUrl ?? firstMedia?.googleDriveUrl ?? null,
  };
}
