/**
 * /teams — the teams index on a permanent URL.
 *
 * `/` shows the Back Page to a stranger and the index to a returning coach; this route always shows
 * the index, which is what the marketing page's "Open the app" link needs.
 */
import { TeamsIndex } from "@/features/teams/TeamsIndex";

export default function TeamsPage() {
  return <TeamsIndex />;
}
